import fs from 'node:fs';

const workflowPath = '.github/workflows/kidults-pre-partner-intake-cert.yml';
const text = fs.readFileSync(workflowPath, 'utf8');

const CHECKOUT_SHA = '3d3c42e5aac5ba805825da76410c181273ba90b1';
const SETUP_NODE_SHA = '820762786026740c76f36085b0efc47a31fe5020';
const EXPECTED_SOURCE_EXPR = '${{ github.event.pull_request.head.sha || github.sha }}';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

function validateWorkflow(source) {
  const failures = [];
  const require = (condition, id) => { if (!condition) failures.push(id); };

  require(/^permissions:\s*\n\s*contents:\s*read\s*$/m.test(source), 'least_privilege_contents_read_missing');
  require(/runs-on:\s*ubuntu-24\.04/.test(source), 'runner_not_pinned_ubuntu_24_04');
  require(source.includes(`uses: actions/checkout@${CHECKOUT_SHA}`), 'checkout_not_immutable_sha');
  require(source.includes(`uses: actions/setup-node@${SETUP_NODE_SHA}`), 'setup_node_not_immutable_sha');
  require(source.includes(`ref: ${EXPECTED_SOURCE_EXPR}`), 'exact_source_ref_missing');
  require(/fetch-depth:\s*1/.test(source), 'bounded_checkout_depth_missing');
  require(/persist-credentials:\s*false/.test(source), 'checkout_credentials_persisted_or_unspecified');
  require(source.includes(`EXPECTED_SHA: ${EXPECTED_SOURCE_EXPR}`), 'expected_sha_binding_missing');
  require(source.includes('git rev-parse HEAD'), 'actual_sha_readback_missing');
  require(source.includes('test "${ACTUAL_SHA}" = "${EXPECTED_SHA}"'), 'sha_equality_assertion_missing');
  require(/node-version:\s*['"]?24['"]?/.test(source), 'node_24_not_pinned');
  require(source.includes('node scripts/kidults/kpmo/validate-pre-partner-intake-workflow-provenance-v1.mjs'), 'self_provenance_validator_not_executed');
  require(source.includes('node scripts/kidults/audit/certify-pre-partner-intake-gate-v1.mjs'), 'certifier_not_executed');
  require(!/pull_request_target\s*:/.test(source), 'pull_request_target_forbidden');
  require(!/continue-on-error\s*:\s*true/.test(source), 'continue_on_error_forbidden');
  require(!/\bsecrets\s*\./.test(source) && !/\bsecrets\s*\[/.test(source) && !/secrets\s*:\s*inherit/.test(source), 'secret_context_forbidden');

  const externalUses = [...source.matchAll(/uses:\s*([^\s#]+)/g)].map(match => match[1]);
  for (const use of externalUses) {
    if (use.startsWith('./')) continue;
    require(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[0-9a-f]{40}$/.test(use), `mutable_or_unpinned_action:${use}`);
  }

  return [...new Set(failures)];
}

const baselineFailures = validateWorkflow(text);
assert(baselineFailures.length === 0, `pre-partner workflow provenance failed: ${baselineFailures.join(', ')}`);

const mutations = [
  ['mutable_checkout_tag', text.replace(`actions/checkout@${CHECKOUT_SHA}`, 'actions/checkout@v4')],
  ['mutable_setup_node_tag', text.replace(`actions/setup-node@${SETUP_NODE_SHA}`, 'actions/setup-node@v4')],
  ['runner_alias', text.replace('runs-on: ubuntu-24.04', 'runs-on: ubuntu-latest')],
  ['wrong_source_ref', text.replace(`ref: ${EXPECTED_SOURCE_EXPR}`, 'ref: main')],
  ['persist_credentials_removed', text.replace(/\n\s*persist-credentials:\s*false/, '')],
  ['sha_readback_removed', text.replace('ACTUAL_SHA="$(git rev-parse HEAD)"', 'ACTUAL_SHA="${EXPECTED_SHA}"')],
  ['sha_assertion_disabled', text.replace('test "${ACTUAL_SHA}" = "${EXPECTED_SHA}"', 'true # equality disabled')],
  ['node_downgrade', text.replace(/node-version:\s*['"]?24['"]?/, "node-version: '22'")],
  ['continue_on_error', text.replace('name: Certify all 12 internal pre-intake control families', 'continue-on-error: true\n      - name: Certify all 12 internal pre-intake control families')],
  ['secret_injection', text + '\n# mutation\nenv:\n  BAD: ${{ secrets.BAD }}\n']
];

for (const [id, mutated] of mutations) {
  const failures = validateWorkflow(mutated);
  assert(failures.length > 0, `mutation did not fail closed: ${id}`);
}

console.log(JSON.stringify({
  suite: 'KIDULTS_PRE_PARTNER_INTAKE_WORKFLOW_PROVENANCE_V1',
  governing_issue: 1043,
  parent_gate: 881,
  result: 'PASS',
  immutable_actions: true,
  exact_source_sha_checkout_and_readback: true,
  runner: 'ubuntu-24.04',
  node: '24',
  checkout_credentials_persisted: false,
  secretless: true,
  least_privilege: 'contents:read',
  mutation_cases_fail_closed: mutations.length,
  empirical_gate_effect: 'NONE',
  external_partner_data_ingestion: 'HOLD',
  production: 'HOLD',
  public: 'HOLD',
  g5: 'EXPLICIT_APPROVAL_REQUIRED'
}, null, 2));
