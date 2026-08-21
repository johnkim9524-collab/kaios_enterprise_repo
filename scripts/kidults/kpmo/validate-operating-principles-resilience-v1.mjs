import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const controlPath = path.join(root, 'coordination', 'kidults', 'kpmo', 'operating-principles-and-resilience-controls-v1.json');
const hedgePath = path.join(root, 'coordination', 'kidults', 'kpmo', 'operational-resilience-hedges-v1.json');

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

function requireValue(condition, message) {
  if (!condition) fail(message);
}

const control = JSON.parse(fs.readFileSync(controlPath, 'utf8'));
const hedge = JSON.parse(fs.readFileSync(hedgePath, 'utf8'));
const requiredPrinciples = ['AUTONOMOUS', 'GLOBAL', 'IRREPLACEABLE_VALUE', 'TRANSPARENT'];
for (const principle of requiredPrinciples) {
  requireValue(typeof control.operating_principles?.[principle] === 'string' && control.operating_principles[principle].length > 20, `missing operating principle ${principle}`);
  requireValue(hedge.operating_principles?.includes(principle), `operational hedge missing principle ${principle}`);
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

const hedgeById = new Map((hedge.hedges || []).map(item => [item.id, item]));
const requiredHedges = [
  'SILENT_PARTIAL_FAILURE',
  'HUMAN_OVERRIDE_GOVERNANCE',
  'ROLLBACK_EPOCH_INTEGRITY',
  'MARKET_REGIME_BREAK',
  'AUDIT_SURVIVABILITY',
  'VENDOR_ECONOMIC_CAPTURE',
  'METHODOLOGICAL_MONOCULTURE'
];
for (const id of requiredHedges) requireValue(hedgeById.has(id), `missing operational resilience hedge ${id}`);

const partial = hedgeById.get('SILENT_PARTIAL_FAILURE');
for (const state of ['COMPLETE_SUCCESS', 'PARTIAL_SUCCESS_EXPLICIT', 'FAILED_CLOSED', 'QUARANTINED_INCOMPLETE_SURFACE']) {
  requireValue(partial.required_states.includes(state), `missing partial-failure state ${state}`);
}
requireValue(partial.rules.includes('PARTIAL_SUCCESS_MUST_NEVER_BE_SERIALIZED_AS_COMPLETE_SUCCESS'), 'partial success must never look complete');

const override = hedgeById.get('HUMAN_OVERRIDE_GOVERNANCE');
for (const field of ['OVERRIDE_ID', 'REASON', 'SCOPE', 'REQUESTOR', 'APPROVER', 'EXPIRES_AT', 'ROLLBACK_TARGET', 'AFFECTED_GATES', 'AUDIT_DIGEST']) {
  requireValue(override.required_fields.includes(field), `missing override field ${field}`);
}
requireValue(override.rules.includes('NO_OVERRIDE_MAY_WEAKEN_RIGHTS_OR_EMPIRICAL_EVIDENCE_REQUIREMENTS'), 'override must not weaken rights/evidence');
requireValue(override.rules.includes('NO_OVERRIDE_MAY_AUTHORIZE_PRODUCTION_OR_G5'), 'override must not authorize Production/G5');

const rollback = hedgeById.get('ROLLBACK_EPOCH_INTEGRITY');
for (const component of ['CODE', 'CONFIG', 'MODEL_OR_METHODOLOGY', 'FACTOR_SNAPSHOT', 'CLAIM_REGISTRY', 'RIGHTS_STATE', 'PROJECTION_BINDING']) {
  requireValue(rollback.epoch_components.includes(component), `missing rollback epoch component ${component}`);
}
requireValue(rollback.fail_closed === 'HOLD_SPLIT_BRAIN_ROLLBACK_EPOCH', 'split-brain rollback must hold');

const regime = hedgeById.get('MARKET_REGIME_BREAK');
requireValue(regime.rules.includes('STATISTICAL_DRIFT_PASS_DOES_NOT_PROVE_MARKET_REGIME_STABILITY'), 'regime break must be distinct from statistical drift');
requireValue(regime.rules.includes('PRE_BREAK_CALIBRATION_CANNOT_AUTO_PROMOTE_POST_BREAK_CLAIMS'), 'pre-break calibration cannot promote post-break claims');

const audit = hedgeById.get('AUDIT_SURVIVABILITY');
for (const field of ['CONTENT_DIGEST', 'RIGHTS_STATE_AT_USE', 'METHODOLOGY_VERSION', 'DECISION_RECEIPT_DIGEST', 'LINEAGE_TOMBSTONE']) {
  requireValue(audit.durable_tombstone_fields.includes(field), `missing durable audit tombstone field ${field}`);
}
requireValue(audit.rules.some(rule => rule.includes('MUST_NOT_RETAIN_PROHIBITED_RAW_CONTENT')), 'audit tombstones must not retain prohibited raw content');
requireValue(audit.rules.includes('DELETION_REVOCATION_AND_SCHEMA_DRIFT_EVENTS_MUST_REMAIN_AUDITABLE_VIA_OPAQUE_DIGESTS_AND_LINEAGE_METADATA'), 'audit survivability across deletion/revocation/schema drift missing');

const vendor = hedgeById.get('VENDOR_ECONOMIC_CAPTURE');
for (const metric of ['REPLACEMENT_LEAD_TIME', 'SWITCHING_COST', 'COVERAGE_LOSS_IF_REMOVED', 'PRICE_INCREASE_SENSITIVITY', 'MARGINAL_VERIFIED_INTELLIGENCE_GAIN']) {
  requireValue(vendor.required_metrics.includes(metric), `missing vendor capture metric ${metric}`);
}
requireValue(vendor.rules.includes('TECHNICAL_PROVIDER_INDEPENDENCE_DOES_NOT_IMPLY_ECONOMIC_INDEPENDENCE'), 'technical independence must not imply economic independence');

const monoculture = hedgeById.get('METHODOLOGICAL_MONOCULTURE');
requireValue(monoculture.rules.includes('VERSION_CHANGE_ALONE_DOES_NOT_COUNT_AS_METHODOLOGICAL_DIVERSITY'), 'version-only challenger must not count as methodology diversity');
requireValue(monoculture.rules.includes('NO_AUTO_PROMOTION_OF_CHALLENGER_ON_SINGLE_METRIC_WIN'), 'single-metric challenger auto-promotion prohibited');

requireValue(control.global_safety_ceiling?.synthetic_or_control_evidence === 'NON_PROMOTABLE_TO_EMPIRICAL_PASS', 'synthetic evidence promotion ceiling missing');
requireValue(control.global_safety_ceiling?.live_mutation === 'DISABLED_UNTIL_SEPARATE_ACTIVATION_GATE', 'live mutation must remain separately gated');
requireValue(control.global_safety_ceiling?.production === 'HOLD', 'Production must remain HOLD');
requireValue(hedge.global_safety_ceiling?.production === 'HOLD', 'hedge layer Production must remain HOLD');
requireValue(hedge.global_safety_ceiling?.g5 === 'EXPLICIT_APPROVAL_REQUIRED', 'hedge layer G5 must remain explicit approval');

if (!process.exitCode) {
  console.log('PASS: Autonomous / Global / Irreplaceable Value / Transparent resilience and operational hedge controls validated');
}
