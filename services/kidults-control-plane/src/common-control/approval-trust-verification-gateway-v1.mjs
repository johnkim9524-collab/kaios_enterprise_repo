// Retained as a fail-closed compatibility boundary. The former implementation
// separated the lifecycle fence from nonce consumption and therefore admitted
// a revocation TOCTOU window. Runtime callers must use approval-trust-runtime-v1.
export async function verifyAndConsumeWithCurrentTrustRegistry() {
  throw new Error('TRUST_HANDOFF_GATEWAY_RETIRED_USE_ATOMIC_CURRENT_HEAD');
}
