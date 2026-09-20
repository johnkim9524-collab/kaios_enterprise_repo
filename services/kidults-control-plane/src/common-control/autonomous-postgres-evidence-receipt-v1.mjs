import {
  requireDigest, requireExactRecord, requireInstant, requireValue, snapshotJson,
  verifySelfDigest,
} from './canonical-v1.mjs';

export const AUTONOMOUS_POSTGRES_MIGRATIONS_V1 = Object.freeze([
  '0001_system_of_record.sql', '0002_workflow_run_receipts.sql',
  '0003_autonomous_task_ledger.sql', '0004_autonomous_admission_proofs.sql',
  '0005_autonomous_task_transition_pair.sql',
  '0006_autonomous_supervisor_invocation_admission.sql',
  '0007_cryptographic_approval_consumption.sql',
  '0008_approval_trust_root_lifecycle.sql',
  '0009_approval_trust_registry_snapshots.sql',
  '0010_approval_trust_current_heads.sql',
  '0011_autonomous_containment_fence_events.sql',
  '0012_protected_launch_manifest_consumptions.sql',
]);

const RECEIPT_KEYS = Object.freeze([
  'id', 'version', 'state', 'exactSourceSha', 'databaseName', 'serverVersionNum',
  'migrationDigest', 'migrations', 'checks', 'scope', 'runtimeRunnerDatabaseExecution',
  'providerAuthority', 'externalEgress', 'credentialMaterialRetained', 'observedAt',
  'production', 'publicRelease', 'g5', 'receiptDigest',
]);
const CHECK_KEYS = Object.freeze([
  'freshEphemeralDatabase', 'roleIsolation', 'appendOnlyMutationDenied',
  'proofExactReplay', 'rollback', 'deferredTransitionPair',
  'invocationAdmissionLeastPrivilege', 'twoClientCas', 'snapshots', 'transitions',
  'trustRevocationWinsTwoClientRace', 'trustConsumptionWinsTwoClientRace',
  'trustCurrentHeads', 'cryptographicApprovalConsumptions',
  'containmentStopFenceBlocks', 'containmentReleaseFenceAllows',
  'containmentReleaseChainEnforced', 'containmentAppendOnlyMutationDenied',
  'containmentMonotonicEventOrder', 'containmentFenceEvents',
  'protectedManifestLeastPrivilege', 'protectedManifestTwoClientSingleWinner',
  'protectedManifestRestartReplayHeld', 'protectedManifestAppendOnlyMutationDenied',
  'protectedManifestConsumptions',
]);

export function verifyAutonomousPostgresEvidenceReceipt(input, {
  expectedSourceSha, expectedMigrationDigest,
}) {
  const receipt = snapshotJson(input, { maxBytes: 65536 });
  requireExactRecord(receipt, RECEIPT_KEYS, 'AUTONOMOUS_POSTGRES_RECEIPT_SHAPE_INVALID');
  requireValue(receipt.id === 'kidults-autonomous-postgres-evidence-v1'
    && receipt.version === '1.2.0' && receipt.state === 'VERIFIED_PASS',
  'AUTONOMOUS_POSTGRES_RECEIPT_CONTRACT_INVALID');
  requireValue(/^[0-9a-f]{40}$/.test(expectedSourceSha ?? '')
    && receipt.exactSourceSha === expectedSourceSha,
  'AUTONOMOUS_POSTGRES_RECEIPT_SOURCE_SHA_INVALID');
  requireDigest(expectedMigrationDigest, 'AUTONOMOUS_POSTGRES_RECEIPT_EXPECTED_MIGRATION_INVALID');
  requireDigest(receipt.migrationDigest, 'AUTONOMOUS_POSTGRES_RECEIPT_MIGRATION_INVALID');
  requireValue(receipt.migrationDigest === expectedMigrationDigest
    && JSON.stringify(receipt.migrations) === JSON.stringify(AUTONOMOUS_POSTGRES_MIGRATIONS_V1),
  'AUTONOMOUS_POSTGRES_RECEIPT_MIGRATION_BINDING_INVALID');
  requireValue(/^kidults_ephemeral_[a-z0-9_]{1,48}$/.test(receipt.databaseName)
    && /^[0-9]{5,6}$/.test(receipt.serverVersionNum),
  'AUTONOMOUS_POSTGRES_RECEIPT_DATABASE_INVALID');
  requireExactRecord(receipt.checks, CHECK_KEYS, 'AUTONOMOUS_POSTGRES_RECEIPT_CHECKS_SHAPE_INVALID');
  for (const key of CHECK_KEYS.filter(key => ![
    'snapshots', 'transitions', 'trustCurrentHeads', 'cryptographicApprovalConsumptions',
    'containmentFenceEvents', 'protectedManifestConsumptions',
  ].includes(key))) {
    requireValue(receipt.checks[key] === true,
      `AUTONOMOUS_POSTGRES_RECEIPT_CHECK_NOT_PROVEN:${key}`);
  }
  requireValue(receipt.checks.snapshots === 2 && receipt.checks.transitions === 1
    && receipt.checks.trustCurrentHeads === 4
    && receipt.checks.cryptographicApprovalConsumptions === 1
    && receipt.checks.containmentFenceEvents === 2
    && receipt.checks.protectedManifestConsumptions === 1,
  'AUTONOMOUS_POSTGRES_RECEIPT_COUNTS_INVALID');
  requireValue(receipt.scope
    === 'EPHEMERAL_POSTGRES_SCHEMA_PRIVILEGE_CAS_TRUST_CONTAINMENT_AND_MANIFEST_REPLAY'
    && receipt.runtimeRunnerDatabaseExecution === false
    && receipt.providerAuthority === false && receipt.externalEgress === false
    && receipt.credentialMaterialRetained === false && receipt.production === 'HOLD'
    && receipt.publicRelease === 'HOLD' && receipt.g5 === 'HOLD',
  'AUTONOMOUS_POSTGRES_RECEIPT_AUTHORITY_INVALID');
  requireInstant(receipt.observedAt, 'AUTONOMOUS_POSTGRES_RECEIPT_TIME_INVALID');
  requireDigest(receipt.receiptDigest, 'AUTONOMOUS_POSTGRES_RECEIPT_DIGEST_INVALID');
  verifySelfDigest(receipt, 'receiptDigest', 'AUTONOMOUS_POSTGRES_RECEIPT_INTEGRITY_INVALID');
  return receipt;
}
