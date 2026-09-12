#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
import { validateP3ExactCanaryProvenance } from './lib/validate-p3-exact-canary-provenance-v1.mjs';

const [receiptPath, contractPath] = process.argv.slice(2);
if (!receiptPath || !contractPath) throw new Error('USAGE_RECEIPT_CONTRACT');

const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
const hash = value => `sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
const canonical = value => Array.isArray(value)
  ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
    : value;
const canonicalHash = value => `sha256:${crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')}`;
const sha256 = value => /^sha256:[0-9a-f]{64}$/.test(value || '') && !/^sha256:0{64}$/.test(value);
const assert = (value, code) => { if (!value) throw new Error(code); };
const requireEnv = name => {
  const value = String(process.env[name] || '');
  assert(value, `EXPECTED_PRODUCER_IDENTITY_REQUIRED:${name}`);
  return value;
};
const assertRegularFile = (path, name) => {
  const stat = fs.lstatSync(path);
  assert(stat.isFile() && !stat.isSymbolicLink(), `INPUT_NOT_REGULAR_FILE:${name}`);
};
const allowTestInputs = process.env.KIDULTS_ALLOW_TEST_INPUTS === '1' && process.env.GITHUB_ACTIONS !== 'true';

assert(contract.id === 'kidults-asi-source-eligibility-receipt-contract-v1' && contract.version === '1.1.0', 'CONTRACT_IDENTITY');
assert(contract.admission_boundary?.evidence_eligibility_ceiling_without_p3_exact_canary === 'CANARY_EVALUATION_ELIGIBLE_ONLY'
  && contract.admission_boundary?.product_content_admission_requires_eligible_unexpired_receipt_p3_source_binding_and_allowed_producer_event === true
  && contract.admission_boundary?.adapter_activation_requires_eligible_unexpired_receipt_p3_source_binding_and_allowed_producer_event === true,
'CONTRACT_P3_CANARY_AUTHORITY_BOUNDARY_INVALID');
if (!allowTestInputs) assert(contractPath === contract.canonical_input_paths?.contract, 'CONTRACT_PATH_NOT_CANONICAL');
assert(receipt.id === 'kidults-asi-source-eligibility-receipts-v1' && receipt.version === '1.1.0', 'IDENTITY');
assert(receipt.purpose_id === contract.purpose_id, 'PURPOSE_DRIFT');
assert(Number.isFinite(Date.parse(receipt.evaluated_at)), 'EVALUATED_AT_INVALID');

const now = Date.now();
const maximumFutureSkewMs = Number(contract.receipt_time_policy?.maximum_future_skew_seconds) * 1000;
assert(Number.isFinite(maximumFutureSkewMs) && maximumFutureSkewMs >= 0, 'TIME_POLICY_INVALID');
assert(Date.parse(receipt.evaluated_at) <= now + maximumFutureSkewMs, 'RECEIPT_EVALUATED_AT_IN_FUTURE');

const expectedProducer = {
  repository: requireEnv('KIDULTS_EXPECTED_REPOSITORY'),
  workflow_path: requireEnv('KIDULTS_EXPECTED_PRODUCER_WORKFLOW_PATH'),
  source_sha: requireEnv('KIDULTS_EXPECTED_SOURCE_SHA'),
  workflow_run_id: requireEnv('KIDULTS_EXPECTED_WORKFLOW_RUN_ID'),
  workflow_run_attempt: Number(requireEnv('KIDULTS_EXPECTED_WORKFLOW_RUN_ATTEMPT')),
  event_name: requireEnv('KIDULTS_EXPECTED_PRODUCER_EVENT_NAME'),
  artifact_name: requireEnv('KIDULTS_EXPECTED_PRODUCER_ARTIFACT_NAME')
};
assert(expectedProducer.repository === contract.producer_identity.repository, 'EXPECTED_REPOSITORY_NOT_CANONICAL');
assert(expectedProducer.workflow_path === contract.producer_identity.workflow_path, 'EXPECTED_WORKFLOW_NOT_CANONICAL');
assert(expectedProducer.artifact_name === contract.producer_identity.artifact_name, 'EXPECTED_ARTIFACT_NOT_CANONICAL');
assert(contract.producer_identity.allowed_events.includes(expectedProducer.event_name), 'EXPECTED_EVENT_NOT_ALLOWED');
assert(/^[a-f0-9]{40}$/.test(expectedProducer.source_sha), 'EXPECTED_SOURCE_SHA_INVALID');
assert(/^[1-9][0-9]*$/.test(expectedProducer.workflow_run_id), 'EXPECTED_RUN_ID_INVALID');
assert(Number.isInteger(expectedProducer.workflow_run_attempt) && expectedProducer.workflow_run_attempt >= 1, 'EXPECTED_RUN_ATTEMPT_INVALID');
assert(JSON.stringify(receipt.producer) === JSON.stringify(expectedProducer), 'PRODUCER_IDENTITY_MISMATCH');

for (const [name, canonicalPath] of Object.entries(contract.canonical_input_paths)) {
  if (name === 'contract') continue;
  if (!allowTestInputs) assert(receipt.inputs?.[name] === canonicalPath, `INPUT_PATH_NOT_CANONICAL:${name}`);
  assertRegularFile(receipt.inputs?.[name], name);
}
if (!allowTestInputs) assert(receipt.inputs?.contract === contract.canonical_input_paths.contract, 'INPUT_PATH_NOT_CANONICAL:contract');
assertRegularFile(contractPath, 'contract');

const readRows = (path, name) => {
  const document = JSON.parse(fs.readFileSync(path, 'utf8'));
  const result = new Map();
  for (const row of document.records || []) {
    assert(row.source_id, `${name}_SOURCE_ID_MISSING`);
    assert(!result.has(row.source_id), `${name}_SOURCE_ID_DUPLICATE`);
    result.set(row.source_id, row);
  }
  return { document, rows: result };
};
const valueInput = readRows(receipt.inputs.product_value, 'VALUE');
const rightsInput = readRows(receipt.inputs.rights, 'RIGHTS');
const snapshotInput = readRows(receipt.inputs.snapshots, 'SNAPSHOT');
const schemaInput = readRows(receipt.inputs.schemas, 'SCHEMA');
const p3Canary = validateP3ExactCanaryProvenance({ contract, paths: {
  p3Receipt: receipt.inputs.p3_exact_canary_receipt, snapshot: receipt.inputs.p3_snapshot,
  evidence: receipt.inputs.p3_evidence, providerReceipt: receipt.inputs.p3_provider_receipt,
} });
assert(receipt.input_set_digest === hash({
  values: valueInput.document,
  rights: rightsInput.document,
  snapshots: snapshotInput.document,
  schemas: schemaInput.document,
  contract,
  p3_exact_canary_receipt: p3Canary?.p3 || null
}), 'INPUT_SET_DIGEST_INVALID');

assert(new Set(receipt.records.map(record => record.source_id)).size === receipt.records.length, 'SOURCE_ID_DUPLICATE');
const receiptSourceIds = receipt.records.map(record => record.source_id).sort();
const governedSourceIds = [...rightsInput.rows.keys()].sort();
assert(JSON.stringify(receiptSourceIds) === JSON.stringify(governedSourceIds), 'RECEIPT_SOURCE_SET_DRIFT');
const producerBindingDigest = hash(receipt.producer);
const contractDigest = hash(contract);
const activationEvent = contract.producer_identity.adapter_activation_events.includes(receipt.producer.event_name);

for (const row of receipt.records) {
  assert(row.binding?.source_id === row.source_id && row.binding?.purpose_id === receipt.purpose_id, 'BINDING_IDENTITY');
  assert(row.binding.evaluated_at === receipt.evaluated_at, 'BINDING_EVALUATED_AT_DRIFT');
  assert(row.binding.producer_binding_digest === producerBindingDigest, 'PRODUCER_BINDING_DIGEST_INVALID');
  assert(row.binding.contract_digest === contractDigest, 'CONTRACT_DIGEST_INVALID');
  assert(row.receipt_digest === hash(row.binding), 'RECEIPT_DIGEST_INVALID');
  const required = contract.required_bindings.every(key => row.binding[key] !== undefined && row.binding[key] !== null);
  const expiresAt = Date.parse(row.binding.expires_at);
  const unexpiredNow = Number.isFinite(expiresAt) && expiresAt > now;
  const canaryEvaluationEligible = row.state === 'CANARY_EVALUATION_ELIGIBLE';
  const value = valueInput.rows.get(row.source_id);
  const rights = rightsInput.rows.get(row.source_id);
  const snapshot = snapshotInput.rows.get(row.source_id);
  const schema = schemaInput.rows.get(row.source_id);
  const expiryCandidates = [rights?.evidence_binding?.recheck_due_at, schema?.expires_at].filter(Boolean);
  const validExpiryCandidates = expiryCandidates
    .filter(value => Number.isFinite(Date.parse(value)))
    .sort((a, b) => Date.parse(a) - Date.parse(b));
  const expectedExpiresAt = validExpiryCandidates[0] || null;
  assert(row.binding.expires_at === expectedExpiresAt, 'EXPIRY_BINDING_DRIFT');
  assert(row.binding.product_value_digest === (value ? hash(value) : null), 'PRODUCT_VALUE_BINDING_DRIFT');
  assert(row.binding.rights_record_digest === (rights ? hash(rights) : null), 'RIGHTS_BINDING_DRIFT');
  assert(row.binding.source_content_snapshot_digest === (snapshot ? hash(snapshot) : null), 'SNAPSHOT_BINDING_DRIFT');
  assert(row.binding.source_schema_digest === (schema ? hash(schema) : null), 'SCHEMA_BINDING_DRIFT');
  const evidenceEligible = Boolean(value && rights && snapshot && schema &&
    value.value_admission_status === contract.eligibility_rules.value_status && value.hard_minimum_complete === true &&
    Number.isFinite(value.value_score) && value.value_score >= contract.eligibility_rules.minimum_value_score &&
    rights.decision === contract.eligibility_rules.rights_decision &&
    Object.entries(contract.eligibility_rules.required_rights).every(([key, expected]) => rights.rights?.[key] === expected) &&
    snapshot.capture_state === contract.eligibility_rules.snapshot_state && snapshot.decision_promotion_eligible === true &&
    snapshot.source_content_sha256 && snapshot.governed_object_ref && schema.state === contract.eligibility_rules.schema_state &&
    schema.terminal_sold_compatible === true && schema.schema_sha256 && schema.sample_digest &&
    validExpiryCandidates.length === expiryCandidates.length && unexpiredNow);
  assert(row.canary_evaluation_eligible === evidenceEligible && canaryEvaluationEligible === evidenceEligible,
    unexpiredNow ? 'CANARY_EVALUATION_ELIGIBILITY_NOT_DERIVED_FROM_EVIDENCE' : 'CANARY_EVALUATION_RECEIPT_EXPIRED_AT_VALIDATION');
  assert(!canaryEvaluationEligible || required, 'CANARY_EVALUATION_BINDING_INCOMPLETE');
  assert(!canaryEvaluationEligible || row.failures.length === 0, 'CANARY_EVALUATION_ELIGIBLE_WITH_FAILURES');
  const p3Bindings = p3Canary?.bindingBySource.get(row.source_id) || [];
  const p3ExactCanaryBound = Boolean(evidenceEligible && p3Bindings.length > 0
    && p3Bindings.every(value => value.source_content_snapshot_sha256 === snapshot.source_content_sha256));
  assert(row.p3_exact_canary_receipt_bound === p3ExactCanaryBound, 'P3_CANARY_SOURCE_BINDING_STATE_DRIFT');
  assert(row.binding.p3_exact_canary_receipt_digest === (p3ExactCanaryBound ? p3Canary.receipt_digest : null)
    && row.binding.p3_exact_pair_digest === (p3ExactCanaryBound ? p3Canary.p3.exact_pair_digest : null)
    && row.binding.p3_launch_cohort_digest === (p3ExactCanaryBound ? p3Canary.p3.launch_cohort_digest : null)
    && row.binding.p3_canary_source_binding_digest === (p3ExactCanaryBound ? p3Canary.p3.canary_source_binding_digest : null)
    && row.binding.p3_canary_transaction_binding_digest === (p3ExactCanaryBound ? p3Canary.p3.canary_transaction_binding_digest : null)
    && JSON.stringify(row.binding.p3_canary_transaction_digests) === JSON.stringify(p3ExactCanaryBound ? p3Bindings.map(value => value.transaction_identity_digest) : null),
  'P3_CANARY_RECEIPT_BINDING_DRIFT');
  assert(!p3ExactCanaryBound || contract.p3_required_bindings.every(key => row.binding[key] !== null && row.binding[key] !== undefined),
    'P3_CANARY_REQUIRED_BINDING_INCOMPLETE');
  const runtimeAuthorized = false;
  assert(row.product_content_admission_authorized === runtimeAuthorized && row.adapter_activation_authorized === runtimeAuthorized,
    'AUTHORIZATION_STATE_DRIFT');
  assert(row.adapter_activation_scope === (runtimeAuthorized ? contract.p3_exact_canary_gate.adapter_enablement_scope : 'HOLD')
    && row.original_cohort_product_content_scope === (runtimeAuthorized ? contract.p3_exact_canary_gate.original_cohort_product_content_scope : 'HOLD'),
  'AUTHORIZATION_SCOPE_DRIFT');
  assert(row.production_authorized === false, 'PRODUCTION_PROMOTION');
}

const eligible = receipt.records.filter(record => record.canary_evaluation_eligible).length;
const p3Bound = receipt.records.filter(record => record.p3_exact_canary_receipt_bound).length;
const admitted = receipt.records.filter(record => record.product_content_admission_authorized).length;
const activated = receipt.records.filter(record => record.adapter_activation_authorized).length;
assert(receipt.summary.evidence_eligible === eligible && receipt.summary.eligible === eligible
  && receipt.summary.canary_evaluation_eligible === eligible &&
  receipt.summary.sources === receipt.records.length && receipt.summary.hold === receipt.records.length - eligible, 'SUMMARY_DRIFT');
assert(receipt.summary.p3_exact_canary_bound === p3Bound, 'P3_CANARY_SUMMARY_DRIFT');
assert(receipt.summary.product_content_admitted === admitted && receipt.summary.adapter_activation_authorized === activated,
  'ADMISSION_SUMMARY_DRIFT');
assert(receipt.truth_boundary.metadata_discovery_admission_is_product_content_admission === false &&
  receipt.truth_boundary.pull_request_or_manual_receipt_authorizes_activation === false &&
  receipt.truth_boundary.eligibility_without_p3_exact_canary === 'CANARY_EVALUATION_ONLY' &&
  receipt.truth_boundary.p3_receipt_source_binding_required_for_content_and_activation === true &&
  receipt.truth_boundary.allowed_producer_event_required_for_content_and_activation === true &&
  receipt.truth_boundary.p3_exact_transactions_bind_original_cohort_content_admission === true &&
  receipt.truth_boundary.source_scoped_adapter_enablement_requires_activation_receipt_and_current_lineage_per_run === true &&
  receipt.truth_boundary.p3_attestation_pending_is_not_track_b_authority === true &&
  receipt.truth_boundary.adapter_activation_hard_disabled_pending_archive_verified_artifact_consumer === true,
'METADATA_CONTENT_BOUNDARY_WEAKENED');
const expectedSetDigest = hash({
  id: receipt.id,
  version: receipt.version,
  evaluated_at: receipt.evaluated_at,
  purpose_id: receipt.purpose_id,
  producer: receipt.producer,
  inputs: receipt.inputs,
  input_set_digest: receipt.input_set_digest,
  summary: receipt.summary,
  records: receipt.records,
  truth_boundary: receipt.truth_boundary
});
assert(receipt.receipt_set_digest === expectedSetDigest, 'RECEIPT_SET_DIGEST_INVALID');

console.log(JSON.stringify({
  suite: 'ASI_SOURCE_ELIGIBILITY_RECEIPTS_V1',
  result: 'VERIFIED_PASS',
  sources: receipt.records.length,
  eligible,
  canary_evaluation_eligible: eligible,
  p3_exact_canary_bound: p3Bound,
  hold: receipt.records.length - eligible,
  adapter_activation_authorized: activated,
  source_sha: receipt.producer.source_sha,
  workflow_run_id: receipt.producer.workflow_run_id,
  artifact_name: receipt.producer.artifact_name
}));
