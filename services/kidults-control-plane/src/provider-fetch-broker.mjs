import { createHash } from 'node:crypto';
import { sha256, verifyAuthorityEnvelope } from './provider-control-runtime.mjs';
const fail = code => { throw new Error(code); };
const digest = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

async function bounded(response, limit) {
  if (!response.body?.getReader) { const b = Buffer.from(await response.arrayBuffer()); if (b.length > limit) fail('BROKER_RESPONSE_BYTES_EXCEEDED'); return b; }
  const reader = response.body.getReader(); const chunks = []; let size = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > limit) { await reader.cancel(); fail('BROKER_RESPONSE_BYTES_EXCEEDED'); } chunks.push(Buffer.from(value)); }
  return Buffer.concat(chunks, size);
}

function validateTrustedPermit(permit, trustedPolicy) {
  if (permit?.action !== 'REQUEST_OPAQUE_PERMIT' || permit.scope?.dataClass !== 'REAL') fail('BROKER_PERMIT_SCOPE_INVALID');
  let url; try { url = new URL(permit.scope.endpoint); } catch { fail('BROKER_URL_INVALID'); }
  if (url.protocol !== 'https:' || url.username || url.password || !trustedPolicy.allowedHosts.includes(url.hostname)) fail('BROKER_HOST_NOT_ALLOWED');
  if (!trustedPolicy.allowedMethods.includes(permit.scope.method)) fail('BROKER_METHOD_NOT_ALLOWED');
  for (const k of ['recordLimit', 'byteLimit', 'timeoutMs']) if (!Number.isSafeInteger(trustedPolicy[k]) || trustedPolicy[k] < 1) fail(`BROKER_POLICY_${k.toUpperCase()}_INVALID`);
  const { digest: claimedDigest, ...policyPayload } = trustedPolicy;
  const exactKeys = ['allowedHosts','allowedMethods','byteLimit','recordLimit','timeoutMs'];
  if (Object.keys(policyPayload).sort().join(',') !== exactKeys.sort().join(',')) fail('BROKER_POLICY_SCHEMA_INVALID');
  if (sha256(policyPayload) !== claimedDigest || permit.scope.brokerPolicyDigest !== claimedDigest) fail('BROKER_POLICY_DIGEST_MISMATCH');
}

export async function executeProviderFetch({ permitId, permitStore, trustedPolicy, pilotLedger, quarantineStore, fetchImpl, readKillSwitch, authorities, evaluatedAt }) {
  for (const fn of [permitStore?.consume, pilotLedger?.reserve, pilotLedger?.commit, pilotLedger?.release, quarantineStore?.write, quarantineStore?.read, fetchImpl, readKillSwitch]) if (typeof fn !== 'function') fail('BROKER_DEPENDENCY_REQUIRED');
  const permit = await permitStore.consume(permitId);
  if (!permit) fail('OPAQUE_PERMIT_INVALID_OR_CONSUMED');
  validateTrustedPermit(permit, trustedPolicy);
  if (quarantineStore.storageBoundaryId !== permit.boundary.storageBoundaryId || quarantineStore.writerCapability !== permit.boundary.writerCapability) fail('QUARANTINE_CAPABILITY_MISMATCH');
  const now = Date.parse(evaluatedAt);
  if (!Number.isFinite(now)) fail('BROKER_EVALUATED_AT_INVALID');
  const checkSwitch = async () => {
    const s = verifyAuthorityEnvelope(await readKillSwitch(), { kind: 'KILL_SWITCH', authorities, now });
    if (s.status !== 'INACTIVE' || s.generation !== permit.killSwitchGeneration || s.global === true
      || s.providers?.includes(permit.scope.providerId) || s.purposes?.includes(permit.scope.purposeCode)) fail('BROKER_KILL_SWITCH_CHANGED');
  };
  await checkSwitch();
  const reservation = await pilotLedger.reserve({ limit: 120, requested: trustedPolicy.recordLimit, providerId: permit.scope.providerId });
  if (!reservation) fail('PILOT_ATOMIC_RESERVATION_DENIED');
  const controller = new AbortController();
  let rejectTimeout;
  const timeoutFailure = new Promise((_, reject) => { rejectTimeout = () => { controller.abort(); reject(Object.assign(new Error('BROKER_TIMEOUT'), { name: 'AbortError' })); }; });
  const timer = setTimeout(rejectTimeout, trustedPolicy.timeoutMs);
  try {
    const response = await Promise.race([fetchImpl(permit.scope.endpoint, { method: permit.scope.method, redirect: 'error', signal: controller.signal, headers: { accept: 'application/json' } }), timeoutFailure]);
    if (!response || response.redirected) fail('BROKER_REDIRECT_FORBIDDEN');
    if (!response.ok) fail([408,429,500,502,503,504].includes(response.status) ? `BROKER_RETRYABLE_HTTP:${response.status}` : `BROKER_TERMINAL_HTTP:${response.status}`);
    const bytes = await Promise.race([bounded(response, trustedPolicy.byteLimit), timeoutFailure]);
    let records; try { const p = JSON.parse(bytes); records = Array.isArray(p) ? p : p.records; } catch { fail('BROKER_RESPONSE_JSON_INVALID'); }
    if (!Array.isArray(records) || records.length > trustedPolicy.recordLimit) fail('BROKER_RESPONSE_RECORDS_EXCEEDED');
    const schema = permit.scope.fieldSchema;
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) fail('BROKER_FIELD_SCHEMA_INVALID');
    const allowed = new Set(Object.keys(schema));
    for (const record of records) {
      if (!record || typeof record !== 'object' || Array.isArray(record)) fail('BROKER_RESPONSE_FIELD_SCOPE_VIOLATION');
      if (Object.keys(record).some(field => !allowed.has(field))) fail('BROKER_RESPONSE_FIELD_SCOPE_VIOLATION');
      for (const [field, rule] of Object.entries(schema)) {
        if (rule.required === true && !(field in record)) fail('BROKER_RESPONSE_FIELD_SCOPE_VIOLATION');
        if (field in record && typeof record[field] !== rule.type) fail('BROKER_RESPONSE_FIELD_TYPE_VIOLATION');
      }
    }
    const fieldSet = [...new Set(records.flatMap(record => Object.keys(record)))].sort();
    await checkSwitch();
    const payloadDigest = digest(bytes);
    const artifactRef = await quarantineStore.write({ bytes, kmsContext: permit.boundary.kmsContext, dbNamespace: permit.boundary.dbNamespace, queueId: permit.boundary.queueId });
    const restored = await quarantineStore.read(artifactRef);
    if (digest(restored) !== payloadDigest) fail('QUARANTINE_READBACK_HASH_MISMATCH');
    await checkSwitch();
    await pilotLedger.commit(reservation, records.length);
    return Object.freeze({ artifactRef, receipt: { status: 'RAW_QUARANTINED_VERIFIED', providerId: permit.scope.providerId, recordCount: records.length, byteCount: bytes.length, payloadDigest, fieldSetDigest: sha256(fieldSet), storageBoundaryId: permit.boundary.storageBoundaryId, brokerEgress: false, holds: permit.holds } });
  } catch (error) { await pilotLedger.release(reservation); if (error?.name === 'AbortError') fail('BROKER_TIMEOUT'); throw error; }
  finally { clearTimeout(timer); }
}
