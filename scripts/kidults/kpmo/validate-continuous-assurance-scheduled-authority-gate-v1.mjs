#!/usr/bin/env node
import fs from 'node:fs';
import process from 'node:process';

const workflowPath = '.github/workflows/kpmo-continuous-assurance-scheduled-authority-gate-v1.yml';
const policyPath = 'coordination/kidults/kpmo/platform-continuous-assurance-v1.json';
const fail = (code) => { throw new Error(code); };

const workflow = fs.readFileSync(workflowPath, 'utf8');
const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));

const requiredWorkflowTokens = [
  'name: KPMO Continuous Assurance Scheduled Authority Gate V1',
  "workflows: ['KIDULTS Platform Continuous Assurance V1']",
  "github.event.workflow_run.event == 'schedule'",
  "github.event.workflow_run.conclusion == 'success'",
  'ref: ${{ github.event.workflow_run.head_sha }}',
  'test "$(git rev-parse HEAD)" = "$UPSTREAM_SHA"',
  '/branches/main',
  'resolve-continuous-assurance-sentinel-health-v1.mjs',
  'if: always()',
  'kpmo-continuous-assurance-scheduled-authority-gate-v1.json',
  '.coverage_scope=="CORE_FOUR_ONLY_NOT_WHOLE_PLATFORM"',
  '.whole_platform_authority==false',
  '.promotion_eligible==false',
  '.public=="HOLD"',
  '.production=="HOLD"',
  '.g5=="HOLD"',
  '.state=="VERIFIED_PASS"'
];
for (const token of requiredWorkflowTokens) {
  if (!workflow.includes(token)) fail(`SCHEDULED_AUTHORITY_GATE_TOKEN_MISSING:${token}`);
}

if (/continue-on-error:\s*true[\s\S]{0,240}Enforce scheduled Assurance authority gate/.test(workflow)) {
  fail('SCHEDULED_AUTHORITY_GATE_ENFORCEMENT_MUST_NOT_CONTINUE_ON_ERROR');
}

const gate = policy.scheduled_authority_gate;
if (!gate || typeof gate !== 'object' || Array.isArray(gate)) fail('SCHEDULED_AUTHORITY_GATE_POLICY_MISSING');
const expected = {
  raw_scheduled_assurance_success_authority: 'NON_AUTHORIZING_OBSERVATION',
  exact_sha_gate_required: true,
  gate_workflow: 'KPMO Continuous Assurance Scheduled Authority Gate V1',
  producer_health_source: 'KPMO Continuous Assurance Exact-SHA Producer Health Sentinel V1',
  coverage_scope: 'CORE_FOUR_ONLY_NOT_WHOLE_PLATFORM',
  whole_platform_green_claim_allowed: false,
  empirical_authority: false,
  provider_authority: false,
  production: 'HOLD',
  public: 'HOLD',
  g5: 'HOLD'
};
for (const [key, value] of Object.entries(expected)) {
  if (JSON.stringify(gate[key]) !== JSON.stringify(value)) fail(`SCHEDULED_AUTHORITY_GATE_POLICY_DRIFT:${key}`);
}

if (!Array.isArray(gate.required_bindings) || ![
  'repository', 'upstream_assurance_run_id', 'upstream_assurance_run_attempt',
  'upstream_assurance_head_sha', 'upstream_assurance_event', 'upstream_assurance_conclusion',
  'current_protected_main_sha', 'producer_health_receipt_digest'
].every((item) => gate.required_bindings.includes(item))) {
  fail('SCHEDULED_AUTHORITY_GATE_REQUIRED_BINDINGS_INCOMPLETE');
}

console.log(JSON.stringify({
  suite: 'KPMO_CONTINUOUS_ASSURANCE_SCHEDULED_AUTHORITY_GATE_V1',
  state: 'VERIFIED_PASS',
  raw_scheduled_success_authority: gate.raw_scheduled_assurance_success_authority,
  coverage_scope: gate.coverage_scope,
  whole_platform_green_claim_allowed: gate.whole_platform_green_claim_allowed,
  production: gate.production,
  public: gate.public,
  g5: gate.g5
}));
