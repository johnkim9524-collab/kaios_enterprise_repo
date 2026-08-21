import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const controlPath = path.join(root, 'coordination', 'kidults', 'kpmo', 'systemic-catastrophic-risk-controls-v1.json');
const globalPath = path.join(root, 'coordination', 'kidults', 'kpmo', 'global-leadership-risk-controls-v1.json');
const control = JSON.parse(fs.readFileSync(controlPath, 'utf8'));
const globalControl = JSON.parse(fs.readFileSync(globalPath, 'utf8'));

let failed = false;
const fail = message => { console.error(`FAIL: ${message}`); failed = true; };
const requireValue = (condition, message) => { if (!condition) fail(message); };

for (const principle of ['AUTONOMOUS', 'GLOBAL', 'IRREPLACEABLE_VALUE', 'TRANSPARENT']) {
  requireValue(control.operating_principles?.includes(principle), `missing operating principle ${principle}`);
  requireValue(globalControl.operating_principles?.includes(principle), `global index missing operating principle ${principle}`);
}
requireValue(globalControl.risk_control_bindings?.systemic_catastrophic === 'systemic-catastrophic-risk-controls-v1.json', 'global control index must bind systemic catastrophic layer');

const byId = new Map((control.controls || []).map(item => [item.id, item]));
const required = [
  'GRAPH_CONTAMINATION_PROPAGATION',
  'CONFIDENCE_CONTAGION',
  'SYNCHRONIZED_REGIONAL_FAILURE',
  'EVIDENCE_CARTEL_OR_COLLUSION',
  'AUTONOMOUS_GOAL_GAMING',
  'RECOVERY_DEADLOCK',
  'HIDDEN_COMMON_MODE_DEPENDENCY'
];
for (const id of required) requireValue(byId.has(id), `missing catastrophic control ${id}`);

const graph = byId.get('GRAPH_CONTAMINATION_PROPAGATION');
requireValue(graph.rules.some(rule => rule.includes('HIGH_FANOUT_NODES')), 'high-fanout graph admission control missing');
requireValue(graph.rules.some(rule => rule.includes('AFFECTED_CLAIM_HOLD')), 'graph contamination dependency hold missing');
requireValue(graph.rules.some(rule => rule.includes('HISTORICAL_LINEAGE')), 'graph repair must preserve historical lineage');

const confidence = byId.get('CONFIDENCE_CONTAGION');
requireValue(confidence.rules.some(rule => rule.includes('REUSED_OR_CORRELATED_EVIDENCE')), 'confidence correlation dedupe missing');
requireValue(confidence.rules.some(rule => rule.includes('NEW_INDEPENDENT_INFORMATION_GAIN')), 'confidence upgrade must require independent information gain');

const regional = byId.get('SYNCHRONIZED_REGIONAL_FAILURE');
for (const dimension of ['PROVIDER', 'FACTUAL_ORIGIN', 'RUNTIME', 'METHODOLOGY', 'FX', 'TIME_CALENDAR']) {
  requireValue(regional.common_mode_dimensions.includes(dimension), `missing regional common-mode dimension ${dimension}`);
}
requireValue(regional.rules.some(rule => rule.includes('FAILURE_DOMAIN_DIVERSITY')), 'global failure-domain diversity rule missing');
requireValue(regional.rules.some(rule => rule.includes('STALE_GLOBAL_AGGREGATE')), 'stale global fallback prohibition missing');

const cartel = byId.get('EVIDENCE_CARTEL_OR_COLLUSION');
requireValue(cartel.rules.some(rule => rule.includes('OWNER_ORIGIN_AND_CONTROL_PATH_DIVERSITY')), 'cartel independence dimensions missing');
requireValue(cartel.rules.some(rule => rule.includes('CLUSTER_LEVEL_REMOVAL')), 'cartel cluster removal test missing');

const gaming = byId.get('AUTONOMOUS_GOAL_GAMING');
requireValue(gaming.rules.some(rule => rule.includes('NO_SINGLE_KPI')), 'single KPI autonomy prohibition missing');
requireValue(gaming.rules.some(rule => rule.includes('RECLASSIFICATION_WITHOUT_NEW_EVIDENCE')), 'unknown debt gaming prohibition missing');
requireValue(gaming.protected_objectives.includes('LONG_TERM_OPTIONALITY'), 'long-term optionality protection missing');

const recovery = byId.get('RECOVERY_DEADLOCK');
requireValue(recovery.rules.some(rule => rule.includes('ACYCLIC')), 'acyclic recovery requirement missing');
requireValue(recovery.rules.some(rule => rule.includes('CANNOT_PROMOTE_EMPIRICAL_OR_PRODUCTION_GATES')), 'break-glass truth ceiling missing');
requireValue(recovery.rules.some(rule => rule.includes('NO_ORPHAN_STATE_REMAINS')), 'post-recovery orphan-state proof missing');

const common = byId.get('HIDDEN_COMMON_MODE_DEPENDENCY');
for (const dependency of ['CODE_LIBRARY', 'REGISTRY', 'IDENTITY_MAP', 'METHODOLOGY', 'RUNTIME', 'CLOCK_TIME_SOURCE', 'FX_SOURCE', 'PROVIDER_ORIGIN', 'SECRET_OR_CREDENTIAL_PLANE']) {
  requireValue(common.required_dependency_classes.includes(dependency), `missing common-mode dependency class ${dependency}`);
}
requireValue(common.rules.some(rule => rule.includes('FAILURE_DOMAIN_COUNT_MUST_BE_REPORTED_SEPARATELY')), 'failure-domain count separation missing');

requireValue(control.catastrophic_activation_ceiling?.empirical_promotion === 'PROHIBITED_FROM_CONTROL_OR_SYNTHETIC_TESTS', 'synthetic/control empirical promotion ceiling missing');
requireValue(control.catastrophic_activation_ceiling?.live_mutation === 'DISABLED_UNTIL_SEPARATE_ACTIVATION_GATE', 'live mutation ceiling missing');
requireValue(control.catastrophic_activation_ceiling?.production === 'HOLD', 'Production HOLD missing');
requireValue(control.catastrophic_activation_ceiling?.g5 === 'EXPLICIT_APPROVAL_REQUIRED', 'G5 gate missing');

if (failed) process.exit(1);
console.log('PASS: systemic/catastrophic Red-Team controls validated and bound to global leadership index');
