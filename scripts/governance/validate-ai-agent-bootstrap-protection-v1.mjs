#!/usr/bin/env node
import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');
const json = (p) => JSON.parse(read(p));
const fail = (m) => { throw new Error(m); };
const requireTrue = (v, m) => { if (!v) fail(m); };

const manifestPath = 'coordination/kidults/governance/ai-agent-bootstrap-protection-v1.json';
const workflowPath = '.github/workflows/ai-agent-bootstrap-remediation-enforcement-v1.yml';
const routingPath = 'scripts/kidults/kpmo/validate-pr-impact-routing-v1.mjs';
const registryPath = 'coordination/kidults/registry/ai-agent-governance-registry-v1.json';

for (const p of [manifestPath, workflowPath, routingPath, registryPath]) requireTrue(fs.existsSync(p), `MISSING:${p}`);

const manifest = json(manifestPath);
const workflow = read(workflowPath);
const routing = read(routingPath);
const registry = json(registryPath);
const principles = ['AUTONOMOUS','GLOBAL','IRREPLACEABLE_VALUE','TRANSPARENT'];

requireTrue(manifest.id === 'kidults-ai-agent-bootstrap-protection-v1', 'PROTECTION_ID');
requireTrue(manifest.version === '1.1.0', 'PROTECTION_VERSION');
requireTrue(manifest.status === 'MANDATORY_TAMPER_EVIDENT_FAIL_CLOSED', 'PROTECTION_STATUS');
requireTrue(manifest.scope === 'REPOSITORY_WIDE_AI_AGENT_BOOTSTRAP_TRUST_ROOT', 'PROTECTION_SCOPE');
requireTrue(manifest.platform_operating_principles?.precedence === 'HIGHEST_PLATFORM_OPERATING_PRINCIPLES', 'PLATFORM_PRECEDENCE');
requireTrue(JSON.stringify(manifest.platform_operating_principles?.ordered_principles) === JSON.stringify(principles), 'PLATFORM_ORDER');
requireTrue(manifest.platform_operating_principles?.constitutional_order_is_binding === true, 'PLATFORM_BINDING');
requireTrue(manifest.platform_operating_principles?.child_rule_can_weaken_reorder_or_bypass === false, 'PLATFORM_WEAKENING_FORBIDDEN');
requireTrue(manifest.platform_operating_principles?.all_ai_agents_and_automations_must_inherit === true, 'PLATFORM_INHERITANCE_REQUIRED');
requireTrue(manifest.platform_operating_principles?.evidence_before_metrics === true, 'EVIDENCE_BEFORE_METRICS');
requireTrue(manifest.platform_operating_principles?.proof_before_procurement === true, 'PROOF_BEFORE_PROCUREMENT');
requireTrue(manifest.platform_operating_principles?.portal_consumes_intelligence_does_not_calculate_intelligence === true, 'PORTAL_CONSUMER_BOUNDARY');
for (const principle of principles) {
  requireTrue(typeof manifest.platform_operating_principles?.principle_contracts?.[principle]?.required_behavior === 'string', `PRINCIPLE_REQUIRED_BEHAVIOR:${principle}`);
  requireTrue(typeof manifest.platform_operating_principles?.principle_contracts?.[principle]?.forbidden_behavior === 'string', `PRINCIPLE_FORBIDDEN_BEHAVIOR:${principle}`);
}
requireTrue(JSON.stringify(registry.platform_operating_principles?.ordered_principles) === JSON.stringify(principles), 'REGISTRY_PLATFORM_ORDER');
requireTrue(registry.platform_operating_principles?.child_rule_can_weaken_or_reorder === false, 'REGISTRY_PLATFORM_WEAKENING');

const requiredProtectedPaths = [
  'AGENTS.md',
  '.github/AI_AGENT_OPERATING_RULES.md',
  '.github/copilot-instructions.md',
  'coordination/kidults/governance/ai-agent-operating-rules-v1.json',
  'coordination/kidults/governance/ai-agent-github-bootstrap-contract-v1.json',
  'coordination/kidults/governance/ai-agent-bootstrap-remediation-sequence-v1.json',
  'coordination/kidults/registry/ai-agent-governance-registry-v1.json',
  'scripts/governance/bootstrap-ai-agent-from-github-v1.mjs',
  'scripts/governance/verify-ai-agent-bootstrap-receipt-v1.mjs',
  'scripts/governance/validate-ai-agent-github-bootstrap-v1.mjs',
  'scripts/governance/validate-ai-agent-bootstrap-remediation-v1.mjs',
  'scripts/governance/validate-ai-agent-bootstrap-protection-v1.mjs',
  '.github/workflows/ai-agent-bootstrap-remediation-enforcement-v1.yml',
  'scripts/kidults/kpmo/validate-pr-impact-routing-v1.mjs',
  manifestPath
];
requireTrue(JSON.stringify(manifest.protected_paths) === JSON.stringify(requiredProtectedPaths), 'PROTECTED_PATH_SET_OR_ORDER_DRIFT');
for (const p of requiredProtectedPaths) requireTrue(fs.existsSync(p), `PROTECTED_PATH_MISSING:${p}`);
for (const key of ['direct_main_write_forbidden','pull_request_required','exact_head_validation_required','target_main_revalidation_required','registry_truth_sync_required','version_increment_required','change_rationale_required','path_filter_narrowing_forbidden','self_exemption_forbidden','silent_deletion_forbidden','platform_principle_weakening_reordering_or_bypass_forbidden','fail_closed_on_missing_or_weakened_control']) requireTrue(manifest.change_control?.[key] === true, `CHANGE_CONTROL:${key}`);
requireTrue(manifest.continuous_enforcement?.all_pull_requests_to_main === true, 'ALL_PRS_REQUIRED');
requireTrue(manifest.continuous_enforcement?.all_main_pushes === true, 'ALL_MAIN_PUSHES_REQUIRED');
requireTrue(manifest.continuous_enforcement?.hourly_sentinel === true, 'HOURLY_SENTINEL_REQUIRED');
requireTrue(manifest.continuous_enforcement?.manual_recovery_path === true, 'MANUAL_RECOVERY_REQUIRED');
requireTrue(manifest.continuous_enforcement?.exact_source_checkout === true, 'EXACT_SOURCE_REQUIRED');
requireTrue(manifest.continuous_enforcement?.persist_credentials === false, 'PERSIST_CREDENTIALS_FORBIDDEN');

requireTrue(/^  pull_request:\s*\n    branches: \[main\]/m.test(workflow), 'WORKFLOW_ALL_PR_TO_MAIN');
requireTrue(/^  push:\s*\n    branches: \[main\]/m.test(workflow), 'WORKFLOW_ALL_MAIN_PUSH');
requireTrue(/^  schedule:\s*$/m.test(workflow) && /cron: '13 \* \* \* \*'/.test(workflow), 'WORKFLOW_HOURLY_SENTINEL');
requireTrue(/^  workflow_dispatch:\s*$/m.test(workflow), 'WORKFLOW_MANUAL_RECOVERY');
requireTrue(!/^    paths(?:-ignore)?:\s*$/m.test(workflow), 'WORKFLOW_PATH_FILTER_FORBIDDEN');
requireTrue(workflow.includes('persist-credentials: false'), 'WORKFLOW_PERSIST_CREDENTIALS_FORBIDDEN');
requireTrue(workflow.includes('verify-ai-agent-bootstrap-receipt-v1.mjs'), 'WORKFLOW_RECEIPT_VERIFIER_REQUIRED');
requireTrue(workflow.includes('--consume'), 'WORKFLOW_ONE_TIME_CONSUMPTION_REQUIRED');
requireTrue(routing.includes("'ai-agent-bootstrap-remediation-enforcement-v1.yml'"), 'ROUTING_ALLOWLIST_REQUIRED');

const mutationRejected = [];
const reject = (label, candidate) => { requireTrue(candidate, `NEGATIVE_MUTATION_ACCEPTED:${label}`); mutationRejected.push(label); };
const reordered = structuredClone(manifest); reordered.platform_operating_principles.ordered_principles.reverse();
reject('REORDER_PLATFORM_PRINCIPLES', JSON.stringify(reordered.platform_operating_principles.ordered_principles) !== JSON.stringify(principles));
const weakened = structuredClone(manifest); weakened.platform_operating_principles.child_rule_can_weaken_reorder_or_bypass = true;
reject('ALLOW_CHILD_WEAKENING', weakened.platform_operating_principles.child_rule_can_weaken_reorder_or_bypass !== false);
const deleted = structuredClone(manifest); deleted.protected_paths = deleted.protected_paths.filter((p) => p !== 'AGENTS.md');
reject('DELETE_PROTECTED_PATH', JSON.stringify(deleted.protected_paths) !== JSON.stringify(requiredProtectedPaths));
const narrowed = workflow.replace('    branches: [main]\n', "    branches: [main]\n    paths:\n      - 'AGENTS.md'\n");
reject('NARROW_WORKFLOW_PATHS', /^    paths:/m.test(narrowed));
const noSentinel = workflow.replace("  schedule:\n    - cron: '13 * * * *'\n", '');
reject('REMOVE_HOURLY_SENTINEL', !/^  schedule:\s*$/m.test(noSentinel));

console.log(JSON.stringify({
  id:'kidults-ai-agent-bootstrap-protection-validation-v1',
  state:'VERIFIED_PASS',
  platform_operating_principles:principles,
  protected_path_count:requiredProtectedPaths.length,
  negative_mutations_rejected:mutationRejected.length,
  repository_wide_pr_enforcement:true,
  repository_wide_main_push_enforcement:true,
  hourly_sentinel:true,
  manual_recovery_path:true,
  production:'HOLD',
  public_release:'HOLD',
  g5:'HOLD'
}, null, 2));
