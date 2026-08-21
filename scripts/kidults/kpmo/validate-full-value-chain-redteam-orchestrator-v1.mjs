import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const orchestratorPath = path.join(root, 'coordination/kidults/kpmo/full-value-chain-redteam-orchestrator-v1.json');
const auditContractPath = path.join(root, 'coordination/kidults/kpmo/full-value-chain-redteam-audit-contract-v1.json');
const data = JSON.parse(fs.readFileSync(orchestratorPath, 'utf8'));
const auditContract = JSON.parse(fs.readFileSync(auditContractPath, 'utf8'));

const requiredStages = [
  'SOURCE_DISCOVERY','RIGHTS_AND_POLICY','ACQUISITION','TEMPORAL_INTEGRITY','ENTITY_AND_ONTOLOGY',
  'SEMANTIC_NORMALIZATION','EVIDENCE_GRAPH','METRICS_AND_FACTORS','INTERPRETATION_AND_CAUSALITY',
  'AUTONOMOUS_SELECTION','DECISION_THEORY','HUMAN_AUTHORITY','SNAPSHOT_AND_TRACK_B','RUNTIME',
  'PROJECTION_PORTAL_EOS','REFLEXIVITY_AND_EXTERNAL_EFFECTS','AUDIT_RECOVERY_CONTINUITY'
];
const requiredInvariants = [
  'NO_STAGE_MAY_PROMOTE_UNKNOWN_TO_PASS','LOCAL_PASS_NE_END_TO_END_PASS','DOWNSTREAM_CANNOT_OUTRUN_UPSTREAM_TRUTH',
  'MATERIAL_LIMITATION_MUST_SURVIVE_TO_EXECUTIVE_AND_CUSTOMER_SURFACES',
  'EVERY_CANONICAL_BUSINESS_CHAIN_NODE_MUST_MAP_TO_AT_LEAST_ONE_AUDIT_STAGE',
  'SYNTHETIC_CONTROL_EVIDENCE_IS_NON_PROMOTABLE','NO_PRODUCTION_PUBLIC_G5_BYPASS'
];
const requiredAxes = ['INTERNAL_CONTROL_READINESS','EMPIRICAL_EVIDENCE_READINESS','RELEASE_EVIDENCE_READINESS'];

const stageIds = new Set((data.chain_stages || []).map(x => x.id));
for (const stage of requiredStages) {
  if (!stageIds.has(stage)) throw new Error(`Missing required value-chain stage: ${stage}`);
}
for (const stage of data.chain_stages || []) {
  if (!Array.isArray(stage.checks) || stage.checks.length === 0) throw new Error(`Stage has no checks: ${stage.id}`);
}
for (const invariant of requiredInvariants) {
  if (!(data.cross_stage_invariants || []).includes(invariant)) throw new Error(`Missing invariant: ${invariant}`);
}
if (data.truth_rule !== 'ONLY_EVIDENCED_PASS_COUNTS_AS_COMPLETE') throw new Error('Canonical evidence truth rule changed');
if (data.promotion_policy?.production !== 'HOLD') throw new Error('Production must remain HOLD');
if (data.promotion_policy?.public !== 'HOLD') throw new Error('Public must remain HOLD');
if (data.promotion_policy?.g5 !== 'EXPLICIT_APPROVAL_REQUIRED') throw new Error('G5 explicit approval rule missing');

for (const file of data.required_existing_control_families || []) {
  const p = path.join(root, 'coordination/kidults/kpmo', file);
  if (!fs.existsSync(p)) throw new Error(`Required control family missing: ${file}`);
}

const canonicalPath = path.join(root, data.canonical_value_chain_binding || '');
if (!fs.existsSync(canonicalPath)) throw new Error('Canonical value-chain contract binding missing');
const canonical = JSON.parse(fs.readFileSync(canonicalPath, 'utf8'));
if (!Array.isArray(canonical.chain) || canonical.chain.length === 0) throw new Error('Canonical business chain is empty');
if (canonical.production !== 'HOLD') throw new Error('Canonical business value-chain Production must remain HOLD');
for (const node of canonical.chain) {
  const mapped = data.business_chain_to_audit_stages?.[node];
  if (!Array.isArray(mapped) || mapped.length === 0) throw new Error(`Canonical business-chain node has no Red-Team mapping: ${node}`);
  for (const auditStage of mapped) {
    if (!stageIds.has(auditStage)) throw new Error(`Business-chain node ${node} maps to unknown audit stage ${auditStage}`);
  }
}
for (const mappedNode of Object.keys(data.business_chain_to_audit_stages || {})) {
  if (!canonical.chain.includes(mappedNode)) throw new Error(`Red-Team mapping references non-canonical business-chain node: ${mappedNode}`);
}

const axisIds = new Set((auditContract.readiness_axes || []).map(x => x.id));
for (const axis of requiredAxes) {
  if (!axisIds.has(axis)) throw new Error(`Missing readiness axis: ${axis}`);
}
if (auditContract.completion_rule !== 'ONLY_PASS_EVIDENCED_COUNTS_TOWARD_EMPIRICAL_COMPLETION') throw new Error('Empirical completion rule changed');
for (const rule of ['NO_AVERAGING_ACROSS_READINESS_AXES','CONTROL_PASS_CANNOT_CLOSE_EMPIRICAL_GATE','UNKNOWN_MATERIAL_STAGE_PREVENTS_END_TO_END_PASS']) {
  if (!(auditContract.aggregation_rules || []).includes(rule)) throw new Error(`Missing audit aggregation rule: ${rule}`);
}
if (auditContract.hard_boundaries?.production !== 'HOLD') throw new Error('Audit contract Production must remain HOLD');
if (auditContract.hard_boundaries?.public !== 'HOLD') throw new Error('Audit contract Public must remain HOLD');
if (auditContract.hard_boundaries?.g5 !== 'EXPLICIT_APPROVAL_REQUIRED') throw new Error('Audit contract G5 explicit approval rule missing');

console.log(`PASS full value-chain Red-Team orchestrator: ${requiredStages.length} audit stages, ${canonical.chain.length} canonical business-chain nodes, ${(data.required_existing_control_families || []).length} control families, ${requiredAxes.length} readiness axes`);
