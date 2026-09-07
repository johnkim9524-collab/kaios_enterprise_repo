import fs from 'node:fs';

const workflowPath = process.argv[2] || '.github/workflows/kidults-asi-p0b-bounded-discovery-candidates-v1.yml';
const source = fs.readFileSync(workflowPath, 'utf8');

const assert = (condition, code) => {
  if (!condition) throw new Error(code);
};

const validate = (text) => {
  const permissionsIndex = text.indexOf('\npermissions:');
  assert(permissionsIndex > 0, 'PERMISSIONS_BOUNDARY_MISSING');
  const triggerHeader = text.slice(0, permissionsIndex);
  assert(!/\n  schedule:/.test(triggerHeader), 'AUTONOMOUS_SCHEDULE_REINTRODUCED');
  assert(!/\n  workflow_run:/.test(triggerHeader), 'AUTONOMOUS_WORKFLOW_RUN_REINTRODUCED');

  const gateName = '      - name: Enforce P0B direct-provider hard-disable\n';
  const gateIndex = text.indexOf(gateName);
  const checkoutIndex = text.indexOf('      - uses: actions/checkout@');
  const providerIndex = text.indexOf('ASI_SCOPE_ROTATION=');
  assert(gateIndex >= 0, 'HARD_DISABLE_GATE_MISSING');
  assert(checkoutIndex > gateIndex, 'HARD_DISABLE_NOT_BEFORE_CHECKOUT');
  assert(providerIndex > gateIndex, 'HARD_DISABLE_NOT_BEFORE_PROVIDER_CODE');

  const gateBlock = text.slice(gateIndex, checkoutIndex);
  assert(gateBlock.includes('P0B_DIRECT_PROVIDER_EXECUTION_HARD_DISABLED'), 'HARD_DISABLE_CODE_MISSING');
  assert(gateBlock.includes('exit 1'), 'HARD_DISABLE_EXIT_MISSING');

  assert(text.includes("failure_code:pass?null:'P0B_DIRECT_PROVIDER_EXECUTION_HARD_DISABLED'"), 'TERMINAL_FAILURE_CODE_MISSING');
  assert(text.includes('provider_requests_issued_by_p0b:0'), 'ZERO_PROVIDER_REQUEST_RECEIPT_MISSING');
  assert(text.includes('provider_execution_authority:false'), 'PROVIDER_AUTHORITY_FALSE_MISSING');
  assert(text.includes('shared_provider_budget_required:true'), 'SHARED_BUDGET_REQUIREMENT_MISSING');
  assert(text.includes("evidence_admission:'NONE'"), 'EVIDENCE_HOLD_MISSING');
  assert(text.includes("public_release:'HOLD'"), 'PUBLIC_HOLD_MISSING');
  assert(text.includes("production:'HOLD'"), 'PRODUCTION_HOLD_MISSING');
};

validate(source);

const mutations = [
  ['schedule', source.replace('  workflow_dispatch:\n', "  workflow_dispatch:\n  schedule:\n    - cron: '37 * * * *'\n")],
  ['workflow_run', source.replace('  workflow_dispatch:\n', "  workflow_dispatch:\n  workflow_run:\n    workflows: ['KIDULTS ASI P0 Mission Consumption v1']\n    types: [completed]\n")],
  ['gate_exit', source.replace('          exit 1\n', '          true\n')],
  ['gate_code', source.replace('P0B_DIRECT_PROVIDER_EXECUTION_HARD_DISABLED', 'P0B_PROVIDER_EXECUTION_ALLOWED')],
  ['request_count', source.replace('provider_requests_issued_by_p0b:0', 'provider_requests_issued_by_p0b:1')],
  ['provider_authority', source.replace('provider_execution_authority:false', 'provider_execution_authority:true')],
  ['evidence_boundary', source.replace("evidence_admission:'NONE'", "evidence_admission:'ADMITTED'")]
];

let rejected = 0;
for (const [name, mutation] of mutations) {
  try {
    validate(mutation);
    throw new Error('MUTATION_ACCEPTED:' + name);
  } catch (error) {
    if (String(error.message).startsWith('MUTATION_ACCEPTED:')) throw error;
    rejected += 1;
  }
}

process.stdout.write(JSON.stringify({
  state: 'VERIFIED_PASS',
  control: 'P0B_DIRECT_PROVIDER_EXECUTION_HARD_DISABLED',
  autonomous_triggers: 0,
  provider_requests_issued_by_p0b: 0,
  provider_execution_authority: false,
  mutation_rejections: rejected,
  mutation_total: mutations.length,
  evidence_admission: 'NONE',
  public_release: 'HOLD',
  production: 'HOLD'
}, null, 2) + '\n');
