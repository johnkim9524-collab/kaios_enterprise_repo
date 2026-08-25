#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const files = {
  agents: 'AGENTS.md',
  policy: '.github/AI_AGENT_OPERATING_RULES.md',
  copilot: '.github/copilot-instructions.md',
  contract: 'coordination/kidults/governance/ai-agent-operating-rules-v1.json',
  platform: 'coordination/kidults/kpmo/operating-principles-and-resilience-controls-v1.json',
  schema: 'coordination/kidults/governance/ai-agent-status-receipt-schema-v1.json',
  registry: 'coordination/kidults/registry/ai-agent-governance-registry-v1.json',
  reserveWorkflow: '.github/workflows/kidults-asi-sharded-source-reserve-v1.yml',
  scaleWorkflow: '.github/workflows/kidults-asi-source-fabric-scale-pi1.yml'
};

const fail = (message) => { throw new Error(message); };
const resolvePath = (p) => path.isAbsolute(p) ? p : path.join(root, p);
const readText = (p) => fs.readFileSync(resolvePath(p), 'utf8');
const readJson = (p) => JSON.parse(readText(p));
const assert = (condition, message) => { if (!condition) fail(message); };
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasTopLevelTrigger = (text, trigger) => new RegExp(`^  ${escapeRegex(trigger)}:\\s*$`, 'm').test(text);

for (const [name, p] of Object.entries(files)) {
  assert(fs.existsSync(resolvePath(p)), `MISSING_${name.toUpperCase()}:${p}`);
}

const agents = readText(files.agents);
const policy = readText(files.policy);
const copilot = readText(files.copilot);
const contract = readJson(files.contract);
const platform = readJson(files.platform);
const schema = readJson(files.schema);
const registry = readJson(files.registry);
const reserveWorkflow = readText(files.reserveWorkflow);
const scaleWorkflow = readText(files.scaleWorkflow);

const requiredPlatformPrinciples = [
  'AUTONOMOUS',
  'GLOBAL',
  'IRREPLACEABLE_VALUE',
  'TRANSPARENT'
];
assert(platform.id === 'kidults-operating-principles-and-resilience-controls-v1', 'PLATFORM_ID');
assert(platform.version === '1.1.0', 'PLATFORM_VERSION');
assert(platform.status === 'ACTIVE_MANDATORY_FAIL_CLOSED', 'PLATFORM_STATUS');
assert(platform.owner === 'KPMO', 'PLATFORM_OWNER');
assert(platform.precedence === 'HIGHEST_PLATFORM_OPERATING_PRINCIPLES', 'PLATFORM_PRECEDENCE');
assert(JSON.stringify(platform.constitutional_order) === JSON.stringify(requiredPlatformPrinciples), 'PLATFORM_ORDER');
assert(JSON.stringify(Object.keys(platform.operating_principles)) === JSON.stringify(requiredPlatformPrinciples), 'PLATFORM_PRINCIPLE_KEYS');
assert(platform.mandatory_inheritance?.all_tracks === true, 'PLATFORM_TRACK_INHERITANCE');
assert(platform.mandatory_inheritance?.all_ai_agents === true, 'PLATFORM_AI_INHERITANCE');
assert(platform.mandatory_inheritance?.all_workflows === true, 'PLATFORM_WORKFLOW_INHERITANCE');
assert(platform.mandatory_inheritance?.child_rule_can_weaken_or_reorder === false, 'PLATFORM_CHILD_WEAKENING');
assert(platform.mandatory_inheritance?.self_exemption_allowed === false, 'PLATFORM_SELF_EXEMPTION');
assert(platform.autonomous_activation_rule?.manual_only_normal_activation_forbidden === true, 'PLATFORM_MANUAL_ONLY_FORBIDDEN');
for (const field of ['autonomous_effect','global_effect','irreplaceable_value_effect','transparency_effect']) {
  assert(platform.material_change_decision_test?.required_fields?.includes(field), `PLATFORM_EFFECT_FIELD:${field}`);
}

assert(contract.id === 'kidults-ai-agent-operating-rules-v1', 'CONTRACT_ID');
assert(contract.version === '1.3.0', 'CONTRACT_VERSION');
assert(contract.status === 'MANDATORY_FAIL_CLOSED', 'CONTRACT_STATUS');
assert(contract.owner === 'KPMO', 'CONTRACT_OWNER');
assert(contract.effective_scope === 'REPOSITORY_WIDE_ALL_AI_AGENTS_AND_AUTOMATIONS', 'CONTRACT_SCOPE');
assert(contract.platform_constitution?.path === files.platform, 'CONTRACT_PLATFORM_PATH');
assert(contract.platform_constitution?.precedence === platform.precedence, 'CONTRACT_PLATFORM_PRECEDENCE');
assert(JSON.stringify(contract.platform_constitution?.ordered_principles) === JSON.stringify(requiredPlatformPrinciples), 'CONTRACT_PLATFORM_ORDER');
assert(contract.platform_constitution?.mandatory_inheritance === true, 'CONTRACT_PLATFORM_INHERITANCE');
assert(contract.platform_constitution?.agent_self_exemption_allowed === false, 'CONTRACT_PLATFORM_SELF_EXEMPTION');
assert(contract.platform_constitution?.child_rule_can_weaken_or_reorder === false, 'CONTRACT_PLATFORM_CHILD_WEAKENING');
assert(contract.platform_constitution?.manual_only_normal_activation_for_governed_ready_runner_forbidden === true, 'CONTRACT_MANUAL_ONLY_FORBIDDEN');
assert(contract.enforcement?.production === 'HOLD', 'CONTRACT_PRODUCTION_BOUNDARY');
assert(contract.enforcement?.public_release === 'HOLD', 'CONTRACT_PUBLIC_BOUNDARY');
assert(contract.enforcement?.no_agent_self_exemption === true, 'SELF_EXEMPTION_MUST_BE_FALSE');
assert(contract.enforcement?.policy_and_contract_must_change_together === true, 'POLICY_CONTRACT_SYNC');
assert(contract.enforcement?.proactive_internal_remediation_required === true, 'PROACTIVE_REMEDIATION_REQUIRED');
assert(contract.enforcement?.verified_closure_and_forward_proposal_required === true, 'VERIFIED_CLOSURE_FORWARD_PROPOSAL_REQUIRED');
assert(contract.enforcement?.global_scale_stewardship_required === true, 'GLOBAL_SCALE_STEWARDSHIP_REQUIRED');
const globalScale = contract.global_scale_operating_standard;
assert(globalScale?.scope === 'ENTIRE_VALUE_CHAIN', 'GLOBAL_SCALE_SCOPE');
assert(globalScale?.platform_position === 'GLOBAL_LEADING_PLATFORM', 'GLOBAL_SCALE_POSITION');
assert(globalScale?.boutique_or_local_only_assumptions_allowed === false, 'GLOBAL_SCALE_BOUTIQUE_FORBIDDEN');
assert(globalScale?.required_dimensions?.length === 7, 'GLOBAL_SCALE_DIMENSION_COUNT');
assert(globalScale?.architecture_coverage_counts_as_empirical_global_proof === false, 'GLOBAL_SCALE_EMPIRICAL_BOUNDARY');
assert(globalScale?.authorized_internal_bottleneck_remediation_required === true, 'GLOBAL_SCALE_BOTTLENECK_REMEDIATION');
assert(globalScale?.scale_claim_requires_measured_evidence === true, 'GLOBAL_SCALE_MEASURED_EVIDENCE');

const requiredPrinciples = [
  'ABSOLUTE_HONESTY',
  'COMPLETE_TRANSPARENCY',
  'EVIDENCE_BEFORE_STATUS',
  'NO_FABRICATED_PROGRESS',
  'EXECUTION_TRUTH',
  'LIVE_STATE_VERIFICATION',
  'IMMEDIATE_BLOCKER_DISCLOSURE',
  'IMMEDIATE_CORRECTION',
  'FIX_WITHIN_AUTHORITY',
  'NO_UNSUPPORTED_CONTINUITY_CLAIMS',
  'NO_CAPABILITY_INFLATION',
  'REGISTRY_IS_TRUTH',
  'LABEL_FACT_INFERENCE_PLAN_UNKNOWN',
  'FAIL_CLOSED_ON_UNCERTAINTY',
  'TRUST_OVER_SPEED',
  'PROACTIVE_ISSUE_OWNERSHIP',
  'LEAD_TO_VERIFIED_CLOSURE_AND_IMPROVEMENT',
  'GLOBAL_SCALE_STEWARDSHIP'
];
const principleNames = contract.principles?.map((x) => x.name) ?? [];
assert(principleNames.length === requiredPrinciples.length, 'PRINCIPLE_COUNT');
assert(new Set(principleNames).size === principleNames.length, 'DUPLICATE_PRINCIPLE');
for (const name of requiredPrinciples) assert(principleNames.includes(name), `MISSING_PRINCIPLE:${name}`);
const principleById = new Map(contract.principles.map((rule) => [rule.rule_id, rule]));
assert(principleById.get('AI-016')?.name === 'PROACTIVE_ISSUE_OWNERSHIP', 'AI_016_IDENTITY_BINDING');
assert(principleById.get('AI-017')?.name === 'LEAD_TO_VERIFIED_CLOSURE_AND_IMPROVEMENT', 'AI_017_IDENTITY_BINDING');
assert(principleById.get('AI-016')?.requirement?.includes('repeated human prompting'), 'AI_016_PROMPTING_BOUNDARY');
assert(principleById.get('AI-017')?.requirement?.includes('prioritized'), 'AI_017_FORWARD_IMPROVEMENT_BOUNDARY');
assert(principleById.get('AI-018')?.name === 'GLOBAL_SCALE_STEWARDSHIP', 'AI_018_IDENTITY_BINDING');
for (const marker of ['entire value chain', 'global leading platform', 'capacity', 'failure isolation', 'rights', 'cost', 'observability', 'recovery']) {
  assert(principleById.get('AI-018')?.requirement?.includes(marker), `AI_018_REQUIREMENT:${marker}`);
}
for (const rule of contract.principles) {
  assert(/^AI-\d{3}$/.test(rule.rule_id), `INVALID_RULE_ID:${rule.rule_id}`);
  assert(['P0_GOVERNANCE_DEFECT', 'P1_OPERATING_DEFECT'].includes(rule.severity_on_violation), `INVALID_SEVERITY:${rule.rule_id}`);
  assert(typeof rule.requirement === 'string' && rule.requirement.length > 20, `WEAK_REQUIREMENT:${rule.rule_id}`);
}

const requiredStates = [
  'PLANNED','IMPLEMENTED_NOT_VERIFIED','RUNNING_VERIFIED','VERIFIED_PASS','VERIFIED_FAIL',
  'MERGED_VERIFIED','DEPLOYED_VERIFIED','BLOCKED','UNKNOWN','HOLD','COMPLETE_VERIFIED'
];
const contractStates = Object.keys(contract.governed_states ?? {});
assert(contractStates.length === requiredStates.length, 'STATE_COUNT');
for (const state of requiredStates) {
  assert(contractStates.includes(state), `MISSING_STATE:${state}`);
  assert(Array.isArray(contract.governed_states[state].minimum_evidence), `STATE_EVIDENCE_NOT_ARRAY:${state}`);
  assert(contract.governed_states[state].minimum_evidence.length > 0, `STATE_EVIDENCE_EMPTY:${state}`);
}

assert(schema.$schema === 'https://json-schema.org/draft/2020-12/schema', 'SCHEMA_DRAFT');
assert(schema.type === 'object' && schema.additionalProperties === false, 'SCHEMA_OBJECT_BOUNDARY');
const schemaStates = schema.properties?.state?.enum ?? [];
assert(JSON.stringify([...schemaStates].sort()) === JSON.stringify([...requiredStates].sort()), 'SCHEMA_STATE_MISMATCH');
for (const field of contract.required_report_fields) {
  assert(schema.required?.includes(field), `SCHEMA_MISSING_REQUIRED_FIELD:${field}`);
}
assert(schema.properties?.production?.const === 'HOLD', 'SCHEMA_PRODUCTION_BOUNDARY');
assert(schema.properties?.public_release?.const === 'HOLD', 'SCHEMA_PUBLIC_BOUNDARY');

assert(registry.id === 'kidults-ai-agent-governance-registry-v1', 'REGISTRY_ID');
assert(registry.version === contract.version, 'REGISTRY_VERSION_MISMATCH');
assert(registry.owner === 'KPMO', 'REGISTRY_OWNER');
assert(registry.registered_policy?.policy_version === '1.3.0', 'REGISTRY_POLICY_VERSION');
assert(registry.registered_policy?.platform_constitution_path === files.platform, 'REGISTRY_PLATFORM_PATH');
assert(registry.platform_operating_principles?.precedence === platform.precedence, 'REGISTRY_PLATFORM_PRECEDENCE');
assert(JSON.stringify(registry.platform_operating_principles?.ordered_principles) === JSON.stringify(requiredPlatformPrinciples), 'REGISTRY_PLATFORM_ORDER');
assert(registry.platform_operating_principles?.child_rule_can_weaken_or_reorder === false, 'REGISTRY_PLATFORM_WEAKENING');
assert(registry.platform_operating_principles?.manual_only_normal_activation_for_ready_governed_runner_forbidden === true, 'REGISTRY_MANUAL_ONLY_FORBIDDEN');
assert(registry.automatic_execution_paths?.sharded_reserve_workflow === files.reserveWorkflow, 'REGISTRY_RESERVE_WORKFLOW');
assert(registry.automatic_execution_paths?.source_fabric_scale_workflow === files.scaleWorkflow, 'REGISTRY_SCALE_WORKFLOW');
assert(registry.automatic_execution_paths?.normal_activation_requires_automatic_trigger === true, 'REGISTRY_AUTOMATIC_TRIGGER');
assert(registry.mandatory_inheritance?.child_rule_can_weaken_policy === false, 'CHILD_WEAKENING_ALLOWED');
assert(registry.mandatory_inheritance?.agent_self_exemption_allowed === false, 'REGISTRY_SELF_EXEMPTION_ALLOWED');
assert(registry.change_control?.requires_policy_and_contract_sync === true, 'REGISTRY_POLICY_SYNC');
assert(registry.change_control?.requires_validator_pass === true, 'REGISTRY_VALIDATOR_GATE');
assert(registry.leadership_execution?.detected_internal_defect_requires_immediate_authorized_remediation === true, 'REGISTRY_PROACTIVE_REMEDIATION');
assert(registry.leadership_execution?.repeated_human_prompting_as_normal_activation_forbidden === true, 'REGISTRY_REPEATED_PROMPTING_FORBIDDEN');
assert(registry.leadership_execution?.ownership_through_evidence_bound_validation_required === true, 'REGISTRY_VERIFIED_CLOSURE');
assert(registry.leadership_execution?.prioritized_forward_improvement_proposal_required === true, 'REGISTRY_FORWARD_PROPOSAL');
assert(registry.leadership_execution?.protected_authority_gates_preserved === true, 'REGISTRY_PROTECTED_GATES');
assert(registry.global_scale_stewardship?.scope === 'ENTIRE_VALUE_CHAIN', 'REGISTRY_GLOBAL_SCALE_SCOPE');
assert(registry.global_scale_stewardship?.platform_position === 'GLOBAL_LEADING_PLATFORM', 'REGISTRY_GLOBAL_SCALE_POSITION');
assert(registry.global_scale_stewardship?.boutique_or_local_only_assumptions_allowed === false, 'REGISTRY_GLOBAL_SCALE_BOUTIQUE_FORBIDDEN');
assert(registry.global_scale_stewardship?.required_dimensions?.length === 7, 'REGISTRY_GLOBAL_SCALE_DIMENSIONS');
assert(registry.global_scale_stewardship?.scale_claim_requires_measured_evidence === true, 'REGISTRY_GLOBAL_SCALE_MEASURED_EVIDENCE');
assert(registry.global_scale_stewardship?.protected_external_empirical_gates_preserved === true, 'REGISTRY_GLOBAL_SCALE_PROTECTED_GATES');
assert(registry.production === 'HOLD' && registry.public_release === 'HOLD', 'REGISTRY_RELEASE_BOUNDARY');
for (const name of requiredPrinciples) {
  assert(registry.constitutional_principles?.includes(name), `REGISTRY_MISSING_PRINCIPLE:${name}`);
}
for (const [key, expected] of Object.entries({
  human_policy_path: files.policy,
  root_instruction_path: files.agents,
  machine_contract_path: files.contract,
  status_receipt_schema_path: files.schema,
  validator_path: 'scripts/governance/validate-ai-agent-operating-rules-v1.mjs',
  workflow_path: '.github/workflows/ai-agent-governance-enforcement-v1.yml'
})) {
  assert(registry.registered_policy?.[key] === expected, `REGISTRY_PATH_MISMATCH:${key}`);
}

for (const trigger of ['workflow_dispatch', 'schedule', 'push', 'workflow_run']) {
  assert(hasTopLevelTrigger(reserveWorkflow, trigger), `RESERVE_MISSING_AUTONOMOUS_TRIGGER:${trigger}`);
}
assert(reserveWorkflow.includes('KIDULTS ASI Global Any-Site Hourly Pooling v2'), 'RESERVE_MISSING_UPSTREAM_WORKFLOW');
for (const trigger of ['workflow_dispatch', 'schedule', 'push']) {
  assert(hasTopLevelTrigger(scaleWorkflow, trigger), `SCALE_MISSING_AUTONOMOUS_TRIGGER:${trigger}`);
}

const requiredAgentMarkers = [
  'Platform constitutional operating principles',
  '**AUTONOMOUS**',
  '**GLOBAL**',
  '**IRREPLACEABLE VALUE**',
  '**TRANSPARENT**',
  'Absolute honesty',
  'Complete transparency',
  'Evidence before status',
  'Immediate blocker disclosure',
  'No unsupported continuity claims',
  'No capability inflation',
  'Fail closed on uncertainty',
  '.github/AI_AGENT_OPERATING_RULES.md',
  'coordination/kidults/governance/ai-agent-operating-rules-v1.json',
  'Global leading platform scale standard',
  'AI-018 / GLOBAL_SCALE_STEWARDSHIP'
];
for (const marker of requiredAgentMarkers) assert(agents.includes(marker), `AGENTS_MISSING_MARKER:${marker}`);

const requiredPolicyMarkers = [
  '**Version:** 1.3.0',
  'Platform constitutional operating principles',
  '**AUTONOMOUS**',
  '**GLOBAL**',
  '**IRREPLACEABLE VALUE**',
  '**TRANSPARENT**',
  'Absolute honesty — 절대 정직',
  'Complete transparency — 완전 투명성',
  'Evidence before statement',
  'Fail closed on uncertainty',
  'Immediate blocker disclosure',
  'Correction protocol',
  'P0 governance defects',
  'No AI agent may self-exempt',
  'Proactive ownership and leadership closure',
  'AI-016 / PROACTIVE_ISSUE_OWNERSHIP',
  'AI-017 / LEAD_TO_VERIFIED_CLOSURE_AND_IMPROVEMENT',
  'without waiting for repeated human prompting',
  'prioritized risks and forward improvements',
  'Global leading platform scale stewardship',
  'AI-018 / GLOBAL_SCALE_STEWARDSHIP',
  'Architecture coverage, provider counts, synthetic capacity, or a successful local test does not constitute empirical global proof'
];
for (const marker of requiredPolicyMarkers) assert(policy.includes(marker), `POLICY_MISSING_MARKER:${marker}`);
assert(copilot.includes('AGENTS.md'), 'COPILOT_AGENTS_REFERENCE');
assert(copilot.includes('.github/AI_AGENT_OPERATING_RULES.md'), 'COPILOT_POLICY_REFERENCE');
assert(copilot.includes('never fabricate metrics'), 'COPILOT_METRIC_BOUNDARY');
assert(copilot.includes('AI-018 / GLOBAL_SCALE_STEWARDSHIP'), 'COPILOT_GLOBAL_SCALE_STEWARDSHIP');

const validateReceipt = (receiptPath) => {
  const receipt = readJson(receiptPath);
  for (const field of schema.required) assert(Object.hasOwn(receipt, field), `RECEIPT_MISSING_FIELD:${receiptPath}:${field}`);
  assert(requiredStates.includes(receipt.state), `RECEIPT_INVALID_STATE:${receiptPath}:${receipt.state}`);
  assert(Array.isArray(receipt.facts), `RECEIPT_FACTS_NOT_ARRAY:${receiptPath}`);
  assert(Array.isArray(receipt.evidence_refs), `RECEIPT_EVIDENCE_NOT_ARRAY:${receiptPath}`);
  assert(Array.isArray(receipt.inferences), `RECEIPT_INFERENCES_NOT_ARRAY:${receiptPath}`);
  assert(Array.isArray(receipt.uncertainties), `RECEIPT_UNCERTAINTIES_NOT_ARRAY:${receiptPath}`);
  assert(Array.isArray(receipt.blockers), `RECEIPT_BLOCKERS_NOT_ARRAY:${receiptPath}`);
  assert(Array.isArray(receipt.actions_executed), `RECEIPT_ACTIONS_NOT_ARRAY:${receiptPath}`);
  if (receipt.state === 'RUNNING_VERIFIED') {
    assert(receipt.evidence_refs.some((x) => ['WORKFLOW_RUN', 'JOB_RUN', 'RUNTIME_RUN'].includes(x.kind)), `RECEIPT_RUNNING_WITHOUT_RUN_ID:${receiptPath}`);
  }
  if (receipt.state === 'MERGED_VERIFIED') {
    assert(receipt.evidence_refs.some((x) => x.kind === 'MERGE_COMMIT'), `RECEIPT_MERGED_WITHOUT_MERGE_COMMIT:${receiptPath}`);
  }
  if (receipt.state === 'BLOCKED') assert(receipt.blockers.length > 0, `RECEIPT_BLOCKED_WITHOUT_BLOCKER:${receiptPath}`);
  for (const action of receipt.actions_executed) {
    assert(['EXECUTED', 'FAILED', 'NOT_EXECUTED'].includes(action.result), `RECEIPT_INVALID_ACTION_RESULT:${receiptPath}`);
    if (action.result === 'EXECUTED') assert(action.evidence_ref_ids?.length > 0, `RECEIPT_EXECUTED_WITHOUT_EVIDENCE:${receiptPath}`);
  }
};

const explicitReceiptIndex = process.argv.indexOf('--receipt');
if (explicitReceiptIndex >= 0) {
  const receiptPath = process.argv[explicitReceiptIndex + 1];
  assert(receiptPath, 'RECEIPT_PATH_REQUIRED');
  validateReceipt(receiptPath);
}

const report = {
  id: 'kidults-ai-agent-governance-validation-v1',
  version: '1.3.0',
  status: 'VERIFIED_PASS',
  policy_id: 'KPMO-AI-GOV-001',
  platform_principles_validated: requiredPlatformPrinciples,
  principles_validated: requiredPrinciples.length,
  leadership_rule_identities_validated: ['AI-016', 'AI-017'],
  global_scale_rule_identities_validated: ['AI-018'],
  global_scale_dimensions_validated: globalScale.required_dimensions.length,
  governed_states_validated: requiredStates.length,
  required_report_fields_validated: contract.required_report_fields.length,
  inheritance_fail_closed: true,
  autonomous_scale_triggers_validated: true,
  manual_only_normal_activation_forbidden: true,
  self_exemption_allowed: false,
  production: 'HOLD',
  public_release: 'HOLD'
};
console.log(JSON.stringify(report, null, 2));
