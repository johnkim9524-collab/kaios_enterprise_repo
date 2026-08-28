import fs from 'node:fs';

const receipt = JSON.parse(fs.readFileSync('coordination/kidults/provider/psa-120-admission-controls-receipt-v1.json', 'utf8'));

const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const hasExactKeys = (value, expected) => isObject(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());

if (!hasExactKeys(receipt, ['receipt_id', 'state', 'branch', 'controls', 'empirical', 'authority'])) throw new Error('PSA_RECEIPT_ROOT_SCHEMA_INVALID');
if (receipt.receipt_id !== 'KIDULTS_PSA_120_ADMISSION_CONTROLS_RECEIPT_V1') throw new Error('PSA_RECEIPT_ID_INVALID');
if (receipt.state !== 'CONTROL_IMPLEMENTATION_STAGED') throw new Error('PSA_RECEIPT_STATE_INVALID');
if (receipt.branch !== 'kpmo/psa-lawful-intake-runtime-hardening-v1') throw new Error('PSA_RECEIPT_BRANCH_INVALID');

const controlKeys = [
  'acquisition_orchestrator',
  'ci_workflow',
  'encrypted_private_store',
  'field_map',
  'keyed_reference_tokens',
  'lawful_private_batch_intake',
  'lawful_manifest_contract',
  'quota_guard',
  'retention_deletion_receipt',
  'source_authority_registry',
  'validator'
];
if (!hasExactKeys(receipt.controls, controlKeys)) throw new Error('PSA_RECEIPT_CONTROLS_SCHEMA_INVALID');
for (const [key, value] of Object.entries(receipt.controls)) {
  if (value !== 'IMPLEMENTED') throw new Error(`PSA_CONTROL_NOT_IMPLEMENTED_${key}`);
}

const empiricalKeys = [
  'declared_only_count_admissible',
  'declared_only_known_cert_count_at_receipt',
  'graded_population_at_receipt',
  'live_acquisition_at_receipt',
  'manifest_source',
  'provider_calls_this_change',
  'provenance_bound_lawful_known_cert_manifest_at_receipt',
  'runtime_activation_at_receipt',
  'source_authority_registry_state_at_receipt'
];
if (!hasExactKeys(receipt.empirical, empiricalKeys)) throw new Error('PSA_RECEIPT_EMPIRICAL_SCHEMA_INVALID');
if (receipt.empirical.manifest_source !== 'coordination/kidults/provider/psa-120-known-cert-manifest-v1.json') throw new Error('PSA_RECEIPT_MANIFEST_SOURCE_INVALID');
if (receipt.empirical.provenance_bound_lawful_known_cert_manifest_at_receipt !== '0/120') throw new Error('PSA_RECEIPT_PROVENANCE_PROGRESS_INFLATED');
if (receipt.empirical.declared_only_known_cert_count_at_receipt !== 2 || receipt.empirical.declared_only_count_admissible !== false) throw new Error('PSA_RECEIPT_DECLARED_ONLY_COUNT_BOUNDARY_INVALID');
if (receipt.empirical.live_acquisition_at_receipt !== 'NOT_RUN' || receipt.empirical.graded_population_at_receipt !== '0/120') throw new Error('PSA_RECEIPT_EMPIRICAL_EXECUTION_INVALID');
if (receipt.empirical.provider_calls_this_change !== 0
  || receipt.empirical.source_authority_registry_state_at_receipt !== 'NO_ACTIVE_SOURCE_AUTHORITIES'
  || receipt.empirical.runtime_activation_at_receipt !== 'HOLD_PENDING_SHARED_QUOTA_AND_SCHEDULED_RETENTION_RUNTIME') {
  throw new Error('PSA_RECEIPT_RUNTIME_OR_AUTHORITY_STATE_INFLATED');
}

if (!hasExactKeys(receipt.authority, ['g5', 'live_acquisition_authorized_by_this_receipt', 'production', 'public'])) throw new Error('PSA_RECEIPT_AUTHORITY_SCHEMA_INVALID');
if (receipt.authority.live_acquisition_authorized_by_this_receipt !== false
  || receipt.authority.production !== 'HOLD'
  || receipt.authority.public !== 'HOLD'
  || receipt.authority.g5 !== 'HOLD') throw new Error('PSA_AUTHORITY_BOUNDARY_INVALID');

console.log(JSON.stringify({
  state: 'PSA_ADMISSION_RECEIPT_VERIFIED_PASS',
  provenance_bound_manifest_at_receipt: '0/120',
  historical_declared_only_count: 2,
  historical_declared_only_count_admissible: false,
  live_acquisition_authorized: false
}, null, 2));
