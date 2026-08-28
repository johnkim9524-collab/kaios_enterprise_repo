import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import {
  createPsaCertReferenceToken,
  decodePsaReferenceKey,
  equalPsaReferenceTokens,
  PSA_HMAC_TOKEN_PATTERN,
} from './psa-reference-token.mjs';

const TARGET = 120;
const MAX_RUN_CALLS = 90;
const MAX_BODY_BYTES = 1_048_576;
const ENDPOINT = 'https://api.psacard.com/publicapi/cert/GetByCertNumber/{cert_number}';
const SHA256 = /^sha256:[0-9a-f]{64}$/;
const PSA_FIELDS = ['Brand','CardGrade','CardNumber','Category','CertNumber','GradeDescription','IsDualCert','IsPSADNA','LabelType','PopulationHigher','SpecID','SpecNumber','Subject','TotalPopulation','TotalPopulationWithQualifier','Variety','Year'];
const ENTRY_KEYS = [
  'admission_purpose','cert_reference_digest','collector_id','empirical_admissible','enumeration_used',
  'non_enumeration_verified','raw_cert_value_in_repository','rights_basis_id','source_authority_entry_digest',
  'source_authority_id','source_bundle_token','source_class','source_observed_at','source_receipt_digest','source_record_token',
];
const canonical = value => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};
const sha256 = value => `sha256:${createHash('sha256').update(String(value)).digest('hex')}`;
const fail = code => { const error = new Error(code); error.code = code; throw error; };
const sameKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
const instant = clock => {
  const value = new Date(clock());
  if (Number.isNaN(value.valueOf())) fail('PSA_ACQUISITION_CLOCK_INVALID');
  return value;
};
const nextUtcDay = date => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1)).toISOString().slice(0, 10);

function assertManifest(manifest) {
  if (manifest?.id !== 'KIDULTS_PSA_120_KNOWN_CERT_MANIFEST_V1'
    || manifest.state !== 'MANIFEST_READY_RUNTIME_GATES_PENDING'
    || manifest.target_count !== TARGET
    || manifest.provenance_bound_admissible_count !== TARGET
    || manifest.remaining_required !== 0
    || manifest.cert_values_in_repository !== false
    || manifest.live_acquisition !== 'HOLD_UNTIL_RUNTIME_GATES'
    || manifest.rules?.provider_daily_limit !== 100
    || !Array.isArray(manifest.entries)
    || manifest.entries.length !== TARGET) fail('PSA_ACQUISITION_EXACT_120_MANIFEST_REQUIRED');
  const references = new Set();
  for (const entry of manifest.entries) {
    if (!sameKeys(entry, ENTRY_KEYS)
      || !PSA_HMAC_TOKEN_PATTERN.test(String(entry.cert_reference_digest || ''))
      || !SHA256.test(String(entry.source_authority_entry_digest || ''))
      || !PSA_HMAC_TOKEN_PATTERN.test(String(entry.source_bundle_token || ''))
      || !PSA_HMAC_TOKEN_PATTERN.test(String(entry.source_record_token || ''))
      || !SHA256.test(String(entry.source_receipt_digest || ''))
      || entry.rights_basis_id !== 'PSA_BOUNDED_PRIVATE_EVALUATION_2026_08_24'
      || entry.admission_purpose !== 'PRIVATE_ER_EVALUATION_ONLY'
      || entry.non_enumeration_verified !== true
      || entry.enumeration_used !== false
      || entry.raw_cert_value_in_repository !== false
      || entry.empirical_admissible !== true
      || references.has(entry.cert_reference_digest)) fail('PSA_ACQUISITION_MANIFEST_ENTRY_INVALID');
    references.add(entry.cert_reference_digest);
  }
  return [...manifest.entries].sort((a, b) => a.cert_reference_digest.localeCompare(b.cert_reference_digest));
}

function assertRuntime({ runtimeGate, runtimeGateHealth, manifestDigest, rightsReceipt, rightsReceiptRef, fieldMap, fieldMapRef, endpointContract, now }) {
  if (runtimeGate?.provider_id !== 'psa-public-api' || runtimeGate.state !== 'ACTIVE_VERIFIED'
    || runtimeGate.persistent_private_store !== 'VERIFIED_ACTIVE'
    || runtimeGate.retention_scheduler !== 'VERIFIED_ACTIVE'
    || runtimeGate.retention_health !== 'VERIFIED_PASS'
    || runtimeGate.quota_ledger !== 'VERIFIED_ACTIVE'
    || runtimeGate.kill_switch !== 'VERIFIED_ACTIVE'
    || runtimeGate.manifest_digest !== manifestDigest
    || runtimeGate.rights_receipt_ref !== rightsReceiptRef
    || runtimeGate.field_map_ref !== fieldMapRef
    || Number.isNaN(Date.parse(runtimeGate.expires_at))
    || Date.parse(runtimeGate.expires_at) <= now.valueOf()) fail('PSA_ACQUISITION_RUNTIME_GATE_NOT_ACTIVE');
  if (runtimeGateHealth?.state !== 'VERIFIED_PASS'
    || runtimeGateHealth.persistent_private_store !== 'VERIFIED_ACTIVE'
    || runtimeGateHealth.retention_scheduler !== 'VERIFIED_ACTIVE'
    || runtimeGateHealth.quota_ledger !== 'VERIFIED_ACTIVE') fail('PSA_ACQUISITION_RUNTIME_HEALTH_FAILED');
  if (rightsReceipt?.provider_id !== 'psa-public-api' || rightsReceipt.evidence_ref !== rightsReceiptRef
    || rightsReceipt.source_message_immutability !== 'VERIFIED'
    || !['collect','store_private','derive_internal_er_calibration','internal_human_qa'].every(right => rightsReceipt[right] === 'ALLOW')
    || rightsReceipt.public_display !== 'BLOCK' || rightsReceipt.redistribute !== 'BLOCK'
    || !Number.isSafeInteger(rightsReceipt.retention_days) || rightsReceipt.retention_days < 1 || rightsReceipt.retention_days > 30) {
    fail('PSA_ACQUISITION_RIGHTS_REF_INVALID');
  }
  if (fieldMap?.provider_id !== 'psa-public-api' || fieldMap.state !== 'APPROVED_FOR_BOUNDED_PRIVATE_EVALUATION'
    || fieldMap.field_map_id !== runtimeGate.field_map_id || fieldMapRef !== runtimeGate.field_map_ref
    || !SHA256.test(String(fieldMap.observed_schema_digest || ''))
    || !Array.isArray(fieldMap.allowed_fields) || fieldMap.allowed_fields.length !== PSA_FIELDS.length
    || JSON.stringify([...fieldMap.allowed_fields].sort()) !== JSON.stringify([...PSA_FIELDS].sort())
    || !Array.isArray(fieldMap.mappings) || fieldMap.mappings.length !== PSA_FIELDS.length
    || new Set(fieldMap.mappings.map(mapping => mapping.source_path)).size !== PSA_FIELDS.length
    || new Set(fieldMap.mappings.map(mapping => mapping.canonical_field)).size !== PSA_FIELDS.length
    || JSON.stringify(fieldMap.mappings.map(mapping => mapping.source_path).sort()) !== JSON.stringify(PSA_FIELDS.map(field => `PSACert.${field}`).sort())
    || fieldMap.mappings.filter(mapping => mapping.required).length !== 1
    || fieldMap.mappings.find(mapping => mapping.required)?.source_path !== 'PSACert.CertNumber'
    || fieldMap.mappings.find(mapping => mapping.source_path === 'PSACert.CertNumber')?.canonical_field !== 'certification_number'
    || fieldMap.retention_days_max !== 30 || fieldMap.raw_public_display !== false
    || fieldMap.raw_redistribution !== false || fieldMap.market_or_transaction_fields_admitted !== false
    || fieldMap.production_authority !== false
    || fieldMap.observed_schema_digest !== sha256(JSON.stringify(PSA_FIELDS.map(field => `PSACert.${field}`).sort()))) {
    fail('PSA_ACQUISITION_SCHEMA_REF_INVALID');
  }
  if (!sameKeys(endpointContract, ['provider_id','method','endpoint_template','documentation_ref'])
    || endpointContract.provider_id !== 'psa-public-api' || endpointContract.method !== 'GET'
    || endpointContract.endpoint_template !== ENDPOINT
    || endpointContract.documentation_ref !== runtimeGate.documented_endpoint_ref) fail('PSA_ACQUISITION_DOCUMENTED_ENDPOINT_INVALID');
}

function signCheckpoint(data, key) {
  const authentication = `hmac-sha256:v1:${createHmac('sha256', key).update(`KIDULTS_PSA_ACQUISITION_CHECKPOINT_V1\0${canonical(data)}`).digest('hex')}`;
  return { ...data, authentication };
}

function checkpointData(checkpoint, key, manifestDigest, references, perRunCeiling, runIdDigest, now, bindings) {
  if (!checkpoint) return {
    checkpoint_id: 'KIDULTS_PSA_ACQUISITION_CHECKPOINT_V1', state: 'IN_PROGRESS', manifest_digest: manifestDigest,
    authority_registry_digest: bindings.authorityRegistryDigest, runtime_gate_digest: bindings.runtimeGateDigest,
    manifest_verification_receipt_digest: bindings.manifestVerificationReceiptDigest,
    runtime_gate_verification_receipt_digest: bindings.runtimeGateVerificationReceiptDigest,
    per_run_ceiling: perRunCeiling, completed_reference_digests: [], attempted_reference_digests: [],
    attempt_receipt_digests: [], total_provider_calls: 0, total_quota_reservations: 0,
    current_run_id_digest: runIdDigest, current_run_attempt_count: 0, resume_not_before_utc_day: null,
    stop_reason: null, updated_at: now.toISOString(),
  };
  const { authentication, ...data } = checkpoint;
  const expected = signCheckpoint(data, key).authentication;
  if (!PSA_HMAC_TOKEN_PATTERN.test(String(authentication || ''))
    || !timingSafeEqual(Buffer.from(authentication), Buffer.from(expected))) fail('PSA_ACQUISITION_CHECKPOINT_AUTH_INVALID');
  if (data.manifest_digest !== manifestDigest || data.per_run_ceiling !== perRunCeiling
    || data.authority_registry_digest !== bindings.authorityRegistryDigest
    || data.runtime_gate_digest !== bindings.runtimeGateDigest
    || data.manifest_verification_receipt_digest !== bindings.manifestVerificationReceiptDigest
    || data.runtime_gate_verification_receipt_digest !== bindings.runtimeGateVerificationReceiptDigest) {
    fail('PSA_ACQUISITION_CHECKPOINT_SUBSTITUTION');
  }
  if (!Array.isArray(data.completed_reference_digests) || !Array.isArray(data.attempted_reference_digests)
    || !Array.isArray(data.attempt_receipt_digests)
    || new Set(data.completed_reference_digests).size !== data.completed_reference_digests.length
    || new Set(data.attempted_reference_digests).size !== data.attempted_reference_digests.length
    || data.attempted_reference_digests.length !== data.attempt_receipt_digests.length
    || data.total_quota_reservations !== data.attempted_reference_digests.length
    || data.total_provider_calls > data.total_quota_reservations
    || data.completed_reference_digests.some(reference => !references.has(reference) || !data.attempted_reference_digests.includes(reference))) {
    fail('PSA_ACQUISITION_CHECKPOINT_INVALID');
  }
  if (data.state === 'STOPPED_REVIEW_REQUIRED') fail('PSA_ACQUISITION_CHECKPOINT_REVIEW_REQUIRED');
  if (data.state === 'COMPLETE') return data;
  if (data.state === 'READY_FOR_NEXT_UTC_DAY') {
    if (now.toISOString().slice(0, 10) < data.resume_not_before_utc_day) fail('PSA_ACQUISITION_NEXT_UTC_DAY_REQUIRED');
    return { ...data, state: 'IN_PROGRESS', current_run_id_digest: runIdDigest, current_run_attempt_count: 0, resume_not_before_utc_day: null };
  }
  if (data.state !== 'IN_PROGRESS' || data.current_run_id_digest !== runIdDigest) fail('PSA_ACQUISITION_CHECKPOINT_RUN_MISMATCH');
  return data;
}

function assertSchemaAndBinding(payload, fieldMap, reference, keyBase64) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !payload.PSACert
    || typeof payload.PSACert !== 'object' || Array.isArray(payload.PSACert)) fail('PSA_ACQUISITION_SCHEMA_DRIFT');
  const fields = Object.keys(payload.PSACert).sort();
  if (JSON.stringify(fields) !== JSON.stringify([...fieldMap.allowed_fields].sort())) fail('PSA_ACQUISITION_SCHEMA_DRIFT');
  const pathsDigest = sha256(JSON.stringify(fields.map(field => `PSACert.${field}`).sort()));
  if (pathsDigest !== fieldMap.observed_schema_digest) fail('PSA_ACQUISITION_SCHEMA_DRIFT');
  let observed;
  try { observed = createPsaCertReferenceToken({ keyBase64, certNumber: payload.PSACert.CertNumber }); }
  catch { fail('PSA_ACQUISITION_PAYLOAD_CERT_INVALID'); }
  if (!equalPsaReferenceTokens(observed, reference)) fail('PSA_ACQUISITION_PAYLOAD_CERT_SUBSTITUTION');
}

export async function runPsaAcquisitionWave(options) {
  const {
    manifest, runtimeGate, rightsReceipt, rightsReceiptRef, fieldMap, fieldMapRef, endpointContract,
    accessToken, certReferenceKeyBase64, privateStore, resolvePrivateCert, stageEvaluation, admitNormalized,
    reserveQuotaAttempt, fetchImpl, runtimeHealthCheck, killSwitchCheck, persistCheckpoint,
    validateManifestForAcquisition, verifyRuntimeGate,
    checkpoint: priorCheckpoint = null, runId, dispatchId, perRunCeiling = MAX_RUN_CALLS, clock = () => new Date(), timeoutMs = 30_000,
  } = options;
  if (!Number.isSafeInteger(perRunCeiling) || perRunCeiling < 1 || perRunCeiling > MAX_RUN_CALLS) fail('PSA_ACQUISITION_RUN_CEILING_INVALID');
  for (const [value, code] of [[resolvePrivateCert,'PRIVATE_RESOLVER'],[stageEvaluation,'STAGE'],[admitNormalized,'ADMISSION'],[reserveQuotaAttempt,'QUOTA'],[fetchImpl,'FETCH'],[runtimeHealthCheck,'HEALTH'],[killSwitchCheck,'KILL_SWITCH'],[persistCheckpoint,'CHECKPOINT'],[validateManifestForAcquisition,'MANIFEST_VERIFIER'],[verifyRuntimeGate,'RUNTIME_GATE_VERIFIER']]) {
    if (typeof value !== 'function') fail(`PSA_ACQUISITION_${code}_CALLBACK_REQUIRED`);
  }
  if (typeof accessToken !== 'string' || accessToken.length < 8) fail('PSA_ACQUISITION_TOKEN_REQUIRED');
  if (!privateStore || !['ENCRYPTION_AT_REST','ACCESS_AUDIT','DELETE_BY_ENFORCEMENT'].every(capability => privateStore.capabilities?.includes(capability))) fail('PSA_ACQUISITION_PRIVATE_STORE_REQUIRED');
  const key = decodePsaReferenceKey(certReferenceKeyBase64);
  try {
    const entries = assertManifest(manifest);
    const manifestDigest = sha256(canonical(manifest));
    const references = new Set(entries.map(entry => entry.cert_reference_digest));
    const now = instant(clock);
    let manifestVerification;
    try { manifestVerification = await validateManifestForAcquisition({ manifest: structuredClone(manifest), manifestDigest }); }
    catch { fail('PSA_ACQUISITION_MANIFEST_AUTHORITY_VERIFICATION_FAILED'); }
    if (!sameKeys(manifestVerification, ['state','manifest_digest','authority_registry_state','authority_registry_digest','provenance_bound_count','raw_cert_in_receipt'])
      || manifestVerification.state !== 'VERIFIED_PASS' || manifestVerification.manifest_digest !== manifestDigest
      || manifestVerification.authority_registry_state !== 'VERIFIED_ACTIVE'
      || !SHA256.test(String(manifestVerification.authority_registry_digest || ''))
      || manifestVerification.provenance_bound_count !== TARGET || manifestVerification.raw_cert_in_receipt !== false) {
      fail('PSA_ACQUISITION_MANIFEST_AUTHORITY_VERIFICATION_FAILED');
    }
    const runtimeGateDigest = sha256(canonical(runtimeGate));
    let runtimeGateVerification;
    try { runtimeGateVerification = await verifyRuntimeGate({ runtimeGate: structuredClone(runtimeGate), runtimeGateDigest, evaluatedAt: now.toISOString() }); }
    catch { fail('PSA_ACQUISITION_RUNTIME_GATE_AUTH_FAILED'); }
    if (!sameKeys(runtimeGateVerification, ['state','runtime_gate_digest','authentication','verifier_id','raw_secret_in_receipt'])
      || runtimeGateVerification.state !== 'VERIFIED_PASS' || runtimeGateVerification.runtime_gate_digest !== runtimeGateDigest
      || runtimeGateVerification.authentication !== 'VERIFIED' || typeof runtimeGateVerification.verifier_id !== 'string'
      || runtimeGateVerification.verifier_id.length < 3 || runtimeGateVerification.raw_secret_in_receipt !== false) {
      fail('PSA_ACQUISITION_RUNTIME_GATE_AUTH_FAILED');
    }
    const health = await runtimeHealthCheck();
    assertRuntime({ runtimeGate, runtimeGateHealth: health, manifestDigest, rightsReceipt, rightsReceiptRef, fieldMap, fieldMapRef, endpointContract, now });
    const runIdDigest = sha256(String(runId));
    const bindings = {
      authorityRegistryDigest: manifestVerification.authority_registry_digest,
      runtimeGateDigest,
      manifestVerificationReceiptDigest: sha256(canonical(manifestVerification)),
      runtimeGateVerificationReceiptDigest: sha256(canonical(runtimeGateVerification)),
    };
    let data = checkpointData(priorCheckpoint, key, manifestDigest, references, perRunCeiling, runIdDigest, now, bindings);
    let lastCheckpoint = priorCheckpoint;
    if (data.state === 'COMPLETE') return { checkpoint: priorCheckpoint, receipt: buildReceipt(data, priorCheckpoint, 0, 0, 0) };
    let calls = 0;
    let reservations = 0;
    let staged = 0;

    const persist = async next => {
      next.updated_at = instant(clock).toISOString();
      const signed = signCheckpoint(next, key);
      const persisted = await persistCheckpoint(structuredClone(signed));
      if (persisted?.state !== 'VERIFIED_PERSISTED' || persisted.authentication !== signed.authentication) fail('PSA_ACQUISITION_CHECKPOINT_PERSIST_FAILED');
      return signed;
    };
    const stop = async (reason, reference = null, attemptDigest = null) => {
      if (reference && !data.attempted_reference_digests.includes(reference)) {
        data.attempted_reference_digests.push(reference);
        data.attempt_receipt_digests.push(attemptDigest || sha256(reason));
      }
      data = { ...data, state: 'STOPPED_REVIEW_REQUIRED', stop_reason: reason };
      const signed = await persist(data);
      return { checkpoint: signed, receipt: buildReceipt(data, signed, calls, reservations, staged) };
    };

    for (const entry of entries) {
      const reference = entry.cert_reference_digest;
      if (data.attempted_reference_digests.includes(reference)) continue;
      if (data.current_run_attempt_count >= perRunCeiling) break;
      if (await killSwitchCheck() !== false) return stop('KILL_SWITCH_ENGAGED');
      const liveHealth = await runtimeHealthCheck();
      try { assertRuntime({ runtimeGate, runtimeGateHealth: liveHealth, manifestDigest, rightsReceipt, rightsReceiptRef, fieldMap, fieldMapRef, endpointContract, now: instant(clock) }); }
      catch { return stop('RUNTIME_OR_RETENTION_HEALTH_FAILURE'); }
      let certNumber;
      try { certNumber = await resolvePrivateCert({ certReferenceDigest: reference, sourceBundleToken: entry.source_bundle_token }); }
      catch { return stop('PRIVATE_CERT_RESOLUTION_FAILURE'); }
      let resolvedReference;
      try { resolvedReference = createPsaCertReferenceToken({ keyBase64: certReferenceKeyBase64, certNumber }); }
      catch { return stop('PRIVATE_CERT_RESOLUTION_FAILURE'); }
      if (!equalPsaReferenceTokens(resolvedReference, reference)) return stop('PRIVATE_CERT_REFERENCE_SUBSTITUTION');
      let quota;
      try {
        quota = await reserveQuotaAttempt({
          runId, dispatchId, attemptId: `psa-${data.attempted_reference_digests.length + 1}`,
          idempotencyKey: sha256(`${manifestDigest}\0${reference}`), requestReferenceDigest: reference,
        });
      } catch { return stop('QUOTA_RESERVATION_FAILURE'); }
      if (quota?.decision !== 'RESERVED_NEW' || quota.provider_id !== 'psa-public-api' || quota.request_reference_digest !== reference || quota.raw_cert_in_receipt !== false) {
        data.total_quota_reservations += 1;
        data.current_run_attempt_count += 1;
        return stop('QUOTA_REPLAY_OR_INVALID_RECEIPT', reference, sha256(canonical(quota || null)));
      }
      reservations += 1;
      data.total_quota_reservations += 1;
      data.current_run_attempt_count += 1;
      if (await killSwitchCheck() !== false) return stop('KILL_SWITCH_ENGAGED_AFTER_RESERVATION', reference, sha256(canonical(quota)));
      let response;
      let text;
      try {
        calls += 1;
        data.total_provider_calls += 1;
        response = await fetchImpl(ENDPOINT.replace('{cert_number}', encodeURIComponent(certNumber)), {
          method: 'GET', headers: { accept: 'application/json', authorization: `bearer ${accessToken}` },
          redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
        });
        text = await response.text();
      } catch { return stop('PROVIDER_TRANSPORT_FAILURE', reference, sha256(canonical(quota))); }
      const responseDigest = sha256(text);
      const status = Number(response.status);
      if ([401,403].includes(status)) return stop('PROVIDER_AUTHORIZATION_STOP', reference, sha256(`${status}:${responseDigest}`));
      if (status === 429) return stop('PROVIDER_RATE_LIMIT_STOP', reference, sha256(`${status}:${responseDigest}`));
      if (status >= 500) return stop('PROVIDER_5XX_STOP', reference, sha256(`${status}:${responseDigest}`));
      if (!response.ok || status !== 200 || Buffer.byteLength(text) > MAX_BODY_BYTES) return stop('PROVIDER_RESPONSE_REJECTED', reference, sha256(`${status}:${responseDigest}`));
      let payload;
      try { payload = JSON.parse(text); assertSchemaAndBinding(payload, fieldMap, reference, certReferenceKeyBase64); }
      catch (error) {
        const reason = String(error?.code || '').startsWith('PSA_ACQUISITION_') ? error.code : 'SCHEMA_DRIFT';
        return stop(reason, reference, sha256(`${status}:${responseDigest}`));
      }
      try {
        const preStageHealth = await runtimeHealthCheck();
        assertRuntime({ runtimeGate, runtimeGateHealth: preStageHealth, manifestDigest, rightsReceipt, rightsReceiptRef, fieldMap, fieldMapRef, endpointContract, now: instant(clock) });
      } catch { return stop('RUNTIME_OR_RETENTION_HEALTH_FAILURE', reference, sha256(`${status}:${responseDigest}`)); }
      let stageReceipt;
      const stageKey = Buffer.from(key);
      try {
        stageReceipt = await stageEvaluation({
          rawPayload: payload, certReferenceDigest: reference, certReferenceKey: stageKey,
          rightsReceipt, fieldMap, privateStore, admitNormalized, acquiredAt: instant(clock),
        });
      } catch { return stop('PRIVATE_STORE_OR_RETENTION_FAILURE', reference, sha256(`${status}:${responseDigest}`)); }
      finally { stageKey.fill(0); payload = null; text = null; certNumber = null; }
      if (stageReceipt?.state !== 'VERIFIED_PASS' || stageReceipt.cert_reference_digest !== reference || stageReceipt.raw_payload_in_receipt !== false) {
        return stop('PRIVATE_STAGE_RECEIPT_INVALID', reference, sha256(canonical(stageReceipt || null)));
      }
      staged += 1;
      data.attempted_reference_digests.push(reference);
      data.attempt_receipt_digests.push(sha256(canonical({ reference, response_digest: responseDigest, quota_digest: sha256(canonical(quota)), stage_digest: sha256(canonical(stageReceipt)) })));
      data.completed_reference_digests.push(reference);
      data.stop_reason = null;
      if (data.completed_reference_digests.length === TARGET) data.state = 'COMPLETE';
      else if (data.current_run_attempt_count >= perRunCeiling) {
        data.state = 'READY_FOR_NEXT_UTC_DAY';
        data.resume_not_before_utc_day = nextUtcDay(instant(clock));
      } else data.state = 'IN_PROGRESS';
      lastCheckpoint = await persist(data);
      if (data.state !== 'IN_PROGRESS') break;
    }
    const signed = lastCheckpoint || await persist(data);
    return { checkpoint: signed, receipt: buildReceipt(data, signed, calls, reservations, staged) };
  } finally {
    key.fill(0);
  }
}

function buildReceipt(data, checkpoint, calls, reservations, staged) {
  return {
    receipt_id: 'KIDULTS_PSA_ACQUISITION_WAVE_RECEIPT_V1', provider_id: 'psa-public-api', state: data.state,
    manifest_digest: data.manifest_digest, checkpoint_digest: sha256(canonical(checkpoint)),
    authority_registry_digest: data.authority_registry_digest, runtime_gate_digest: data.runtime_gate_digest,
    provider_calls_this_run: calls, quota_reservations_this_run: reservations, staged_this_run: staged,
    total_completed_count: data.completed_reference_digests.length, remaining_count: TARGET - data.completed_reference_digests.length,
    stop_reason: data.stop_reason, resume_not_before_utc_day: data.resume_not_before_utc_day,
    raw_cert_in_receipt: false, raw_provider_payload_in_receipt: false, access_token_in_receipt: false,
    cert_reference_key_in_receipt: false, retries: 0, production: 'HOLD', public: 'HOLD', g5: 'HOLD',
  };
}
