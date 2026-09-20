import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { evaluateDecadeDurability } from '../../scripts/governance/decade-durability-v1.mjs';

const sha = 'a'.repeat(40);
const tree = 'b'.repeat(40);
const digest = 'c'.repeat(64);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const replica = (overrides = {}) => ({
  id: 'replica', class: 'GITHUB_PROTECTED_REF', state: 'VERIFIED', sourceSha: sha,
  sourceTree: tree, digest, providerFailureDomain: 'github', administrativeDomain: 'primary',
  offsite: true, worm: false, offline: false, retentionYears: 10,
  readBackAt: '2026-09-19T00:00:00Z', signatureState: 'VERIFIED', keyIdentifier: 'kms:key-1',
  controls: ['DELETE_DENY', 'NON_FAST_FORWARD_DENY', 'EXACT_TREE_READBACK'], ...overrides,
});
const complete = () => ({
  contractId: 'kidults-decade-durability-evidence-v1', version: '1.0.0',
  sourceSha: sha, sourceTree: tree, errors: [],
  replicas: [
    replica(),
    replica({ id: 'object-lock', class: 'CROSS_PROVIDER_OBJECT_LOCK',
      providerFailureDomain: 'object-store-b', administrativeDomain: 'recovery-custodian',
      worm: true, controls: ['SEPARATE_PROVIDER', 'SEPARATE_ADMIN_DOMAIN',
        'OBJECT_LOCK_COMPLIANCE_MODE', 'RETENTION_LEGAL_HOLD_CAPABLE'] }),
    replica({ id: 'cold', class: 'OFFLINE_ENCRYPTED_COLD_COPY',
      providerFailureDomain: 'offline-media', administrativeDomain: 'recovery-custodian',
      offsite: true, offline: true, controls: ['OFFLINE_OR_AIR_GAPPED', 'SEPARATE_CUSTODIAN',
        'KEY_ESCROW_TESTED', 'MEDIA_REFRESH_SCHEDULED'] }),
  ],
  restoreDrill: { state: 'VERIFIED', sourceSha: sha, sourceTree: tree,
    completedAt: '2026-09-19T00:00:00Z', receiptDigest: digest, testsState: 'VERIFIED',
    isolated: true },
  annualFullRestore: { state: 'VERIFIED', sourceSha: sha, sourceTree: tree,
    completedAt: '2026-09-19T00:00:00Z', receiptDigest: digest, testsState: 'VERIFIED',
    isolated: true, independentCustodian: true },
});

test('passes only a complete 3-2-1-1-0 evidence set with current restore drill', () => {
  assert.equal(evaluateDecadeDurability(complete(), { now: '2026-09-20T00:00:00Z' }).state,
    'DECADE_DURABILITY_VERIFIED');
});

test('holds a GitHub-only design even with duplicate refs', () => {
  const input = complete();
  input.replicas = [replica(), replica({ id: 'rolling' }), replica({ id: 'tag' })];
  const result = evaluateDecadeDurability(input, { now: '2026-09-20T00:00:00Z' });
  assert.equal(result.state, 'HOLD');
  assert(result.failures.includes('PROVIDER_FAILURE_DOMAIN_DIVERSITY_NOT_MET'));
  assert(result.failures.includes('REPLICA_CLASS_SET_INCOMPLETE'));
});

test('holds stale restore evidence', () => {
  const input = complete();
  input.restoreDrill.completedAt = '2025-01-01T00:00:00Z';
  assert(evaluateDecadeDurability(input, { now: '2026-09-20T00:00:00Z' }).failures
    .includes('CURRENT_RESTORE_DRILL_MISSING'));
});

test('holds unsigned replicas or incomplete protection controls', () => {
  const input = complete();
  input.replicas[0].signatureState = 'MISSING';
  input.replicas[1].controls = ['OBJECT_LOCK_COMPLIANCE_MODE'];
  const result = evaluateDecadeDurability(input, { now: '2026-09-20T00:00:00Z' });
  assert.equal(result.state, 'HOLD');
  assert(result.failures.includes('MINIMUM_VERIFIED_COPIES_NOT_MET'));
});

test('holds stale or non-independent annual full restore evidence', () => {
  const input = complete();
  input.annualFullRestore.independentCustodian = false;
  assert(evaluateDecadeDurability(input, { now: '2026-09-20T00:00:00Z' }).failures
    .includes('CURRENT_INDEPENDENT_ANNUAL_RESTORE_MISSING'));
});

test('holds digest mismatch, short retention, and any unverified error', () => {
  const input = complete();
  input.replicas[1].digest = 'invalid';
  input.replicas[2].retentionYears = 2;
  input.errors.push('READBACK_PENDING');
  const result = evaluateDecadeDurability(input, { now: '2026-09-20T00:00:00Z' });
  assert.equal(result.state, 'HOLD');
  assert(result.failures.includes('MINIMUM_VERIFIED_COPIES_NOT_MET'));
  assert(result.failures.includes('TEN_YEAR_RETENTION_NOT_PROVEN'));
  assert(result.failures.includes('UNVERIFIED_ERRORS_PRESENT'));
});

test('makes durability classification mandatory without retaining rebuildable caches for ten years', () => {
  const contract = JSON.parse(readFileSync(path.join(root,
    'coordination/kidults/governance/decade-durability-contract-v1.json'), 'utf8'));
  assert.equal(contract.platform_default.applies_to_every_material_design_and_change, true);
  assert.equal(contract.platform_default.unclassified_state, 'HOLD');
  assert.equal(contract.platform_default.critical_default_class, 'D10_IRREPLACEABLE');
  assert.equal(contract.platform_default.exception_requires_reconstructibility_proof, true);
  const classes = Object.fromEntries(contract.durability_classes.map(item => [item.class, item]));
  assert.equal(classes.D10_IRREPLACEABLE.minimum_retention_years, 10);
  assert(classes.D10_IRREPLACEABLE.applies_to.includes('RIGHTS'));
  assert(classes.D10_IRREPLACEABLE.applies_to.includes('LEDGER'));
  assert(classes.D0_EPHEMERAL.required_controls.includes('NO_IRREPLACEABLE_STATE'));
  assert.equal(contract.design_gate.production_activation_requires_verified_restore, true);
});
