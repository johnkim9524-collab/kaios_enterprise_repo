#!/usr/bin/env node
import fs from 'node:fs';

const workflowPath = '.github/workflows/kpmo-continuous-assurance-success-authority-gate-v1.yml';
const policyPath = 'coordination/kidults/kpmo/platform-continuous-assurance-v1.json';
const fail = (code) => { throw new Error(code); };

const workflow = fs.readFileSync(workflowPath, 'utf8');
const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));

const requiredWorkflowTokens = [
  'name: KPMO Continuous Assurance Success Authority Gate V1',
  "workflows: ['KIDULTS Platform Continuous Assurance V1']",
  "github.event.workflow_run.conclusion == 'success'",
  'ref: ${{ github.event.workflow_run.head_sha }}',
  'test "$(git rev-parse HEAD)" = "$UPSTREAM_SHA"',
  '/branches/main',
  'resolve-continuous-assurance-sentinel-health-v1.mjs',
  'GATE_DIR="$RUNNER_TEMP/kpmo-success-assurance-authority-gate"',
  'echo "GATE_DIR=$GATE_DIR" >> "$GITHUB_ENV"',
  'if: always()',
  'kpmo-continuous-assurance-success-authority-gate-v1.json',
  '.coverage_scope=="CORE_FOUR_ONLY_NOT_WHOLE_PLATFORM"',
  '.whole_platform_authority==false',
  '.promotion_eligible==false',
  '.public=="HOLD"',
  '.production=="HOLD"',
  '.g5=="HOLD"',
  '.state=="VERIFIED_PASS"'
];
for (const token of requiredWorkflowTokens) {
  if (!workflow.includes(token)) fail(`SUCCESS_AUTHORITY_GATE_TOKEN_MISSING:${token}`);
}

if (workflow.includes("github.event.workflow_run.event == 'schedule'")) {
  fail('SUCCESS_AUTHORITY_GATE_EVENT_SPECIFIC_BYPASS');
}
if (/^\s{4,}GATE_DIR:\s*\$\{\{\s*runner\.temp/m.test(workflow)) {
  fail('SUCCESS_AUTHORITY_GATE_JOB_ENV_RUNNER_CONTEXT_FORBIDDEN');
}
if (/continue-on-error:\s*true[\s\S]{0,240}Enforce successful Assurance authority gate/.test(workflow)) {
  fail('SUCCESS_AUTHORITY_GATE_ENFORCEMENT_MUST_NOT_CONTINUE_ON_ERROR');
}

const gate = policy.successful_assurance_authority_gate;
if (!gate || typeof gate !== 'object' || Array.isArray(gate)) fail('SUCCESS_AUTHORITY_GATE_POLICY_MISSING');
const expected = {
  raw_successful_assurance_authority: 'NON_AUTHORIZING_OBSERVATION',
  all_success_events_gate_required: true,
  event_specific_bypass_forbidden: true,
  enforcement_location: 'SAME_ASSURANCE_RUN_BEFORE_CANONICAL_LEADER_PUBLICATION',
  same_run_prepublication_gate_required: true,
  canonical_leader_publication_requires_verified_producer_health: true,
  downstream_workflow_run_gate_role: 'DEFENSE_IN_DEPTH_NON_AUTHORIZING_OBSERVATION',
  downstream_gate_workflow: 'KPMO Continuous Assurance Success Authority Gate V1',
  workflow_load_validity_required: true,
  producer_health_source: 'KPMO Continuous Assurance Exact-SHA Producer Health Sentinel V1',
  coverage_scope: 'CORE_FOUR_ONLY_NOT_WHOLE_PLATFORM',
  whole_platform_green_claim_allowed: false,
  empirical_authority: false,
  provider_authority: false,
  database_authority: false,
  production: 'HOLD',
  public: 'HOLD',
  g5: 'HOLD'
};
for (const [key, value] of Object.entries(expected)) {
  if (JSON.stringify(gate[key]) !== JSON.stringify(value)) fail(`SUCCESS_AUTHORITY_GATE_POLICY_DRIFT:${key}`);
}

const requiredBindings = [
  'repository', 'upstream_assurance_run_id', 'upstream_assurance_run_attempt',
  'upstream_assurance_head_sha', 'upstream_assurance_event', 'upstream_assurance_conclusion',
  'current_protected_main_sha', 'producer_health_receipt_digest'
];
if (!Array.isArray(gate.required_bindings) || !requiredBindings.every((item) => gate.required_bindings.includes(item))) {
  fail('SUCCESS_AUTHORITY_GATE_REQUIRED_BINDINGS_INCOMPLETE');
}

const eventSpecificMutation = workflow.replace(
  "github.event.workflow_run.conclusion == 'success'",
  "github.event.workflow_run.event == 'schedule' &&\n      github.event.workflow_run.conclusion == 'success'"
);
if (eventSpecificMutation === workflow || !eventSpecificMutation.includes("github.event.workflow_run.event == 'schedule'")) {
  fail('SUCCESS_AUTHORITY_GATE_MUTATION_SETUP');
}

console.log(JSON.stringify({
  suite: 'KPMO_CONTINUOUS_ASSURANCE_SUCCESS_AUTHORITY_GATE_V1',
  state: 'VERIFIED_PASS',
  raw_successful_assurance_authority: gate.raw_successful_assurance_authority,
  all_success_events_gate_required: gate.all_success_events_gate_required,
  coverage_scope: gate.coverage_scope,
  whole_platform_green_claim_allowed: gate.whole_platform_green_claim_allowed,
  production: gate.production,
  public: gate.public,
  g5: gate.g5
}));
