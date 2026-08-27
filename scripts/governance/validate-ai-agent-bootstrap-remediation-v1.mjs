#!/usr/bin/env node
import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');
const json = (p) => JSON.parse(read(p));
const fail = (m) => { throw new Error(m); };
const requireTrue = (v, m) => { if (!v) fail(m); };

const paths = {
  bootstrap: 'coordination/kidults/governance/ai-agent-bootstrap-remediation-sequence-v1.json',
  agents: 'AGENTS.md',
  copilot: '.github/copilot-instructions.md',
  policy: '.github/AI_AGENT_OPERATING_RULES.md',
  contract: 'coordination/kidults/governance/ai-agent-operating-rules-v1.json',
  registry: 'coordination/kidults/registry/ai-agent-governance-registry-v1.json'
};
for (const p of Object.values(paths)) requireTrue(fs.existsSync(p), `MISSING:${p}`);

const bootstrap = json(paths.bootstrap);
const agents = read(paths.agents);
const copilot = read(paths.copilot);
const policy = read(paths.policy);
const contract = json(paths.contract);
const registry = json(paths.registry);

const expected = [
  'DETECT_REVERSIBLE_DEFECT',
  'CORRECT_ROOT_CAUSE_IMMEDIATELY',
  'RUN_REGRESSION_AND_NEGATIVE_TESTS',
  'REVALIDATE_EXACT_HEAD_AND_TARGET_MAIN',
  'TRUTH_SYNC_REGISTRY_AND_ISSUE',
  'REPORT_VERIFIED_OUTCOME',
  'PROPOSE_PRIORITIZED_IMPROVEMENTS'
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

for (const marker of ['Mandatory agent bootstrap — fix first, report last','regression + negative tests','exact-head revalidation','registry/issue truth-sync','report verified outcome','propose prioritized improvements']) {
  requireTrue(agents.toLowerCase().includes(marker.toLowerCase()), `AGENTS_BOOTSTRAP_MARKER:${marker}`);
}
for (const marker of ['ai-agent-bootstrap-remediation-sequence-v1.json','regression + negative tests','registry/issue truth-sync','report verified outcome','propose prioritized improvements','report-only response is forbidden']) {
  requireTrue(copilot.toLowerCase().includes(marker.toLowerCase()), `COPILOT_BOOTSTRAP_MARKER:${marker}`);
}

requireTrue(policy.includes('### 4.4 Fix first within authority'), 'POLICY_FIX_FIRST_SECTION');
requireTrue(policy.includes('A report-only response is not closure'), 'POLICY_REPORT_ONLY_FORBIDDEN');
requireTrue(contract.principles?.some((r) => r.rule_id === 'AI-016' && r.name === 'PROACTIVE_ISSUE_OWNERSHIP'), 'CONTRACT_AI_016');
requireTrue(contract.principles?.some((r) => r.rule_id === 'AI-017' && r.name === 'LEAD_TO_VERIFIED_CLOSURE_AND_IMPROVEMENT'), 'CONTRACT_AI_017');
requireTrue(contract.enforcement?.proactive_internal_remediation_required === true, 'CONTRACT_PROACTIVE_REMEDIATION');
requireTrue(contract.enforcement?.verified_closure_and_forward_proposal_required === true, 'CONTRACT_VERIFIED_CLOSURE');

requireTrue(registry.registered_policy?.bootstrap_remediation_sequence_path === paths.bootstrap, 'REGISTRY_BOOTSTRAP_PATH');
requireTrue(registry.mandatory_inheritance?.bootstrap_remediation_sequence_required === true, 'REGISTRY_BOOTSTRAP_REQUIRED');
requireTrue(registry.mandatory_inheritance?.bootstrap_load_before_task_execution_required === true, 'REGISTRY_BOOTSTRAP_PRELOAD');
requireTrue(JSON.stringify(registry.leadership_execution?.mandatory_bootstrap_sequence) === JSON.stringify(expected), 'REGISTRY_SEQUENCE_ORDER');
requireTrue(registry.leadership_execution?.routine_report_before_authorized_remediation_forbidden === true, 'REGISTRY_REPORT_ONLY_FORBIDDEN');

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

console.log(JSON.stringify({
  id: 'kidults-ai-agent-bootstrap-remediation-validation-v1',
  state: 'VERIFIED_PASS',
  sequence: expected,
  inheritance_count: 13,
  negative_mutations_rejected: 3,
  report_only_before_remediation_allowed: false,
  production: 'HOLD',
  public_release: 'HOLD',
  g5: 'HOLD'
}, null, 2));
