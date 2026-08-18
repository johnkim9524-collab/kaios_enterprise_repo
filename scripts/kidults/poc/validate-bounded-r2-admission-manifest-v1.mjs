import fs from 'node:fs';

const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const manifest = read('coordination/kidults/poc/bounded-r2-admission-manifest-v1.json');
const contract = read('coordination/kidults/poc/global-standard-poc-hardening-contract-v1.json');
const anchors = read('coordination/kidults/scope-data/scope-poc-anchor-selection-v1.json');
const errors = [];
const assert = (ok, message) => { if (!ok) errors.push(message); };
const sameSet = (a, b) => a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);

assert(manifest.status === 'R2_SCOPE_PRODUCT_SELECTION_LOCKED_ADMISSION_PENDING', 'STATUS_MISMATCH');
assert(sameSet(manifest.pilot_scopes, contract.bounded_candidate_r2.pilot_scopes), 'PILOT_SCOPE_MISMATCH');
assert(manifest.products_per_scope === 2 && manifest.products.length === 14, 'PRODUCT_COUNT_MISMATCH');
assert(new Set(manifest.products.map((p) => p.product_id)).size === 14, 'PRODUCT_IDS_NOT_UNIQUE');

for (const scope of manifest.pilot_scopes) {
  const products = manifest.products.filter((p) => p.scope_id === scope);
  assert(products.length === 2 && sameSet(products.map((p) => p.slot), [1, 2]), `SCOPE_PRODUCT_SLOTS_${scope}`);
  const admission = manifest.scope_admission.find((x) => x.scope_id === scope);
  assert(Boolean(admission), `SCOPE_ADMISSION_MISSING_${scope}`);
  assert(admission?.market_event_state === 'NOT_ADMITTED', `PREMATURE_EVENT_ADMISSION_${scope}`);
  assert(admission?.identity_state === 'GOLDEN_DATASET_PENDING', `IDENTITY_GATE_MISMATCH_${scope}`);
  for (const product of products) {
    const anchor = anchors.records.find((a) => a.target_scope_id === scope && a.slot === product.slot);
    assert(anchor?.representative_product_id === product.product_id, `NON_CANONICAL_PRODUCT_${product.product_id}`);
    assert(anchor?.display_name === product.display_name, `PRODUCT_NAME_DRIFT_${product.product_id}`);
  }
}

assert(sameSet(manifest.scope_admission.map((x) => x.scope_id), manifest.pilot_scopes), 'ADMISSION_SCOPE_MISMATCH');
assert(sameSet(manifest.admission_requirements.rights_actions_required_allow, ['collect','store','transform']), 'RIGHTS_ACTIONS_MISMATCH');
assert(sameSet(manifest.admission_requirements.identity_hierarchy_required, ['design','edition','variant','physical_object','lot','listing','event']), 'IDENTITY_HIERARCHY_MISMATCH');
assert(manifest.admission_requirements.golden_dataset_minimum_records >= 200, 'GOLDEN_DATASET_TOO_SMALL');
assert(manifest.admission_requirements.identity_precision_minimum >= 0.99, 'IDENTITY_PRECISION_TOO_LOW');
assert(manifest.admission_requirements.critical_false_auto_merge_maximum === 0, 'CRITICAL_AUTO_MERGE_NOT_ZERO');
assert(manifest.outputs.market_events_admitted === 0, 'MARKET_EVENTS_PREMATURELY_ADMITTED');
for (const [key, value] of Object.entries(manifest.outputs)) if (key !== 'market_events_admitted') assert(value === false, `OUTPUT_MUST_BE_FALSE_${key}`);
for (const [key, value] of Object.entries(manifest.holds)) assert(value === 'HOLD', `HOLD_MISMATCH_${key}`);

const mutations = [
  ['invented-product', (x) => { x.products[0].product_id = 'invented'; }],
  ['premature-admission', (x) => { x.scope_admission[0].market_event_state = 'ADMITTED'; }],
  ['rights-weakened', (x) => { x.admission_requirements.rights_actions_required_allow = ['collect']; }],
  ['rank-enabled', (x) => { x.outputs.cross_scope_ranking_allowed = true; }],
  ['provider-unheld', (x) => { x.holds.provider_contact = 'ACTIVE'; }]
];

function valid(candidate) {
  if (candidate.products.some((p) => !anchors.records.some((a) => a.target_scope_id === p.scope_id && a.slot === p.slot && a.representative_product_id === p.product_id))) return false;
  if (candidate.scope_admission.some((x) => x.market_event_state !== 'NOT_ADMITTED')) return false;
  if (!sameSet(candidate.admission_requirements.rights_actions_required_allow, ['collect','store','transform'])) return false;
  if (candidate.outputs.cross_scope_ranking_allowed !== false) return false;
  if (Object.values(candidate.holds).some((x) => x !== 'HOLD')) return false;
  return true;
}
for (const [name, mutate] of mutations) {
  const candidate = structuredClone(manifest); mutate(candidate);
  assert(!valid(candidate), `MUTATION_NOT_REJECTED_${name}`);
}

if (errors.length) {
  console.error(`Bounded R2 Admission Manifest: FAIL (${errors.length})`);
  errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
}
console.log(JSON.stringify({status:'PASS', scopes:7, products:14, admitted_market_events:0, negative_controls:mutations.length, track_b_input_eligible:false, production:'HOLD'}, null, 2));
