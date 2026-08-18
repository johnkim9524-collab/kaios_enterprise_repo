import test from 'node:test';
import assert from 'node:assert/strict';
import { compileChallengerRoleEvidenceWorkPackets } from '../scripts/lib/challenger-role-evidence-work-packets.mjs';

const baseContract = {
  production: 'HOLD',
  provider_contact: 'HOLD',
  selection_gate: { independent_source_family_floor: 2 },
};

const baseDiagnostic = {
  production: 'HOLD',
  provider_contact: 'HOLD',
  selected: 0,
};

test('compiles mapped role requirements into observational work packets without selecting', () => {
  const result = compileChallengerRoleEvidenceWorkPackets({
    contract: {
      ...baseContract,
      roles: [{
        role: 'EMERGING_DYNAMIC_VERTICAL',
        minimum_evidence: ['CANONICAL_IDENTITY', 'MULTI_PERIOD_ATTENTION_OR_CULTURE_SIGNAL'],
      }],
      source_topology_classes: [
        { class: 'OFFICIAL', supports: ['CANONICAL_IDENTITY'], default_rights: 'REFERENCE_SAFE' },
        { class: 'ATTENTION', supports: ['MULTI_PERIOD_ATTENTION_OR_CULTURE_SIGNAL'] },
        { class: 'IGNORED' },
      ],
    },
    diagnostic: {
      ...baseDiagnostic,
      rows: [{
        scope_id: 'test_scope',
        challenger_role: 'EMERGING_DYNAMIC_VERTICAL',
        candidate_nominations: [{ provider_record_id: 'TEST_ONLY_Q1' }],
      }],
    },
  });

  assert.equal(result.status, 'WORK_REQUIRED');
  assert.equal(result.slots, 1);
  assert.equal(result.nominations, 1);
  assert.equal(result.work_packet_count, 1);
  assert.equal(result.topology_gap_count, 0);
  assert.equal(result.productionEvidence, false);
  assert.equal(result.createsEvidence, false);
  assert.equal(result.mutatesSelection, false);
  assert.equal(result.autoSelectionAllowed, false);
  assert.equal(result.provider_contact, 'HOLD');
  assert.equal(result.production, 'HOLD');
  assert.deepEqual(result.packets[0].unresolved_requirements, []);
  assert.equal(result.packets[0].independent_source_family_floor, 2);
  assert.equal(result.packets[0].selection_allowed, false);
  assert.deepEqual(result.packets[0].evidence_topology[1].source_classes, [{ class: 'ATTENTION', default_rights: 'UNKNOWN' }]);
});

test('surfaces unmapped role evidence requirements without inventing evidence', () => {
  const result = compileChallengerRoleEvidenceWorkPackets({
    contract: {
      ...baseContract,
      roles: [{
        role: 'HIGH_LIQUIDITY_OR_ACTIVE_MARKET',
        minimum_evidence: ['VERIFIED_ACTIVITY_OR_TRANSACTION_FREQUENCY_EVIDENCE', 'MULTI_PERIOD_OR_MULTI_VENUE_SUPPORT'],
      }],
      source_topology_classes: [{
        class: 'AUCTION_RESULTS',
        supports: ['VERIFIED_ACTIVITY_OR_TRANSACTION_FREQUENCY_EVIDENCE'],
        default_rights: 'MUST_PREFLIGHT',
      }],
    },
    diagnostic: {
      ...baseDiagnostic,
      slots: 160,
      nominations: 43,
      rows: [{ scope_id: 'market_scope', challenger_role: 'HIGH_LIQUIDITY_OR_ACTIVE_MARKET', candidate_nominations: [] }],
    },
  });

  assert.equal(result.status, 'WORK_REQUIRED_TOPOLOGY_GAPS');
  assert.equal(result.slots, 160);
  assert.equal(result.nominations, 43);
  assert.equal(result.topology_gap_count, 1);
  assert.equal(result.packets[0].status, 'ROLE_EVIDENCE_TOPOLOGY_GAP');
  assert.deepEqual(result.packets[0].unresolved_requirements, ['MULTI_PERIOD_OR_MULTI_VENUE_SUPPORT']);
  assert.equal(result.packets[0].role_evidence_state, 'NOT_VERIFIED');
});

test('flags missing role contracts and handles missing optional arrays fail closed', () => {
  const result = compileChallengerRoleEvidenceWorkPackets({
    contract: { ...baseContract, roles: [], source_topology_classes: [] },
    diagnostic: { ...baseDiagnostic, rows: [{ challenger_role: 'UNKNOWN_ROLE' }] },
  });

  assert.equal(result.status, 'WORK_REQUIRED_TOPOLOGY_GAPS');
  assert.equal(result.topology_gap_count, 1);
  assert.equal(result.packets[0].scope_id, null);
  assert.equal(result.packets[0].nomination_count, 0);
  assert.equal(result.packets[0].status, 'ROLE_CONTRACT_MISSING');
  assert.deepEqual(result.packets[0].required_evidence, []);
  assert.deepEqual(result.packets[0].unresolved_requirements, ['ROLE_CONTRACT_MISSING']);
});

test('returns NO_WORK for an empty or non-array diagnostic row set', () => {
  const result = compileChallengerRoleEvidenceWorkPackets({
    contract: { production: 'HOLD', provider_contact: 'HOLD', roles: 'invalid', source_topology_classes: 'invalid' },
    diagnostic: { production: 'HOLD', provider_contact: 'HOLD', rows: 'invalid', nominations: 'not-a-number', slots: 'not-a-number' },
  });

  assert.equal(result.status, 'NO_WORK');
  assert.equal(result.slots, 0);
  assert.equal(result.nominations, 0);
  assert.equal(result.work_packet_count, 0);
  assert.deepEqual(result.packets, []);
});

test('supports a role with no declared minimum evidence while still prohibiting selection', () => {
  const result = compileChallengerRoleEvidenceWorkPackets({
    contract: { ...baseContract, roles: [{ role: 'EDGE_CASE' }] },
    diagnostic: { ...baseDiagnostic, rows: [{ scope_id: 'edge', challenger_role: 'EDGE_CASE' }] },
  });

  assert.equal(result.status, 'WORK_REQUIRED');
  assert.equal(result.packets[0].status, 'ROLE_EVIDENCE_WORK_REQUIRED');
  assert.deepEqual(result.packets[0].evidence_topology, []);
  assert.equal(result.packets[0].selection_allowed, false);
});

test('rejects unsafe or malformed inputs before compiling work packets', () => {
  assert.throws(() => compileChallengerRoleEvidenceWorkPackets(), /CHALLENGER_DIAGNOSTIC_REQUIRED/);
  assert.throws(() => compileChallengerRoleEvidenceWorkPackets({ diagnostic: {}, contract: null }), /CHALLENGER_ROLE_EVIDENCE_CONTRACT_REQUIRED/);
  assert.throws(() => compileChallengerRoleEvidenceWorkPackets({ diagnostic: { ...baseDiagnostic, production: 'APPROVED' }, contract: baseContract }), /PRODUCTION_MUST_REMAIN_HOLD/);
  assert.throws(() => compileChallengerRoleEvidenceWorkPackets({ diagnostic: baseDiagnostic, contract: { ...baseContract, production: 'APPROVED' } }), /PRODUCTION_MUST_REMAIN_HOLD/);
  assert.throws(() => compileChallengerRoleEvidenceWorkPackets({ diagnostic: { ...baseDiagnostic, provider_contact: 'READY' }, contract: baseContract }), /PROVIDER_CONTACT_MUST_REMAIN_HOLD/);
  assert.throws(() => compileChallengerRoleEvidenceWorkPackets({ diagnostic: baseDiagnostic, contract: { ...baseContract, provider_contact: 'READY' } }), /PROVIDER_CONTACT_MUST_REMAIN_HOLD/);
  assert.throws(() => compileChallengerRoleEvidenceWorkPackets({ diagnostic: { ...baseDiagnostic, selected: 1 }, contract: baseContract }), /FAIL_CLOSED_DIAGNOSTIC_REQUIRED/);
});
