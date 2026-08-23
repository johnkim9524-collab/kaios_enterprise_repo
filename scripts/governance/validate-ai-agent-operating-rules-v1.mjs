#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const files = {
  agents: 'AGENTS.md',
  policy: '.github/AI_AGENT_OPERATING_RULES.md',
  copilot: '.github/copilot-instructions.md',
  contract: 'coordination/kidults/governance/ai-agent-operating-rules-v1.json',
  schema: 'coordination/kidults/governance/ai-agent-status-receipt-schema-v1.json',
  registry: 'coordination/kidults/registry/ai-agent-governance-registry-v1.json'
};

const fail = (message) => {
  throw new Error(message);
};
const resolvePath = (p) => path.isAbsolute(p) ? p : path.join(root, p);
const readText = (p) => fs.readFileSync(resolvePath(p), 'utf8');
const readJson = (p) => JSON.parse(readText(p));
const assert = (condition, message) => {
  if (!condition) fail(message);
};

for (const [name, p] of Object.entries(files)) {
  assert(fs.existsSync(resolvePath(p)), `MISSING_${name.toUpperCase()}:${p}`);
}

const agents = readText(files.agents);
const policy = readText(files.policy);
const copilot = readText(files.copilot);
const contract = readJson(files.contract);
const schema = readJson(files.schema);
const registry = readJson(files.registry);

assert(contract.id === 'kidults-ai-agent-operating-rules-v1', 'CONTRACT_ID');
assert(contract.version === '1.1.0', 'CONTRACT_VERSION');
assert(contract.status === 'MANDATORY_FAIL_CLOSED', 'CONTRACT_STATUS');
assert(contract.owner === 'KPMO', 'CONTRACT_OWNER');
assert(contract.effective_scope === 'REPOSITORY_WIDE_ALL_AI_AGENTS_AND_AUTOMATIONS', 'CONTRACT_SCOPE');
assert(contract.enforcement?.production === 'HOLD', 'CONTRACT_PRODUCTION_BOUNDARY');
assert(contract.enforcement?.public_release === 'HOLD', 'CONTRACT_PUBLIC_BOUNDARY');
assert(contract.enforcement?.no_agent_self_exemption === true, 'SELF_EXEMPTION_MUST_BE_FALSE');
assert(contract.enforcement?.policy_and_contract_must_change_together === true, 'POLICY_CONTRACT_SYNC');

const requiredTopPrinciples = [
  'AUTONOMOUS',
  'GLOBAL',
  'IRREPLACEABLE_VALUE',
  'TRANSPARENT'
];
const topPrinciples = contract.platform_operating_principles ?? [];
assert(topPrinciples.length === requiredTopPrinciples.length, 'TOP_PRINCIPLE_COUNT');
assert(JSON.stringify(topPrinciples.map((x) => x.name)) === JSON.stringify(requiredTopPrinciples), 'TOP_PRINCIPLE_ORDER');
assert(JSON.stringify(topPrinciples.map((x) => x.priority)) === JSON.stringify([1, 2, 3, 4]), 'TOP_PRINCIPLE_PRIORITY');
for (const p of topPrinciples) {
  assert(/^POP-\\d{3}$/.test(p.principle_id), `INVALID_TOP_PRINCIPLE_ID:${p.principle_id}`);
  assert(typeof p.doctrine === 'string' && p.doctrine.length > 30, `WEAK_TOP_PRINCIPLE_DOCTRINE:${p.name}`);
  assert(Array.isArray(p.required_controls) && p.required_controls.length >= 5, `WEAK_TOP_PRINCIPLE_CONTROLS:${p.name}`);
  assert(Array.isArray(p.prohibited_interpretations) && p.prohibited_interpretations.length >= 3, `WEAK_TOP_PRINCIPLE_BOUNDARY:${p.name}`);
}
assert(contract.principle_inheritance?.strategic_priority_order_fixed === true, 'TOP_PRINCIPLE_ORDER_NOT_FIXED');
assert(contract.principle_inheritance?.all_four_required === true, 'TOP_PRINCIPLE_NOT_ALL_REQUIRED');
assert(contract.principle_inheritance?.transparent_cross_cutting_non_waivable === true, 'TRANSPARENCY_WAIVABLE');
assert(contract.principle_inheritance?.principle_does_not_expand_agent_authority === true, 'TOP_PRINCIPLE_EXPANDS_AUTHORITY');
assert(contract.principle_inheritance?.conflicts_fail_closed_and_are_recorded === true, 'TOP_PRINCIPLE_CONFLICT_NOT_FAIL_CLOSED');

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
  'TRUST_OVER_SPEED'
];
const principleNames = contract.principles?.map((x) => x.name) ?? [];
assert(principleNames.length === requiredPrinciples.length, 'PRINCIPLE_COUNT');
assert(new Set(principleNames).size === principleNames.length, 'DUPLICATE_PRINCIPLE');
for (const name of requiredPrinciples) assert(principleNames.includes(name), `MISSING_PRINCIPLE:${name}`);
for (const rule of contract.principles) {
  assert(/^AI-\d{3}$/.test(rule.rule_id), `INVALID_RULE_ID:${rule.rule_id}`);
  assert(['P0_GOVERNANCE_DEFECT', 'P1_OPERATING_DEFECT'].includes(rule.severity_on_violation), `INVALID_SEVERITY:${rule.rule_id}`);
  assert(typeof rule.requirement === 'string' && rule.requirement.length > 20, `WEAK_REQUIREMENT:${rule.rule_id}`);
}

const requiredStates = [
  'PLANNED',
  'IMPLEMENTED_NOT_VERIFIED',
  'RUNNING_VERIFIED',
  'VERIFIED_PASS',
  'VERIFIED_FAIL',
  'MERGED_VERIFIED',
  'DEPLOYED_VERIFIED',
  'BLOCKED',
  'UNKNOWN',
  'HOLD',
  'COMPLETE_VERIFIED'
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
assert(registry.registered_policy?.policy_version === contract.version, 'REGISTRY_POLICY_VERSION_MISMATCH');
assert(JSON.stringify(registry.top_platform_operating_principles) === JSON.stringify(requiredTopPrinciples), 'REGISTRY_TOP_PRINCIPLE_ORDER');
assert(registry.top_principle_inheritance?.priority_order_fixed === true, 'REGISTRY_TOP_PRINCIPLE_ORDER_NOT_FIXED');
assert(registry.top_principle_inheritance?.all_four_required === true, 'REGISTRY_TOP_PRINCIPLE_NOT_ALL_REQUIRED');
assert(registry.top_principle_inheritance?.transparent_cross_cutting_non_waivable === true, 'REGISTRY_TRANSPARENCY_WAIVABLE');
assert(registry.top_principle_inheritance?.protected_gates_bound_all_principles === true, 'REGISTRY_PROTECTED_GATES_NOT_BOUND');
assert(registry.owner === 'KPMO', 'REGISTRY_OWNER');
assert(registry.mandatory_inheritance?.child_rule_can_weaken_policy === false, 'CHILD_WEAKENING_ALLOWED');
assert(registry.mandatory_inheritance?.agent_self_exemption_allowed === false, 'REGISTRY_SELF_EXEMPTION_ALLOWED');
assert(registry.change_control?.requires_policy_and_contract_sync === true, 'REGISTRY_POLICY_SYNC');
assert(registry.change_control?.requires_validator_pass === true, 'REGISTRY_VALIDATOR_GATE');
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

const requiredAgentMarkers = [
  'Autonomous',
  'Global',
  'Irreplaceable Value',
  'Transparent',
  'Absolute honesty',
  'Complete transparency',
  'Evidence before status',
  'Immediate blocker disclosure',
  'No unsupported continuity claims',
  'No capability inflation',
  'Fail closed on uncertainty',
  '.github/AI_AGENT_OPERATING_RULES.md',
  'coordination/kidults/governance/ai-agent-operating-rules-v1.json'
];
for (const marker of requiredAgentMarkers) assert(agents.includes(marker), `AGENTS_MISSING_MARKER:${marker}`);

const requiredPolicyMarkers = [
  'Top-level platform operating principles — 최상위 운영원칙',
  'Autonomous — 자율성',
  'Global — 글로벌성',
  'Irreplaceable Value — 대체 불가능한 가치',
  'Transparent — 투명성',
  'Absolute honesty — 절대 정직',
  'Complete transparency — 완전 투명성',
  'Evidence before statement',
  'Fail closed on uncertainty',
  'Immediate blocker disclosure',
  'Correction protocol',
  'P0 governance defects',
  'No AI agent may self-exempt'
];
for (const marker of requiredPolicyMarkers) assert(policy.includes(marker), `POLICY_MISSING_MARKER:${marker}`);
assert(copilot.includes('AGENTS.md'), 'COPILOT_AGENTS_REFERENCE');
assert(copilot.includes('Autonomous → Global → Irreplaceable Value → Transparent'), 'COPILOT_TOP_PRINCIPLE_ORDER');
assert(copilot.includes('.github/AI_AGENT_OPERATING_RULES.md'), 'COPILOT_POLICY_REFERENCE');
assert(copilot.includes('never fabricate metrics'), 'COPILOT_METRIC_BOUNDARY');

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
  version: '1.1.0',
  status: 'VERIFIED_PASS',
  policy_id: 'KPMO-AI-GOV-001',
  platform_operating_principles_validated: requiredTopPrinciples.length,
  principles_validated: requiredPrinciples.length,
  governed_states_validated: requiredStates.length,
  required_report_fields_validated: contract.required_report_fields.length,
  inheritance_fail_closed: true,
  self_exemption_allowed: false,
  production: 'HOLD',
  public_release: 'HOLD'
};
console.log(JSON.stringify(report, null, 2));
