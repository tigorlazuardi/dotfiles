export const meta = {
  name: 'slice_orchestrator',
  description: 'Fresh per-slice orchestrator: implement in an isolated worktree, then review. Nested under the fleet control plane.',
  phases: [{ title: 'Implement' }, { title: 'Review' }],
}

// args: { slice, knowledge, integrationBranch }
//   slice: { id, desc, paths[], deps[], tier, lowTolerance, acceptance }
//   knowledge: [{ kind:'rule'|'skill', name, scope, body }]  (accumulated so far)
//   integrationBranch: the base branch slices fork from (already cut from origin)
const slice = args && args.slice ? args.slice : {}
const knowledge = (args && args.knowledge) || []
const integrationBranch = (args && args.integrationBranch) || 'main'
const sliceBranch = `fleet/${slice.id}`

const knowledgeBlock = knowledge.length
  ? 'SHARED KNOWLEDGE (rules + skills learned by the fleet so far — follow these):\n' +
    knowledge.map((k) => `- [${k.kind}] ${k.name} (scope: ${k.scope}): ${k.body}`).join('\n')
  : 'SHARED KNOWLEDGE: none yet.'

const DELTA_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    required: ['kind', 'name', 'scope', 'body'],
    properties: {
      kind: { type: 'string', enum: ['rule', 'skill'] },
      name: { type: 'string' },
      scope: { type: 'string', description: 'For rule: glob path(s). For skill: the intent/trigger.' },
      body: { type: 'string', description: 'The convention/gotcha/decision, concise and actionable.' },
    },
  },
}

phase('Implement')
const impl = await agent(
  `${knowledgeBlock}

You are implementing ONE slice of a larger plan, in an isolated git worktree.

Slice id: ${slice.id}
Goal: ${slice.desc}
Target paths: ${(slice.paths || []).join(', ') || '(discover)'}
Acceptance check: ${slice.acceptance || '(run the project test/build/lint and report)'}

Steps (run these git commands yourself via bash):
1. From the repo root: git worktree add -B ${sliceBranch} ../.fleet-wt-${slice.id} ${integrationBranch}
2. cd ../.fleet-wt-${slice.id}
3. Implement the slice. Match surrounding code style. Honor the SHARED KNOWLEDGE above.
4. Run the acceptance check. It MUST pass.
5. git add -A && git commit -m "fleet(${slice.id}): ${slice.desc}"
6. Capture: git diff ${integrationBranch}...${sliceBranch}

If you discover a reusable convention, gotcha, or decision that OTHER slices should follow, record it in knowledgeDelta (kind rule = path-scoped, kind skill = intent-triggered).

Return the structured result. Set passed=false if the acceptance check fails; do not fake it.`,
  {
    agentType: 'implementer',
    label: `impl:${slice.id}`,
    phase: 'Implement',
    schema: {
      type: 'object',
      required: ['passed', 'branch', 'diff', 'testOutput'],
      properties: {
        passed: { type: 'boolean' },
        branch: { type: 'string' },
        diff: { type: 'string', description: 'Unified diff of the slice vs the integration branch.' },
        testOutput: { type: 'string', description: 'Actual output of the acceptance check.' },
        summary: { type: 'string' },
        knowledgeDelta: DELTA_SCHEMA,
      },
    },
  },
)

if (!impl) {
  return { sliceId: slice.id, passed: false, branch: sliceBranch, verdict: 'error', reason: 'implement agent died', knowledgeDelta: [] }
}

phase('Review')
const reviewerType = slice.lowTolerance ? 'deep-reviewer' : 'reviewer'
const review = await agent(
  `${knowledgeBlock}

Review this slice diff against its intent. You are read-only — report findings, do not edit.

Slice id: ${slice.id}
Goal: ${slice.desc}
Acceptance result: passed=${impl.passed}
Test output:
${impl.testOutput}

Diff:
${impl.diff}

Judge correctness, security, error handling${slice.lowTolerance ? ', and LOW-TOLERANCE surfaces (auth/migration/schema/public-API/money) with adversarial scrutiny' : ''}.
Give a go/no-go verdict. If you spot a convention other slices should follow, add it to knowledgeDelta.`,
  {
    agentType: reviewerType,
    label: `review:${slice.id}`,
    phase: 'Review',
    schema: {
      type: 'object',
      required: ['verdict', 'findings'],
      properties: {
        verdict: { type: 'string', enum: ['go', 'no-go'] },
        findings: { type: 'array', items: { type: 'string' } },
        knowledgeDelta: DELTA_SCHEMA,
      },
    },
  },
)

const reviewVerdict = review ? review.verdict : 'no-go'
const reviewFindings = review ? review.findings : ['review agent died']
const delta = [].concat(impl.knowledgeDelta || [], (review && review.knowledgeDelta) || [])

return {
  sliceId: slice.id,
  passed: impl.passed === true && reviewVerdict === 'go',
  branch: impl.branch || sliceBranch,
  verdict: reviewVerdict,
  testPassed: impl.passed === true,
  findings: reviewFindings,
  summary: impl.summary || '',
  knowledgeDelta: delta,
}
