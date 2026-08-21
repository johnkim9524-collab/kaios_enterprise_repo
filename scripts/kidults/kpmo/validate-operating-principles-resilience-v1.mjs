import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const controlPath = path.join(root, 'coordination', 'kidults', 'kpmo', 'operating-principles-and-resilience-controls-v1.json');

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

function requireValue(condition, message) {
  if (!condition) fail(message);
}

const control = JSON.parse(fs.readFileSync(controlPath, 'utf8'));
const requiredPrinciples = ['AUTONOMOUS', 'GLOBAL', 'IRREPLACEABLE_VALUE', 'TRANSPARENT'];
for (const principle of requiredPrinciples) {
  requireValue(typeof control.operating_principles?.[principle] === 'string' && control.operating_principles[principle].length > 20, `missing operating principle ${principle}`);
}

const byId = new Map((control.resilience_controls || []).map(item => [item.id, item]));
const requiredControls = [
  'FACTUAL_ORIGIN_INDEPENDENCE',
  'POISONED_OR_NONREPRESENTATIVE_MARKET_EVENT',
  'RIGHTS_REVOCATION_TRANSITIVE_INVALIDATION',
  'TEMPORAL_COHERENCE',
  'PROVIDER_SCHEMA_SEMANTIC_DRIFT',
  'DERIVED_CLAIM_DEPENDENCY_DAG',
  'AUTONOMOUS_DECISION_EXPLAINABILITY'
];
for (const id of requiredControls) requireValue(byId.has(id), `missing resilience control ${id}`);

const origin = byId.get('FACTUAL_ORIGIN_INDEPENDENCE');
requireValue(origin.rules.includes('COMMERCIAL_SOURCE_OWNER_INDEPENDENCE_NE_FACTUAL_ORIGIN_INDEPENDENCE'), 'provider independence must not equal factual-origin independence');
requireValue(origin.rules.some(rule => rule.includes('ORIGIN_CLUSTERS')), 'correlated factual-origin cluster removal test required');

const event = byId.get('POISONED_OR_NONREPRESENTATIVE_MARKET_EVENT');
for (const state of ['OBSERVED', 'VALIDATED', 'MARKET_ADMISSIBLE', 'REPRESENTATIVE_ELIGIBLE', 'QUARANTINED']) {
  requireValue(event.event_states.includes(state), `missing market event state ${state}`);
}
requireValue(event.rules.includes('VALID_EVENT_NE_REPRESENTATIVE_MARKET_EVENT'), 'valid event must not imply representative event');

const revocation = byId.get('RIGHTS_REVOCATION_TRANSITIVE_INVALIDATION');
for (const stage of ['RIGHTS_CHANGE', 'LINEAGE_TRAVERSAL', 'DEPENDENT_FACTOR_INVALIDATION', 'DERIVED_CLAIM_INVALIDATION', 'CANDIDATE_PROJECTION_HOLD', 'DETERMINISTIC_RECOMPUTE']) {
  requireValue(revocation.cascade.includes(stage), `missing rights-revocation cascade stage ${stage}`);
}

const temporal = byId.get('TEMPORAL_COHERENCE');
for (const time of ['EVENT_OCCURRED_AT', 'SOURCE_OBSERVED_AT', 'COLLECTED_AT', 'ADMITTED_AT', 'ANALYZED_AT', 'PROJECTED_AT']) {
  requireValue(temporal.required_times.includes(time), `missing temporal timestamp ${time}`);
}
requireValue(temporal.rules.includes('NO_FUTURE_INFORMATION_RELATIVE_TO_SNAPSHOT_OR_ANALYSIS_CUTOFF'), 'future leakage prohibition missing');

const schema = byId.get('PROVIDER_SCHEMA_SEMANTIC_DRIFT');
for (const detector of ['FIELD_FINGERPRINT', 'SEMANTIC_CONTRACT_VERSION', 'ENUM_DRIFT_DETECTION', 'UNIT_CURRENCY_BEHAVIOR_DETECTION', 'PRICE_TYPE_SEMANTIC_BINDING']) {
  requireValue(schema.controls.includes(detector), `missing schema/semantic drift detector ${detector}`);
}
requireValue(schema.fail_closed.includes('QUARANTINE_PROVIDER_SCHEMA_DRIFT'), 'schema drift must quarantine');

const dag = byId.get('DERIVED_CLAIM_DEPENDENCY_DAG');
requireValue(dag.rules.includes('NO_ORPHAN_DERIVED_CLAIM_AFTER_UPSTREAM_INVALIDATION'), 'orphan derived claims must be prohibited');
requireValue(dag.rules.some(rule => rule.includes('DETERMINISTIC_RECOMPUTE_OR_HOLD')), 'dependency invalidation must recompute or hold');

const explain = byId.get('AUTONOMOUS_DECISION_EXPLAINABILITY');
for (const item of ['WHY_THIS_TARGET', 'WHY_NOT_HIGHER_RANKED_ALTERNATIVES', 'WEIGHTED_UNKNOWN_DEBT', 'DECISION_IMPACT', 'EXPECTED_MARGINAL_INTELLIGENCE_GAIN', 'RIGHTS_FEASIBILITY', 'BLAST_RADIUS_STATE']) {
  requireValue(explain.required_rationale.includes(item), `missing autonomous rationale field ${item}`);
}
requireValue(explain.rules.some(rule => rule.includes('REPRODUCIBLE_RATIONALE')), 'autonomous decision rationale must be reproducible');

requireValue(control.global_safety_ceiling?.synthetic_or_control_evidence === 'NON_PROMOTABLE_TO_EMPIRICAL_PASS', 'synthetic evidence promotion ceiling missing');
requireValue(control.global_safety_ceiling?.live_mutation === 'DISABLED_UNTIL_SEPARATE_ACTIVATION_GATE', 'live mutation must remain separately gated');
requireValue(control.global_safety_ceiling?.production === 'HOLD', 'Production must remain HOLD');

if (!process.exitCode) {
  console.log('PASS: Autonomous / Global / Irreplaceable Value / Transparent resilience controls validated');
}
