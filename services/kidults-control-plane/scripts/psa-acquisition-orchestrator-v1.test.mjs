import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { runPsaAcquisitionWave } from '../src/psa-acquisition-orchestrator.mjs';
import { createPsaCertReferenceToken } from '../src/psa-reference-token.mjs';

const keyBase64 = Buffer.alloc(32, 11).toString('base64');
const certs = Array.from({ length: 120 }, (_, index) => String(900_000_000_000 + index));
const fields = ['Brand','CardGrade','CardNumber','Category','CertNumber','GradeDescription','IsDualCert','IsPSADNA','LabelType','PopulationHigher','SpecID','SpecNumber','Subject','TotalPopulation','TotalPopulationWithQualifier','Variety','Year'];
const digest = value => `sha256:${createHash('sha256').update(String(value)).digest('hex')}`;
const token = (prefix, index) => `${prefix}${index.toString(16).padStart(64, '0')}`;
const entries = certs.map((cert, index) => ({
  admission_purpose: 'PRIVATE_ER_EVALUATION_ONLY', cert_reference_digest: createPsaCertReferenceToken({ keyBase64, certNumber: cert }),
  collector_id: 'KPMO_AUTHORIZED_OPERATOR', empirical_admissible: true, enumeration_used: false, non_enumeration_verified: true,
  raw_cert_value_in_repository: false, rights_basis_id: 'PSA_BOUNDED_PRIVATE_EVALUATION_2026_08_24',
  source_authority_entry_digest: token('sha256:', index + 1), source_authority_id: 'PSA_TEST_AUTHORITY_V1',
  source_bundle_token: token('hmac-sha256:v1:', 1000), source_class: 'RIGHTS_CLEAR_PRIVATE_SOURCE_RECORD',
  source_observed_at: '2026-08-28T00:00:00.000Z', source_receipt_digest: token('sha256:', 2000 + index),
  source_record_token: token('hmac-sha256:v1:', 3000 + index),
}));
const manifest = { id: 'KIDULTS_PSA_120_KNOWN_CERT_MANIFEST_V1', state: 'MANIFEST_READY_RUNTIME_GATES_PENDING', target_count: 120,
  provenance_bound_admissible_count: 120, remaining_required: 0, cert_values_in_repository: false,
  live_acquisition: 'HOLD_UNTIL_RUNTIME_GATES', rules: { provider_daily_limit: 100 }, entries };
const fieldMap = { provider_id: 'psa-public-api', state: 'APPROVED_FOR_BOUNDED_PRIVATE_EVALUATION', field_map_id: 'PSA_FIELD_MAP_V1',
  observed_schema_digest: digest(JSON.stringify(fields.map(field => `PSACert.${field}`).sort())), allowed_fields: fields,
  mappings: fields.map((field, index) => ({ source_path: `PSACert.${field}`, canonical_field: field === 'CertNumber' ? 'certification_number' : `field_${index}`, required: field === 'CertNumber' })),
  retention_days_max: 30, raw_public_display: false, raw_redistribution: false,
  market_or_transaction_fields_admitted: false, production_authority: false };
const rightsReceiptRef = 'rights:v1';
const fieldMapRef = 'field-map:v1';
const endpointContract = { provider_id: 'psa-public-api', method: 'GET', endpoint_template: 'https://api.psacard.com/publicapi/cert/GetByCertNumber/{cert_number}', documentation_ref: 'psa-docs:v1' };
const manifestDigest = digest((value => {
  const stable = item => Array.isArray(item) ? `[${item.map(stable).join(',')}]` : item && typeof item === 'object' ? `{${Object.keys(item).sort().map(key => `${JSON.stringify(key)}:${stable(item[key])}`).join(',')}}` : JSON.stringify(item);
  return stable(value);
})(manifest));
const runtimeGate = { provider_id: 'psa-public-api', state: 'ACTIVE_VERIFIED', persistent_private_store: 'VERIFIED_ACTIVE', retention_scheduler: 'VERIFIED_ACTIVE',
  retention_health: 'VERIFIED_PASS', quota_ledger: 'VERIFIED_ACTIVE', kill_switch: 'VERIFIED_ACTIVE', manifest_digest: manifestDigest,
  rights_receipt_ref: rightsReceiptRef, field_map_ref: fieldMapRef, field_map_id: fieldMap.field_map_id,
  documented_endpoint_ref: endpointContract.documentation_ref, expires_at: '2026-09-30T00:00:00.000Z' };
const rightsReceipt = { provider_id: 'psa-public-api', evidence_ref: rightsReceiptRef, source_message_immutability: 'VERIFIED',
  collect: 'ALLOW', store_private: 'ALLOW', derive_internal_er_calibration: 'ALLOW', internal_human_qa: 'ALLOW',
  public_display: 'BLOCK', redistribute: 'BLOCK', retention_days: 30 };
const privateStore = { capabilities: ['ENCRYPTION_AT_REST','ACCESS_AUDIT','DELETE_BY_ENFORCEMENT'] };
const health = async () => ({ state: 'VERIFIED_PASS', persistent_private_store: 'VERIFIED_ACTIVE', retention_scheduler: 'VERIFIED_ACTIVE', quota_ledger: 'VERIFIED_ACTIVE' });

function harness({ day = '2026-08-28T00:00:00.000Z', status = 200 } = {}) {
  const byReference = new Map(entries.map((entry, index) => [entry.cert_reference_digest, certs[index]]));
  const events = [];
  let persisted;
  return {
    events,
    options: {
      manifest, runtimeGate, rightsReceipt, rightsReceiptRef, fieldMap, fieldMapRef, endpointContract,
      accessToken: 'runtime-token-secret', certReferenceKeyBase64: keyBase64, privateStore,
      resolvePrivateCert: async ({ certReferenceDigest }) => byReference.get(certReferenceDigest),
      reserveQuotaAttempt: async input => { events.push(['quota', input.requestReferenceDigest]); return { decision: 'RESERVED_NEW', provider_id: 'psa-public-api', request_reference_digest: input.requestReferenceDigest, raw_cert_in_receipt: false }; },
      fetchImpl: async url => { events.push(['fetch', url]); const cert = url.split('/').at(-1); const PSACert = Object.fromEntries(fields.map(field => [field, field === 'CertNumber' ? cert : null])); return { ok: status === 200, status, text: async () => JSON.stringify({ PSACert }) }; },
      stageEvaluation: async input => { events.push(['stage', input.certReferenceDigest]); return { state: 'VERIFIED_PASS', cert_reference_digest: input.certReferenceDigest, raw_payload_in_receipt: false }; },
      admitNormalized: async () => ({ state: 'COMMITTED' }), runtimeHealthCheck: health, killSwitchCheck: async () => false,
      persistCheckpoint: async value => { persisted = value; return { state: 'VERIFIED_PERSISTED', authentication: value.authentication }; },
      validateManifestForAcquisition: async ({ manifestDigest: observedDigest }) => ({
        state: 'VERIFIED_PASS', manifest_digest: observedDigest, authority_registry_state: 'VERIFIED_ACTIVE',
        authority_registry_digest: token('sha256:', 9000), provenance_bound_count: 120, raw_cert_in_receipt: false,
      }),
      verifyRuntimeGate: async ({ runtimeGateDigest }) => ({
        state: 'VERIFIED_PASS', runtime_gate_digest: runtimeGateDigest, authentication: 'VERIFIED',
        verifier_id: 'PSA_RUNTIME_GATE_VERIFIER_V1', raw_secret_in_receipt: false,
      }),
      runId: `run-${day.slice(0, 10)}`, dispatchId: `dispatch-${day.slice(0, 10)}`, clock: () => new Date(day),
    },
    checkpoint: () => persisted,
  };
}

test('exact-120 acquisition runs 90 then resumes 30 on the next UTC day with quota before every fetch', async () => {
  const first = harness();
  const wave1 = await runPsaAcquisitionWave(first.options);
  assert.equal(wave1.receipt.staged_this_run, 90);
  assert.equal(wave1.checkpoint.state, 'READY_FOR_NEXT_UTC_DAY');
  assert.equal(first.events.filter(([event]) => event === 'quota').length, 90);
  assert(first.events.every((event, index) => event[0] !== 'fetch' || first.events[index - 1][0] === 'quota'));
  const second = harness({ day: '2026-08-29T00:00:00.000Z' });
  const wave2 = await runPsaAcquisitionWave({ ...second.options, checkpoint: wave1.checkpoint });
  assert.equal(wave2.receipt.staged_this_run, 30);
  assert.equal(wave2.receipt.total_completed_count, 120);
  assert.equal(wave2.checkpoint.state, 'COMPLETE');
  const serialized = JSON.stringify(wave2);
  assert(!serialized.includes(certs[0]));
  assert(!serialized.includes('runtime-token-secret'));
  assert(!serialized.includes(keyBase64));
});

test('incomplete manifest fails before resolution, quota, or fetch', async () => {
  const context = harness();
  await assert.rejects(() => runPsaAcquisitionWave({ ...context.options, manifest: { ...manifest, entries: manifest.entries.slice(0, 119) } }), /EXACT_120/);
  assert.deepEqual(context.events, []);
});

test('429 stops after one counted call with no retry and stopped checkpoint cannot replay', async () => {
  const context = harness({ status: 429 });
  const result = await runPsaAcquisitionWave(context.options);
  assert.equal(result.receipt.stop_reason, 'PROVIDER_RATE_LIMIT_STOP');
  assert.equal(result.receipt.provider_calls_this_run, 1);
  assert.equal(context.events.filter(([event]) => event === 'fetch').length, 1);
  const replay = harness();
  await assert.rejects(() => runPsaAcquisitionWave({ ...replay.options, checkpoint: result.checkpoint }), /CHECKPOINT_REVIEW_REQUIRED/);
  assert.deepEqual(replay.events, []);
});

test('private resolver and provider payload substitution stop without further calls or raw receipt leakage', async () => {
  const privateSwap = harness();
  privateSwap.options.resolvePrivateCert = async () => certs[1];
  const beforeFetch = await runPsaAcquisitionWave(privateSwap.options);
  assert.equal(beforeFetch.receipt.stop_reason, 'PRIVATE_CERT_REFERENCE_SUBSTITUTION');
  assert.equal(privateSwap.events.length, 0);
  const providerSwap = harness();
  providerSwap.options.fetchImpl = async url => {
    providerSwap.events.push(['fetch', url]);
    const PSACert = Object.fromEntries(fields.map(field => [field, field === 'CertNumber' ? certs[1] : null]));
    return { ok: true, status: 200, text: async () => JSON.stringify({ PSACert }) };
  };
  const afterFetch = await runPsaAcquisitionWave(providerSwap.options);
  assert.equal(afterFetch.receipt.stop_reason, 'PSA_ACQUISITION_PAYLOAD_CERT_SUBSTITUTION');
  assert.equal(providerSwap.events.filter(([event]) => event === 'stage').length, 0);
  assert(!JSON.stringify(afterFetch).includes(certs[1]));
});

test('forged manifest authority, unauthenticated runtime gate, and incomplete rights fail before resolver, quota, or fetch', async t => {
  await t.test('manifest authority', async () => {
    const context = harness();
    context.options.validateManifestForAcquisition = async ({ manifestDigest: observedDigest }) => ({
      state: 'VERIFIED_PASS', manifest_digest: observedDigest, authority_registry_state: 'UNVERIFIED',
      authority_registry_digest: token('sha256:', 9000), provenance_bound_count: 120, raw_cert_in_receipt: false,
    });
    await assert.rejects(() => runPsaAcquisitionWave(context.options), /MANIFEST_AUTHORITY_VERIFICATION_FAILED/);
    assert.deepEqual(context.events, []);
  });

  await t.test('runtime gate authentication', async () => {
    const context = harness();
    context.options.verifyRuntimeGate = async ({ runtimeGateDigest }) => ({
      state: 'VERIFIED_PASS', runtime_gate_digest: runtimeGateDigest, authentication: 'SELF_ASSERTED',
      verifier_id: 'PSA_RUNTIME_GATE_VERIFIER_V1', raw_secret_in_receipt: false,
    });
    await assert.rejects(() => runPsaAcquisitionWave(context.options), /RUNTIME_GATE_AUTH_FAILED/);
    assert.deepEqual(context.events, []);
  });

  await t.test('rights boundary', async () => {
    const context = harness();
    context.options.rightsReceipt = { ...rightsReceipt, store_private: 'BLOCK' };
    await assert.rejects(() => runPsaAcquisitionWave(context.options), /RIGHTS_REF_INVALID/);
    assert.deepEqual(context.events, []);
  });
});
