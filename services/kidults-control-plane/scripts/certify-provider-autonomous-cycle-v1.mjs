import fs from 'node:fs';
import { evaluateProviderAutonomousCycle } from '../src/provider-autonomous-cycle.mjs';

const root = new URL('../../../', import.meta.url);
const readJson = relative => JSON.parse(fs.readFileSync(new URL(relative, root), 'utf8'));
const registry = readJson('coordination/kidults/registry/provider/records/provider-operating-state-v1.json');
const evidence = readJson('coordination/kidults/evidence/aws-offline-durability-receipt-2026-09-21-v1.json');
const exactHeadSha = process.env.EXACT_HEAD_SHA || '6f38700fa439ea381777e4474e41c1478fda9b4a';

const result = evaluateProviderAutonomousCycle({
  registry,
  providerId: 'PSA_PREMIUM',
  exactHeadSha,
  evaluatedAt: evidence.verified_at,
  durableEvidence: {
    verified: ['VERIFIED', 'AWS_OBJECT_RESTORE_VERIFIED_OFFLINE_COPY_PENDING'].includes(evidence.status),
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
if (evidence.offline_copy.restore_verification !== 'PENDING_PHYSICAL_MEDIA') {
  throw new Error('OFFLINE_RESTORE_STATE_MUST_REMAIN_PENDING');
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
