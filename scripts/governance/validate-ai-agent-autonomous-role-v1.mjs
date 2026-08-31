import fs from 'node:fs';

const rolePath = 'coordination/kidults/governance/ai-agent-autonomous-role-contract-v1.json';
const seqPath = 'coordination/kidults/governance/ai-agent-bootstrap-remediation-sequence-v1.json';
const trackJdPath = 'coordination/kidults/governance/track-abcdez-job-description-contract-v1.json';
const strategyPath = 'coordination/kidults/governance/ih-integrated-product-customer-platform-provider-internalization-strategy-v1.json';
const strategyDocPath = 'docs/strategy/IH_INTEGRATED_PRODUCT_CUSTOMER_PLATFORM_PROVIDER_INTERNALIZATION_STRATEGY_V1.md';
const docPath = '.github/AI_AGENT_AUTONOMOUS_ROLE.md';
const trackDocPath = '.github/TRACK_ABCDEZ_JOB_DESCRIPTIONS.md';

const fail = (m) => { console.error(`AUTONOMOUS_ROLE_FAIL:${m}`); process.exitCode = 1; };
for (const p of [rolePath, seqPath, trackJdPath, strategyPath, strategyDocPath, docPath, trackDocPath]) if (!fs.existsSync(p)) fail(`MISSING:${p}`);
if (process.exitCode) process.exit();

const role = JSON.parse(fs.readFileSync(rolePath, 'utf8'));
const seq = JSON.parse(fs.readFileSync(seqPath, 'utf8'));
const trackJd = JSON.parse(fs.readFileSync(trackJdPath, 'utf8'));
const strategy = JSON.parse(fs.readFileSync(strategyPath, 'utf8'));
const doc = fs.readFileSync(docPath, 'utf8');
const trackDoc = fs.readFileSync(trackDocPath, 'utf8');
const strategyDoc = fs.readFileSync(strategyDocPath, 'utf8');

const expectedPrinciples = ['AUTONOMOUS','GLOBAL','IRREPLACEABLE_VALUE','TRANSPARENT'];
if (JSON.stringify(role.platform_principles) !== JSON.stringify(expectedPrinciples)) fail('PRINCIPLE_ORDER');
if (role.status !== 'MANDATORY_FAIL_CLOSED') fail('ROLE_NOT_FAIL_CLOSED');
if (role.scope !== 'ALL_AI_AGENT_INSTANCES_AND_AGENT_DISPATCHING_AUTOMATIONS') fail('ROLE_SCOPE');
if (role.autonomous_role?.report_only_while_fix_executable !== 'FORBIDDEN') fail('REPORT_ONLY_NOT_FORBIDDEN');
if (role.autonomous_role?.repeated_human_prompting_required !== false) fail('REPEATED_PROMPT_ALLOWED');
if (role.autonomous_role?.self_exemption_allowed !== false) fail('SELF_EXEMPTION');
if (role.track_job_description_contract_path !== trackJdPath) fail('TRACK_JD_PATH');
if (role.integrated_strategy_contract_path !== strategyPath) fail('STRATEGY_PATH');
if (role.integrated_strategy_document_path !== strategyDocPath) fail('STRATEGY_DOC_PATH');

const requiredSteps = [
  'IDENTIFY_ROOT_CAUSE',
  'CORRECT_ROOT_CAUSE_IMMEDIATELY',
  'ADD_OR_STRENGTHEN_REGRESSION_NEGATIVE_AND_MUTATION_TESTS',
  'REVALIDATE_EXACT_HEAD',
  'SYNC_CANONICAL_REGISTRY_ISSUES_AND_MANAGEMENT_TRUTH',
  'REPORT_ONLY_AFTER_VERIFIED_REMEDIATION',
  'PROPOSE_PRIORITIZED_CURRENT_IMPROVEMENTS',
  'ASSESS_INTEGRATED_STRATEGY_EFFECT_WHEN_MATERIAL'
];
for (const step of requiredSteps) if (!role.autonomous_role?.mandatory_immediate_behavior?.includes(step)) fail(`MISSING_ROLE_STEP:${step}`);

const strategic = [
  'INTELLIGENCE_HOLDINGS_GROUP_FUTURE_STRATEGY',
  'VERTICAL_BRAND_FUTURE_STRATEGY',
  'CURRENT_PLATFORM_IMPROVEMENT_PROPOSALS',
  'PRODUCT_STRATEGY',
  'CUSTOMER_STRATEGY',
  'PLATFORM_STRATEGY',
  'PROVIDER_STRATEGY',
  'INTERNALIZATION_STRATEGY',
  'GO_TO_MARKET_AND_MONETIZATION'
];
for (const d of strategic) if (!role.strategic_stewardship_role?.required_domains?.includes(d)) fail(`MISSING_STRATEGIC_DOMAIN:${d}`);
if (role.strategic_stewardship_role?.kpmo_accountable_owner !== true) fail('KPMO_NOT_ACCOUNTABLE');
if (role.bootstrap_requirement?.must_load_before_task_execution !== true) fail('ROLE_NOT_BOOTSTRAP_REQUIRED');
if (role.bootstrap_requirement?.must_inherit_to_every_child_agent !== true) fail('CHILD_INHERITANCE_MISSING');
if (role.bootstrap_requirement?.track_jd_contract_required_for_track_agents !== true) fail('TRACK_JD_NOT_BOOTSTRAP_REQUIRED');
if (role.bootstrap_requirement?.integrated_strategy_contract_required_for_material_strategy_tasks !== true) fail('STRATEGY_NOT_BOOTSTRAP_REQUIRED');
if (role.bootstrap_requirement?.missing_or_invalid_contract_behavior !== 'REJECT_TASK_DISPATCH') fail('MISSING_FAIL_CLOSED_DISPATCH');

if (seq.autonomous_role_contract_path !== rolePath) fail('SEQUENCE_ROLE_PATH');
if (seq.track_job_description_contract_path !== trackJdPath) fail('SEQUENCE_TRACK_JD_PATH');
if (seq.integrated_strategy_contract_path !== strategyPath) fail('SEQUENCE_STRATEGY_PATH');
if (seq.bootstrap_must_load_before_task_execution !== true) fail('SEQUENCE_BOOTSTRAP_ORDER');
if (seq.report_only_before_remediation_allowed !== false) fail('SEQUENCE_REPORT_ONLY');
if (seq.repeated_human_prompting_required !== false) fail('SEQUENCE_REPEATED_PROMPT');
for (const key of ['KPMO','TRACK_A','TRACK_B','TRACK_C','TRACK_D','TRACK_E','TRACK_Z','ASI','RED_TEAM','EXTERNAL_MODEL_AGENTS']) {
  if (seq.bootstrap_inheritance?.[key] !== true) fail(`SEQUENCE_INHERITANCE:${key}`);
}
const legacySequence = [
  'DETECT_REVERSIBLE_DEFECT',
  'CORRECT_ROOT_CAUSE_IMMEDIATELY',
  'RUN_REGRESSION_AND_NEGATIVE_TESTS',
  'REVALIDATE_EXACT_HEAD_AND_TARGET_MAIN',
  'TRUTH_SYNC_REGISTRY_AND_ISSUE',
  'REPORT_VERIFIED_OUTCOME',
  'PROPOSE_PRIORITIZED_IMPROVEMENTS'
];
if (JSON.stringify(seq.mandatory_sequence) !== JSON.stringify(legacySequence)) fail('SEQUENCE_V1_2_COMPATIBILITY');
if (seq.version !== '1.2.0') fail('SEQUENCE_VERSION_COMPATIBILITY');
if (seq.strategic_stewardship?.intelligence_holdings_group_future_strategy_required !== true) fail('SEQUENCE_GROUP_STRATEGY_LINK');
if (seq.strategic_stewardship?.vertical_future_strategy_required_when_affected !== true) fail('SEQUENCE_VERTICAL_STRATEGY_LINK');
if (seq.strategic_stewardship?.current_improvement_proposal_required !== true) fail('SEQUENCE_IMPROVEMENT_LINK');
if (seq.strategic_stewardship?.integrated_product_customer_platform_provider_internalization_strategy_required_when_material !== true) fail('SEQUENCE_INTEGRATED_STRATEGY_LINK');
if (!seq.stop_conditions?.includes('PROVIDER_ACTIVATION_REQUIRING_SEPARATE_AUTHORITY')) fail('SEQUENCE_PROVIDER_ACTIVATION_GATE');

if (trackJd.id !== 'kidults-track-abcdez-job-description-contract-v1') fail('TRACK_JD_ID');
if (trackJd.status !== 'MANDATORY_FAIL_CLOSED') fail('TRACK_JD_STATUS');
if (trackJd.integrated_strategy_contract_path !== strategyPath) fail('TRACK_JD_STRATEGY_PATH');
if (JSON.stringify(trackJd.platform_principles) !== JSON.stringify(expectedPrinciples)) fail('TRACK_JD_PRINCIPLES');
if (trackJd.common_role_contract?.autonomous_fix_first_required !== true) fail('TRACK_JD_FIX_FIRST');
if (trackJd.common_role_contract?.report_only_while_fix_executable !== 'FORBIDDEN') fail('TRACK_JD_REPORT_ONLY');
if (trackJd.bootstrap_requirement?.must_load_before_track_task_execution !== true) fail('TRACK_JD_PRELOAD');
if (trackJd.bootstrap_requirement?.integrated_strategy_contract_required_for_material_strategy_tasks !== true) fail('TRACK_JD_STRATEGY_PRELOAD');
const tracks = ['TRACK_A','TRACK_B','TRACK_C','TRACK_D','TRACK_E','TRACK_Z'];
for (const key of tracks) {
  const t = trackJd.tracks?.[key];
  if (!t) fail(`TRACK_JD_MISSING:${key}`);
  if (!t?.mission) fail(`TRACK_JD_MISSION:${key}`);
  if (!Array.isArray(t?.accountabilities) || t.accountabilities.length < 5) fail(`TRACK_JD_ACCOUNTABILITIES:${key}`);
  if (!Array.isArray(t?.required_outputs) || t.required_outputs.length < 3) fail(`TRACK_JD_OUTPUTS:${key}`);
  if (!t?.success_definition) fail(`TRACK_JD_SUCCESS:${key}`);
}
if (!trackJd.tracks?.TRACK_E?.accountabilities?.includes('PRODUCT_STRATEGY')) fail('TRACK_E_PRODUCT_STRATEGY');
if (!trackJd.tracks?.TRACK_E?.accountabilities?.includes('CUSTOMER_STRATEGY')) fail('TRACK_E_CUSTOMER_STRATEGY');
if (!trackJd.tracks?.TRACK_E?.accountabilities?.includes('PLATFORM_STRATEGY')) fail('TRACK_E_PLATFORM_STRATEGY');
if (!trackJd.tracks?.TRACK_E?.accountabilities?.includes('INTELLIGENCE_HOLDINGS_GROUP_FUTURE_STRATEGY')) fail('TRACK_E_GROUP_STRATEGY');
if (!trackJd.tracks?.TRACK_E?.accountabilities?.includes('VERTICAL_AND_BRAND_FUTURE_STRATEGY')) fail('TRACK_E_VERTICAL_STRATEGY');
if (!trackJd.tracks?.TRACK_Z?.accountabilities?.includes('PROVIDER_DISCOVERY_AND_PORTFOLIO_STRATEGY')) fail('TRACK_Z_PROVIDER_STRATEGY');
if (!trackJd.tracks?.TRACK_Z?.accountabilities?.includes('INTERNALIZATION_CANDIDATE_IDENTIFICATION')) fail('TRACK_Z_INTERNALIZATION');
if (trackJd.cross_track_failure_rules?.downstream_may_not_promote_when_upstream_authority_is_red_unknown_or_hold !== true) fail('TRACK_HANDOFF_FAIL_CLOSED');

if (strategy.id !== 'ih-integrated-product-customer-platform-provider-internalization-strategy-v1') fail('STRATEGY_ID');
if (strategy.status !== 'MANDATORY_STRATEGIC_STEWARDSHIP') fail('STRATEGY_STATUS');
if (JSON.stringify(strategy.platform_principles) !== JSON.stringify(expectedPrinciples)) fail('STRATEGY_PRINCIPLES');
for (const domain of ['PRODUCT_STRATEGY','CUSTOMER_STRATEGY','PLATFORM_STRATEGY','PROVIDER_STRATEGY','INTERNALIZATION_STRATEGY','GO_TO_MARKET_AND_MONETIZATION']) {
  if (!strategy.strategy_domains?.[domain]) fail(`STRATEGY_DOMAIN_MISSING:${domain}`);
}
if (!strategy.strategy_domains?.PROVIDER_STRATEGY?.portfolio_rules?.includes('NO_SINGLE_PROVIDER_AS_CANONICAL_TRUTH')) fail('PROVIDER_CANONICAL_TRUTH_GUARD');
if (!strategy.strategy_domains?.PROVIDER_STRATEGY?.portfolio_rules?.includes('PROOF_BEFORE_PROCUREMENT')) fail('PROVIDER_PROOF_BEFORE_PROCUREMENT');
if (!strategy.strategy_domains?.INTERNALIZATION_STRATEGY?.must_internalize?.includes('CANONICAL_IDENTITY_AND_ENTITY_RESOLUTION')) fail('INTERNALIZATION_IDENTITY_CORE');
if (!strategy.strategy_domains?.INTERNALIZATION_STRATEGY?.must_internalize?.includes('AI_AGENT_GOVERNANCE_AND_AUTONOMOUS_OPERATIONS')) fail('INTERNALIZATION_AI_GOVERNANCE');
if (!strategy.track_ownership?.TRACK_E?.includes('PRODUCT_CUSTOMER_PLATFORM_PORTFOLIO_STRATEGY')) fail('TRACK_E_INTEGRATED_STRATEGY_OWNER');
if (!strategy.track_ownership?.TRACK_Z?.includes('PROVIDER_PORTFOLIO')) fail('TRACK_Z_PROVIDER_OWNER');

for (const phrase of ['AUTONOMOUS','GLOBAL','IRREPLACEABLE VALUE','TRANSPARENT','REPORT_ONLY_AFTER_VERIFIED_REMEDIATION']) {
  if (!doc.toUpperCase().includes(phrase)) fail(`DOC_CONTRACT:${phrase}`);
}
for (const phrase of ['Track A','Track B','Track C','Track D','Track E','Track Z','Intelligence Holdings','AUTONOMOUS']) {
  if (!trackDoc.includes(phrase)) fail(`TRACK_DOC_CONTRACT:${phrase}`);
}
for (const phrase of ['## 2. Product strategy','## 3. Customer strategy','## 4. Platform strategy','## 5. Provider strategy','## 6. Internalization strategy']) {
  if (!strategyDoc.includes(phrase)) fail(`STRATEGY_DOC_CONTRACT:${phrase}`);
}

if (!process.exitCode) console.log('AUTONOMOUS_ROLE_VERIFIED_PASS');
