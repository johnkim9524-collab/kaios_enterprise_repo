import fs from 'node:fs';

const rolePath = 'coordination/kidults/governance/ai-agent-autonomous-role-contract-v1.json';
const seqPath = 'coordination/kidults/governance/ai-agent-bootstrap-remediation-sequence-v1.json';
const docPath = '.github/AI_AGENT_AUTONOMOUS_ROLE.md';

const fail = (m) => { console.error(`AUTONOMOUS_ROLE_FAIL:${m}`); process.exitCode = 1; };
for (const p of [rolePath, seqPath, docPath]) if (!fs.existsSync(p)) fail(`MISSING:${p}`);
if (process.exitCode) process.exit();

const role = JSON.parse(fs.readFileSync(rolePath, 'utf8'));
const seq = JSON.parse(fs.readFileSync(seqPath, 'utf8'));
const doc = fs.readFileSync(docPath, 'utf8');

const expectedPrinciples = ['AUTONOMOUS','GLOBAL','IRREPLACEABLE_VALUE','TRANSPARENT'];
if (JSON.stringify(role.platform_principles) !== JSON.stringify(expectedPrinciples)) fail('PRINCIPLE_ORDER');
if (role.status !== 'MANDATORY_FAIL_CLOSED') fail('ROLE_NOT_FAIL_CLOSED');
if (role.scope !== 'ALL_AI_AGENT_INSTANCES_AND_AGENT_DISPATCHING_AUTOMATIONS') fail('ROLE_SCOPE');
if (role.autonomous_role?.report_only_while_fix_executable !== 'FORBIDDEN') fail('REPORT_ONLY_NOT_FORBIDDEN');
if (role.autonomous_role?.repeated_human_prompting_required !== false) fail('REPEATED_PROMPT_ALLOWED');
if (role.autonomous_role?.self_exemption_allowed !== false) fail('SELF_EXEMPTION');

const requiredSteps = [
  'IDENTIFY_ROOT_CAUSE',
  'CORRECT_ROOT_CAUSE_IMMEDIATELY',
  'ADD_OR_STRENGTHEN_REGRESSION_NEGATIVE_AND_MUTATION_TESTS',
  'REVALIDATE_EXACT_HEAD',
  'SYNC_CANONICAL_REGISTRY_ISSUES_AND_MANAGEMENT_TRUTH',
  'REPORT_ONLY_AFTER_VERIFIED_REMEDIATION',
  'PROPOSE_PRIORITIZED_CURRENT_IMPROVEMENTS'
];
for (const step of requiredSteps) if (!role.autonomous_role?.mandatory_immediate_behavior?.includes(step)) fail(`MISSING_ROLE_STEP:${step}`);

const strategic = [
  'INTELLIGENCE_HOLDINGS_GROUP_FUTURE_STRATEGY',
  'VERTICAL_BRAND_FUTURE_STRATEGY',
  'CURRENT_PLATFORM_IMPROVEMENT_PROPOSALS'
];
for (const d of strategic) if (!role.strategic_stewardship_role?.required_domains?.includes(d)) fail(`MISSING_STRATEGIC_DOMAIN:${d}`);
if (role.strategic_stewardship_role?.kpmo_accountable_owner !== true) fail('KPMO_NOT_ACCOUNTABLE');
if (role.bootstrap_requirement?.must_load_before_task_execution !== true) fail('ROLE_NOT_BOOTSTRAP_REQUIRED');
if (role.bootstrap_requirement?.must_inherit_to_every_child_agent !== true) fail('CHILD_INHERITANCE_MISSING');
if (role.bootstrap_requirement?.missing_or_invalid_contract_behavior !== 'REJECT_TASK_DISPATCH') fail('MISSING_FAIL_CLOSED_DISPATCH');

if (seq.autonomous_role_contract_path !== rolePath) fail('SEQUENCE_ROLE_PATH');
if (seq.bootstrap_must_load_before_task_execution !== true) fail('SEQUENCE_BOOTSTRAP_ORDER');
if (seq.report_only_before_remediation_allowed !== false) fail('SEQUENCE_REPORT_ONLY');
if (seq.repeated_human_prompting_required !== false) fail('SEQUENCE_REPEATED_PROMPT');
for (const key of ['KPMO','TRACK_A','TRACK_B','TRACK_C','TRACK_D','TRACK_E','ASI','RED_TEAM','EXTERNAL_MODEL_AGENTS']) {
  if (seq.bootstrap_inheritance?.[key] !== true) fail(`SEQUENCE_INHERITANCE:${key}`);
}
const legacySequence = [
  'DETECT_REVERSIBLE_DEFECT',
  'CORRECT_ROOT_CAUSE_IMMEDIATELY',
  'RUN_REGRESSION_AND_NEGATIVE_TESTS',
  'REVALIDATE_EXACT_HEAD_AND_TARGET_MAIN',
  'TRUTH_SYNC_REGISTRY_AND_ISSUE',
  'REPORT_VERIFIED_OUTCOME',
  'PROPOSE_PRIITIZED_IMPROVEMENTS'
];
legacySequence[6] = 'PROPOSE_PRIORITIZED_IMPROVEMENTS';
if (JSON.stringify(seq.mandatory_sequence) !== JSON.stringify(legacySequence)) fail('SEQUENCE_V1_2_COMPATIBILITY');
if (seq.version !== '1.2.0') fail('SEQUENCE_VERSION_COMPATIBILITY');
if (seq.strategic_stewardship?.intelligence_holdings_group_future_strategy_required !== true) fail('SEQUENCE_GROUP_STRATEGY_LINK');
if (seq.strategic_stewardship?.vertical_future_strategy_required_when_affected !== true) fail('SEQUENCE_VERTICAL_STRATEGY_LINK');
if (seq.strategic_stewardship?.current_improvement_proposal_required !== true) fail('SEQUENCE_IMPROVEMENT_LINK');
if (role.scope !== 'ALL_AI_AGENT_INSTANCES_AND_AGENT_DISPATCHING_AUTOMATIONS') fail('ROLE_GLOBAL_INHERITANCE_SCOPE');

for (const phrase of ['AUTONOMOUS','GLOBAL','IRREPLACEABLE VALUE','TRANSPARENT','REPORT_ONLY_AFTER_VERIFIED_REMEDIATION']) {
  if (!doc.toUpperCase().includes(phrase)) fail(`DOC_CONTRACT:${phrase}`);
}

if (!process.exitCode) console.log('AUTONOMOUS_ROLE_VERIFIED_PASS');
