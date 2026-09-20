import {
  canonicalJson, requireDigest, requireIdentifier, requireInstant, requireValue,
} from '../common-control/canonical-v1.mjs';

const WRITER_ID = 'kpmo-autonomous-invocation-writer-v1';

function verifyRow(row, manifest) {
  requireValue(row.manifest_digest === manifest.manifestDigest
    && row.source_sha === manifest.sourceSha
    && row.request_id === manifest.request.requestId
    && row.manifest_json?.manifestDigest === manifest.manifestDigest
    && canonicalJson(row.manifest_json) === canonicalJson(manifest)
    && row.writer_id === WRITER_ID,
  'PROTECTED_LAUNCH_MANIFEST_CONSUMPTION_READBACK_INVALID');
  requireInstant(row.consumed_at, 'PROTECTED_LAUNCH_MANIFEST_CONSUMPTION_TIME_INVALID');
  return row;
}

export async function consumeProtectedLaunchManifest(client, manifest, consumedAt) {
  requireValue(client && typeof client.query === 'function',
    'PROTECTED_LAUNCH_MANIFEST_STORE_CLIENT_INVALID');
  requireDigest(manifest?.manifestDigest, 'PROTECTED_LAUNCH_MANIFEST_DIGEST_INVALID');
  requireValue(/^[0-9a-f]{40}$/.test(manifest?.sourceSha),
    'PROTECTED_LAUNCH_MANIFEST_SOURCE_SHA_INVALID');
  requireIdentifier(manifest?.request?.requestId,
    'PROTECTED_LAUNCH_MANIFEST_REQUEST_ID_INVALID');
  const observed = requireInstant(consumedAt,
    'PROTECTED_LAUNCH_MANIFEST_CONSUMPTION_TIME_INVALID').toISOString();
  const inserted = await client.query(`INSERT INTO kidults_control.protected_launch_manifest_consumptions
    (manifest_digest, source_sha, request_id, consumed_at, manifest_json, writer_id)
    VALUES ($1,$2,$3,$4,$5::jsonb,$6)
    ON CONFLICT (manifest_digest) DO NOTHING
    RETURNING manifest_digest, source_sha, request_id, consumed_at, manifest_json, writer_id`,
  [manifest.manifestDigest, manifest.sourceSha, manifest.request.requestId, observed,
    canonicalJson(manifest), WRITER_ID]);
  if (inserted.rows.length === 1) {
    return { state: 'CONSUMED_SINGLE_USE_MANIFEST',
      row: verifyRow(inserted.rows[0], manifest) };
  }
  const existing = await client.query(`SELECT manifest_digest, source_sha, request_id,
      consumed_at, manifest_json, writer_id
    FROM kidults_control.protected_launch_manifest_consumptions
    WHERE manifest_digest=$1`, [manifest.manifestDigest]);
  requireValue(existing.rows.length === 1,
    'PROTECTED_LAUNCH_MANIFEST_CONSUMPTION_CONFLICT_UNRESOLVED');
  return { state: 'MANIFEST_ALREADY_CONSUMED_HOLD',
    row: verifyRow(existing.rows[0], manifest) };
}
