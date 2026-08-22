// #1053/#1057 hardening wrapper: preserve all existing partner-like adversarial proofs,
// then require trusted control-plane provider-transition and admission-time rights proofs.
// The legacy core is retained byte-for-byte for regression continuity; this wrapper is
// the canonical validator path consumed by #881 certification and the full-value-chain suite.
import './validate-pre-partner-adversarial-fixtures-legacy-core-v1.mjs';
import './validate-provider-transition-trusted-binding-v1.mjs';
import './validate-admission-temporal-authority-v1.mjs';
