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
  'RIGHTS_REVOCATION_OR_ENTITY_CORRECTION_MUST_TRANSITIVELY_INVALIDATE_DEPENDENT_CLAIMS',
  'EVERY_CANONICAL_BUSINESS_CHAIN_NODE_MUST_MAP_TO_AT_LEAST_ONE_AUDIT_STAGE',
  'SYNTHETIC_CONTROL_EVIDENCE_IS_NON_PROMOTABLE','NO_PRODUCTION_PUBLIC_G5_BYPASS'
];
const requiredAxes = ['INTERNAL_CONTROL_READINESS','EMPIRICAL_EVIDENCE_READINESS','RELEASE_EVIDENCE_READINESS'];
const requiredStageStatuses = ['PASS_EVIDENCED','PASS_CONTROL_ONLY','IN_PROGRESS','WAITING_EXTERNAL','UNKNOWN','HOLD','FAIL'];
const requiredAggregationRules = [
  'NO_AVERAGING_ACROSS_READINESS_AXES','CONTROL_PASS_CANNOT_CLOSE_EMPIRICAL_GATE',
  'UNKNOWN_MATERIAL_STAGE_PREVENTS_END_TO_END_PASS','ONE_MATERIAL_FAIL_OR_HOLD_PREVENTS_END_TO_END_PASS',
  'DOWNSTREAM_RELEASE_CHAIN_CANNOT_BE_GREENER_THAN_UPSTREAM_EMPIRICAL_TRUTH'
];
const requiredChainReceipts = [
  'source_receipt','rights_state','raw_event_digest','normalization_lineage','entity_lineage','evidence_references',
  'factor_computability','claim_confidence_and_limitations','decision_rationale','snapshot_id','assessment_id',
  'runtime_release_or_hold_state','projection_binding','portal_eos_truth_state','audit_digest'
];
const requiredHardBoundaries = {
  synthetic_control_evidence: 'NON_PROMOTABLE',
  provider_contact_or_contract: 'EXPLICIT_GATE',
  external_spend: 'EXPLICIT_GATE',
  credential_activation: 'EXPLICIT_GATE',
  production: 'HOLD',
  public: 'HOLD',
  g5: 'EXPLICIT_APPROVAL_REQUIRED'
};
const requiredControlFamilies = [
  'operating-principles-and-resilience-controls-v1.json',
  'operational-resilience-hedges-v1.json',
  'systemic-catastrophic-risk-controls-v1.json',
  'adversarial-ecosystem-risk-controls-v1.json',
  'economic-strategic-attack-controls-v1.json',
  'institutional-trust-risk-controls-v1.json',
  'institutional-continuity-sovereignty-controls-v1.json',
  'reflexivity-self-influence-risk-controls-v1.json',
  'epistemic-causal-integrity-controls-v1.json',
  'decision-theoretic-tailrisk-controls-v1.json',
  'human-autonomy-authority-controls-v1.json',
  'temporal-integrity-latency-controls-v1.json',
  'ontology-entity-integrity-controls-v1.json',
  'semantic-normalization-integrity-controls-v1.json'
];
const requiredFamilyValidators = [
  'scripts/kidults/kpmo/validate-operating-principles-resilience-v1.mjs',
  'scripts/kidults/kpmo/validate-systemic-catastrophic-risk-controls-v1.mjs',
  'scripts/kidults/kpmo/validate-adversarial-ecosystem-risk-controls-v1.mjs',
  'scripts/kidults/kpmo/validate-economic-strategic-attack-controls-v1.mjs',
  'scripts/kidults/kpmo/validate-institutional-trust-risk-controls-v1.mjs',
  'scripts/kidults/kpmo/validate-institutional-continuity-sovereignty-v1.mjs',
  'scripts/kidults/kpmo/validate-reflexivity-self-influence-risk-controls-v1.mjs',
  'scripts/kidults/kpmo/validate-epistemic-causal-integrity-v1.mjs',
  'scripts/kidults/kpmo/validate-decision-theoretic-tailrisk-controls-v1.mjs',
  'scripts/kidults/kpmo/validate-human-autonomy-authority-v1.mjs',
  'scripts/kidults/kpmo/validate-temporal-integrity-latency-v1.mjs',
  'scripts/kidults/kpmo/validate-ontology-entity-integrity-v1.mjs',
  'scripts/kidults/kpmo/validate-semantic-normalization-integrity-v1.mjs'
];
const requiredDownstreamValidators = [
  'scripts/kidults/portal/validate-portal-release-001.mjs'
];
const requiredCanonicalIds = [
  'collectible_family_id','representative_product_id','market_cell_id','assertion_id','evidence_requirement_id',
  'source_demand_id','source_family_id','evidence_id','market_event_id','snapshot_id','assessment_id','projection_id'
];
const requiredCanonicalStateChain = [
  'DISCOVERED_OBJECT','COLLECTIBLE_CANDIDATE','COLLECTIBLE_QUALIFIED','REPRESENTATIVE_CANDIDATE',
  'REPRESENTATIVE_QUALIFIED','EVIDENCE_TARGETED','EVIDENCE_SUFFICIENT','TRACK_B_APPROVED','INDEX_ELIGIBLE','PUBLISHED'
];
const requiredCanonicalFailClosed = {
  kidults_is_toy_taxonomy: false,
  any_object_is_collectible: false,
  collectible_is_representative: false,
  representative_is_index_constituent: false,
  collectible_is_investment_recommendation: false,
  provider_id_is_canonical_id: false,
  listing_is_sold_transaction: false,
  missing_becomes_zero: false,
  portal_defines_market_truth: false,
  source_availability_defines_representativeness: false
};
const requiredTrackOwnership = {
  A: ['PRODUCT_EVIDENCE_DEMAND','SOURCE_DEMAND','CANONICAL_EVIDENCE_PRODUCTION'],
  B: ['INDEPENDENT_QUALIFICATION','REPRESENTATIVENESS','EVIDENCE_SUFFICIENCY','INDEX_ELIGIBILITY_RECOMMENDATION'],
  C: ['CUSTOMER_EXPERIENCE','PORTAL_PROJECTION_CONSUMPTION','CUSTOMER_RECOGNITION_INPUT'],
  D: ['DEV_STAGING_RUNTIME','CAPACITY','RECOVERY','COST','PRODUCTION_RELIABILITY'],
  E: ['READ_ONLY_EXECUTIVE_PROJECTION','EXECUTIVE_COMMAND_ROUTING','VALUE_CHAIN_HEALTH']
};

function requireMembers(actual, required, label) {
  if (!Array.isArray(actual)) throw new Error(`${label} must be an array`);
  const set = new Set(actual);
  if (set.size !== actual.length) throw new Error(`${label} contains duplicates`);
  for (const item of required) {
    if (!set.has(item)) throw new Error(`Missing ${label}: ${item}`);
  }
}

const stageIds = new Set((data.chain_stages || []).map(x => x.id));
for (const stage of requiredStages) {
  if (!stageIds.has(stage)) throw new Error(`Missing required value-chain stage: ${stage}`);
}
for (const stage of data.chain_stages || []) {
  if (!Array.isArray(stage.checks) || stage.checks.length === 0) throw new Error(`Stage has no checks: ${stage.id}`);
}
requireMembers(data.cross_stage_invariants || [], requiredInvariants, 'cross-stage invariant');
if (data.truth_rule !== 'ONLY_EVIDENCED_PASS_COUNTS_AS_COMPLETE') throw new Error('Canonical evidence truth rule changed');
if (data.promotion_policy?.production !== 'HOLD') throw new Error('Production must remain HOLD');
if (data.promotion_policy?.public !== 'HOLD') throw new Error('Public must remain HOLD');
if (data.promotion_policy?.g5 !== 'EXPLICIT_APPROVAL_REQUIRED') throw new Error('G5 explicit approval rule missing');

requireMembers(data.required_existing_control_families || [], requiredControlFamilies, 'required control family');
for (const file of data.required_existing_control_families || []) {
  const p = path.join(root, 'coordination/kidults/kpmo', file);
  if (!fs.existsSync(p)) throw new Error(`Required control family missing: ${file}`);
}
requireMembers(data.required_family_validators || [], requiredFamilyValidators, 'required family validator');
for (const validator of data.required_family_validators || []) {
  const p = path.join(root, validator);
  if (!fs.existsSync(p)) throw new Error(`Required family validator missing: ${validator}`);
}
for (const validator of requiredDownstreamValidators) {
  const p = path.join(root, validator);
  if (!fs.existsSync(p)) throw new Error(`Required downstream boundary validator missing: ${validator}`);
}
if (data.aggregate_machine_enforcement?.runner !== 'scripts/kidults/kpmo/run-full-value-chain-redteam-suite-v1.mjs') {
  throw new Error('Aggregate Red-Team runner binding changed');
}
if (data.aggregate_machine_enforcement?.workflow !== '.github/workflows/kidults-full-value-chain-redteam-orchestrator-v1.yml') {
  throw new Error('Aggregate Red-Team workflow binding changed');
}
if (data.aggregate_machine_enforcement?.require_all_family_validators_pass !== true) {
  throw new Error('All family validators must pass the aggregate Red-Team');
}
if (data.aggregate_machine_enforcement?.exact_head_checkout_required !== true) {
  throw new Error('Aggregate Red-Team must checkout the exact source SHA');
}
if (data.aggregate_machine_enforcement?.exact_head_sha_assertion_required !== true) {
  throw new Error('Aggregate Red-Team must assert the exact source SHA before validation');
}
if (data.aggregate_machine_enforcement?.post_merge_main_revalidation !== true) {
  throw new Error('Protected main must be revalidated post-merge');
}
if (data.aggregate_machine_enforcement?.control_pass_closes_empirical_gate !== false) {
  throw new Error('Control PASS must never close empirical gates');
}
const runnerPath = path.join(root, data.aggregate_machine_enforcement.runner);
if (!fs.existsSync(runnerPath)) throw new Error('Aggregate Red-Team runner missing');
const runnerText = fs.readFileSync(runnerPath, 'utf8');
for (const validator of requiredDownstreamValidators) {
  if (!runnerText.includes(validator)) throw new Error(`Aggregate Red-Team downstream boundary validator binding missing: ${validator}`);
}
const workflowPath = path.join(root, data.aggregate_machine_enforcement.workflow);
if (!fs.existsSync(workflowPath)) throw new Error('Aggregate Red-Team workflow missing');
const workflowText = fs.readFileSync(workflowPath, 'utf8');
for (const marker of [
  "ref: ${{ github.event.pull_request.head.sha || github.sha }}",
  'Verify exact source SHA',
  'test "$ACTUAL_SHA" = "$EXPECTED_SHA"'
]) {
  if (!workflowText.includes(marker)) throw new Error(`Aggregate Red-Team exact-head workflow marker missing: ${marker}`);
}

const canonicalPath = path.join(root, data.canonical_value_chain_binding || '');
if (!fs.existsSync(canonicalPath)) throw new Error('Canonical value-chain contract binding missing');
const canonical = JSON.parse(fs.readFileSync(canonicalPath, 'utf8'));
if (!Array.isArray(canonical.chain) || canonical.chain.length === 0) throw new Error('Canonical business chain is empty');
if (canonical.production !== 'HOLD') throw new Error('Canonical business value-chain Production must remain HOLD');
if (canonical.g5 !== 'NOT_REQUESTED') throw new Error('Canonical business value-chain G5 must remain NOT_REQUESTED');
requireMembers(canonical.canonical_ids || [], requiredCanonicalIds, 'canonical id');
requireMembers(canonical.state_chain || [], requiredCanonicalStateChain, 'canonical state');
for (const [key, expected] of Object.entries(requiredCanonicalFailClosed)) {
  if (canonical.fail_closed_invariants?.[key] !== expected) throw new Error(`Canonical fail-closed invariant changed: ${key}`);
}
for (const [track, required] of Object.entries(requiredTrackOwnership)) {
  requireMembers(canonical.track_ownership?.[track] || [], required, `Track ${track} ownership`);
}
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

requireMembers((auditContract.readiness_axes || []).map(x => x.id), requiredAxes, 'readiness axis');
requireMembers(auditContract.stage_statuses || [], requiredStageStatuses, 'audit stage status');
if (auditContract.completion_rule !== 'ONLY_PASS_EVIDENCED_COUNTS_TOWARD_EMPIRICAL_COMPLETION') throw new Error('Empirical completion rule changed');
requireMembers(auditContract.aggregation_rules || [], requiredAggregationRules, 'audit aggregation rule');
requireMembers(auditContract.required_chain_receipts || [], requiredChainReceipts, 'required chain receipt');
for (const [key, expected] of Object.entries(requiredHardBoundaries)) {
  if (auditContract.hard_boundaries?.[key] !== expected) throw new Error(`Audit hard boundary changed: ${key}`);
}

console.log(`PASS full value-chain Red-Team orchestrator: ${requiredStages.length} audit stages, ${canonical.chain.length} canonical business-chain nodes, ${(data.required_existing_control_families || []).length} control families, ${(data.required_family_validators || []).length} executable family validators, ${requiredDownstreamValidators.length} mandatory downstream boundary validator, ${requiredAxes.length} readiness axes, ${requiredChainReceipts.length} mandatory chain receipts, exact-head CI enforced`);
