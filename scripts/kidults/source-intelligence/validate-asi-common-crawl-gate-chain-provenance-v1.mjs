import fs from 'node:fs';

const workflowPath = '.github/workflows/kidults-asi-common-crawl-gate-chain-binding-v1.yml';
const source = fs.readFileSync(workflowPath, 'utf8');

function violations(text) {
  const failures = [];
  const mustInclude = [
    'workflow_run:',
    "workflows: ['KIDULTS ASI Global Any-Site Discovery v2']",
    'branches: [main]',
    'types: [completed]',
    "if: github.event_name != 'workflow_run' || github.event.workflow_run.conclusion == 'success'",
    'EXPECTED_SHA: ${{ github.event.workflow_run.head_sha || github.sha }}',
    'EXPECTED_EXECUTION_SHA: ${{ github.event.pull_request.head.sha || github.event.workflow_run.head_sha || github.sha }}',
    'ref: ${{ github.event.pull_request.head.sha || github.event.workflow_run.head_sha || github.sha }}',
    "TRIGGER_EXPECTED: ${{ github.event_name == 'workflow_run' && 'true' || 'false' }}",
    "UPSTREAM_REPOSITORY: ${{ github.event.workflow_run.repository.full_name || '' }}",
    "UPSTREAM_RUN_ID: ${{ github.event.workflow_run.id || '' }}",
    'TARGET_BRANCH: main',
    'resolve-asi-exact-generation-orchestration-v1.mjs',
    '--mode live',
    '--mode pr-fixture',
    '--trigger-expected "$TRIGGER_EXPECTED"',
    '--trigger-expected false',
    '--expected-run-id "$UPSTREAM_RUN_ID"',
    '--max-attempts 24 \\',
    '--poll-milliseconds 10000',
    '--workflow-path .github/workflows/kidults-asi-global-open-market-discovery-v1.yml',
    '--artifact-name kidults-asi-global-any-site-discovery-v2',
    'test "$UPSTREAM_REPOSITORY" = "$GITHUB_REPOSITORY"',
    'test -n "$UPSTREAM_RUN_ID"',
    'MAIN_SHA="$(gh api -H \'Accept: application/vnd.github+json\' "/repos/${GITHUB_REPOSITORY}/branches/main" --jq \'.commit.sha\')"',
    'test "$MAIN_SHA" = "$EXPECTED_SHA"',
    'test "$RUN_ID" = "$UPSTREAM_RUN_ID"',
    "if: github.event_name != 'pull_request'",
    "if: always() && github.event_name != 'pull_request'",
    'producer_run_id:r.selected_run_id',
    'producer_head_sha:r.expected_producer_sha',
    'artifact_id:r.selected_artifact_id',
    'artifact_digest:r.selected_artifact_digest',
    'exact_generation:true',
    'upstream_global_discovery:provenance'
  ];
  for (const needle of mustInclude) {
    if (!text.includes(needle)) failures.push(`MISSING:${needle}`);
  }
  if (/^\s*schedule:\s*$/m.test(text) || /^\s*-\s*cron:/m.test(text)) {
    failures.push('INDEPENDENT_CONSUMER_SCHEDULE_FORBIDDEN');
  }
  return failures;
}

const pristine = violations(source);
if (pristine.length) {
  console.error(JSON.stringify({status:'FAIL',violations:pristine},null,2));
  process.exit(1);
}

const mutations = [
  ['DROP_WORKFLOW_RUN', t => t.replace('workflow_run:', 'workflow_dispatch:')],
  ['FORGE_PRODUCER', t => t.replace("workflows: ['KIDULTS ASI Global Any-Site Discovery v2']", "workflows: ['Forged Producer']")],
  ['REINTRODUCE_SCHEDULE', t => t.replace('  workflow_dispatch:', "  schedule:\n    - cron: '9 * * * *'\n  workflow_dispatch:")],
  ['DROP_EXPECTED_SHA', t => t.replaceAll('EXPECTED_SHA: ${{ github.event.workflow_run.head_sha || github.sha }}', 'EXPECTED_SHA: unbound')],
  ['DROP_EXECUTION_SHA', t => t.replace('EXPECTED_EXECUTION_SHA: ${{ github.event.pull_request.head.sha || github.event.workflow_run.head_sha || github.sha }}', 'EXPECTED_EXECUTION_SHA: unbound')],
  ['DROP_TRIGGER_CLASS', t => t.replace("TRIGGER_EXPECTED: ${{ github.event_name == 'workflow_run' && 'true' || 'false' }}", 'TRIGGER_EXPECTED: true')],
  ['DROP_UPSTREAM_REPOSITORY', t => t.replace("UPSTREAM_REPOSITORY: ${{ github.event.workflow_run.repository.full_name || '' }}", 'UPSTREAM_REPOSITORY: unbound')],
  ['DROP_UPSTREAM_RUN_ID', t => t.replace("UPSTREAM_RUN_ID: ${{ github.event.workflow_run.id || '' }}", 'UPSTREAM_RUN_ID: unbound')],
  ['DROP_EXPECTED_RUN_ID', t => t.replace('--expected-run-id "$UPSTREAM_RUN_ID"', '--expected-run-id ""')],
  ['DROP_MAIN_READBACK', t => t.replace('test "$MAIN_SHA" = "$EXPECTED_SHA"', 'echo "$MAIN_SHA"')],
  ['ALLOW_RUN_SUBSTITUTION', t => t.replace('test "$RUN_ID" = "$UPSTREAM_RUN_ID"', 'test -n "$RUN_ID"')],
  ['DROP_RESOLVER', t => t.replaceAll('resolve-asi-exact-generation-orchestration-v1.mjs', 'unbound-resolver.mjs')],
  ['DROP_CANONICAL_PATH', t => t.replaceAll('--workflow-path .github/workflows/kidults-asi-global-open-market-discovery-v1.yml', '--workflow-path .github/workflows/forged.yml')],
  ['DROP_BOUND', t => t.replace('--max-attempts 24', '--max-attempts 240')],
  ['ALLOW_PR_LIVE', t => t.replaceAll("if: github.event_name != 'pull_request'", 'if: always()')],
  ['DROP_RECEIPT_PROVENANCE', t => t.replace('upstream_global_discovery:provenance,', '')],
  ['ALLOW_FALSE_EXACT_GENERATION', t => t.replace('exact_generation:true', 'exact_generation:false')]
];

for (const [name, mutate] of mutations) {
  const changed = mutate(source);
  if (changed === source) {
    console.error(`MUTATION_NOT_APPLIED:${name}`);
    process.exit(1);
  }
  if (violations(changed).length === 0) {
    console.error(`FALSE_GREEN:${name}`);
    process.exit(1);
  }
}

console.log(JSON.stringify({
  status:'PASS',
  id:'asi-common-crawl-gate-chain-provenance-v1',
  mutations_rejected:mutations.length,
  causal_trigger_required:true,
  exact_generation_required:true,
  production:'HOLD'
},null,2));
