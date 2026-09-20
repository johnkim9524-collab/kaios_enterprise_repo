import {
  canonicalJson, digestObject, requireExactRecord, requireIdentifier,
  requireInstant, requireValue, snapshotJson,
} from '../common-control/canonical-v1.mjs';
import {
  normalizeSourceRequest, validateAdmissionLifetime, verifyDecision, verifyManifest,
} from '../common-control/admission-v1.mjs';

const WRITER_ID = 'kpmo-autonomous-admission-proof-writer-v1';
const PROOF_KEYS = Object.freeze(['sourceRequest', 'decision', 'manifest']);

function fail(code) { throw new Error(code); }
function jsonValue(value, code) {
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { fail(code); }
  }
  return value;
}

function proofClock(now) {
  requireValue(now instanceof Date && Number.isFinite(now.getTime()), 'ADMISSION_PROOF_CLOCK_INVALID');
  return now;
}

export function validateAdmissionProof(input, { now = null } = {}) {
  const proof = snapshotJson(input, { maxBytes: 196608 });
  requireExactRecord(proof, PROOF_KEYS, 'ADMISSION_PROOF_SHAPE_INVALID');
  const source = normalizeSourceRequest(proof.sourceRequest);
  const decision = verifyDecision(proof.decision);
  requireValue(proof.manifest !== null, 'ADMISSION_PROOF_MANIFEST_REQUIRED');
  const manifest = verifyManifest(proof.manifest);
  requireValue(source.synthetic === true && source.requestedMode === 'SYNTHETIC_SHADOW',
    'ADMISSION_PROOF_NON_SYNTHETIC_DENIED');
  requireValue(decision.verdict === 'SHADOW_ELIGIBLE' && decision.allowedMode === 'SHADOW_NO_FETCH',
    'ADMISSION_PROOF_DECISION_DENIED');
  requireValue(manifest.allowedMode === 'SHADOW_NO_FETCH' && manifest.externalEgress === false,
    'ADMISSION_PROOF_MODE_DENIED');
  const requestDigest = digestObject(source);
  requireValue(decision.requestDigest === requestDigest && manifest.requestDigest === requestDigest,
    'ADMISSION_PROOF_REQUEST_BINDING_INVALID');
  requireValue(decision.taskId === source.taskId && manifest.taskId === source.taskId
    && manifest.requestId === source.requestId && manifest.sourceId === source.sourceId
    && manifest.sourceFamilyId === source.sourceFamilyId && manifest.providerId === source.providerId
    && manifest.purpose === source.purpose && manifest.scope === source.scope
    && manifest.dataClass === source.dataClass && manifest.region === source.region
    && manifest.endpointFingerprint === source.endpointFingerprint
    && decision.sourceId === source.sourceId && decision.sourceFamilyId === source.sourceFamilyId
    && decision.providerId === source.providerId && decision.taskId === source.taskId
    && decision.purpose === source.purpose && decision.scope === source.scope
    && decision.requestedMode === source.requestedMode,
  'ADMISSION_PROOF_SOURCE_BINDING_INVALID');
  requireValue(manifest.decisionId === decision.decisionId
    && manifest.decisionDigest === decision.decisionDigest,
  'ADMISSION_PROOF_DECISION_BINDING_INVALID');
  requireValue(manifest.policyRevision === decision.policyRevision
    && manifest.policyDigest === decision.policyDigest
    && manifest.registryRevision === decision.registryRevision
    && manifest.registryDigest === decision.registryDigest
    && manifest.killEpoch === decision.killEpoch
    && manifest.issuedAt === decision.issuedAt && manifest.expiresAt === decision.expiresAt,
  'ADMISSION_PROOF_CONTROL_BINDING_INVALID');
  requireValue(decision.externalEgress === false && manifest.externalEgress === false
    && decision.production === 'HOLD' && manifest.production === 'HOLD'
    && decision.publicRelease === 'HOLD' && manifest.publicRelease === 'HOLD'
    && decision.g5 === 'HOLD' && manifest.g5 === 'HOLD',
  'ADMISSION_PROOF_PROTECTED_GATE_INVALID');
  if (now !== null) validateAdmissionLifetime(decision, manifest, proofClock(now));
  return proof;
}

function identity(proof) {
  const proofDigest = digestObject(proof);
  return { proofId: `admission-proof:${proofDigest.slice(7)}`, proofDigest };
}

function rowMatches(row, proof) {
  if (!row) return false;
  const { proofId, proofDigest } = identity(proof);
  return row.proof_id === proofId && row.task_id === proof.sourceRequest.taskId
    && row.request_digest === digestObject(proof.sourceRequest)
    && row.decision_id === proof.decision.decisionId
    && row.decision_digest === proof.decision.decisionDigest
    && row.manifest_id === proof.manifest.manifestId
    && row.manifest_digest === proof.manifest.manifestDigest
    && new Date(row.issued_at).toISOString() === proof.manifest.issuedAt
    && new Date(row.expires_at).toISOString() === proof.manifest.expiresAt
    && row.proof_digest === proofDigest && row.writer_id === WRITER_ID
    && canonicalJson(jsonValue(row.proof_json, 'ADMISSION_PROOF_READBACK_JSON_INVALID')) === canonicalJson(proof);
}

async function begin(client) {
  requireValue(client && typeof client.query === 'function', 'ADMISSION_PROOF_CLIENT_INVALID');
  await client.query('BEGIN');
  await client.query("SELECT set_config('kidults.writer_id', $1, true)", [WRITER_ID]);
  await client.query('SELECT kidults_control.assert_registered_writer($1)', [WRITER_ID]);
}
async function rollback(client) { try { await client.query('ROLLBACK'); } catch { /* preserve original */ } }

export async function persistAdmissionProof(client, input, { now } = {}) {
  const proof = validateAdmissionProof(input, { now: proofClock(now) });
  requireValue(Buffer.byteLength(canonicalJson(proof), 'utf8') <= 196608, 'ADMISSION_PROOF_TOO_LARGE');
  const { proofId, proofDigest } = identity(proof);
  const params = [proofId, proof.sourceRequest.taskId, digestObject(proof.sourceRequest),
    proof.decision.decisionId, proof.decision.decisionDigest, proof.manifest.manifestId,
    proof.manifest.manifestDigest, proof.manifest.issuedAt, proof.manifest.expiresAt,
    JSON.stringify(proof), proofDigest, WRITER_ID];
  try {
    await begin(client);
    const inserted = await client.query(`INSERT INTO kidults_control.autonomous_admission_proofs
      (proof_id, task_id, request_digest, decision_id, decision_digest, manifest_id,
       manifest_digest, issued_at, expires_at, proof_json, proof_digest, writer_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12)
      ON CONFLICT (proof_id) DO NOTHING RETURNING *`, params);
    const row = inserted.rows?.[0] ?? (await client.query(
      '/* AUTONOMOUS_ADMISSION_PROOF_BY_ID_V1 */ SELECT * FROM kidults_control.autonomous_admission_proofs WHERE proof_id=$1',
      [proofId])).rows?.[0];
    if (!rowMatches(row, proof)) fail('ADMISSION_PROOF_CONFLICT');
    await client.query('COMMIT');
    return { state: inserted.rows?.length ? 'RECORDED' : 'IDEMPOTENT_REPLAY', proofId, proofDigest,
      remoteActivation: 'HOLD' };
  } catch (error) { await rollback(client); throw error; }
}

export async function resolveAdmissionProof(client, { taskId, admissionRequestDigest, now }) {
  requireValue(client && typeof client.query === 'function', 'ADMISSION_PROOF_CLIENT_INVALID');
  requireIdentifier(taskId, 'ADMISSION_PROOF_TASK_ID_INVALID');
  requireValue(/^sha256:[0-9a-f]{64}$/.test(admissionRequestDigest), 'ADMISSION_PROOF_REQUEST_DIGEST_INVALID');
  const observedAt = proofClock(now).toISOString();
  const result = await client.query(`/* AUTONOMOUS_ADMISSION_PROOF_RESOLVE_V1 */
    SELECT * FROM kidults_control.autonomous_admission_proofs
    WHERE task_id=$1 AND request_digest=$2 AND expires_at>$3::timestamptz
    ORDER BY issued_at DESC, proof_id ASC LIMIT 1`, [taskId, admissionRequestDigest, observedAt]);
  if (!result.rows?.length) return null;
  const proof = validateAdmissionProof(jsonValue(result.rows[0].proof_json,
    'ADMISSION_PROOF_READBACK_JSON_INVALID'), { now });
  requireValue(rowMatches(result.rows[0], proof), 'ADMISSION_PROOF_READBACK_MISMATCH');
  requireValue(proof.sourceRequest.taskId === taskId
    && digestObject(proof.sourceRequest) === admissionRequestDigest,
  'ADMISSION_PROOF_TASK_BINDING_INVALID');
  const { proofId, proofDigest } = identity(proof);
  return { proof, proofId, proofDigest };
}
