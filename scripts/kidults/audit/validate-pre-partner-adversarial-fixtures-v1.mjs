// #1053 hardening wrapper: preserve all existing partner-like adversarial proofs,
// then require a trusted control-plane provider transition/revalidation proof.
// The legacy core is retained byte-for-byte for regression continuity; this wrapper is
// the canonical validator path consumed by #881 certification and the full-value-chain suite.
import './validate-pre-partner-adversarial-fixtures-legacy-core-v1.mjs';
import './validate-provider-transition-trusted-binding-v1.mjs';
