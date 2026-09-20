import { requireDigest, requireIdentifier, requireValue } from './canonical-v1.mjs';
import { verifyTrustRegistrySnapshotRow } from './approval-trust-registry-snapshot-v1.mjs';

export async function resolveExactTrustRegistrySnapshot(client, { registryId, registryDigest }) {
  requireValue(client && typeof client.query === 'function', 'TRUST_REGISTRY_RESOLVER_CLIENT_INVALID');
  requireIdentifier(registryId, 'TRUST_REGISTRY_RESOLVER_ID_INVALID');
  requireDigest(registryDigest, 'TRUST_REGISTRY_RESOLVER_DIGEST_INVALID');
  const rows = (await client.query(`SELECT * FROM kidults_control.approval_trust_registry_snapshots
    WHERE registry_id=$1 AND registry_digest=$2 ORDER BY snapshot_id`,
  [registryId, registryDigest])).rows ?? [];
  requireValue(rows.length === 1, rows.length ? 'TRUST_REGISTRY_RESOLVER_AMBIGUOUS'
    : 'TRUST_REGISTRY_RESOLVER_NOT_FOUND');
  const resolved = verifyTrustRegistrySnapshotRow(rows[0]);
  return { state: 'EXACT_SNAPSHOT_RESOLVED_AUTHORITY_NOT_ACTIVATED', ...resolved,
    activationAuthorized: false, externalEgress: false,
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD' };
}
