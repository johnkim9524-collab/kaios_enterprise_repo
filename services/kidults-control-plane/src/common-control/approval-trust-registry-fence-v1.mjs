import { canonicalJson, requireDigest, requireValue } from './canonical-v1.mjs';
import { compileSyntheticApprovalTrustRegistry } from './approval-trust-registry-compiler-v1.mjs';

export function fenceCurrentTrustRegistry({ resolvedSnapshot, candidates, events,
  expectedCurrentLifecycleStateDigest }) {
  requireDigest(expectedCurrentLifecycleStateDigest,
    'TRUST_REGISTRY_FENCE_CURRENT_DIGEST_INVALID');
  requireValue(resolvedSnapshot?.state === 'EXACT_SNAPSHOT_RESOLVED_AUTHORITY_NOT_ACTIVATED',
    'TRUST_REGISTRY_FENCE_SNAPSHOT_INVALID');
  let current;
  try { current = compileSyntheticApprovalTrustRegistry({ candidates, events }); }
  catch { throw new Error('TRUST_REGISTRY_FENCE_STALE_OR_REVOKED'); }
  requireValue(current.handoffReceipt.lifecycleStateDigest === expectedCurrentLifecycleStateDigest,
    'TRUST_REGISTRY_FENCE_CURRENT_STATE_PIN_MISMATCH');
  requireValue(canonicalJson(current.registry) === canonicalJson(resolvedSnapshot.registry)
    && canonicalJson(current.handoffReceipt) === canonicalJson(resolvedSnapshot.handoffReceipt),
  'TRUST_REGISTRY_FENCE_STALE_OR_REVOKED');
  return { state: 'CURRENT_TRUST_REGISTRY_FENCED_AUTHORITY_NOT_ACTIVATED',
    registry: current.registry, handoffReceipt: current.handoffReceipt,
    activationAuthorized: false, externalEgress: false,
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD' };
}
