#!/usr/bin/env node
import fs from 'node:fs';

const workflowPath = '.github/workflows/kidults-platform-continuous-assurance-v1.yml';
const auditPath = 'scripts/kidults/kpmo/run-platform-a-to-z-readiness-audit-v1.mjs';
const stateDepartmentWorkflowPath = '.github/workflows/kidults-asi-state-department-camera-evidence-v1.yml';
const gettyWorkflowPath = '.github/workflows/kidults-asi-getty-historical-transaction-admission-v1.yml';
const p0MissionWorkflowPath = '.github/workflows/kidults-asi-p0-mission-consumption-v1.yml';
const p0bWorkflowPath = '.github/workflows/kidults-asi-p0b-bounded-discovery-candidates-v1.yml';
const autonomousResolutionWorkflowPath = '.github/workflows/kidults-asi-autonomous-resolution-layer-v1.yml';
const wave2WorkflowPath = '.github/workflows/kidults-asi-source-adapter-wave2-v1.yml';
const wave3WorkflowPath = '.github/workflows/kidults-asi-source-adapter-wave3-v1.yml';
const wave4WorkflowPath = '.github/workflows/kidults-asi-source-adapter-wave4-v1.yml';
const errors = [];
const workflow = fs.readFileSync(workflowPath, 'utf8');
const audit = fs.readFileSync(auditPath, 'utf8');
const stateDepartmentWorkflow = fs.readFileSync(stateDepartmentWorkflowPath, 'utf8');
const gettyWorkflow = fs.readFileSync(gettyWorkflowPath, 'utf8');
const p0MissionWorkflow = fs.readFileSync(p0MissionWorkflowPath, 'utf8');
const p0bWorkflow = fs.readFileSync(p0bWorkflowPath, 'utf8');
const autonomousResolutionWorkflow = fs.readFileSync(autonomousResolutionWorkflowPath, 'utf8');
const wave2Workflow = fs.readFileSync(wave2WorkflowPath, 'utf8');
const wave3Workflow = fs.readFileSync(wave3WorkflowPath, 'utf8');
const wave4Workflow = fs.readFileSync(wave4WorkflowPath, 'utf8');

const watched = [
  'KIDULTS ASI Source Adapter Wave 2 v1',
  'KIDULTS ASI Source Adapter Wave 3 v1',
  'KIDULTS ASI Source Adapter Wave 4 v1',
  'KIDULTS ASI State Department Camera Evidence v1',
  'KIDULTS ASI Getty Historical Transaction Admission v1',
  'KIDULTS ASI P0 Mission Consumption v1',
  'KIDULTS ASI P0B Bounded Discovery Candidates v1',
  'KIDULTS ASI Autonomous Resolution Layer v1'
];

const staticProducerControls = [
  {
    label: 'State Department',
    text: stateDepartmentWorkflow,
    expected: "group: kidults-asi-state-department-camera-evidence-v1-${{ github.event_name }}-${{ github.sha }}"
  },
  {
    label: 'Getty Historical Transaction Admission',
    text: gettyWorkflow,
    expected: "group: kidults-asi-getty-historical-transaction-admission-v1-${{ github.event_name }}-${{ github.sha }}"
  },
  {
    label: 'Source Adapter Wave 2',
    text: wave2Workflow,
    expected: "group: kidults-asi-source-adapter-wave2-v1-${{ github.event_name }}-${{ github.sha }}"
  },
  {
    label: 'Source Adapter Wave 3',
    text: wave3Workflow,
    expected: "group: kidults-asi-source-adapter-wave3-v1-${{ github.event_name }}-${{ github.sha }}"
  },
  {
    label: 'Source Adapter Wave 4',
    text: wave4Workflow,
    expected: "group: kidults-asi-source-adapter-wave4-v1-${{ github.event_name }}-${{ github.sha }}"
  }
];

const eventConsumerControls = [
  {
    label: 'P0 Mission Consumption',
    text: p0MissionWorkflow,
    expected: "group: kidults-asi-p0-mission-consumption-v1-${{ github.event_name }}-${{ github.event_name == 'workflow_run' && github.event.workflow_run.id || github.ref }}",
    unsafe: "group: kidults-asi-p0-mission-consumption-v1-${{ github.ref }}"
  },
  {
    label: 'Autonomous Resolution Layer',
    text: autonomousResolutionWorkflow,
    expected: "group: kidults-asi-autonomous-resolution-layer-v1-${{ github.event_name == 'workflow_run' && github.event.workflow_run.id || github.sha }}",
    unsafe: "group: kidults-asi-autonomous-resolution-layer-v1-${{ github.sha }}",
    cancelInProgress: false
  }
];

const disabledProviderControls = [
  {
    label: 'P0B Bounded Discovery Candidates',
    text: p0bWorkflow,
    marker: 'P0B_DIRECT_PROVIDER_EXECUTION_HARD_DISABLED',
    providerMarker: 'ASI_SCOPE_ROTATION='
  }
];

function validateStaticProducer(control) {
  const findings = [];
  if (control.text.includes('workflow_run:')) findings.push(`${control.label} static validator retains redundant workflow_run trigger`);
  if (control.text.includes('github.event.workflow_run')) findings.push(`${control.label} stale workflow_run expression remains`);
  if (!control.text.includes(control.expected)) findings.push(`${control.label} concurrency is not coalesced by event and exact source generation`);
  if (!control.text.includes('cancel-in-progress: true')) findings.push(`${control.label} exact-generation coalescing missing`);
  return findings;
}

function validateDisabledProvider(control) {
  const findings = [];
  const permissionsIndex = control.text.indexOf('\npermissions:');
  const triggerHeader = permissionsIndex > 0 ? control.text.slice(0, permissionsIndex) : control.text;
  if (/\n  schedule:/.test(triggerHeader)) findings.push(`${control.label} autonomous schedule remains`);
  if (/\n  workflow_run:/.test(triggerHeader)) findings.push(`${control.label} autonomous workflow_run remains`);
  const gateIndex = control.text.indexOf(control.marker);
  const checkoutIndex = control.text.indexOf('      - uses: actions/checkout@');
  const providerIndex = control.text.indexOf(control.providerMarker);
  if (gateIndex < 0) findings.push(`${control.label} hard-disable marker missing`);
  if (gateIndex >= checkoutIndex || gateIndex >= providerIndex) findings.push(`${control.label} hard-disable does not precede checkout/provider code`);
  if (!control.text.includes('provider_requests_issued_by_p0b:0')) findings.push(`${control.label} zero-request terminal receipt missing`);
  if (!control.text.includes('provider_execution_authority:false')) findings.push(`${control.label} provider authority false missing`);
  return findings;
}

function validateEventConsumer(control) {
  const findings = [];
  if (!control.text.includes('workflow_run:')) findings.push(`${control.label} workflow_run trigger missing`);
  if (!control.text.includes(control.expected)) findings.push(`${control.label} concurrency is not isolated by event and upstream run id`);
  if (control.text.includes(control.unsafe)) findings.push(`${control.label} unsafe ref-only concurrency remains`);
  const expectedCancellation = control.cancelInProgress === false ? 'cancel-in-progress: false' : 'cancel-in-progress: true';
  if (!control.text.includes(expectedCancellation)) findings.push(`${control.label} generation leadership serialization policy missing`);
  return findings;
}

function validate(text) {
  const findings = [];
  const workflowRun = text.match(/\n  workflow_run:\n([\s\S]*?)(?=\n  [A-Za-z_]+:|\npermissions:)/)?.[1] || '';
  for (const name of watched) {
    if (!workflowRun.includes(`- '${name}'`)) findings.push(`missing workflow_run watch: ${name}`);
  }
  if (!workflowRun.includes('types: [completed]')) findings.push('workflow_run must observe completed events');
  if (!workflowRun.includes('branches: [main]')) findings.push('workflow_run must remain bound to main');
  if (!text.includes("github.event.workflow_run.repository.full_name == github.repository")) findings.push('repository binding missing');
  if (!text.includes("github.event.workflow_run.head_branch == 'main'")) findings.push('upstream main binding missing');
  if (!text.includes("KPMO_UPSTREAM_CONCLUSION: ${{ inputs.coverage_run_id != '' && 'success' || github.event.workflow_run.conclusion || '' }}")) {
    findings.push('native and forwarded upstream conclusion receipt binding missing');
  }
  if (/github\.event\.workflow_run\.conclusion\s*==\s*['\"]success['\"]/.test(text.match(/jobs:\n([\s\S]*?)\n    runs-on:/)?.[1] || '')) findings.push('job-level success-only filter would hide cancelled/failed upstream runs');
  return findings;
}

errors.push(...validate(workflow));
for (const name of watched) {
  const mutated = workflow.replace(`      - '${name}'\n`, '');
  if (validate(mutated).length === 0) errors.push(`mutation self-test failed for ${name}`);
}
for (const control of staticProducerControls) {
  errors.push(...validateStaticProducer(control));
  const mutated = {
    ...control,
    text: control.text.replace('\npermissions:', "\n  workflow_run:\n    workflows: ['KIDULTS ASI P1 Market-Event Adapter Runtime v1']\n    types: [completed]\n\npermissions:")
  };
  if (validateStaticProducer(mutated).length === 0) errors.push(`${control.label} redundant workflow_run mutation escaped`);
}
for (const control of eventConsumerControls) {
  errors.push(...validateEventConsumer(control));
  const mutated = { ...control, text: control.text.replace(control.expected, control.unsafe) };
  if (validateEventConsumer(mutated).length === 0) errors.push(`${control.label} ref-only concurrency mutation escaped`);
}
for (const control of disabledProviderControls) {
  errors.push(...validateDisabledProvider(control));
  const scheduleMutation = {
    ...control,
    text: control.text.replace('  workflow_dispatch:\n', "  workflow_dispatch:\n  schedule:\n    - cron: '37 * * * *'\n")
  };
  if (validateDisabledProvider(scheduleMutation).length === 0) errors.push(`${control.label} autonomous schedule mutation escaped`);
  const triggerMutation = {
    ...control,
    text: control.text.replace('  workflow_dispatch:\n', "  workflow_dispatch:\n  workflow_run:\n    workflows: ['KIDULTS ASI P0 Mission Consumption v1']\n    types: [completed]\n")
  };
  if (validateDisabledProvider(triggerMutation).length === 0) errors.push(`${control.label} autonomous workflow_run mutation escaped`);
  const markerMutation = { ...control, text: control.text.replace(control.marker, 'P0B_PROVIDER_EXECUTION_ALLOWED') };
  if (validateDisabledProvider(markerMutation).length === 0) errors.push(`${control.label} hard-disable marker mutation escaped`);
}

for (const marker of [
  'classifyUpstreamAuditHealth',
  'upstreamAuditHealth.acceptable === true',
  "process.env.KPMO_UPSTREAM_AUDIT_CONCLUSION_ACCEPTABLE === 'true'",
  'process.env.KPMO_UPSTREAM_AUDIT_DISPOSITION === upstreamAuditHealth.disposition',
  "'UPSTREAM_WORKFLOW_CONCLUSION'",
  'process.env.KPMO_UPSTREAM_REPOSITORY === process.env.GITHUB_REPOSITORY',
  "process.env.KPMO_UPSTREAM_HEAD_BRANCH === 'main'"
]) {
  if (!audit.includes(marker)) errors.push(`audit fail-closed upstream marker missing: ${marker}`);
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log(JSON.stringify({
  suite: 'KIDULTS_CONTINUOUS_ASSURANCE_CRITICAL_PRODUCER_CANCELLATION_WATCH_V1',
  result: 'PASS',
  watched,
  cancellation_or_failure_must_surface: true,
  static_validators_detached_from_workflow_run: staticProducerControls.map((control) => control.label),
  exact_run_consumers_preserved: eventConsumerControls.map((control) => control.label),
  disabled_provider_producers_preserved: disabledProviderControls.map((control) => control.label),
  production: 'HOLD',
  public: 'HOLD',
  g5: 'EXPLICIT_APPROVAL_REQUIRED'
}, null, 2));
