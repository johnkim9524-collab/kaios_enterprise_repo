import {
  canonicalJson, digestObject, requireDigest, requireExactRecord, requireIdentifier,
  requireInstant, requireValue, snapshotJson, verifySelfDigest,
} from './canonical-v1.mjs';
import { compileSyntheticApprovalTrustRegistry } from './approval-trust-registry-compiler-v1.mjs';
import {
  deriveTrustRootLifecycle, verifyTrustRootCandidate, verifyTrustRootLifecycleEvent,
} from './approval-trust-root-lifecycle-v1.mjs';

export const TRUST_HEAD_WRITER_ID = 'kpmo-trust-current-head-writer-v1';
export const TRUST_HEAD_LOCK_SQL = "SELECT pg_advisory_xact_lock(hashtextextended('kidults.approval-trust-current-head.v1', 0))";
const HEAD_KEYS = Object.freeze([
  'contractId', 'version', 'state', 'revision', 'previousHeadDigest',
  'candidateSetDigest', 'eventSetDigest', 'lifecycleStateDigest',
  'activeRegistryId', 'activeRegistryDigest', 'observedAt', 'activationAuthorized',
  'providerContactExecuted', 'spendAuthorized', 'externalEgress', 'credentialResolution',
  'production', 'publicRelease', 'g5', 'headId', 'headDigest',
]);

export function verifyTrustCurrentHead(input) {
  const head = snapshotJson(input, { maxBytes: 65536 });
  requireExactRecord(head, HEAD_KEYS, 'TRUST_HEAD_SHAPE_INVALID');
  requireValue(head.contractId === 'kidults-approval-trust-current-head-v1'
    && head.version === '1.0.0' && head.state === 'CURRENT_LIFECYCLE_HEAD_RECORDED',
  'TRUST_HEAD_CONTRACT_INVALID');
  requireValue(Number.isSafeInteger(head.revision) && head.revision >= 1,
    'TRUST_HEAD_REVISION_INVALID');
  requireValue(head.previousHeadDigest === null
    || Boolean(requireDigest(head.previousHeadDigest, 'TRUST_HEAD_PREVIOUS_DIGEST_INVALID')),
  'TRUST_HEAD_PREVIOUS_DIGEST_INVALID');
  for (const digest of [head.candidateSetDigest, head.eventSetDigest, head.lifecycleStateDigest]) {
    requireDigest(digest, 'TRUST_HEAD_DIGEST_INVALID');
  }
  const active = head.activeRegistryId !== null || head.activeRegistryDigest !== null;
  requireValue(active === (head.activeRegistryId !== null && head.activeRegistryDigest !== null),
    'TRUST_HEAD_ACTIVE_REGISTRY_PARTIAL');
  if (active) {
    requireIdentifier(head.activeRegistryId, 'TRUST_HEAD_REGISTRY_ID_INVALID');
    requireDigest(head.activeRegistryDigest, 'TRUST_HEAD_REGISTRY_DIGEST_INVALID');
  }
  requireInstant(head.observedAt, 'TRUST_HEAD_TIME_INVALID');
  requireValue(head.activationAuthorized === false && head.providerContactExecuted === false
    && head.spendAuthorized === false && head.externalEgress === false
    && head.credentialResolution === false && head.production === 'HOLD'
    && head.publicRelease === 'HOLD' && head.g5 === 'HOLD',
  'TRUST_HEAD_PROTECTED_GATE_INVALID');
  requireIdentifier(head.headId, 'TRUST_HEAD_ID_INVALID');
  requireDigest(head.headDigest, 'TRUST_HEAD_DIGEST_INVALID');
  verifySelfDigest(head, 'headDigest', 'TRUST_HEAD_INTEGRITY_INVALID');
  const unsigned = Object.fromEntries(Object.entries(head)
    .filter(([key]) => key !== 'headId' && key !== 'headDigest'));
  requireValue(head.headId === `trust-current-head:${digestObject(unsigned).slice(7)}`,
    'TRUST_HEAD_ID_INVALID');
  return head;
}

function jsonValue(value) {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { throw new Error('TRUST_HEAD_JSON_INVALID'); }
}

export function verifyTrustCurrentHeadRow(row) {
  requireValue(row && typeof row === 'object', 'TRUST_HEAD_ROW_INVALID');
  const head = verifyTrustCurrentHead(jsonValue(row.head_json));
  requireValue(row.revision === head.revision && row.head_id === head.headId
    && row.head_digest === head.headDigest
    && row.previous_head_digest === head.previousHeadDigest
    && row.lifecycle_state_digest === head.lifecycleStateDigest
    && row.active_registry_id === head.activeRegistryId
    && row.active_registry_digest === head.activeRegistryDigest
    && row.writer_id === TRUST_HEAD_WRITER_ID,
  'TRUST_HEAD_ROW_BINDING_INVALID');
  return head;
}

function material(candidatesInput, eventsInput) {
  const candidates = candidatesInput.map(verifyTrustRootCandidate).sort((a, b) =>
    a.role.localeCompare(b.role) || a.keyId.localeCompare(b.keyId));
  const events = eventsInput.map(verifyTrustRootLifecycleEvent).sort((a, b) =>
    a.observedAt.localeCompare(b.observedAt) || a.eventId.localeCompare(b.eventId));
  const lifecycle = deriveTrustRootLifecycle({ candidates, events });
  let activeRegistryId = null; let activeRegistryDigest = null;
  if (lifecycle.activeSyntheticKeys.length) {
    const compiled = compileSyntheticApprovalTrustRegistry({ candidates, events });
    activeRegistryId = compiled.registry.registryId;
    activeRegistryDigest = compiled.registry.registryDigest;
  }
  return { candidates, events, candidateSetDigest: digestObject(candidates),
    eventSetDigest: digestObject(events), lifecycleStateDigest: digestObject(lifecycle),
    activeRegistryId, activeRegistryDigest };
}

async function rollback(client) { try { await client.query('ROLLBACK'); } catch { /* preserve */ } }

export async function publishTrustCurrentHead(client, { candidates, events, observedAt }) {
  requireValue(client && typeof client.query === 'function', 'TRUST_HEAD_CLIENT_INVALID');
  requireInstant(observedAt, 'TRUST_HEAD_TIME_INVALID');
  const current = material(candidates, events);
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('kidults.writer_id', $1, true)", [TRUST_HEAD_WRITER_ID]);
    await client.query('SELECT kidults_control.assert_registered_writer($1)', [TRUST_HEAD_WRITER_ID]);
    await client.query(TRUST_HEAD_LOCK_SQL);
    const previousRows = (await client.query(`SELECT * FROM kidults_control.approval_trust_current_heads
      ORDER BY revision DESC LIMIT 1`)).rows ?? [];
    requireValue(previousRows.length <= 1, 'TRUST_HEAD_LATEST_AMBIGUOUS');
    const previous = previousRows.length ? verifyTrustCurrentHeadRow(previousRows[0]) : null;
    if (previous?.lifecycleStateDigest === current.lifecycleStateDigest) {
      requireValue(previous.activeRegistryId === current.activeRegistryId
        && previous.activeRegistryDigest === current.activeRegistryDigest,
      'TRUST_HEAD_IDEMPOTENT_BINDING_CONFLICT');
      await client.query('COMMIT');
      return { state: 'IDEMPOTENT_CURRENT_HEAD_REPLAY', head: previous,
        activationAuthorized: false };
    }
    const base = {
      contractId: 'kidults-approval-trust-current-head-v1', version: '1.0.0',
      state: 'CURRENT_LIFECYCLE_HEAD_RECORDED', revision: (previous?.revision ?? 0) + 1,
      previousHeadDigest: previous?.headDigest ?? null,
      candidateSetDigest: current.candidateSetDigest, eventSetDigest: current.eventSetDigest,
      lifecycleStateDigest: current.lifecycleStateDigest,
      activeRegistryId: current.activeRegistryId,
      activeRegistryDigest: current.activeRegistryDigest, observedAt,
      activationAuthorized: false, providerContactExecuted: false, spendAuthorized: false,
      externalEgress: false, credentialResolution: false,
      production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
    };
    const headId = `trust-current-head:${digestObject(base).slice(7)}`;
    const identified = { ...base, headId };
    const head = verifyTrustCurrentHead({ ...identified, headDigest: digestObject(identified) });
    const inserted = await client.query(`INSERT INTO kidults_control.approval_trust_current_heads
      (revision, head_id, head_digest, previous_head_digest, lifecycle_state_digest,
       active_registry_id, active_registry_digest, head_json, writer_id, observed_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10) RETURNING *`,
    [head.revision, head.headId, head.headDigest, head.previousHeadDigest,
      head.lifecycleStateDigest, head.activeRegistryId, head.activeRegistryDigest,
      JSON.stringify(head), TRUST_HEAD_WRITER_ID, head.observedAt]);
    requireValue(inserted.rows?.length === 1
      && canonicalJson(verifyTrustCurrentHeadRow(inserted.rows[0])) === canonicalJson(head),
    'TRUST_HEAD_INSERT_READBACK_INVALID');
    await client.query('COMMIT');
    return { state: 'CURRENT_HEAD_RECORDED_AUTHORITY_NOT_ACTIVATED', head,
      activationAuthorized: false };
  } catch (error) { await rollback(client); throw error; }
}
