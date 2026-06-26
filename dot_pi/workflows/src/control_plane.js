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

// args: { task?: string, planPath?: string, baseBranch?: string, runName?: string }
const task = (args && args.task) || ''
const planPath = (args && args.planPath) || ''
const runName = (args && args.runName) || 'integration'
const argBase = (args && args.baseBranch) || ''

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

// ---------- Plan ----------
phase('Plan')
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
              acceptance: { type: 'string' },
            },
          },
        },
        seedKnowledge: DELTA_SCHEMA,
      },
    },
  },
)

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

const baseBranch = argBase || plan.baseBranch || 'main'
const integrationBranch = `fleet/${runName}`
let knowledge = (plan.seedKnowledge || []).slice()

// ---------- compute topological waves (Kahn) ----------
const byId = {}
plan.slices.forEach((s) => { byId[s.id] = s })
const indeg = {}
plan.slices.forEach((s) => { indeg[s.id] = 0 })
plan.slices.forEach((s) => {
  (s.deps || []).forEach((d) => { if (byId[d]) indeg[s.id]++ })
})
const waves = []
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

// ---------- Build: wave by wave (barrier between waves for deps) ----------
phase('Build')
const allResults = []
for (let w = 0; w < waves.length; w++) {
  const wave = waves[w]
  log(`Wave ${w + 1}/${waves.length}: building ${wave.join(', ')}`)
  const results = await parallel(
    wave.map((id) => () =>
      workflow('slice_orchestrator', { slice: byId[id], knowledge: knowledge.slice(), integrationBranch }),
    ),
  )
  const clean = results.filter(Boolean)

  // collect + persist new knowledge BEFORE the next wave so it propagates
  const newDelta = []
  clean.forEach((r) => (r.knowledgeDelta || []).forEach((k) => newDelta.push(k)))
  if (newDelta.length) {
    knowledge = knowledge.concat(newDelta)
    await writeKnowledge(newDelta, `wave-${w + 1}`)
  }

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
