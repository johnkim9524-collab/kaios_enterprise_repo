import fs from 'node:fs';

const workflowPath='.github/workflows/kpmo-continuous-assurance-success-authority-gate-v1.yml';
const producerPath='.github/workflows/kidults-platform-continuous-assurance-v1.yml';
const auditPath='scripts/kidults/kpmo/run-platform-a-to-z-readiness-audit-v1.mjs';
const policyPath='coordination/kidults/kpmo/platform-continuous-assurance-v1.json';
const workflow=fs.readFileSync(workflowPath,'utf8');
const producer=fs.readFileSync(producerPath,'utf8');
const audit=fs.readFileSync(auditPath,'utf8');
const policy=JSON.parse(fs.readFileSync(policyPath,'utf8'));
const fail=(code)=>{ throw new Error(code); };

const requiredWorkflowTokens=[
  'name: KPMO Continuous Assurance Success Authority Gate V1',
  "workflows: ['KIDULTS Platform Continuous Assurance V1']",
  'Restore and verify exact Assurance receipt and causal upstream tuple',
  'kidults-continuous-assurance-${UPSTREAM_SHA}-${UPSTREAM_RUN_ID}-${UPSTREAM_RUN_ATTEMPT}',
  'upstream-assurance-receipt.json',
  '.execution.upstream.workflow_name // empty',
  'KPMO Continuous Assurance Exact-SHA Producer Health Sentinel V1',
  'CAUSAL_ELIGIBLE=true',
  'CAUSAL_ELIGIBLE=false',
  'Restore causally bound exact-main Sentinel producer-health receipt',
  '/actions/runs/${PRODUCER_HEALTH_RUN_ID}',
  '.assurance_actual_upstream.head_sha==env.UPSTREAM_SHA',
  '.producer_health_run_id==(.assurance_actual_upstream.run_id|tonumber)',
  ".causal_reserve_binding.state=='VERIFIED_PASS'".replaceAll("'",'"'),
  'ASSURANCE_ACTUAL_UPSTREAM_NOT_SENTINEL',
  '.state=="VERIFIED_HOLD"',
  '.producer_health_eligible==false',
  '.coverage_scope=="CORE_FOUR_ONLY_NOT_WHOLE_PLATFORM"',
  '.public=="HOLD" and .production=="HOLD" and .g5=="HOLD"'
];
for(const token of requiredWorkflowTokens) if(!workflow.includes(token)) fail('CAUSAL_AUTHORITY_TOKEN_MISSING:'+token);
for(const forbidden of [
  'Restore latest exact-main natural Sentinel producer-health receipt',
  'actions/workflows/kpmo-continuous-assurance-sentinel-health-v1.yml/runs?branch=main&per_page=100'
]) if(workflow.includes(forbidden)) fail('INDEPENDENT_LATEST_SENTINEL_SELECTION_FORBIDDEN:'+forbidden);

if(!producer.includes("KPMO_UPSTREAM_HEAD_SHA: ${{ inputs.coverage_run_id != '' && inputs.coverage_source_sha || github.event.workflow_run.head_sha || '' }}")) {
  fail('ASSURANCE_PRODUCER_UPSTREAM_HEAD_SHA_ENV_MISSING');
}
if((audit.match(/head_sha: process\.env\.KPMO_UPSTREAM_HEAD_SHA \|\| 'UNKNOWN'/g)||[]).length!==2) {
  fail('ASSURANCE_RECEIPT_UPSTREAM_HEAD_SHA_BINDING_INCOMPLETE');
}

const SENTINEL='KPMO Continuous Assurance Exact-SHA Producer Health Sentinel V1';
const tupleValid=(u)=>u?.workflow_name===SENTINEL &&
  Number.isSafeInteger(Number(u.run_id)) && Number(u.run_id)>0 &&
  Number.isSafeInteger(Number(u.run_attempt)) && Number(u.run_attempt)>0 &&
  /^[0-9a-f]{40}$/.test(u.head_sha||'') &&
  /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(u.repository||'') &&
  u.conclusion==='success';
const classify=(receipt)=>tupleValid(receipt?.execution?.upstream)?'ELIGIBLE':'VERIFIED_HOLD';
const base={run_id:36556694105,run_attempt:1,head_sha:'a'.repeat(40),repository:'johnkim9524-collab/kaios_enterprise_repo',conclusion:'success'};
if(classify({execution:{upstream:{...base,workflow_name:SENTINEL}}})!=='ELIGIBLE') fail('REGRESSION_SENTINEL_ASSURANCE_MUST_BE_ELIGIBLE');
for(const workflow_name of ['KPMO Getty Admission Contract V1','KPMO Sharded Reserve V1','KIDULTS Coverage / full-audit']) {
  if(classify({execution:{upstream:{...base,workflow_name}}})!=='VERIFIED_HOLD') fail('REGRESSION_NON_SENTINEL_ASSURANCE_MUST_HOLD:'+workflow_name);
}
if(classify({execution:{upstream:{...base,workflow_name:SENTINEL,run_id:0}}})!=='VERIFIED_HOLD') fail('REGRESSION_INVALID_SENTINEL_TUPLE_MUST_HOLD');

const gate=policy.successful_assurance_authority_gate;
if(!gate||typeof gate!=='object'||Array.isArray(gate)) fail('SUCCESS_AUTHORITY_GATE_POLICY_MISSING');
if(gate.producer_health_eligibility_basis!=='EXACT_ASSURANCE_RECEIPT_CAUSAL_UPSTREAM') fail('CAUSAL_ELIGIBILITY_BASIS_INVALID');
if(JSON.stringify(gate.producer_health_eligible_assurance_upstream_workflows)!==JSON.stringify([SENTINEL])) fail('CAUSAL_ELIGIBLE_WORKFLOW_INVALID');
if(JSON.stringify(gate.receipt_classified_events)!==JSON.stringify(['repository_dispatch','workflow_run'])) fail('RECEIPT_CLASSIFIED_EVENTS_INVALID');
if(JSON.stringify(gate.producer_health_eligible_upstream_events)!==JSON.stringify([])) fail('EVENT_CLASS_AUTHORITY_MUST_BE_EMPTY');
for(const key of [
  'assurance_receipt_digest','assurance_actual_upstream_workflow_name','assurance_actual_upstream_run_id',
  'assurance_actual_upstream_run_attempt','assurance_actual_upstream_head_sha',
  'assurance_actual_upstream_repository','assurance_actual_upstream_conclusion',
  'producer_health_receipt_digest','causal_reserve_triggering_run_id','causal_reserve_selected_run_id'
]) if(!gate.required_bindings.includes(key)) fail('REQUIRED_CAUSAL_BINDING_MISSING:'+key);
if(gate.non_authorizing_terminal_state!=='VERIFIED_HOLD'||gate.production!=='HOLD'||gate.public!=='HOLD'||gate.g5!=='HOLD') fail('AUTHORITY_BOUNDARY_INVALID');

console.log(JSON.stringify({
  suite:'KPMO_CONTINUOUS_ASSURANCE_CAUSAL_SUCCESS_AUTHORITY_GATE_V1',
  state:'VERIFIED_PASS',
  sentinel_fixture:'ELIGIBLE',
  non_sentinel_fixtures:'VERIFIED_HOLD',
  exact_causal_tuple_required:true,
  production:gate.production,
  public:gate.public,
  g5:gate.g5
},null,2));
