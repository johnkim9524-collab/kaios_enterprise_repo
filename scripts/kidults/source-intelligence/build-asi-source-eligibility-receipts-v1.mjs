#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
import { validateP3ExactCanaryProvenance } from './lib/validate-p3-exact-canary-provenance-v1.mjs';

const [
  valuePath, rightsPath, snapshotPath, schemaPath, contractPath,
  outputPath = '/tmp/asi-source-eligibility-receipts-v1.json', evaluatedAtArg,
  p3CanaryReceiptPath, p3SnapshotPath, p3EvidencePath, p3ProviderReceiptPath
] = process.argv.slice(2);
if (![valuePath, rightsPath, snapshotPath, schemaPath, contractPath].every(Boolean)) {
  throw new Error('USAGE_VALUE_RIGHTS_SNAPSHOT_SCHEMA_CONTRACT_OUTPUT');
}

const read = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const hash = value => `sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
const canonical = value => Array.isArray(value)
  ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
    : value;
const canonicalHash = value => `sha256:${crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')}`;
const sha256 = value => /^sha256:[0-9a-f]{64}$/.test(value || '') && !/^sha256:0{64}$/.test(value);
const assert = (condition, code) => { if (!condition) throw new Error(code); };
const requireEnv = name => {
  const value = String(process.env[name] || '');
  if (!value) throw new Error(`PRODUCER_IDENTITY_REQUIRED:${name}`);
  return value;
};
const assertRegularFile = (path, name) => {
  const stat = fs.lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`INPUT_NOT_REGULAR_FILE:${name}`);
};

const contract = read(contractPath);
if (contract.id !== 'kidults-asi-source-eligibility-receipt-contract-v1' || contract.version !== '1.1.0') {
  throw new Error('CONTRACT_IDENTITY');
}
assert(contract.admission_boundary?.evidence_eligibility_ceiling_without_p3_exact_canary === 'CANARY_EVALUATION_ELIGIBLE_ONLY'
  && contract.admission_boundary?.product_content_admission_requires_eligible_unexpired_receipt_p3_source_binding_and_allowed_producer_event === true
  && contract.admission_boundary?.adapter_activation_requires_eligible_unexpired_receipt_p3_source_binding_and_allowed_producer_event === true,
'CONTRACT_ADMISSION_BOUNDARY_INVALID');
const suppliedInputs = {
  product_value: valuePath,
  rights: rightsPath,
  snapshots: snapshotPath,
  schemas: schemaPath,
  contract: contractPath
};
const allowTestInputs = process.env.KIDULTS_ALLOW_TEST_INPUTS === '1' && process.env.GITHUB_ACTIONS !== 'true';
for (const [name, suppliedPath] of Object.entries(suppliedInputs)) {
  if (!allowTestInputs && suppliedPath !== contract.canonical_input_paths?.[name]) throw new Error(`INPUT_PATH_NOT_CANONICAL:${name}`);
  assertRegularFile(suppliedPath, name);
}

const runAttempt = Number(requireEnv('KIDULTS_WORKFLOW_RUN_ATTEMPT'));
const producer = {
  repository: requireEnv('KIDULTS_REPOSITORY'),
  workflow_path: requireEnv('KIDULTS_PRODUCER_WORKFLOW_PATH'),
  source_sha: requireEnv('KIDULTS_SOURCE_SHA'),
  workflow_run_id: requireEnv('KIDULTS_WORKFLOW_RUN_ID'),
  workflow_run_attempt: runAttempt,
  event_name: requireEnv('KIDULTS_PRODUCER_EVENT_NAME'),
  artifact_name: requireEnv('KIDULTS_PRODUCER_ARTIFACT_NAME')
};
if (producer.repository !== contract.producer_identity?.repository) throw new Error('PRODUCER_REPOSITORY_NOT_CANONICAL');
if (producer.workflow_path !== contract.producer_identity?.workflow_path) throw new Error('PRODUCER_WORKFLOW_NOT_CANONICAL');
if (producer.artifact_name !== contract.producer_identity?.artifact_name) throw new Error('PRODUCER_ARTIFACT_NOT_CANONICAL');
if (!contract.producer_identity?.allowed_events?.includes(producer.event_name)) throw new Error('PRODUCER_EVENT_NOT_ALLOWED');
if (!/^[a-f0-9]{40}$/.test(producer.source_sha)) throw new Error('PRODUCER_SOURCE_SHA_INVALID');
if (!/^[1-9][0-9]*$/.test(producer.workflow_run_id)) throw new Error('PRODUCER_RUN_ID_INVALID');
if (!Number.isInteger(runAttempt) || runAttempt < 1) throw new Error('PRODUCER_RUN_ATTEMPT_INVALID');

if (evaluatedAtArg && process.env.KIDULTS_ALLOW_TEST_CLOCK !== '1') throw new Error('EVALUATED_AT_OVERRIDE_FORBIDDEN');
const evaluatedAt = evaluatedAtArg || new Date().toISOString();
if (!Number.isFinite(Date.parse(evaluatedAt))) throw new Error('EVALUATED_AT_INVALID');

const values = read(valuePath);
const rights = read(rightsPath);
const snapshots = read(snapshotPath);
const schemas = read(schemaPath);
const map = (rows, name) => {
  const result = new Map();
  for (const row of rows || []) {
    if (!row.source_id) throw new Error(`${name}_SOURCE_ID_MISSING`);
    if (result.has(row.source_id)) throw new Error(`${name}_SOURCE_ID_DUPLICATE`);
    result.set(row.source_id, row);
  }
  return result;
};
const valueBy = map(values.records, 'VALUE');
const rightsBy = map(rights.records, 'RIGHTS');
const snapshotBy = map(snapshots.records, 'SNAPSHOT');
const schemaBy = map(schemas.records, 'SCHEMA');
const rightsAllowed = record => record?.decision === contract.eligibility_rules.rights_decision &&
  Object.entries(contract.eligibility_rules.required_rights).every(([key, value]) => record.rights?.[key] === value);
const producerBindingDigest = hash(producer);
const contractDigest = hash(contract);
const activationEvent = contract.producer_identity.adapter_activation_events.includes(producer.event_name);
const p3Canary = validateP3ExactCanaryProvenance({ contract, paths: {
  p3Receipt: p3CanaryReceiptPath, snapshot: p3SnapshotPath, evidence: p3EvidencePath, providerReceipt: p3ProviderReceiptPath,
} });
const records = [];

for (const [sourceId, right] of rightsBy) {
  const value = valueBy.get(sourceId);
  const snapshot = snapshotBy.get(sourceId);
  const schema = schemaBy.get(sourceId);
  const failures = [];
  if (!value || value.value_admission_status !== contract.eligibility_rules.value_status || value.hard_minimum_complete !== true ||
      !Number.isFinite(value.value_score) || value.value_score < contract.eligibility_rules.minimum_value_score) {
    failures.push('PRODUCT_VALUE_NOT_ELIGIBLE');
  }
  if (!rightsAllowed(right)) failures.push('PURPOSE_RIGHTS_NOT_PASS');
  if (!snapshot || snapshot.capture_state !== contract.eligibility_rules.snapshot_state ||
      snapshot.decision_promotion_eligible !== true || !snapshot.source_content_sha256 || !snapshot.governed_object_ref) {
    failures.push('SOURCE_CONTENT_SNAPSHOT_NOT_BOUND');
  }
  if (!schema || schema.state !== contract.eligibility_rules.schema_state || schema.terminal_sold_compatible !== true ||
      !schema.schema_sha256 || !schema.sample_digest) {
    failures.push('SOURCE_SPECIFIC_SCHEMA_NOT_BOUND');
  }
  const expiryCandidates = [right?.evidence_binding?.recheck_due_at, schema?.expires_at].filter(Boolean);
  const validExpiryCandidates = expiryCandidates
    .filter(value => Number.isFinite(Date.parse(value)))
    .sort((a, b) => Date.parse(a) - Date.parse(b));
  const expiresAt = validExpiryCandidates[0] || null;
  if (validExpiryCandidates.length !== expiryCandidates.length) failures.push('EVIDENCE_EXPIRY_INVALID');
  if (!expiresAt || !Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.parse(evaluatedAt)) {
    failures.push('EVIDENCE_EXPIRED_OR_EXPIRY_MISSING');
  }
  const canaryEvaluationEligible = failures.length === 0;
  const p3Bindings = p3Canary?.bindingBySource.get(sourceId) || [];
  const p3ExactCanaryBound = Boolean(canaryEvaluationEligible && p3Bindings.length > 0
    && p3Bindings.every(value => value.source_content_snapshot_sha256 === snapshot.source_content_sha256));
  // No archive-verifying artifact consumer is wired yet.  Environment variables and a
  // provider JSON cannot be treated as authority until the downloaded provider ZIP and
  // its member closure are independently verified against GitHub's artifact digest.
  const runtimeAuthorized = false;
  const binding = {
    source_id: sourceId,
    purpose_id: contract.purpose_id,
    product_value_digest: value ? hash(value) : null,
    rights_record_digest: hash(right),
    source_content_snapshot_digest: snapshot ? hash(snapshot) : null,
    source_schema_digest: schema ? hash(schema) : null,
    producer_binding_digest: producerBindingDigest,
    contract_digest: contractDigest,
    evaluated_at: evaluatedAt,
    expires_at: expiresAt,
    p3_exact_canary_receipt_digest: p3ExactCanaryBound ? p3Canary.receipt_digest : null,
    p3_exact_pair_digest: p3ExactCanaryBound ? p3Canary.p3.exact_pair_digest : null,
    p3_launch_cohort_digest: p3ExactCanaryBound ? p3Canary.p3.launch_cohort_digest : null,
    p3_canary_source_binding_digest: p3ExactCanaryBound ? p3Canary.p3.canary_source_binding_digest : null,
    p3_canary_transaction_binding_digest: p3ExactCanaryBound ? p3Canary.p3.canary_transaction_binding_digest : null,
    p3_canary_transaction_digests: p3ExactCanaryBound ? p3Bindings.map(value => value.transaction_identity_digest) : null
  };
  records.push({
    source_id: sourceId,
    purpose_id: contract.purpose_id,
    state: canaryEvaluationEligible ? 'CANARY_EVALUATION_ELIGIBLE' : 'HOLD',
    failures,
    binding,
    receipt_digest: hash(binding),
    canary_evaluation_eligible: canaryEvaluationEligible,
    p3_exact_canary_receipt_bound: p3ExactCanaryBound,
    product_content_admission_authorized: runtimeAuthorized,
    adapter_activation_authorized: runtimeAuthorized,
    adapter_activation_scope: runtimeAuthorized ? contract.p3_exact_canary_gate.adapter_enablement_scope : 'HOLD',
    original_cohort_product_content_scope: runtimeAuthorized ? contract.p3_exact_canary_gate.original_cohort_product_content_scope : 'HOLD',
    production_authorized: false
  });
}

const evidenceEligible = records.filter(record => record.canary_evaluation_eligible).length;
const p3ExactCanaryBound = records.filter(record => record.p3_exact_canary_receipt_bound).length;
const productContentAdmitted = records.filter(record => record.product_content_admission_authorized).length;
const adapterActivationAuthorized = records.filter(record => record.adapter_activation_authorized).length;
const receipt = {
  id: 'kidults-asi-source-eligibility-receipts-v1',
  version: '1.1.0',
  status: evidenceEligible ? 'BOUNDED_CANARY_EVALUATION_ELIGIBILITY_CREATED' : 'FAIL_CLOSED_NO_CANARY_EVALUATION_ELIGIBLE_SOURCE',
  evaluated_at: evaluatedAt,
  purpose_id: contract.purpose_id,
  producer,
  inputs: { ...suppliedInputs, p3_exact_canary_receipt: p3CanaryReceiptPath || null, p3_snapshot: p3SnapshotPath || null, p3_evidence: p3EvidencePath || null, p3_provider_receipt: p3ProviderReceiptPath || null },
  input_set_digest: hash({ values, rights, snapshots, schemas, contract, p3_exact_canary_receipt: p3Canary?.p3 || null }),
  summary: {
    sources: records.length,
    evidence_eligible: evidenceEligible,
    eligible: evidenceEligible,
    canary_evaluation_eligible: evidenceEligible,
    hold: records.length - evidenceEligible,
    p3_exact_canary_bound: p3ExactCanaryBound,
    product_content_admitted: productContentAdmitted,
    adapter_activation_authorized: adapterActivationAuthorized
  },
  records,
  truth_boundary: {
    metadata_discovery_admission_is_product_content_admission: false,
    pull_request_or_manual_receipt_authorizes_activation: false,
    eligibility_without_p3_exact_canary: 'CANARY_EVALUATION_ONLY',
    p3_receipt_source_binding_required_for_content_and_activation: true,
    allowed_producer_event_required_for_content_and_activation: true,
    p3_exact_transactions_bind_original_cohort_content_admission: true,
    source_scoped_adapter_enablement_requires_activation_receipt_and_current_lineage_per_run: true,
    p3_attestation_pending_is_not_track_b_authority: true,
    adapter_activation_hard_disabled_pending_archive_verified_artifact_consumer: true,
    production: 'HOLD',
    public_release: 'HOLD'
  }
};
receipt.receipt_set_digest = hash({
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
fs.writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify(receipt.summary));
