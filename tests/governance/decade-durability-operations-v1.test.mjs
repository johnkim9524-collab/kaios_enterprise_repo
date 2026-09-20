import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { evaluateDurabilityOperations } from '../../scripts/governance/decade-durability-operations-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const contract = JSON.parse(readFileSync(path.join(root,
  'coordination/kidults/governance/decade-durability-operations-contract-v1.json'), 'utf8'));
const sha = 'a'.repeat(40); const tree = 'b'.repeat(40);
const controls = () => contract.capabilities.map(item => ({ id: item.id, state: 'VERIFIED',
  observedAt: '2026-09-20T00:00:00.000Z', evidenceRef: `receipt:${item.id}` }));
const asset = () => ({ id: 'governed-source', durabilityClass: 'D10_IRREPLACEABLE', rpo: 'ONE_BATCH',
  rto: '4_HOURS', retention: '10_YEARS', replication: '3-2-1-1-0', restoreTest: 'QUARTERLY',
  failureDomains: ['github', 'aws', 'offline'], costOwner: 'KPMO', migrationPath: 'CONTENT_ADDRESSED_EXPORT' });
const complete = () => ({ contractId: 'kidults-decade-durability-operations-evidence-v1',
  version: '1.0.0', sourceSha: sha, sourceTree: tree, controls: controls(), assets: [asset()],
  checkpoint: { state: 'VERIFIED', sourceSha: sha, sourceTree: tree,
    completedAt: '2026-09-20T00:00:00.000Z' },
  restoreDrill: { state: 'VERIFIED', sourceSha: sha, sourceTree: tree, isolated: true,
    completedAt: '2026-09-20T00:00:00.000Z' },
  identityRecovery: { state: 'VERIFIED', completedAt: '2026-09-20T00:00:00.000Z',
    controls: [...contract.identity_recovery.required_evidence] },
  retention: { state: 'VERIFIED', minimumRetainUntil: '2036-09-20T00:00:00.000Z' }, errors: [] });

test('integrates all seven capabilities without granting production promotion', () => {
  const result = evaluateDurabilityOperations(complete(), contract, { now: '2026-09-20T01:00:00.000Z' });
  assert.equal(result.state, 'OPERATING_TRANSITION_READY');
  assert.equal(result.dashboard.controlsVerified, 7);
  assert.equal(result.production, 'HOLD');
  assert.equal(result.automaticPromotion, false);
});

test('fails closed on stale checkpoint and restore drill', () => {
  const input = complete();
  input.checkpoint.completedAt = '2026-09-18T00:00:00.000Z';
  input.restoreDrill.completedAt = '2026-01-01T00:00:00.000Z';
  const result = evaluateDurabilityOperations(input, contract, { now: '2026-09-20T01:00:00.000Z' });
  assert.equal(result.state, 'HOLD');
  assert(result.failures.includes('CURRENT_CHECKPOINT_MISSING'));
  assert(result.failures.includes('CURRENT_RESTORE_DRILL_MISSING'));
});

test('fails closed when an operating control observation is stale', () => {
  const input = complete();
  input.controls[0].observedAt = '2026-09-18T00:00:00.000Z';
  const result = evaluateDurabilityOperations(input, contract, { now: '2026-09-20T01:00:00.000Z' });
  assert.equal(result.state, 'HOLD');
  assert(result.failures.includes('CONTROL_CHECKPOINT_ORCHESTRATION_STALE'));
  assert.equal(result.dashboard.controlsVerified, 6);
});

test('fails closed on incomplete key recovery, classification, or retention', () => {
  const input = complete();
  input.identityRecovery.controls = ['ROOT_RECOVERY_PATH_TESTED'];
  input.assets[0].durabilityClass = 'UNKNOWN';
  input.retention.minimumRetainUntil = '2027-09-20T00:00:00.000Z';
  const result = evaluateDurabilityOperations(input, contract, { now: '2026-09-20T01:00:00.000Z' });
  assert.equal(result.state, 'HOLD');
  assert(result.failures.includes('IDENTITY_AND_KEY_RECOVERY_NOT_VERIFIED'));
  assert(result.failures.includes('DURABILITY_CLASSIFICATION_INCOMPLETE'));
  assert(result.failures.includes('TEN_YEAR_RETENTION_WINDOW_NOT_VERIFIED'));
});

test('rejects malformed evidence rather than creating a partial dashboard', () => {
  const input = complete(); input.unexpected = true;
  assert.throws(() => evaluateDurabilityOperations(input, contract,
    { now: '2026-09-20T01:00:00.000Z' }), /DURABILITY_OPERATIONS_EVIDENCE_INVALID/);
});

test('registers every critical durability family with the complete design declaration', () => {
  const registry = JSON.parse(readFileSync(path.join(root,
    'coordination/kidults/governance/durability-asset-registry-v1.json'), 'utf8'));
  const kinds = new Set(registry.assets.map(item => item.kind));
  for (const required of contract.classification.critical_asset_kinds) {
    assert(kinds.has(required));
  }
  for (const item of registry.assets) {
    for (const field of ['id', 'kind', 'durabilityClass', 'rpo', 'rto', 'retention',
      'replication', 'restoreTest', 'failureDomains', 'costOwner', 'migrationPath']) {
      assert.notEqual(item[field], undefined, `${item.id}:${field}`);
    }
  }
  assert.equal(registry.assets.find(item => item.kind === 'CACHE').durabilityClass, 'D0_EPHEMERAL');
});
