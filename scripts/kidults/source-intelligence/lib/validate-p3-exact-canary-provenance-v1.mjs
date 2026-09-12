import fs from 'node:fs';
import crypto from 'node:crypto';

const sha256 = value => /^sha256:[0-9a-f]{64}$/.test(value || '') && !/^sha256:0{64}$/.test(value);
const canonical = value => Array.isArray(value)
  ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
    : value;
const canonicalHash = value => `sha256:${crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')}`;
const fileHash = path => `sha256:${crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex')}`;
const assert = (condition, code) => { if (!condition) throw new Error(code); };
const regularFile = (path, name) => {
  assert(typeof path === 'string' && path.length > 0, `P3_PATH_MISSING:${name}`);
  const stat = fs.lstatSync(path);
  assert(stat.isFile() && !stat.isSymbolicLink(), `P3_INPUT_NOT_REGULAR_FILE:${name}`);
};
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const env = name => {
  const value = String(process.env[name] || '');
  assert(value, `P3_EXPECTED_PROVENANCE_REQUIRED:${name}`);
  return value;
};

function transactionBindings(evidence) {
  const cohort = evidence.launch_cohort || {};
  const currentSold = (evidence.evidence_records || []).filter(record => record?.temporality === 'CURRENT_MARKET'
    && record.market_observation_type === 'SOLD_TRANSACTION' && record.rights_state === 'ALLOW');
  const bindings = currentSold.map(record => {
    const identity = {
      source_id: record.source_id,
      source_owner_id: record.source_owner_id,
      factual_origin_id: record.factual_origin_id,
      source_record_id: record.source_record_id,
      asset_identity_id: record.asset_identity_id,
      market_venue_id: record.market_venue_id,
      transaction_occurred_at: record.transaction_occurred_at,
      sold_price: record.sold_price,
    };
    return {
      evidence_id: record.evidence_id,
      transaction_identity_digest: canonicalHash(identity),
      evidence_record_digest: canonicalHash(record),
      source_id: record.source_id,
      source_content_snapshot_sha256: record.rights_assertion?.source_content_snapshot_sha256,
    };
  }).sort((left, right) => String(left.evidence_id).localeCompare(String(right.evidence_id)));
  assert(bindings.length === 5, 'P3_CANARY_EXACT_FIVE_TRANSACTIONS_REQUIRED');
  for (const binding of bindings) assert(typeof binding.evidence_id === 'string' && sha256(binding.transaction_identity_digest)
    && sha256(binding.evidence_record_digest) && typeof binding.source_id === 'string'
    && sha256(binding.source_content_snapshot_sha256), 'P3_CANARY_TRANSACTION_BINDING_INVALID');
  assert(new Set(bindings.map(value => value.evidence_id)).size === 5, 'P3_CANARY_EVIDENCE_ID_DUPLICATE');
  assert(new Set(bindings.map(value => value.transaction_identity_digest)).size === 5, 'P3_CANARY_TRANSACTION_IDENTITY_DUPLICATE');
  assert(new Set(bindings.map(value => value.evidence_record_digest)).size === 5, 'P3_CANARY_EVIDENCE_DIGEST_DUPLICATE');
  assert(JSON.stringify(cohort.event_ids) === JSON.stringify(bindings.map(value => value.evidence_id)), 'P3_COHORT_EVENT_IDS_DRIFT');
  assert(JSON.stringify(cohort.event_digests) === JSON.stringify(bindings.map(value => value.evidence_record_digest).sort()), 'P3_COHORT_EVENT_DIGESTS_DRIFT');
  assert(JSON.stringify(cohort.canary_transactions) === JSON.stringify(bindings), 'P3_COHORT_TRANSACTIONS_DRIFT');
  assert(cohort.transaction_binding_digest === canonicalHash({ cohort_digest: cohort.cohort_digest, transactions: bindings }), 'P3_COHORT_TRANSACTION_BINDING_DIGEST_INVALID');
  return bindings;
}

export function validateP3ExactCanaryProvenance({ contract, paths }) {
  const { p3Receipt, snapshot, evidence, providerReceipt } = paths;
  if (![p3Receipt, snapshot, evidence, providerReceipt].some(Boolean)) {
    assert(![p3Receipt, snapshot, evidence, providerReceipt].some(Boolean), 'P3_PAIR_INPUTS_PARTIAL');
    return null;
  }
  for (const [name, path] of Object.entries({ p3Receipt, snapshot, evidence, providerReceipt })) regularFile(path, name);
  const p3 = JSON.parse(fs.readFileSync(p3Receipt, 'utf8'));
  const snapshotDocument = JSON.parse(fs.readFileSync(snapshot, 'utf8'));
  const evidenceDocument = JSON.parse(fs.readFileSync(evidence, 'utf8'));
  const provider = JSON.parse(fs.readFileSync(providerReceipt, 'utf8'));
  const gate = contract.p3_exact_canary_gate;
  const policy = JSON.parse(fs.readFileSync(gate.canonical_sample_policy, 'utf8'));
  const tier = (policy.tiers || []).find(value => value.id === gate.sample_tier
    && value.purpose === gate.sample_purpose && value.claim_target === gate.claim_target);
  const promotion = policy.promotion_matrix?.[gate.sample_tier];
  const binding = p3.sample_policy_binding || {};
  assert(p3.id === gate.receipt_id && p3.version === gate.receipt_version
    && p3.state === gate.receipt_state, 'P3_CANARY_RECEIPT_ID_VERSION_STATE_INVALID');
  assert(p3.atomic_directory_commit === true && p3.immutable_storage_receipt === null && p3.artifact_attestation === null
    && p3.track_b_submission_eligible === false && p3.track_b_assessment_started === false
    && p3.public_release === 'HOLD' && p3.production === 'HOLD', 'P3_ATTESTATION_PENDING_AUTHORITY_ESCALATION');
  assert(tier && tier.min_n === 5 && tier.max_n === 5 && promotion?.maximum_claim === gate.maximum_claim
    && promotion.release_allowed === false, 'P3_CANARY_CANONICAL_POLICY_INVALID');
  assert(binding.canonical_policy === gate.canonical_sample_policy && binding.policy_id === policy.id
    && binding.policy_version === policy.version && binding.policy_digest === canonicalHash(policy)
    && binding.pair_purpose === tier.purpose && binding.claim_target === tier.claim_target
    && binding.sample_tier === tier.id && binding.min_n === 5 && binding.max_n === 5
    && binding.maximum_claim === promotion.maximum_claim && binding.release_allowed === false,
  'P3_CANARY_SAMPLE_POLICY_BINDING_INVALID');
  assert(snapshotDocument.snapshot_id === p3.snapshot_id && evidenceDocument.package_id === p3.evidence_package_id
    && snapshotDocument.bound_evidence_package_id === evidenceDocument.package_id
    && evidenceDocument.bound_snapshot_id === snapshotDocument.snapshot_id, 'P3_PAIR_CROSS_BINDING_INVALID');
  assert(p3.snapshot_file_sha256 === fileHash(snapshot) && p3.evidence_file_sha256 === fileHash(evidence)
    && p3.exact_pair_digest === canonicalHash({ snapshot: snapshotDocument, evidence: evidenceDocument }), 'P3_PAIR_FILE_OR_DIGEST_INVALID');
  assert(p3.upstream_binding_receipt_sha256 === evidenceDocument.upstream_binding_receipt_sha256
    && p3.upstream_binding_receipt_sha256 === snapshotDocument.upstream_binding_receipt_sha256, 'P3_UPSTREAM_BINDING_DRIFT');
  const bindings = transactionBindings(evidenceDocument);
  assert(p3.admitted_current_sold_count === 5 && JSON.stringify(p3.canary_transactions) === JSON.stringify(bindings)
    && p3.canary_transaction_binding_digest === canonicalHash({ cohort_digest: p3.launch_cohort_digest, transactions: bindings }),
  'P3_RECEIPT_TRANSACTION_BINDING_INVALID');
  assert(p3.launch_cohort_digest === evidenceDocument.launch_cohort?.cohort_digest
    && p3.canary_transaction_binding_digest === evidenceDocument.launch_cohort?.transaction_binding_digest
    && p3.sample_plan_sha256 === evidenceDocument.launch_cohort?.sample_plan_sha256,
  'P3_RECEIPT_COHORT_BINDING_INVALID');
  const sourceIds = [...new Set(bindings.map(value => value.source_id))].sort();
  assert(JSON.stringify(p3.canary_source_ids) === JSON.stringify(sourceIds)
    && p3.canary_source_binding_digest === evidenceDocument.launch_cohort?.source_binding_digest,
  'P3_RECEIPT_SOURCE_BINDING_INVALID');
  const now = Date.now();
  const asOf = Date.parse(p3.as_of || '');
  const maximumAge = Number(gate.receipt_time_policy?.maximum_age_hours) * 3600000;
  const futureSkew = Number(gate.receipt_time_policy?.future_skew_seconds) * 1000;
  assert(iso(p3.as_of) && Number.isFinite(maximumAge) && Number.isFinite(futureSkew)
    && asOf <= now + futureSkew && now - asOf <= maximumAge, 'P3_RECEIPT_STALE_OR_FUTURE_DATED');
  const expected = {
    repository: env('KIDULTS_EXPECTED_P3_REPOSITORY'), workflow_path: env('KIDULTS_EXPECTED_P3_WORKFLOW_PATH'),
    protected_ref: env('KIDULTS_EXPECTED_P3_PROTECTED_REF'), source_sha: env('KIDULTS_EXPECTED_P3_SOURCE_SHA'),
    workflow_run_id: env('KIDULTS_EXPECTED_P3_WORKFLOW_RUN_ID'), workflow_run_attempt: Number(env('KIDULTS_EXPECTED_P3_WORKFLOW_RUN_ATTEMPT')),
    event_name: env('KIDULTS_EXPECTED_P3_EVENT_NAME'), artifact_name: env('KIDULTS_EXPECTED_P3_ARTIFACT_NAME'),
    artifact_id: env('KIDULTS_EXPECTED_P3_ARTIFACT_ID'), artifact_digest: env('KIDULTS_EXPECTED_P3_ARTIFACT_DIGEST'), artifact_url: env('KIDULTS_EXPECTED_P3_ARTIFACT_URL'),
  };
  const expectedArtifactName = `${gate.provider_artifact_identity.artifact_name_prefix}${expected.source_sha}-${expected.workflow_run_id}`;
  const expectedArtifactUrl = `${gate.provider_artifact_identity.artifact_url_base}/${expected.repository}/actions/runs/${expected.workflow_run_id}/artifacts/${expected.artifact_id}`;
  assert(expected.repository === gate.provider_artifact_identity.repository && expected.workflow_path === gate.provider_artifact_identity.workflow_path
    && expected.protected_ref === gate.provider_artifact_identity.protected_ref && expected.artifact_name === expectedArtifactName
    && gate.provider_artifact_identity.allowed_events?.includes(expected.event_name) && /^[a-f0-9]{40}$/.test(expected.source_sha)
    && /^[1-9][0-9]*$/.test(expected.workflow_run_id) && Number.isInteger(expected.workflow_run_attempt) && expected.workflow_run_attempt >= 1
    && /^[1-9][0-9]*$/.test(expected.artifact_id) && sha256(expected.artifact_digest) && expected.artifact_url === expectedArtifactUrl,
  'P3_EXPECTED_PROVENANCE_INVALID');
  assert(canonicalHash(provider) === canonicalHash({
    id: gate.provider_artifact_identity.provider_receipt_id, version: gate.provider_artifact_identity.provider_receipt_version,
    state: 'PROVIDER_ARTIFACT_RECEIPT_CAPTURED_ATTESTATION_PENDING', repository: expected.repository,
    workflow_path: expected.workflow_path, protected_ref: expected.protected_ref, source_ref: expected.protected_ref, source_sha: expected.source_sha,
    workflow_run_id: expected.workflow_run_id, workflow_run_attempt: expected.workflow_run_attempt, event_name: expected.event_name,
    artifact_name: expected.artifact_name, artifact_id: expected.artifact_id, artifact_digest: expected.artifact_digest,
    artifact_url: expected.artifact_url, exact_pair_digest: p3.exact_pair_digest,
    pair_receipt_sha256: fileHash(p3Receipt),
    upstream_binding_receipt_sha256: p3.upstream_binding_receipt_sha256,
    authority_scope: 'BOUNDED_CANARY_ADAPTER_ADMISSION_ONLY', track_b_submission_eligible: false,
    public_release: 'HOLD', production: 'HOLD',
  }), 'P3_PROVIDER_PROVENANCE_MISMATCH');
  return { p3, receipt_digest: canonicalHash(p3), bindings, bindingBySource: new Map(sourceIds.map(sourceId => [sourceId,
    bindings.filter(value => value.source_id === sourceId)])) };
}
