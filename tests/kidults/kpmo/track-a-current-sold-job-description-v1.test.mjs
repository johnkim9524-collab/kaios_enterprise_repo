import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateTrackACurrentSoldOwnership,
} from '../../../scripts/kidults/kpmo/validate-track-a-current-sold-job-description-v1.mjs';

function fixture() {
  return {
    jd: {
      id: 'kidults-track-a-current-sold-job-description-v1',
      primary_track: 'TRACK_A',
      accountable_track: 'TRACK_A',
      product_owner: 'KIDULTS',
      governance_owner: 'KPMO',
      runtime_owner: 'ASI',
      raci: {
        TRACK_A: { role: 'ACCOUNTABLE_AND_RESPONSIBLE' },
        TRACK_Z: { role: 'UPSTREAM_RESPONSIBLE' },
        TRACK_D: { role: 'PERSISTENCE_AND_RUNTIME_SUPPORT' },
        TRACK_B: { role: 'INDEPENDENT_DOWNSTREAM_VALIDATOR' },
      },
      prohibited_actions_and_claims: [
        'TRACK_A_DIRECT_PUBLICATION',
        'TRACK_A_PRODUCTION_APPROVAL',
        'CONTROL_SYNTHETIC_AS_EMPIRICAL',
        'PRIVATE_CANDIDATE_AS_LAWFUL_EMPIRICAL',
      ],
      handoff_contract: {
        to_track_b: 'EXACT_IMMUTABLE_SNAPSHOT_CANDIDATE_PLUS_EVIDENCE_PACKAGE_ONLY',
        track_b_may_mutate_evidence: false,
        track_a_may_self_approve: false,
      },
    },
    engine: {
      product_owner: 'KIDULTS',
      governance_owner: 'KPMO',
      runtime_owner: 'ASI',
      canonical_chain: ['SOURCE', 'TRACK_B', 'PROJECTION'],
    },
    readiness: {
      primary_track: 'TRACK_A',
      overall_state: 'CORE_ENGINE_COMPLETE_EMPIRICAL_RUNTIME_AND_PRODUCT_CHAIN_NOT_COMPLETE',
      truth_boundary: {
        lawful_empirical_current_sold_admitted: 0,
        public: 'HOLD',
        production: 'HOLD',
        g5: 'HOLD',
      },
    },
    readme: 'Track A — Intelligence Factory & Current-SOLD Engine\nTrack Z: lawful source, provider and rights authority',
    directive: 'Track A is accountable for the Current-SOLD engine\nTrack B remains an independent downstream validator',
  };
}

test('Track A ownership, ASI runtime and cross-track RACI pass', () => {
  assert.equal(validateTrackACurrentSoldOwnership(fixture()).state, 'PASS');
});

test('Track Z cannot become accountable for the Current-SOLD engine', () => {
  const value = fixture();
  value.jd.accountable_track = 'TRACK_Z';
  assert.throws(() => validateTrackACurrentSoldOwnership(value),
    /TRACK_A_CURRENT_SOLD_ACCOUNTABILITY_INVALID/);
});

test('Track A cannot self-approve Track B or publication', () => {
  const value = fixture();
  value.jd.handoff_contract.track_a_may_self_approve = true;
  assert.throws(() => validateTrackACurrentSoldOwnership(value),
    /TRACK_A_CURRENT_SOLD_SELF_APPROVAL_INVALID/);
});

test('empirical and release boundaries cannot be widened by the JD', () => {
  const value = fixture();
  value.readiness.truth_boundary.production = 'ALLOW';
  assert.throws(() => validateTrackACurrentSoldOwnership(value),
    /TRACK_A_CURRENT_SOLD_RELEASE_BOUNDARY_INVALID/);
});
