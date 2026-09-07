import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runSyntheticMarketTwin120 } from '../../../scripts/kidults/kpmo/run-synthetic-market-twin-120-v1.mjs';
import { readPortalProjection } from '../../../apps/kidults-enterprise-staging/public/portal-r001/projection-store.js';

test('8 vertical x 15 synthetic cases exercise ASI-to-Portal control chain without authority', () => {
  const receipt = runSyntheticMarketTwin120();
  assert.equal(receipt.state, 'VERIFIED_PASS');
  assert.equal(receipt.record_count, 120);
  assert.equal(receipt.accepted, 96);
  assert.equal(receipt.rejected, 24);
  assert.equal(receipt.red_team_mutations, 56);
  assert.equal(receipt.normal_count + receipt.boundary_count + receipt.defect_count, 120);
  assert.equal(receipt.candidate_controls, 96);
  assert.equal(receipt.track_b_controls, 96);
  assert.equal(receipt.projection_controls, 96);
  assert.equal(receipt.portal_no_projection, 96);
  assert.equal(receipt.customer_visible, 0);
  assert.equal(receipt.empirical_current_sold_delta, 0);
  assert.equal(receipt.postgres_rows_written, 0);
  assert.equal(receipt.network_fetch, false);
  for (const key of ['provider_authority','database_authority','market_authority','promotion_authority']) assert.equal(receipt[key], false);
  for (const key of ['public_release','production','g5']) assert.equal(receipt[key], 'HOLD');
});

test('synthetic market twin replay is deterministic', () => {
  const first = runSyntheticMarketTwin120();
  const second = runSyntheticMarketTwin120();
  assert.equal(first.case_manifest_sha256, second.case_manifest_sha256);
  assert.equal(first.deterministic_replay_sha256, second.deterministic_replay_sha256);
});

test('contract forbids empirical, customer and production authority', () => {
  const contract = JSON.parse(fs.readFileSync('coordination/kidults/kpmo/synthetic-market-twin-120-v1.json','utf8'));
  assert.equal(contract.isolation.actual_provider_names_forbidden, true);
  assert.equal(contract.isolation.actual_object_identifiers_forbidden, true);
  assert.equal(contract.isolation.network_fetch, false);
  assert.equal(contract.isolation.customer_visible, false);
  assert.equal(contract.isolation.empirical_evidence, false);
  assert.equal(contract.isolation.production_eligible, false);
  assert.equal(contract.authority_boundary.promotion_authority, false);
});

test('actual Portal adapter suppresses all 96 synthetic downstream controls', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    record_type:'kidults_non_promotable_control_projection', schema_version:'1.0.0',
    fixture_type:'NON_PROMOTABLE_CONTROL', release:{state:'HOLD'},
    projection:{state:'NO_PROJECTION',synthetic:true,promotable:false,production:false,public:false}
  }), {status:200, headers:{'content-type':'application/json'}});
  try {
    for (let index = 0; index < 96; index += 1) {
      const view = await readPortalProjection({url:`https://portal.kidults.invalid/control/${index}`});
      assert.equal(view.projection.state, 'NO_PROJECTION');
      assert.equal(view.objects.length, 0);
      assert.equal(view.signals.length, 0);
      assert.equal(view.evidence.length, 0);
      assert.equal(view.release.state, 'HOLD');
    }
  } finally { globalThis.fetch = originalFetch; }
});
