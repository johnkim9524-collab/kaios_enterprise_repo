import fs from 'node:fs';

const workflow = fs.readFileSync('.github/workflows/kpmo-live-canonical-issue-truth-v1.yml', 'utf8');
const contract = JSON.parse(fs.readFileSync('coordination/kidults/kpmo/canonical-issue-concurrency-by-issue-v1.json', 'utf8'));
const fail = (m) => { throw new Error(`CANONICAL_ISSUE_CONCURRENCY_${m}`); };

if (contract.required_semantics.issue_event_identity !== 'EXACT_ISSUE_NUMBER') fail('CONTRACT_IDENTITY_INVALID');
if (!workflow.includes("github.event_name == 'issues' && format('issue-{0}', github.event.issue.number)")) fail('ISSUE_NUMBER_NOT_BOUND');
if (!workflow.includes("github.event_name == 'pull_request' && format('pr-{0}', github.event.pull_request.head.sha)")) fail('PR_HEAD_NOT_BOUND');
if (!workflow.includes("format('run-{0}', github.run_id)")) fail('RUN_ID_NOT_BOUND');
if (!/cancel-in-progress:\s*true/.test(workflow)) fail('SUPERSESSION_DISABLED');
if (workflow.includes("github.event_name == 'issues' && github.sha")) fail('LEGACY_MAIN_SHA_ISSUE_GROUP_PRESENT');
if (contract.assurance.ignore_cancelled_runs !== false || contract.assurance.false_green_relaxation !== false) fail('ASSURANCE_RELAXED');

const forged = workflow.replace("format('issue-{0}', github.event.issue.number)", 'github.sha');
if (!forged.includes("github.event_name == 'issues' && github.sha")) fail('NEGATIVE_MUTATION_SETUP_FAILED');
const accepts = forged.includes("github.event_name == 'issues' && format('issue-{0}', github.event.issue.number)");
if (accepts) fail('NEGATIVE_MUTATION_NOT_REJECTED');

console.log(JSON.stringify({
  validator: 'KPMO_CANONICAL_ISSUE_CONCURRENCY_BY_ISSUE_V1',
  state: 'VERIFIED_PASS',
  cross_issue_cancellation: 'PROHIBITED',
  same_issue_supersession: 'PRESERVED',
  assurance_fail_closed: 'PRESERVED',
  production: 'HOLD',
  public: 'HOLD',
  g5: 'HOLD'
}, null, 2));
