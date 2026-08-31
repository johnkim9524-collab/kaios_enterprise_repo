#!/usr/bin/env node
import fs from 'node:fs';

const CONTRACT = 'coordination/kidults/governance/ai-agent-report-after-remediation-gate-v1.json';
const BOOTSTRAP = 'coordination/kidults/governance/ai-agent-bootstrap-remediation-sequence-v1.json';
const fail = (m) => { throw new Error(m); };
const ok = (v, m) => { if (!v) fail(m); };
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

ok(fs.existsSync(CONTRACT), `MISSING:${CONTRACT}`);
ok(fs.existsSync(BOOTSTRAP), `MISSING:${BOOTSTRAP}`);
const contract = readJson(CONTRACT);
const bootstrap = readJson(BOOTSTRAP);

ok(contract.id === 'kidults-ai-agent-report-after-remediation-gate-v1', 'CONTRACT_ID');
ok(contract.version === '1.2.0', 'CONTRACT_VERSION');
ok(contract.status === 'MANDATORY_FAIL_CLOSED', 'CONTRACT_STATUS');
ok(contract.scope === 'REPOSITORY_GOVERNED_AI_AGENT_STATUS_RECEIPTS', 'CONTRACT_SCOPE');
ok(contract.behavioral_scope === 'ALL_AI_AGENTS_STATUS_AND_PROGRESS_REPORTING', 'BEHAVIORAL_SCOPE');
ok(contract.machine_enforcement_scope === 'REGISTERED_REPOSITORY_STATUS_RECEIPT_PATHS', 'MACHINE_SCOPE');
ok(contract.external_chat_output_interception_claimed === false, 'CHAT_INTERCEPTION_OVERCLAIM');
ok(contract.normal_report_gate?.report_only_allowed === false, 'REPORT_ONLY_MUST_BE_FALSE');
ok(contract.violation?.self_exemption_allowed === false, 'SELF_EXEMPTION_MUST_BE_FALSE');
ok(contract.machine_receipt_rule?.receipt_must_pass_canonical_status_schema === true, 'CANONICAL_SCHEMA_BINDING');
ok(contract.machine_receipt_rule?.receipt_must_pass_report_after_remediation_validator === true, 'REPORT_VALIDATOR_BINDING');
ok(contract.machine_receipt_rule?.synthetic_self_test_alone_counts_as_end_to_end_report_enforcement === false, 'SYNTHETIC_SELF_TEST_OVERCLAIM');
ok(contract.machine_receipt_rule?.registered_workflow_must_emit_and_validate_real_run_receipt === true, 'REAL_RUN_RECEIPT_REQUIRED');
ok(contract.production === 'HOLD' && contract.public_release === 'HOLD' && contract.g5 === 'HOLD', 'RELEASE_BOUNDARY');
ok(contract.strategic_stewardship_after_remediation?.required_when_material === true, 'STRATEGY_STEWARDSHIP_REQUIRED');
ok(contract.strategic_stewardship_after_remediation?.strategy_must_not_delay_executable_internal_fix === true, 'STRATEGY_MAY_NOT_DELAY_FIX');
for (const domain of ['PRODUCT_STRATEGY','CUSTOMER_STRATEGY','PLATFORM_STRATEGY','PROVIDER_STRATEGY','INTERNALIZATION_STRATEGY','GROUP_FUTURE_STRATEGY','VERTICAL_FUTURE_STRATEGY']) {
  ok(contract.strategic_stewardship_after_remediation?.required_domains?.includes(domain), `MISSING_STRATEGY_DOMAIN:${domain}`);
}

const expected = [
  'ROOT_CAUSE_CORRECTED',
  'REGRESSION_TESTED',
  'NEGATIVE_TESTED',
  'EXACT_HEAD_REVALIDATED',
  'TARGET_MAIN_REVALIDATED_OR_PREMERGE_NOT_APPLICABLE',
  'REGISTRY_ISSUE_TRUTH_SYNCED',
  'VERIFIED_OUTCOME_READY',
  'PRIORITIZED_IMPROVEMENT_PROPOSAL_READY'
];
ok(JSON.stringify(contract.normal_report_gate?.required_sequence) === JSON.stringify(expected), 'REPORT_SEQUENCE_ORDER');
ok(bootstrap.report_only_before_remediation_allowed === false, 'BOOTSTRAP_REPORT_ONLY_BOUNDARY');

const protectedStops = new Set(contract.protected_stop_exception?.allowed_only_when ?? []);
for (const stop of bootstrap.stop_conditions ?? []) ok(protectedStops.has(stop), `MISSING_PROTECTED_STOP:${stop}`);

function validateReceipt(receipt) {
  const allowed = new Set(contract.report_receipt_minimum.defect_disposition_values);
  ok(allowed.has(receipt.defect_disposition), 'INVALID_DEFECT_DISPOSITION');
  ok(typeof receipt.improvement_proposal === 'string' && receipt.improvement_proposal.trim().length > 0, 'MISSING_IMPROVEMENT_PROPOSAL');
  ok(Array.isArray(receipt.verification_evidence_refs), 'MISSING_VERIFICATION_EVIDENCE_REFS');
  ok(Array.isArray(receipt.truth_sync_refs), 'MISSING_TRUTH_SYNC_REFS');

  if (receipt.defect_disposition === 'REMEDIATED_AND_VERIFIED') {
    ok(JSON.stringify(receipt.remediation_sequence) === JSON.stringify(expected), 'INCOMPLETE_OR_REORDERED_REMEDIATION_SEQUENCE');
    ok(receipt.verification_evidence_refs.length > 0, 'REMEDIATED_WITHOUT_VERIFICATION_EVIDENCE');
    ok(receipt.truth_sync_refs.length > 0, 'REMEDIATED_WITHOUT_TRUTH_SYNC');
    ok(!receipt.blocker, 'REMEDIATED_RECEIPT_CANNOT_CLAIM_BLOCKER');
  }

  if (receipt.defect_disposition === 'PROTECTED_STOP_BLOCKED') {
    ok(receipt.remediation_sequence == null || receipt.remediation_sequence.length === 0, 'BLOCKED_RECEIPT_MUST_NOT_FAKE_REMEDIATION');
    ok(protectedStops.has(receipt.blocker?.type), 'INVALID_PROTECTED_STOP');
    ok(typeof receipt.blocker?.exact_blocker === 'string' && receipt.blocker.exact_blocker.length > 0, 'MISSING_EXACT_BLOCKER');
    ok(typeof receipt.blocker?.unblock_condition === 'string' && receipt.blocker.unblock_condition.length > 0, 'MISSING_UNBLOCK_CONDITION');
  }

  if (receipt.defect_disposition === 'NO_REVERSIBLE_DEFECT_DETECTED') {
    ok(receipt.remediation_sequence == null || receipt.remediation_sequence.length === 0, 'NO_DEFECT_RECEIPT_MUST_NOT_FAKE_REMEDIATION');
  }
}

const idx = process.argv.indexOf('--receipt');
const requireReceipt = process.argv.includes('--require-receipt');
let explicitReceiptPath = null;
if (idx >= 0) {
  explicitReceiptPath = process.argv[idx + 1];
  ok(explicitReceiptPath && fs.existsSync(explicitReceiptPath), 'RECEIPT_PATH_REQUIRED');
  validateReceipt(readJson(explicitReceiptPath));
}
if (requireReceipt) ok(explicitReceiptPath, 'REAL_RUN_RECEIPT_REQUIRED');

const good = {
  defect_disposition: 'REMEDIATED_AND_VERIFIED',
  remediation_sequence: expected,
  verification_evidence_refs: ['validator:exact-head'],
  truth_sync_refs: ['registry:current', 'issue:current'],
  improvement_proposal: 'Prioritize the next highest-risk reversible control gap and assess material product/customer/platform/provider/internalization implications.'
};
validateReceipt(good);

const mutations = [
  ['REPORT_ONLY', (x) => { x.remediation_sequence = []; }],
  ['NO_NEGATIVE_TEST', (x) => { x.remediation_sequence = x.remediation_sequence.filter(v => v !== 'NEGATIVE_TESTED'); }],
  ['NO_TRUTH_SYNC', (x) => { x.truth_sync_refs = []; }],
  ['NO_IMPROVEMENT', (x) => { x.improvement_proposal = ''; }],
  ['FAKE_BLOCKER', (x) => { x.defect_disposition = 'PROTECTED_STOP_BLOCKED'; x.remediation_sequence = []; x.blocker = {type:'INTERNAL_BUG', exact_blocker:'x', unblock_condition:'y'}; }]
];
for (const [name, mutate] of mutations) {
  const x = structuredClone(good);
  mutate(x);
  let rejected = false;
  try { validateReceipt(x); } catch { rejected = true; }
  ok(rejected, `NEGATIVE_MUTATION_ACCEPTED:${name}`);
}

console.log(JSON.stringify({
  id: 'kidults-ai-agent-report-after-remediation-validation-v1',
  state: 'VERIFIED_PASS',
  contract_version: contract.version,
  behavioral_scope: contract.behavioral_scope,
  machine_enforcement_scope: contract.machine_enforcement_scope,
  external_chat_output_interception_claimed: false,
  real_run_receipt_validated: Boolean(explicitReceiptPath),
  report_only_allowed: false,
  strategic_stewardship_required_when_material: true,
  required_sequence: expected,
  negative_mutations_rejected: mutations.length,
  production: 'HOLD',
  public_release: 'HOLD',
  g5: 'HOLD'
}, null, 2));
