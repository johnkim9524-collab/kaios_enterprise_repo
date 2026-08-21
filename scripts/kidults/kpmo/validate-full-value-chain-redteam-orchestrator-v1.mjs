import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const orchestratorPath = path.join(root, 'coordination/kidults/kpmo/full-value-chain-redteam-orchestrator-v1.json');
const data = JSON.parse(fs.readFileSync(orchestratorPath, 'utf8'));

const requiredStages = [
  'SOURCE_DISCOVERY','RIGHTS_AND_POLICY','ACQUISITION','TEMPORAL_INTEGRITY','ENTITY_AND_ONTOLOGY',
  'SEMANTIC_NORMALIZATION','EVIDENCE_GRAPH','METRICS_AND_FACTORS','INTERPRETATION_AND_CAUSALITY',
  'AUTONOMOUS_SELECTION','DECISION_THEORY','HUMAN_AUTHORITY','SNAPSHOT_AND_TRACK_B','RUNTIME',
  'PROJECTION_PORTAL_EOS','REFLEXIVITY_AND_EXTERNAL_EFFECTS','AUDIT_RECOVERY_CONTINUITY'
];
const requiredInvariants = [
  'NO_STAGE_MAY_PROMOTE_UNKNOWN_TO_PASS','LOCAL_PASS_NE_END_TO_END_PASS','DOWNSTREAM_CANNOT_OUTRUN_UPSTREAM_TRUTH',
  'MATERIAL_LIMITATION_MUST_SURVIVE_TO_EXECUTIVE_AND_CUSTOMER_SURFACES','SYNTHETIC_CONTROL_EVIDENCE_IS_NON_PROMOTABLE',
  'NO_PRODUCTION_PUBLIC_G5_BYPASS'
];

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

console.log(`PASS full value-chain Red-Team orchestrator: ${requiredStages.length} stages, ${(data.required_existing_control_families || []).length} bound control families`);
