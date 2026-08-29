#!/usr/bin/env node
import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');
const json = (p) => JSON.parse(read(p));
const fail = (m) => { throw new Error(m); };
const requireTrue = (v, m) => { if (!v) fail(m); };

const paths = {
  bootstrap: 'coordination/kidults/governance/ai-agent-bootstrap-remediation-sequence-v1.json',
  protection: 'coordination/kidults/governance/ai-agent-bootstrap-protection-v1.json',
  agents: 'AGENTS.md',
  copilot: '.github/copilot-instructions.md',
  policy: '.github/AI_AGENT_OPERATING_RULES.md',
  contract: 'coordination/kidults/governance/ai-agent-operating-rules-v1.json',
  registry: 'coordination/kidults/registry/ai-agent-governance-registry-v1.json',
  enforcement: '.github/workflows/ai-agent-bootstrap-remediation-enforcement-v1.yml',
  impactRouting: 'scripts/kidults/kpmo/validate-pr-impact-routing-v1.mjs'
};
for (const p of Object.values(paths)) requireTrue(fs.existsSync(p), `MISSING:${p}`);

const bootstrap = json(paths.bootstrap);
const protection = json(paths.protection);
const agents = read(paths.agents);
const copilot = read(paths.copilot);
const policy = read(paths.policy);
const contract = json(paths.contract);
const registry = json(paths.registry);
const enforcement = read(paths.enforcement);
const impactRouting = read(paths.impactRouting);

const expected = [
  'DETECT_REVERSIBLE_DEFECT',
  'CORRECT_ROOT_CAUSE_IMMEDIATELY',
  'RUN_REGRESSION_AND_NEGATIVE_TESTS',
  'REVALIDATE_EXACT_HEAD_AND_TARGET_MAIN',
  'TRUTH_SYNC_REGISTRY_AND_ISSUE',
  'REPORT_VERIFIED_OUTCOME',
  'PROPOSE_PRIORITIZED_IMPROVEMENTS'
];
const protectedPaths = [
  'AGENTS.md',
  '.github/AI_AGENT_OPERATING_RULES.md',
  '.github/copilot-instructions.md',
  'coordination/kidults/governance/ai-agent-operating-rules-v1.json',
  'coordination/kidults/governance/ai-agent-bootstrap-remediation-sequence-v1.json',
  'coordination/kidults/registry/ai-agent-governance-registry-v1.json',
  'scripts/governance/validate-ai-agent-bootstrap-remediation-v1.mjs',
  '.github/workflows/ai-agent-bootstrap-remediation-enforcement-v1.yml',
  'scripts/kidults/kpmo/validate-pr-impact-routing-v1.mjs',
  'coordination/kidults/governance/ai-agent-bootstrap-protection-v1.json'
];

requireTrue(bootstrap.id === 'kidults-ai-agent-bootstrap-remediation-sequence-v1', 'BOOTSTRAP_ID');
requireTrue(bootstrap.status === 'MANDATORY_FAIL_CLOSED', 'BOOTSTRAP_STATUS');
requireTrue(bootstrap.scope === 'ALL_AI_AGENTS_AND_AUTOMATIONS', 'BOOTSTRAP_SCOPE');
requireTrue(bootstrap.trigger === 'REVERSIBLE_INTERNAL_DEFECT_WITHIN_GRANTED_AUTHORITY', 'BOOTSTRAP_TRIGGER');
requireTrue(JSON.stringify(bootstrap.mandatory_sequence) === JSON.stringify(expected), 'BOOTSTRAP_SEQUENCE_ORDER');
requireTrue(bootstrap.report_only_before_remediation_allowed === false, 'REPORT_ONLY_MUST_BE_FALSE');
requireTrue(bootstrap.repeated_human_prompting_required === false, 'REPEATED_PROMPTING_MUST_BE_FALSE');
requireTrue(bootstrap.bootstrap_must_load_before_task_execution === true, 'BOOTSTRAP_PRELOAD_REQUIRED');
requireTrue(bootstrap.bootstrap_inheritance?.child_rule_can_weaken === false, 'CHILD_WEAKENING_FORBIDDEN');
requireTrue(bootstrap.bootstrap_inheritance?.agent_self_exemption_allowed === false, 'SELF_EXEMPTION_FORBIDDEN');
for (const agent of ['KPMO','TRACK_A','TRACK_B','TRACK_C','TRACK_D','TRACK_E','RED_TEAM','ASI','CODING_AGENTS','REVIEW_AGENTS','RUNTIME_AGENTS','SCHEDULED_AUTOMATIONS','EXTERNAL_MODEL_AGENTS']) {
  requireTrue(bootstrap.bootstrap_inheritance?.[agent] === true, `MISSING_BOOTSTRAP_INHERITANCE:${agent}`);
}
for (const stop of ['PRODUCTION_G5','IRREVERSIBLE_LEGAL_CHANGE','IRREVERSIBLE_SECURITY_CHANGE','EXTERNAL_SPEND','CONTRACTUAL_COMMITMENT','EXPANDED_CREDENTIAL_OR_PERMISSION','MISSING_REQUIRED_TOOL_OR_PERMISSION']) {
  requireTrue(bootstrap.stop_conditions?.includes(stop), `MISSING_STOP_CONDITION:${stop}`);
}
for (const marker of ['Mandatory agent bootstrap — fix first, report last','regression + negative tests','exact-head revalidation','registry/issue truth-sync','report verified outcome','propose prioritized improvements']) requireTrue(agents.toLowerCase().includes(marker.toLowerCase()), `AGENTS_BOOTSTRAP_MARKER:${marker}`);
for (const marker of ['ai-agent-bootstrap-remediation-sequence-v1.json','regression + negative tests','registry/issue truth-sync','report verified outcome','propose prioritized improvements','report-only response is forbidden']) requireTrue(copilot.toLowerCase().includes(marker.toLowerCase()), `COPILOT_BOOTSTRAP_MARKER:${marker}`);
requireTrue(policy.includes('### 4.4 Fix first within authority'), 'POLICY_FIX_FIRST_SECTION');
requireTrue(policy.includes('A report-only response is not closure'), 'POLICY_REPORT_ONLY_FORBIDDEN');
requireTrue(contract.principles?.some((r) => r.rule_id === 'AI-016' && r.name === 'PROACTIVE_ISSUE_OWNERSHIP'), 'CONTRACT_AI_016');
requireTrue(contract.principles?.some((r) => r.rule_id === 'AI-017' && r.name === 'LEAD_TO_VERIFIED_CLOSURE_AND_IMPROVEMENT'), 'CONTRACT_AI_017');
requireTrue(contract.enforcement?.proactive_internal_remediation_required === true, 'CONTRACT_PROACTIVE_REMEDIATION');
requireTrue(contract.enforcement?.verified_closure_and_forward_proposal_required === true, 'CONTRACT_VERIFIED_CLOSURE');
requireTrue(registry.registered_policy?.bootstrap_remediation_sequence_path === paths.bootstrap, 'REGISTRY_BOOTSTRAP_PATH');
requireTrue(registry.registered_policy?.bootstrap_protection_path === paths.protection, 'REGISTRY_BOOTSTRAP_PROTECTION_PATH');
requireTrue(registry.mandatory_inheritance?.bootstrap_remediation_sequence_required === true, 'REGISTRY_BOOTSTRAP_REQUIRED');
requireTrue(registry.mandatory_inheritance?.bootstrap_load_before_task_execution_required === true, 'REGISTRY_BOOTSTRAP_PRELOAD');
requireTrue(registry.mandatory_inheritance?.bootstrap_tamper_evident_protection_required === true, 'REGISTRY_BOOTSTRAP_TAMPER_PROTECTION');
requireTrue(registry.change_control?.direct_main_write_for_bootstrap_trust_root_forbidden === true, 'REGISTRY_DIRECT_MAIN_FORBIDDEN');
requireTrue(registry.change_control?.bootstrap_trust_root_pull_request_required === true, 'REGISTRY_PR_REQUIRED');
requireTrue(registry.change_control?.bootstrap_path_filter_narrowing_forbidden === true, 'REGISTRY_PATH_FILTER_NARROWING_FORBIDDEN');
requireTrue(JSON.stringify(registry.leadership_execution?.mandatory_bootstrap_sequence) === JSON.stringify(expected), 'REGISTRY_SEQUENCE_ORDER');
requireTrue(registry.leadership_execution?.routine_report_before_authorized_remediation_forbidden === true, 'REGISTRY_REPORT_ONLY_FORBIDDEN');

requireTrue(protection.id === 'kidults-ai-agent-bootstrap-protection-v1', 'PROTECTION_ID');
requireTrue(protection.status === 'MANDATORY_TAMPER_EVIDENT_FAIL_CLOSED', 'PROTECTION_STATUS');
requireTrue(protection.scope === 'REPOSITORY_WIDE_AI_AGENT_BOOTSTRAP_TRUST_ROOT', 'PROTECTION_SCOPE');
requireTrue(JSON.stringify(protection.protected_paths) === JSON.stringify(protectedPaths), 'PROTECTED_PATH_SET_OR_ORDER_DRIFT');
for (const p of protectedPaths) requireTrue(fs.existsSync(p), `PROTECTED_PATH_MISSING:${p}`);
for (const [key, value] of Object.entries({
  direct_main_write_forbidden: true,
  pull_request_required: true,
  exact_head_validation_required: true,
  target_main_revalidation_required: true,
  registry_truth_sync_required: true,
  version_increment_required: true,
  change_rationale_required: true,
  path_filter_narrowing_forbidden: true,
  self_exemption_forbidden: true,
  silent_deletion_forbidden: true,
  fail_closed_on_missing_or_weakened_control: true
})) requireTrue(protection.change_control?.[key] === value, `PROTECTION_CHANGE_CONTROL:${key}`);
requireTrue(protection.continuous_enforcement?.all_pull_requests_to_main === true, 'PROTECTION_ALL_PRS');
requireTrue(protection.continuous_enforcement?.all_main_pushes === true, 'PROTECTION_ALL_MAIN_PUSHES');
requireTrue(protection.continuous_enforcement?.hourly_sentinel === true, 'PROTECTION_HOURLY_SENTINEL');
requireTrue(protection.continuous_enforcement?.manual_recovery_path === true, 'PROTECTION_MANUAL_RECOVERY');
requireTrue(protection.continuous_enforcement?.exact_source_checkout === true, 'PROTECTION_EXACT_SOURCE');
requireTrue(protection.continuous_enforcement?.persist_credentials === false, 'PROTECTION_NO_PERSISTED_CREDENTIALS');

requireTrue(/^\s*pull_request:\s*\n\s+branches:\s*\[main\]/m.test(enforcement), 'ENFORCEMENT_ALL_PR_TO_MAIN_REQUIRED');
requireTrue(/^\s*push:\s*\n\s+branches:\s*\[main\]/m.test(enforcement), 'ENFORCEMENT_ALL_MAIN_PUSH_REQUIRED');
requireTrue(/^\s*schedule:\s*$/m.test(enforcement) && /cron:\s*['"]13 \* \* \* \*['"]/.test(enforcement), 'ENFORCEMENT_HOURLY_SENTINEL_REQUIRED');
requireTrue(/^\s*workflow_dispatch:\s*$/m.test(enforcement), 'ENFORCEMENT_MANUAL_RECOVERY_REQUIRED');
requireTrue(!/^\s+paths:\s*$/m.test(enforcement), 'ENFORCEMENT_PATH_FILTER_FORBIDDEN');
requireTrue(enforcement.includes("ref: ${{ github.event.pull_request.head.sha || github.sha }}"), 'ENFORCEMENT_EXACT_HEAD_CHECKOUT');
requireTrue(enforcement.includes('persist-credentials: false'), 'ENFORCEMENT_CREDENTIAL_PERSISTENCE_FORBIDDEN');
requireTrue(enforcement.includes('node scripts/governance/validate-ai-agent-bootstrap-remediation-v1.mjs'), 'ENFORCEMENT_VALIDATOR_REQUIRED');
requireTrue(impactRouting.includes("'ai-agent-bootstrap-remediation-enforcement-v1.yml'"), 'IMPACT_ROUTING_BOOTSTRAP_ALLOWLIST_REQUIRED');

const mutate = (value, transform, label) => {
  const candidate = structuredClone(value);
  transform(candidate);
  let rejected = false;
  try {
    requireTrue(JSON.stringify(candidate.mandatory_sequence) === JSON.stringify(expected), label);
    requireTrue(candidate.report_only_before_remediation_allowed === false, label);
    requireTrue(candidate.bootstrap_inheritance?.agent_self_exemption_allowed === false, label);
  } catch { rejected = true; }
  requireTrue(rejected, `NEGATIVE_MUTATION_ACCEPTED:${label}`);
};
mutate(bootstrap, (x) => x.mandatory_sequence = [...x.mandatory_sequence].reverse(), 'REORDER_SEQUENCE');
mutate(bootstrap, (x) => x.report_only_before_remediation_allowed = true, 'ALLOW_REPORT_ONLY');
mutate(bootstrap, (x) => x.bootstrap_inheritance.agent_self_exemption_allowed = true, 'ALLOW_SELF_EXEMPTION');

const enforcementMutations = [
  enforcement.replace('  pull_request:\n    branches: [main]\n', "  pull_request:\n    branches: [main]\n    paths:\n      - 'AGENTS.md'\n"),
  enforcement.replace("  schedule:\n    - cron: '13 * * * *'\n", ''),
  enforcement.replace('  workflow_dispatch:\n', ''),
  enforcement.replace('persist-credentials: false', 'persist-credentials: true')
];
for (const mutated of enforcementMutations) {
  const invalid = /^\s+paths:\s*$/m.test(mutated)
    || !/^\s*schedule:\s*$/m.test(mutated)
    || !/^\s*workflow_dispatch:\s*$/m.test(mutated)
    || mutated.includes('persist-credentials: true');
  requireTrue(invalid, 'ENFORCEMENT_NEGATIVE_MUTATION_NOT_REJECTED');
}

const protectionMutations = [
  (x) => { x.protected_paths = x.protected_paths.filter((p) => p !== 'AGENTS.md'); },
  (x) => { x.change_control.pull_request_required = false; },
  (x) => { x.change_control.path_filter_narrowing_forbidden = false; },
  (x) => { x.change_control.self_exemption_forbidden = false; },
  (x) => { x.continuous_enforcement.hourly_sentinel = false; }
];
for (const change of protectionMutations) {
  const mutated = structuredClone(protection);
  change(mutated);
  const rejected = JSON.stringify(mutated.protected_paths) !== JSON.stringify(protectedPaths)
    || mutated.change_control?.pull_request_required !== true
    || mutated.change_control?.path_filter_narrowing_forbidden !== true
    || mutated.change_control?.self_exemption_forbidden !== true
    || mutated.continuous_enforcement?.hourly_sentinel !== true;
  requireTrue(rejected, 'PROTECTION_NEGATIVE_MUTATION_NOT_REJECTED');
}

console.log(JSON.stringify({
  id:'kidults-ai-agent-bootstrap-remediation-validation-v1',
  state:'VERIFIED_PASS',
  sequence:expected,
  inheritance_count:13,
  protected_path_count:protectedPaths.length,
  negative_mutations_rejected:12,
  tamper_evident_protection:true,
  direct_main_write_forbidden:true,
  pull_request_required:true,
  repository_wide_pr_enforcement:true,
  repository_wide_main_push_enforcement:true,
  hourly_sentinel:true,
  manual_recovery_path:true,
  path_filter_allowed:false,
  report_only_before_remediation_allowed:false,
  production:'HOLD',
  public_release:'HOLD',
  g5:'HOLD'
}, null, 2));
