export const meta = {
  name: 'fleet',
  description: 'Control plane: plan a task into a slice DAG, gate it, then spawn a fresh orchestrator per slice — parallel where independent, sequenced where dependent — with worktree isolation, auto-merge of clean slices, and rule/skill knowledge transfer across slices.',
  phases: [
    { title: 'Plan' },
    { title: 'Gate' },
    { title: 'Setup' },
    { title: 'Build' },
    { title: 'Integrate' },
  ],
}

// args: { task?: string, planPath?: string, baseBranch?: string, runName?: string, resume?: boolean }
const task = (args && args.task) || ''
const planPath = (args && args.planPath) || ''
const runName = (args && args.runName) || 'integration'
const argBase = (args && args.baseBranch) || ''
const forceResume = !!(args && args.resume)
const stateDir = `plans/fleet/${runName}`
const statePath = `${stateDir}/state.json`

const DELTA_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    required: ['kind', 'name', 'scope', 'body'],
    properties: {
      kind: { type: 'string', enum: ['rule', 'skill'] },
      name: { type: 'string' },
      scope: { type: 'string' },
      body: { type: 'string' },
    },
  },
}

// ---------- Plan (with resume probe) ----------
phase('Plan')
const resumeProbe = await agent(
  `Check for an existing fleet resume state. If the file \`${statePath}\` exists, parse it and return its content under \`state\`. If it does not exist, return \`{ state: null }\`. Use bash.`,
  {
    agentType: 'support',
    label: 'resume-probe',
    phase: 'Plan',
    schema: {
      type: 'object',
      required: ['state'],
      properties: { state: { type: ['object', 'null'] } },
    },
  },
)
const priorState = resumeProbe && resumeProbe.state ? resumeProbe.state : null
const isResume = forceResume || (priorState && priorState.status && priorState.status !== 'complete')

const plan = await agent(
  `You are the fleet planner. Turn this work into a slice DAG and seed the shared knowledge base.

${task ? 'Task:\n' + task : ''}
${planPath ? 'Read the plan document at: ' + planPath + ' and base the DAG on it.' : ''}

Read the relevant code first (you have read/grep/find/bash). Then produce:
- baseBranch: the branch slices should ultimately integrate into (e.g. "main"). ${argBase ? 'Use "' + argBase + '".' : ''}
- slices: each a unit of work ~one PR. For each: id (kebab, unique), desc, paths (files it will touch), deps (ids of slices that MUST land first), tier, lowTolerance (true if it touches auth/secrets/migration/schema/public-API/money/data-deletion), acceptance (the exact command that proves it works).
- seedKnowledge: conventions, decisions, or gotchas discovered during planning that EVERY slice must follow (kind rule = path-scoped, kind skill = intent-triggered).

Make deps a true DAG (no cycles). Independent slices share no deps so they run in parallel.

DISAMBIGUATION GUARD: this fleet runs autonomously in the background — you CANNOT ask the user anything here. The interview must already be done upstream (via /grill-me in the main session). If the spec still leaves you with material ambiguity that would force you to guess on scope, acceptance, data model, or a low-tolerance decision, do NOT invent answers. Instead list each open question in needsClarification and return. The fleet will abort and tell the user to re-run /grill-me. Only return slices when you can plan them without guessing.`,
  {
    agentType: 'planner',
    label: 'plan',
    phase: 'Plan',
    schema: {
      type: 'object',
      required: ['baseBranch', 'slices', 'needsClarification'],
      properties: {
        baseBranch: { type: 'string' },
        needsClarification: { type: 'array', items: { type: 'string' }, description: 'Open questions that block planning. Non-empty => fleet aborts.' },
        slices: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'desc', 'deps'],
            properties: {
              id: { type: 'string' },
              desc: { type: 'string' },
              paths: { type: 'array', items: { type: 'string' } },
              deps: { type: 'array', items: { type: 'string' } },
              tier: { type: 'string' },
              lowTolerance: { type: 'boolean' },
              writeDirectly: { type: 'boolean' },
              acceptance: { type: 'string' },
            },
          },
        },
        seedKnowledge: DELTA_SCHEMA,
      },
    },
  },
)

// ---------- Resume or fresh plan ----------
let baseBranch, integrationBranch, byId, waves, knowledge, completedSlices, currentWaveIdx

if (isResume) {
  // Reuse state from prior run — skip Plan + Gate + Setup
  baseBranch = priorState.baseBranch
  integrationBranch = priorState.integrationBranch
  byId = priorState.byId
  waves = priorState.waves
  knowledge = (priorState.knowledge || []).slice()
  completedSlices = Object.assign({}, priorState.completedSlices || {})
  currentWaveIdx = priorState.currentWaveIdx || 0
  log(`Resuming run ${runName} from wave ${currentWaveIdx + 1}/${waves.length}`)
} else {
  if (!plan) {
    return { aborted: true, reason: 'planner died' }
  }
  if (plan.needsClarification && plan.needsClarification.length) {
    return {
      aborted: true,
      reason: 'plan is ambiguous — interview not complete',
      needsClarification: plan.needsClarification,
      nextStep: 'Run /grill-me in the main session to resolve these, update the spec, then re-run /fleet.',
    }
  }
  if (!plan.slices || !plan.slices.length) {
    return { aborted: true, reason: 'planner produced no slices' }
  }

  baseBranch = argBase || plan.baseBranch || 'main'
  integrationBranch = `fleet/${runName}`
  knowledge = (plan.seedKnowledge || []).slice()

  // normalize writeDirectly per slice
  plan.slices.forEach((s) => {
    if (s.writeDirectly === undefined) s.writeDirectly = s.lowTolerance === true
  })

  // ---------- compute topological waves (Kahn) ----------
  byId = {}
  plan.slices.forEach((s) => { byId[s.id] = s })
  const indeg = {}
  plan.slices.forEach((s) => { indeg[s.id] = 0 })
  plan.slices.forEach((s) => {
    (s.deps || []).forEach((d) => { if (byId[d]) indeg[s.id]++ })
  })
  waves = []
  let remaining = plan.slices.map((s) => s.id)
  let guard = 0
  while (remaining.length && guard++ < 1000) {
    const ready = remaining.filter((id) => indeg[id] === 0)
    if (!ready.length) {
      return { aborted: true, reason: 'dependency cycle detected', remaining }
    }
    waves.push(ready)
    remaining = remaining.filter((id) => !ready.includes(id))
    remaining.forEach((id) => {
      (byId[id].deps || []).forEach((d) => { if (ready.includes(d)) indeg[id]-- })
    })
  }
  log(`Planned ${plan.slices.length} slices in ${waves.length} wave(s): ${waves.map((w) => '[' + w.join(',') + ']').join(' -> ')}`)

  // ---------- Gate ----------
  phase('Gate')
  const summary = waves
    .map((w, i) => `Wave ${i + 1}: ${w.map((id) => id + (byId[id].lowTolerance ? '(!low-tol)' : '')).join(', ')}`)
    .join('\n')
  const knowledgeSummary = knowledge.length
    ? knowledge.map((k) => `- [${k.kind}] ${k.name}: ${k.body}`).join('\n')
    : '(none)'
  const approved = await checkpoint(
    `Fleet plan ready.\nBase: ${baseBranch} -> integration: ${integrationBranch}\n\n${summary}\n\nSeed knowledge:\n${knowledgeSummary}\n\nApprove and start building? (Building writes code in isolated worktrees and auto-merges clean slices.)`,
    { kind: 'confirm', default: false },
  )
  if (!approved) {
    return { aborted: true, reason: 'plan not approved at gate', waves, knowledge }
  }

  // ---------- Setup: integration branch fresh from origin ----------
  phase('Setup')
  const setup = await agent(
    `Prepare the fleet integration branch. Run, from the repo root, via bash:
1. git fetch origin
2. Verify origin/${baseBranch} exists. If it does NOT, report and stop (do not invent a base).
3. git worktree prune
4. Create the integration branch FRESH FROM ORIGIN (not from local state):
   git checkout -B ${integrationBranch} origin/${baseBranch}
5. Confirm HEAD is at origin/${baseBranch}.

Report the resolved base commit and whether setup succeeded.`,
    {
      agentType: 'support',
      label: 'setup-base',
      phase: 'Setup',
      schema: {
        type: 'object',
        required: ['ok'],
        properties: { ok: { type: 'boolean' }, baseCommit: { type: 'string' }, note: { type: 'string' } },
      },
    },
  )
  if (!setup || !setup.ok) {
    return { aborted: true, reason: 'integration branch setup failed', detail: setup }
  }

  // persist seed knowledge to .pi/rules + .pi/skills
  if (knowledge.length) {
    await writeKnowledge(knowledge, 'seed')
  }

  completedSlices = {}
  currentWaveIdx = 0

  // ---------- writeState helper ----------
  async function writeState(state) {
    await agent(
      `Persist fleet state. Create dir \`${stateDir}\` if missing. Write the JSON below to \`${statePath}\` (pretty-printed). Stamp it with an ISO timestamp in the \`updatedAt\` field. Then \`git add ${statePath}\` (do NOT commit yet — the captain or user batches commits).\n\nSTATE:\n${JSON.stringify(state)}`,
      { agentType: 'support', label: 'write-state', phase: 'Build', schema: { type: 'object', required: ['written'], properties: { written: { type: 'boolean' } } } },
    )
  }

  // initial state persist
  await writeState({ status: 'running', runName, baseBranch, integrationBranch, slices: plan.slices, byId, waves, currentWaveIdx: 0, completedSlices: {}, knowledge })
}

// ---------- Build: wave by wave (barrier between waves for deps) ----------
phase('Build')

// writeState available in both paths — redefine at build scope so resume path can also call it
async function writeState(state) {
  await agent(
    `Persist fleet state. Create dir \`${stateDir}\` if missing. Write the JSON below to \`${statePath}\` (pretty-printed). Stamp it with an ISO timestamp in the \`updatedAt\` field. Then \`git add ${statePath}\` (do NOT commit yet — the captain or user batches commits).\n\nSTATE:\n${JSON.stringify(state)}`,
    { agentType: 'support', label: 'write-state', phase: 'Build', schema: { type: 'object', required: ['written'], properties: { written: { type: 'boolean' } } } },
  )
}

const allResults = []
for (let w = currentWaveIdx; w < waves.length; w++) {
  const wave = waves[w]
  log(`Wave ${w + 1}/${waves.length}: building ${wave.join(', ')}`)
  const results = await parallel(
    wave
      .filter((id) => !completedSlices[id])
      .map((id) => () =>
        workflow('slice_orchestrator', { slice: byId[id], knowledge: knowledge.slice(), integrationBranch, writeDirectly: byId[id].writeDirectly === true }),
      ),
  )
  const clean = results.filter(Boolean)

  // record completed slices
  clean.forEach((r) => { completedSlices[r.sliceId] = r })

  // collect + persist new knowledge BEFORE the next wave so it propagates
  const newDelta = []
  clean.forEach((r) => {
    const already = new Set((r.writtenItems || []))
    ;(r.knowledgeDelta || []).forEach((k) => { if (!already.has(k.name)) newDelta.push(k) })
  })
  if (newDelta.length) {
    knowledge = knowledge.concat(newDelta)
    await writeKnowledge(newDelta, `wave-${w + 1}`)
  }

  // persist state after wave
  await writeState({ status: 'running', runName, baseBranch, integrationBranch, slices: Object.values(byId), byId, waves, currentWaveIdx: w + 1, completedSlices, knowledge })

  // auto-merge passed + clean slices into the integration branch
  const toMerge = clean.filter((r) => r.passed).map((r) => r.branch)
  if (toMerge.length) {
    const merge = await agent(
      `Merge these passed slice branches into ${integrationBranch}, one at a time, via bash:
${toMerge.map((b) => '- ' + b).join('\n')}

For each: git checkout ${integrationBranch} && git merge --no-ff <branch>.
If a merge has CONFLICTS: abort that merge (git merge --abort), leave the branch unmerged, and report it as conflicted — do NOT force or hand-resolve. After merging, clean up each merged worktree (git worktree remove ../.fleet-wt-<id> if present).

Report which branches merged cleanly and which conflicted.`,
      {
        agentType: 'support',
        label: `merge:wave-${w + 1}`,
        phase: 'Build',
        schema: {
          type: 'object',
          required: ['merged', 'conflicted'],
          properties: {
            merged: { type: 'array', items: { type: 'string' } },
            conflicted: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    )
    clean.forEach((r) => {
      r.merged = merge ? (merge.merged || []).includes(r.branch) : false
      r.conflicted = merge ? (merge.conflicted || []).includes(r.branch) : false
    })
  }
  allResults.push(...clean)
}

// ---------- Integrate: report ----------
phase('Integrate')
const passed = allResults.filter((r) => r.passed)
const failed = allResults.filter((r) => !r.passed)
const merged = allResults.filter((r) => r.merged)
const conflicted = allResults.filter((r) => r.conflicted)

await writeState({ status: 'complete', runName, baseBranch, integrationBranch, slices: Object.values(byId), byId, waves, currentWaveIdx: waves.length, completedSlices, knowledge })

return {
  integrationBranch,
  baseBranch,
  waves,
  totals: { slices: allResults.length, passed: passed.length, failed: failed.length, merged: merged.length, conflicted: conflicted.length },
  merged: merged.map((r) => r.branch),
  conflicted: conflicted.map((r) => ({ branch: r.branch, sliceId: r.sliceId })),
  failed: failed.map((r) => ({ sliceId: r.sliceId, verdict: r.verdict, findings: r.findings })),
  knowledge: knowledge.map((k) => ({ kind: k.kind, name: k.name, scope: k.scope })),
  nextStep: conflicted.length
    ? `Resolve ${conflicted.length} conflicted branch(es), then review ${integrationBranch}.`
    : `Review ${integrationBranch}; open a PR to ${baseBranch} when satisfied.`,
}

// ---------- helper: persist knowledge as rules + skills ----------
async function writeKnowledge(items, tag) {
  const rules = items.filter((k) => k.kind === 'rule')
  const skills = items.filter((k) => k.kind === 'skill')
  const spec = [
    rules.length
      ? 'RULES -> write each to .pi/rules/<name>.md with YAML frontmatter `paths:` (the scope as a glob list) then the body:\n' +
        rules.map((k) => `  - name: ${k.name}\n    paths: ${k.scope}\n    body: ${k.body}`).join('\n')
      : '',
    skills.length
      ? 'SKILLS -> write each to .pi/skills/<name>/SKILL.md with YAML frontmatter `name:` and `description:` (the scope/intent is the description) then the body:\n' +
        skills.map((k) => `  - name: ${k.name}\n    description: ${k.scope}\n    body: ${k.body}`).join('\n')
      : '',
  ].filter(Boolean).join('\n\n')
  await agent(
    `Persist fleet knowledge (tag: ${tag}) so other slices and future sessions inherit it. Create directories as needed via bash. Do NOT overwrite an existing file with the same name — if one exists, merge the new body in. Write valid frontmatter.\n\n${spec}`,
    { agentType: 'support', label: `knowledge:${tag}`, phase: 'Build', schema: { type: 'object', required: ['written'], properties: { written: { type: 'array', items: { type: 'string' } } } } },
  )
}
