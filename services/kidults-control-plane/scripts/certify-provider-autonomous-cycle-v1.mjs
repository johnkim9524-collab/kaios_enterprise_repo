import fs from 'node:fs';
import { evaluateProviderAutonomousCycle } from '../src/provider-autonomous-cycle.mjs';

const root = new URL('../../../', import.meta.url);
const readJson = relative => JSON.parse(fs.readFileSync(new URL(relative, root), 'utf8'));
const registry = readJson('coordination/kidults/registry/provider/records/provider-operating-state-v1.json');
const evidence = readJson('coordination/kidults/evidence/aws-offline-durability-receipt-2026-09-21-v1.json');
const exactHeadSha = process.env.EXACT_HEAD_SHA || '6f38700fa439ea381777e4474e41c1478fda9b4a';

if (evidence.status !== 'VERIFIED') {
  throw new Error('AWS_DURABILITY_EVIDENCE_UNVERIFIED');
}
if (!Array.isArray(evidence.required_live_evidence) || evidence.required_live_evidence.length !== 0) {
  throw new Error('AWS_LIVE_EVIDENCE_CLOSURE_MISSING');
}

const result = evaluateProviderAutonomousCycle({
  registry,
  providerId: 'PSA_PREMIUM',
  exactHeadSha,
  evaluatedAt: evidence.verified_at,
  durableEvidence: {
    verified: evidence.status === 'VERIFIED',
    objectLockMode: evidence.object_lock.mode,
    kmsSignatureValid: evidence.kms_signature_valid,
    retentionUntil: evidence.object_lock.retention_until,
    manifestSha256: evidence.manifest_sha256,
    receiptSha256: evidence.receipt_sha256,
  },
});

if (result.action !== 'SHADOW_NO_FETCH') throw new Error('UNEXPECTED_LIVE_FETCH_AUTHORIZATION');
if (result.brokerEgress !== false) throw new Error('BROKER_EGRESS_MUST_REMAIN_DISABLED');
if (Object.values(result.holds).some(value => value !== 'HOLD')) {
  throw new Error('PROTECTED_HOLD_DRIFT');
}
if (evidence.offline_copy.restore_verification !== 'PASS') {
  throw new Error('OFFLINE_RESTORE_NOT_VERIFIED');
}

console.log(JSON.stringify({
  verdict: 'VERIFIED_PASS',
  vertical: 'SCHEDULER_CONTROL_PROVIDER_BROKER_EVIDENCE',
  provider_id: result.providerId,
  provider_action: result.action,
  broker_egress: result.brokerEgress,
  decision_digest: result.decisionDigest,
  immutable_evidence: result.immutableEvidence,
  offline_copy: evidence.offline_copy,
  holds: result.holds,
}, null, 2));
