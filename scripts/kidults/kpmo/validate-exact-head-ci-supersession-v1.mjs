import fs from 'node:fs';

const workflowPath = '.github/workflows/kpmo-exact-head-ci-supersession-v1.yml';
const source = fs.readFileSync(workflowPath, 'utf8');

function findingsFor(text) {
  const findings = [];
  const required = [
    ['push-main-trigger', 'branches: [main]'],
    ['associative-workflow-cardinality', 'declare -A exact_head_workflow_seen=()'],
    ['unique-workflow-retention', 'exact_head_workflow_seen["${workflow_name}"]="${run_id}"'],
    ['unique-retention-counter', 'unique_same_head_retained=$((unique_same_head_retained + 1))'],
    ['duplicate-cancellation-receipt', 'same_head_duplicate_runs_cancelled:$same_head_cancelled'],
    ['one-per-workflow-policy', 'same_head_policy:"RETAIN_ONE_ACTIVE_RUN_PER_WORKFLOW"']
  ];
  for (const [id, marker] of required) {
    if (!text.includes(marker)) findings.push(`missing:${id}`);
  }
  if (text.includes('essential_workflow_allowlist')) findings.push('blanket-essential-allowlist');
  if (text.includes('same_head_optional_runs_cancelled')) findings.push('unsupported-optional-classification');
  if (/retain_run\s*\(\)/.test(text)) findings.push('name-allowlist-cancellation');
  return findings;
}

function classify(runs, exactHead, currentRunId) {
  const seen = new Set();
  const result = { retained: [], duplicateCancelled: [], staleCancelled: [] };
  for (const run of runs) {
    if (run.id === currentRunId || !['queued', 'in_progress', 'waiting', 'pending'].includes(run.status)) continue;
    if (run.head === exactHead) {
      if (!seen.has(run.workflow)) {
        seen.add(run.workflow);
        result.retained.push(run.id);
      } else {
        result.duplicateCancelled.push(run.id);
      }
    } else {
      result.staleCancelled.push(run.id);
    }
  }
  return result;
}

const baselineFindings = findingsFor(source);
if (baselineFindings.length) throw new Error(`exact-head supersession violations: ${baselineFindings.join(',')}`);

const fixture = classify([
  { id: 1, head: 'H', status: 'queued', workflow: 'Full Value Chain Deep Red-Team' },
  { id: 2, head: 'H', status: 'in_progress', workflow: 'Security Assurance' },
  { id: 3, head: 'H', status: 'queued', workflow: 'Owned Source-Intelligence Graph' },
  { id: 4, head: 'H', status: 'queued', workflow: 'Full Value Chain Deep Red-Team' },
  { id: 5, head: 'OLD', status: 'queued', workflow: 'CI Validation' },
  { id: 6, head: 'H', status: 'completed', workflow: 'D1 Policy' },
  { id: 99, head: 'H', status: 'in_progress', workflow: 'KPMO Exact-Head CI Supersession v1' }
], 'H', 99);

if (fixture.retained.join(',') !== '1,2,3') throw new Error(`unique critical workflows were not retained: ${fixture.retained}`);
if (fixture.duplicateCancelled.join(',') !== '4') throw new Error(`same-workflow duplicate was not isolated: ${fixture.duplicateCancelled}`);
if (fixture.staleCancelled.join(',') !== '5') throw new Error(`stale run was not isolated: ${fixture.staleCancelled}`);

const mutations = [
  ['remove-cardinality-map', text => text.replace('declare -A exact_head_workflow_seen=()', '# removed'), 'missing:associative-workflow-cardinality'],
  ['remove-unique-retention', text => text.replace('exact_head_workflow_seen["${workflow_name}"]="${run_id}"', '# removed'), 'missing:unique-workflow-retention'],
  ['restore-name-allowlist', text => `${text}\nretain_run() { :; }\n`, 'name-allowlist-cancellation'],
  ['claim-optional-without-proof', text => text.replace('same_head_duplicate_runs_cancelled', 'same_head_optional_runs_cancelled'), 'missing:duplicate-cancellation-receipt']
];

for (const [id, mutate, expected] of mutations) {
  const findings = findingsFor(mutate(source));
  if (!findings.includes(expected)) throw new Error(`mutation escaped ${id}: ${findings.join(',')}`);
}

console.log(JSON.stringify({
  id: 'kpmo-exact-head-ci-supersession-v1',
  state: 'VERIFIED_PASS',
  policy: 'RETAIN_ONE_ACTIVE_RUN_PER_WORKFLOW',
  unique_critical_fixture_runs_retained: fixture.retained.length,
  duplicate_fixture_runs_cancelled: fixture.duplicateCancelled.length,
  stale_fixture_runs_cancelled: fixture.staleCancelled.length,
  mutation_cases_rejected: mutations.length,
  external_effect: 'NONE',
  production: 'HOLD',
  public: 'HOLD',
  g5: 'EXPLICIT_APPROVAL_REQUIRED'
}, null, 2));
