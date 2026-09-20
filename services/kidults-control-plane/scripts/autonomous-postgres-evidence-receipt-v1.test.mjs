import assert from 'node:assert/strict';
import test from 'node:test';
import { digestObject } from '../src/common-control/canonical-v1.mjs';
import {
  AUTONOMOUS_POSTGRES_MIGRATIONS_V1,
  verifyAutonomousPostgresEvidenceReceipt,
} from '../src/common-control/autonomous-postgres-evidence-receipt-v1.mjs';

const SOURCE_SHA = 'a'.repeat(40);
const MIGRATION_DIGEST = digestObject({ migrations: 'fixture' });

function receipt() {
  const unsigned = {
    id: 'kidults-autonomous-postgres-evidence-v1', version: '1.2.0',
    state: 'VERIFIED_PASS', exactSourceSha: SOURCE_SHA,
    databaseName: 'kidults_ephemeral_receipt_01', serverVersionNum: '160003',
    migrationDigest: MIGRATION_DIGEST, migrations: [...AUTONOMOUS_POSTGRES_MIGRATIONS_V1],
    checks: {
      freshEphemeralDatabase: true, roleIsolation: true, appendOnlyMutationDenied: true,
      proofExactReplay: true, rollback: true, deferredTransitionPair: true,
      invocationAdmissionLeastPrivilege: true, twoClientCas: true,
      snapshots: 2, transitions: 1, trustRevocationWinsTwoClientRace: true,
      trustConsumptionWinsTwoClientRace: true, trustCurrentHeads: 4,
      cryptographicApprovalConsumptions: 1,
      containmentStopFenceBlocks: true, containmentReleaseFenceAllows: true,
      containmentReleaseChainEnforced: true, containmentAppendOnlyMutationDenied: true,
      containmentMonotonicEventOrder: true,
      containmentFenceEvents: 2,
      protectedManifestLeastPrivilege: true, protectedManifestTwoClientSingleWinner: true,
      protectedManifestRestartReplayHeld: true, protectedManifestAppendOnlyMutationDenied: true,
      protectedManifestConsumptions: 1,
    },
    scope: 'EPHEMERAL_POSTGRES_SCHEMA_PRIVILEGE_CAS_TRUST_CONTAINMENT_AND_MANIFEST_REPLAY',
    runtimeRunnerDatabaseExecution: false, providerAuthority: false,
    externalEgress: false, credentialMaterialRetained: false,
    observedAt: '2026-09-19T09:00:00.000Z', production: 'HOLD',
    publicRelease: 'HOLD', g5: 'HOLD',
  };
  return { ...unsigned, receiptDigest: digestObject(unsigned) };
}

function verify(value) {
  return verifyAutonomousPostgresEvidenceReceipt(value, {
    expectedSourceSha: SOURCE_SHA, expectedMigrationDigest: MIGRATION_DIGEST,
  });
}

test('exact PostgreSQL evidence receipt verifies all counts, races and HOLD boundaries', () => {
  const value = receipt();
  assert.equal(JSON.stringify(verify(value)), JSON.stringify(value));
});

test('PostgreSQL evidence receipt rejects source, migration and result substitution', () => {
  const cases = [
    { key: 'exactSourceSha', value: 'b'.repeat(40), code: /SOURCE_SHA_INVALID/ },
    { key: 'migrationDigest', value: digestObject({ migrations: 'other' }), code: /MIGRATION_BINDING_INVALID/ },
  ];
  for (const mutation of cases) {
    const changed = { ...receipt(), [mutation.key]: mutation.value };
    changed.receiptDigest = digestObject(Object.fromEntries(Object.entries(changed)
      .filter(([key]) => key !== 'receiptDigest')));
    assert.throws(() => verify(changed), mutation.code);
  }
  const countChanged = receipt(); countChanged.checks.trustCurrentHeads = 3;
  countChanged.receiptDigest = digestObject(Object.fromEntries(Object.entries(countChanged)
    .filter(([key]) => key !== 'receiptDigest')));
  assert.throws(() => verify(countChanged), /COUNTS_INVALID/);
  const containmentChanged = receipt(); containmentChanged.checks.containmentFenceEvents = 1;
  containmentChanged.receiptDigest = digestObject(Object.fromEntries(Object.entries(containmentChanged)
    .filter(([key]) => key !== 'receiptDigest')));
  assert.throws(() => verify(containmentChanged), /COUNTS_INVALID/);
  const manifestChanged = receipt(); manifestChanged.checks.protectedManifestConsumptions = 2;
  manifestChanged.receiptDigest = digestObject(Object.fromEntries(Object.entries(manifestChanged)
    .filter(([key]) => key !== 'receiptDigest')));
  assert.throws(() => verify(manifestChanged), /COUNTS_INVALID/);
});

test('PostgreSQL evidence receipt cannot self-authorize runtime or protected gates', () => {
  for (const [key, value] of [
    ['runtimeRunnerDatabaseExecution', true], ['providerAuthority', true],
    ['externalEgress', true], ['production', 'ACTIVE'],
  ]) {
    const changed = { ...receipt(), [key]: value };
    changed.receiptDigest = digestObject(Object.fromEntries(Object.entries(changed)
      .filter(([field]) => field !== 'receiptDigest')));
    assert.throws(() => verify(changed), /AUTHORITY_INVALID/);
  }
});

test('PostgreSQL evidence receipt rejects injected fields and stale self-digests', () => {
  assert.throws(() => verify({ ...receipt(), unexpected: true }), /SHAPE_INVALID/);
  const changed = receipt(); changed.checks.rollback = false;
  assert.throws(() => verify(changed), /CHECK_NOT_PROVEN|INTEGRITY_INVALID/);
});
