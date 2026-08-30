import assert from 'node:assert/strict';
import fs from 'node:fs';

const contractPath = 'coordination/kidults/market/current-sold-admission-contract-v1.json';

function validate(value) {
  assert.equal(value.id, 'kidults-current-sold-admission-contract-v1');
  assert.equal(value.status, 'ACTIVE_CONTROL_ONLY');
  assert.deepEqual(value.freshness, {strict_current_max_age_days: 7, bounded_current_max_age_days: 30, older_classification: 'HISTORICAL_ONLY'});
  const fields = new Set(value.required_event_fields);
  for (const field of ['stable_object_or_lot_identity', 'terminal_sold_state', 'sold_at', 'realized_consideration', 'currency', 'venue_or_source_reference', 'source_owner', 'provenance']) assert.ok(fields.has(field), `missing field ${field}`);
  assert.equal(fields.size, value.required_event_fields.length, 'duplicate required event field');
  const rights = new Set(value.required_rights_dimensions);
  for (const right of ['query_collect', 'private_store', 'internal_derive', 'commercial_use', 'deletion_termination', 'entity_territory_scope']) assert.ok(rights.has(right), `missing right ${right}`);
  const stages = Object.fromEntries(value.admission_stages.map((stage) => [stage.stage, stage]));
  assert.equal(Object.keys(stages).length, value.admission_stages.length, 'duplicate stage');
  for (const name of ['SMOKE', 'LIGHTHOUSE_PILOT', 'VERTICAL_VALIDATION', 'GLOBAL_LAUNCH_BASELINE', 'SCALE_TARGET']) {
    assert.ok(stages[name], `missing stage ${name}`);
    assert.equal(stages[name].launch_evidence, false, `${name} cannot authorize launch`);
  }
  assert.equal(stages.SMOKE.minimum_rights_admitted_transactions, 1);
  assert.equal(stages.SMOKE.claim_ceiling, 'PIPELINE_FUNCTIONAL_ONLY');
  assert.equal(stages.SMOKE.product_evidence, false);
  assert.equal(stages.LIGHTHOUSE_PILOT.minimum_lighthouse_objects, 25);
  assert.equal(stages.LIGHTHOUSE_PILOT.maximum_lighthouse_objects, 50);
  assert.equal(stages.VERTICAL_VALIDATION.minimum_rights_admitted_transactions_per_vertical, 100);
  assert.equal(stages.GLOBAL_LAUNCH_BASELINE.required_vertical_count, 8);
  assert.equal(stages.GLOBAL_LAUNCH_BASELINE.minimum_rights_admitted_transactions_total, 800);
  assert.equal(stages.GLOBAL_LAUNCH_BASELINE.minimum_rights_admitted_transactions_total, stages.GLOBAL_LAUNCH_BASELINE.required_vertical_count * stages.GLOBAL_LAUNCH_BASELINE.minimum_rights_admitted_transactions_per_vertical);
  assert.equal(stages.SCALE_TARGET.target_rights_admitted_transactions_minimum, 8000);
  assert.equal(stages.SCALE_TARGET.target_rights_admitted_transactions_upper_planning_band, 25000);
  assert.equal(stages.SCALE_TARGET.hard_maximum, null);
  assert.deepEqual(value.canonical_run_identity, ['source_sha', 'upstream_class']);
  assert.deepEqual(value.release_boundary, {main_scope_validated: false, production_authorized: false, public: 'HOLD', production: 'HOLD', g5: 'HOLD', separate_human_approval_required: true});
  for (const prohibition of ['FIXTURE_OR_SYNTHETIC_AS_EMPIRICAL_PROOF', 'COUNT_ONLY_PROMOTION', 'SMOKE_TO_LAUNCH_PROMOTION']) assert.ok(value.prohibitions.includes(prohibition), `missing prohibition ${prohibition}`);
}

const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
validate(contract);
const mutations = [
  (v) => { v.freshness.strict_current_max_age_days = 8; },
  (v) => { v.required_event_fields = v.required_event_fields.filter((x) => x !== 'currency'); },
  (v) => { v.admission_stages.find((x) => x.stage === 'SMOKE').product_evidence = true; },
  (v) => { v.admission_stages.find((x) => x.stage === 'GLOBAL_LAUNCH_BASELINE').minimum_rights_admitted_transactions_total = 1; },
  (v) => { v.release_boundary.production_authorized = true; },
  (v) => { v.release_boundary.g5 = 'PASS'; },
  (v) => { v.prohibitions = v.prohibitions.filter((x) => x !== 'SMOKE_TO_LAUNCH_PROMOTION'); }
];
for (const mutate of mutations) {
  const candidate = structuredClone(contract);
  mutate(candidate);
  assert.throws(() => validate(candidate), assert.AssertionError);
}
console.log(JSON.stringify({suite: 'KIDULTS_CURRENT_SOLD_ADMISSION_CONTRACT_V1', result: 'PASS', negative_tests: mutations.length, smoke_claim_ceiling: 'PIPELINE_FUNCTIONAL_ONLY', lighthouse_objects: '25-50', vertical_floor: 100, global_floor: 800, public: 'HOLD', production: 'HOLD', g5: 'HOLD'}, null, 2));
