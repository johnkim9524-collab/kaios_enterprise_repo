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
  "github.event.workflow_run.name == 'KIDULTS Platform Continuous Assurance V1' &&",
  "github.event.workflow_run.conclusion == 'success'",
  "github.event.workflow_run.event == 'workflow_run'",
  "github.event.workflow_run.event == 'repository_dispatch'",
  "github.event.workflow_run.event == 'pull_request'",
  "github.event.workflow_run.event == 'push'",
  "github.event.workflow_run.event == 'schedule'",
  "github.event.workflow_run.event == 'workflow_dispatch'",
  'ref: ${{ github.event.workflow_run.head_sha }}',
  'success-authority-gate:',
  'non-authorizing-success-observation:',
  'upstream_observation:{',
  'UPSTREAM_WORKFLOW_NAME',
  'test "$(git rev-parse HEAD)" = "$UPSTREAM_SHA"',
  '/branches/main',
  'Restore latest exact-main natural Sentinel producer-health receipt',
  'actions/workflows/kpmo-continuous-assurance-sentinel-health-v1.yml/runs?branch=main&per_page=100',
  'select-latest-natural-sentinel-run-v1.mjs',
  'PRODUCER_HEALTH_CONCLUSION',
  'node --test tests/kidults/kpmo/sentinel-generation-selection-v1.test.mjs tests/kidults/kpmo/sentinel-producer-content-v1.test.mjs',
  '.state=="VERIFIED_PASS" and .latest.status=="completed" and .latest.conclusion=="success"',
  'actions/runs/${SENTINEL_RUN_ID}/artifacts?per_page=100',
  'read-sentinel-artifact-v1.py',
  'kpmo-continuous-assurance-sentinel-health-v1-${UPSTREAM_SHA}-${SENTINEL_RUN_ID}-${SENTINEL_RUN_ATTEMPT}',
  'if: always()',
  'kpmo-continuous-assurance-success-authority-gate-v1.json',
  'kpmo-continuous-assurance-non-authorizing-observation-v1.json',
  '.coverage_scope=="CORE_FOUR_ONLY_NOT_WHOLE_PLATFORM"',
  '.producer_health_run_attempt==1',
  '(.producer_health_event=="repository_dispatch" or .producer_health_event=="schedule" or .producer_health_event=="workflow_run")',
  '.producer_health_eligible==false',
  '.producer_health_receipt_required==false',
  '.whole_platform_authority==false',
  '.promotion_eligible==false',
  '.public=="HOLD"',
  '.production=="HOLD"',
  '.g5=="HOLD"',
  '.state=="VERIFIED_PASS"',
  '.state=="VERIFIED_HOLD"'
];
for (const token of requiredWorkflowTokens) {
  if (!workflow.includes(token)) fail('SUCCESS_AUTHORITY_GATE_TOKEN_MISSING:'+token);
}

if (workflow.includes('.conclusion=="success"') && workflow.includes('.created_at<=$before')) fail('SUCCESS_AUTHORITY_GATE_STALE_SUCCESS_FILTER');
if (workflow.includes("github.event.workflow_run.name == 'KPMO Continuous Assurance Exact-SHA Producer Health Sentinel V1'")) fail('SUCCESS_AUTHORITY_GATE_PREMATURE_SENTINEL_TRIGGER_FORBIDDEN');
if (/continue-on-error:\s*true[\s\S]{0,240}Enforce successful Assurance authority gate/.test(workflow)) fail('SUCCESS_AUTHORITY_GATE_ENFORCEMENT_MUST_NOT_CONTINUE_ON_ERROR');
if (workflow.includes('node scripts/kidults/kpmo/resolve-continuous-assurance-sentinel-health-v1.mjs\n          --output "$GATE_DIR')) fail('SUCCESS_AUTHORITY_GATE_MUST_CONSUME_UPSTREAM_HEALTH_RECEIPT');

const gate = policy.successful_assurance_authority_gate;
if (!gate || typeof gate !== 'object' || Array.isArray(gate)) fail('SUCCESS_AUTHORITY_GATE_POLICY_MISSING');
const expected = {
  raw_successful_assurance_authority: 'NON_AUTHORIZING_OBSERVATION',
  all_success_events_gate_required: true,
  all_success_events_classified_required: true,
  event_specific_bypass_forbidden: true,
  gate_workflow: 'KPMO Continuous Assurance Success Authority Gate V1',
  producer_health_source: 'KPMO Continuous Assurance Exact-SHA Producer Health Sentinel V1',
  coverage_scope: 'CORE_FOUR_ONLY_NOT_WHOLE_PLATFORM',
  producer_health_eligible_upstream_events: ['repository_dispatch', 'workflow_run'],
  non_authorizing_observation_events: ['pull_request', 'push', 'schedule', 'workflow_dispatch'],
  unclassified_event_state: 'VERIFIED_FAIL',
  non_authorizing_terminal_state: 'VERIFIED_HOLD',
  non_authorizing_receipt_required: true,
  whole_platform_green_claim_allowed: false,
  empirical_authority: false,
  provider_authority: false,
  database_authority: false,
  production: 'HOLD',
  public: 'HOLD',
  g5: 'HOLD',
  latest_natural_failure_fallback_forbidden: true
};
for (const [key, value] of Object.entries(expected)) {
  if (JSON.stringify(gate[key]) !== JSON.stringify(value)) fail('SUCCESS_AUTHORITY_GATE_POLICY_DRIFT:'+key);
}

const requiredBindings = [
  'repository', 'upstream_observation_workflow_name', 'upstream_observation_run_id',
  'upstream_observation_run_attempt', 'upstream_observation_head_sha',
  'upstream_observation_event', 'upstream_observation_conclusion',
  'current_protected_main_sha', 'producer_health_receipt_digest'
];
if (!Array.isArray(gate.required_bindings) || !requiredBindings.every((item) => gate.required_bindings.includes(item))) fail('SUCCESS_AUTHORITY_GATE_REQUIRED_BINDINGS_INCOMPLETE');

const supportedEvents = ['pull_request', 'push', 'repository_dispatch', 'schedule', 'workflow_dispatch', 'workflow_run'];
const validatePartition = (eligible, nonAuthorizing) => {
  if (!Array.isArray(eligible) || !Array.isArray(nonAuthorizing)) fail('SUCCESS_AUTHORITY_GATE_EVENT_CLASS_NOT_ARRAY');
  const eligibleUnique = [...new Set(eligible)].sort();
  const nonAuthorizingUnique = [...new Set(nonAuthorizing)].sort();
  if (JSON.stringify(eligible) !== JSON.stringify(eligibleUnique)) fail('SUCCESS_AUTHORITY_GATE_ELIGIBLE_EVENT_CLASS_NOT_CANONICAL');
  if (JSON.stringify(nonAuthorizing) !== JSON.stringify(nonAuthorizingUnique)) fail('SUCCESS_AUTHORITY_GATE_NON_AUTHORIZING_EVENT_CLASS_NOT_CANONICAL');
  if (eligibleUnique.some((event) => nonAuthorizingUnique.includes(event))) fail('SUCCESS_AUTHORITY_GATE_EVENT_CLASS_OVERLAP');
  const union = [...new Set([...eligibleUnique, ...nonAuthorizingUnique])].sort();
  if (JSON.stringify(union) !== JSON.stringify(supportedEvents)) fail('SUCCESS_AUTHORITY_GATE_EVENT_CLASS_INCOMPLETE');
};
validatePartition(gate.producer_health_eligible_upstream_events, gate.non_authorizing_observation_events);

for (const event of supportedEvents) {
  if (!workflow.includes("github.event.workflow_run.event == '"+event+"'")) fail('SUCCESS_AUTHORITY_GATE_WORKFLOW_EVENT_CLASS_MISSING:'+event);
}

let overlapRejected = false;
try {
  validatePartition(['repository_dispatch', 'workflow_run'], ['push', 'schedule', 'workflow_run']);
} catch (error) {
  overlapRejected = error.message === 'SUCCESS_AUTHORITY_GATE_EVENT_CLASS_OVERLAP';
}
if (!overlapRejected) fail('SUCCESS_AUTHORITY_GATE_EVENT_CLASS_MUTATION_NOT_REJECTED');

console.log(JSON.stringify({
  suite: 'KPMO_CONTINUOUS_ASSURANCE_SUCCESS_AUTHORITY_GATE_V1',
  state: 'VERIFIED_PASS',
  raw_successful_assurance_authority: gate.raw_successful_assurance_authority,
  all_success_events_gate_required: gate.all_success_events_gate_required,
  all_success_events_classified_required: gate.all_success_events_classified_required,
  producer_health_eligible_upstream_events: gate.producer_health_eligible_upstream_events,
  non_authorizing_observation_events: gate.non_authorizing_observation_events,
  non_authorizing_terminal_state: gate.non_authorizing_terminal_state,
  coverage_scope: gate.coverage_scope,
  whole_platform_green_claim_allowed: gate.whole_platform_green_claim_allowed,
  production: gate.production,
  public: gate.public,
  g5: gate.g5
}));
