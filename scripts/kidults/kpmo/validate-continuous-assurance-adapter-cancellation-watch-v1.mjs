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
  {label:'State Department',text:stateDepartmentWorkflow,expected:"group: kidults-asi-state-department-camera-evidence-v1-${{ github.event_name }}-${{ github.sha }}"},
  {label:'Getty Historical Transaction Admission',text:gettyWorkflow,expected:"group: kidults-asi-getty-historical-transaction-admission-v1-${{ github.event_name }}-${{ github.sha }}"},
  {label:'Source Adapter Wave 2',text:wave2Workflow,expected:"group: kidults-asi-source-adapter-wave2-v1-${{ github.event_name }}-${{ github.sha }}"},
  {label:'Source Adapter Wave 3',text:wave3Workflow,expected:"group: kidults-asi-source-adapter-wave3-v1-${{ github.event_name }}-${{ github.sha }}"},
  {label:'Source Adapter Wave 4',text:wave4Workflow,expected:"group: kidults-asi-source-adapter-wave4-v1-${{ github.event_name }}-${{ github.sha }}"}
];

const eventConsumerControls = [
  {
    label:'P0 Mission Consumption',text:p0MissionWorkflow,
    expected:"group: kidults-asi-p0-mission-consumption-v1-${{ github.event_name }}-${{ github.event_name == 'workflow_run' && github.event.workflow_run.id || github.ref }}",
    unsafe:"group: kidults-asi-p0-mission-consumption-v1-${{ github.ref }}"
  },
  {
    label:'Autonomous Resolution Layer',text:autonomousResolutionWorkflow,
    expected:"group: kidults-asi-autonomous-resolution-layer-v1-${{ github.event_name == 'workflow_run' && github.event.workflow_run.id || github.sha }}",
    unsafe:"group: kidults-asi-autonomous-resolution-layer-v1-${{ github.sha }}",cancelInProgress:false
  }
];

function validateStaticProducer(control) {
  const findings=[];
  if(control.text.includes('workflow_run:')) findings.push(`${control.label} static validator retains redundant workflow_run trigger`);
  if(control.text.includes('github.event.workflow_run')) findings.push(`${control.label} stale workflow_run expression remains`);
  if(!control.text.includes(control.expected)) findings.push(`${control.label} concurrency is not coalesced by event and exact source generation`);
  if(!control.text.includes('cancel-in-progress: true')) findings.push(`${control.label} exact-generation coalescing missing`);
  return findings;
}

function validateEventConsumer(control) {
  const findings=[];
  if(!control.text.includes('workflow_run:')) findings.push(`${control.label} workflow_run trigger missing`);
  if(!control.text.includes(control.expected)) findings.push(`${control.label} concurrency is not isolated by event and upstream run id`);
  if(control.text.includes(control.unsafe)) findings.push(`${control.label} unsafe ref-only concurrency remains`);
  const expectedCancellation=control.cancelInProgress===false?'cancel-in-progress: false':'cancel-in-progress: true';
  if(!control.text.includes(expectedCancellation)) findings.push(`${control.label} generation leadership serialization policy missing`);
  return findings;
}

function validateP0BChainedConsumer(text) {
  const findings=[];
  const permissionsIndex=text.indexOf('\npermissions:');
  const triggerHeader=permissionsIndex>0?text.slice(0,permissionsIndex):text;
  if(/^\s{2}schedule:/m.test(triggerHeader)) findings.push('P0B independent schedule remains');
  if(/^\s{2}push:/m.test(triggerHeader)) findings.push('P0B independent push remains');
  if(!/\n  workflow_run:\n[\s\S]*KIDULTS ASI P0 Mission Consumption v1/.test(triggerHeader)) findings.push('P0B P0 Mission chained workflow_run missing');
  if(/\n  workflow_run:\n[\s\S]*KIDULTS ASI Source Fabric Scale PI1/.test(triggerHeader)) findings.push('P0B direct Source Fabric fan-out reintroduced');
  if(!text.includes("group: kidults-asi-p0b-bounded-discovery-candidates-v1-${{ github.event_name }}-${{ github.event_name == 'workflow_run' && github.event.workflow_run.id || github.event_name == 'pull_request' && github.event.pull_request.head.sha || github.run_id }}")) findings.push('P0B concurrency is not isolated by upstream run id');
  if(!text.includes('cancel-in-progress: false')) findings.push('P0B completed upstream generation may be cancelled');
  if(text.includes('ASI_SCOPE_ROTATION=')) findings.push('P0B direct provider rotation reintroduced');
  if(text.includes('node scripts/kidults/source-intelligence/asi-openalex-gdelt-public-metadata-discovery-v1.mjs')) findings.push('P0B direct provider execution reintroduced');
  for(const marker of [
    "test \"$EVENT_WORKFLOW_NAME\" = 'KIDULTS ASI P0 Mission Consumption v1'",
    "test \"$EVENT_WORKFLOW_PATH\" = '.github/workflows/kidults-asi-p0-mission-consumption-v1.yml'",
    'test "$EVENT_SOURCE_SHA" = "$LIVE_MAIN_SHA"',
    '-f head_sha="$EXPECTED_GENERATION_SHA"',
    '.name=="KIDULTS ASI Source Fabric Scale PI1"',
    '.workflow_run.id==$run',
    '.workflow_run.head_sha==$sha',
    '--expected-digest "$SOURCE_FABRIC_ARTIFACT_DIGEST"',
    'provider_requests_issued_by_p0b:0',
    'provider_execution_authority:false',
    'shared_provider_budget_required:true'
  ]) if(!text.includes(marker)) findings.push(`P0B chained consumer marker missing: ${marker}`);
  if(text.indexOf('--expected-digest "$SOURCE_FABRIC_ARTIFACT_DIGEST"')>=text.indexOf('unzip -q -o /tmp/p0b-source-fabric.zip')) findings.push('P0B safe archive verification does not precede extraction');
  return findings;
}

function validateContinuousAssurance(text) {
  const findings=[];
  const workflowRun=text.match(/\n  workflow_run:\n([\s\S]*?)(?=\n  [A-Za-z_]+:|\npermissions:)/)?.[1]||'';
  for(const name of watched) if(!workflowRun.includes(`- '${name}'`)) findings.push(`missing workflow_run watch: ${name}`);
  if(!workflowRun.includes('types: [completed]')) findings.push('workflow_run must observe completed events');
  if(!workflowRun.includes('branches: [main]')) findings.push('workflow_run must remain bound to main');
  if(!text.includes("github.event.workflow_run.repository.full_name == github.repository")) findings.push('repository binding missing');
  if(!text.includes("github.event.workflow_run.head_branch == 'main'")) findings.push('upstream main binding missing');
  if(!text.includes("KPMO_UPSTREAM_CONCLUSION: ${{ inputs.coverage_run_id != '' && 'success' || github.event.workflow_run.conclusion || '' }}")) findings.push('native and forwarded upstream conclusion receipt binding missing');
  if(/github\.event\.workflow_run\.conclusion\s*==\s*['\"]success['\"]/.test(text.match(/jobs:\n([\s\S]*?)\n    runs-on:/)?.[1]||'')) findings.push('job-level success-only filter would hide cancelled/failed upstream runs');
  return findings;
}

errors.push(...validateContinuousAssurance(workflow));
for(const name of watched){const mutated=workflow.replace(`      - '${name}'\n`,'');if(validateContinuousAssurance(mutated).length===0) errors.push(`mutation self-test failed for ${name}`);}
for(const control of staticProducerControls){
  errors.push(...validateStaticProducer(control));
  const mutated={...control,text:control.text.replace('\npermissions:',"\n  workflow_run:\n    workflows: ['KIDULTS ASI P1 Market-Event Adapter Runtime v1']\n    types: [completed]\n\npermissions:")};
  if(validateStaticProducer(mutated).length===0) errors.push(`${control.label} redundant workflow_run mutation escaped`);
}
for(const control of eventConsumerControls){
  errors.push(...validateEventConsumer(control));
  const mutated={...control,text:control.text.replace(control.expected,control.unsafe)};
  if(validateEventConsumer(mutated).length===0) errors.push(`${control.label} ref-only concurrency mutation escaped`);
}

errors.push(...validateP0BChainedConsumer(p0bWorkflow));
const p0bMutations=[
  p0bWorkflow.replace('  workflow_dispatch:\n',"  workflow_dispatch:\n  schedule:\n    - cron: '37 * * * *'\n"),
  p0bWorkflow.replace("- 'KIDULTS ASI P0 Mission Consumption v1'","- 'KIDULTS ASI Source Fabric Scale PI1'"),
  p0bWorkflow.replace('      - name: Rebuild current P0 mission task queue\n',"      - name: Direct provider regression\n        run: node scripts/kidults/source-intelligence/asi-openalex-gdelt-public-metadata-discovery-v1.mjs /tmp/direct.json\n      - name: Rebuild current P0 mission task queue\n"),
  p0bWorkflow.replace('-f head_sha="$EXPECTED_GENERATION_SHA"','-f per_page=100'),
  p0bWorkflow.replace('--expected-digest "$SOURCE_FABRIC_ARTIFACT_DIGEST"','--expected-digest sha256:0000000000000000000000000000000000000000000000000000000000000000'),
  p0bWorkflow.replace('provider_requests_issued_by_p0b:0','provider_requests_issued_by_p0b:1')
];
for(const [index,mutated] of p0bMutations.entries()) if(validateP0BChainedConsumer(mutated).length===0) errors.push(`P0B chained-consumer mutation escaped: ${index+1}`);

for(const marker of [
  'classifyUpstreamAuditHealth',
  'upstreamAuditHealth.acceptable === true',
  "process.env.KPMO_UPSTREAM_AUDIT_CONCLUSION_ACCEPTABLE === 'true'",
  'process.env.KPMO_UPSTREAM_AUDIT_DISPOSITION === upstreamAuditHealth.disposition',
  "'UPSTREAM_WORKFLOW_CONCLUSION'",
  'process.env.KPMO_UPSTREAM_REPOSITORY === process.env.GITHUB_REPOSITORY',
  "process.env.KPMO_UPSTREAM_HEAD_BRANCH === 'main'"
]) if(!audit.includes(marker)) errors.push(`audit fail-closed upstream marker missing: ${marker}`);

if(errors.length){console.error(errors.join('\n'));process.exit(1);}
console.log(JSON.stringify({
  suite:'KIDULTS_CONTINUOUS_ASSURANCE_CRITICAL_PRODUCER_CANCELLATION_WATCH_V1',
  result:'PASS',watched,cancellation_or_failure_must_surface:true,
  static_validators_detached_from_workflow_run:staticProducerControls.map(c=>c.label),
  exact_run_consumers_preserved:eventConsumerControls.map(c=>c.label),
  p0b_chained_consumer:{normal_trigger:'KIDULTS ASI P0 Mission Consumption v1',direct_source_fabric_fanout:false,direct_provider_execution:false,provider_requests:0,exact_same_generation_source_fabric_required:true},
  production:'HOLD',public:'HOLD',g5:'EXPLICIT_APPROVAL_REQUIRED'
},null,2));
