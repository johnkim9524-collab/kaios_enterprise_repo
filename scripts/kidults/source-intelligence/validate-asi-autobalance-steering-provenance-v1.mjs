#!/usr/bin/env node
import fs from 'node:fs';
const target=process.argv[2]||'.github/workflows/kidults-asi-autobalance-steering-overlay-live-v1.yml';
function validate(t){
  const f=[];
  const need=(x,l)=>{if(!t.includes(x))f.push('missing '+l)};
  const reject=(x,l)=>{if(t.includes(x))f.push('forbidden '+l)};
  reject('git merge-base --is-ancestor','ancestor fallback');
  reject('-f status=success','success-only peer selector');
  need("- 'KIDULTS ASI Throughput Coverage Autobalance Live v1'",'autobalance trigger');
  need("- 'KIDULTS ASI Self-Driving Control Loop v1'",'self-driving trigger');
  need('test "$TRIGGER_SOURCE_SHA" = "$CURRENT_SHA"','workflow_run exact current');
  need('EXPECTED_GENERATION_SHA="$TRIGGER_SOURCE_SHA"','workflow_run trigger generation');
  need('EXPECTED_GENERATION_SHA="$PR_BASE_SHA"','PR base compatibility');
  need('test "$BASE_SOURCE_SHA" = "$EXPECTED_GENERATION_SHA"','base generation');
  need('test "$AUTOBALANCE_SOURCE_SHA" = "$EXPECTED_GENERATION_SHA"','autobalance generation');
  need('test "$BASE_SOURCE_SHA" = "$AUTOBALANCE_SOURCE_SHA"','cross-input equality');
  need('test "$TRIGGER_REPOSITORY" = "$GITHUB_REPOSITORY"','trigger repository');
  need('KIDULTS ASI Self-Driving Control Loop v1|.github/workflows/kidults-asi-self-driving-control-loop-v1.yml','self-driving trigger path');
  need('KIDULTS ASI Throughput Coverage Autobalance Live v1|.github/workflows/kidults-asi-throughput-coverage-autobalance-live-v1.yml','autobalance trigger path');
  need('.path==".github/workflows/kidults-asi-self-driving-control-loop-v1.yml"','base path');
  need('.path==".github/workflows/kidults-asi-throughput-coverage-autobalance-live-v1.yml"','autobalance path');
  if((t.match(/sort_by\(\.created_at\) \| reverse \| \.\[0\] \/\/ empty/g)||[]).length<2)f.push('missing deterministic latest exact-SHA peer selection');
  need('test "$BASE_RUN_ID" = "$TRIGGER_RUN_ID"','self-driving exact trigger run binding');
  need('test "$AUTOBALANCE_RUN_ID" = "$TRIGGER_RUN_ID"','autobalance exact trigger run binding');
  need('[ "$BASE_STATUS" != \'completed\' ]','base terminal state gate');
  need('[ "$AUTOBALANCE_STATUS" != \'completed\' ]','autobalance terminal state gate');
  need('[ "$BASE_CONCLUSION" != \'success\' ]','base conclusion gate');
  need('[ "$AUTOBALANCE_CONCLUSION" != \'success\' ]','autobalance conclusion gate');
  need("STEERING_PEER_FRESHNESS_SLO_SECONDS: '5400'",'90 minute freshness SLO');
  need('UPSTREAM_STEERING_TIMESTAMP_MALFORMED','malformed timestamp fail-closed');
  need('UPSTREAM_STEERING_TIMESTAMP_FUTURE','future timestamp fail-closed');
  need('UPSTREAM_STEERING_GENERATION_STALE','stale generation fail-closed');
  need('UPSTREAM_STEERING_PEER_SKEW_STALE','peer skew fail-closed');
  need('.workflow_run.id==$run','artifact run');
  need('.workflow_run.head_sha==$sha','artifact SHA');
  if((t.match(/if length==1 then \.\[0\] else empty end/g)||[]).length<4)f.push('missing exact cardinality');
  need('^sha256:[0-9a-f]{64}$','digest');
  need("status:'VERIFIED_FAIL'",'terminal failure receipt status');
  need("status:'VERIFIED_EXACT_GENERATION_BINDING'",'verified receipt status');
  const readyGate="if: steps.inputs.outputs.ready == 'true'";
  if((t.split(readyGate).length-1)<3)f.push('missing complete ready gating');
  need("echo 'ready=false' >> \"$GITHUB_OUTPUT\"",'fail output');
  need("echo 'ready=true' >> \"$GITHUB_OUTPUT\"",'ready output');
  need('expected_generation_sha:e.STEERING_EXPECTED_GENERATION_SHA','receipt generation');
  need('freshness_slo_seconds:Number(e.STEERING_PEER_FRESHNESS_SLO_SECONDS)','receipt freshness binding');
  need('age_seconds:Number(e.STEERING_BASE_AGE_SECONDS)','base age receipt');
  need('age_seconds:Number(e.STEERING_AUTOBALANCE_AGE_SECONDS)','autobalance age receipt');
  need('mixed_generation_allowed:false','mixed-generation prohibition');
  need('promotion_allowed:false','promotion hold');
  need('/tmp/asi-autobalance-steering-provenance-v1.json','receipt artifact');
  need("public_release:'HOLD'",'public HOLD');
  need("production:'HOLD'",'production HOLD');
  need('- name: Ensure terminal fail-closed steering receipt','terminal receipt finalizer');
  need("failure_code:'STEERING_PIPELINE_TERMINAL_FAILURE'",'hard-failure receipt synthesis');
  if((t.match(/if: always\(\)/g)||[]).length<2)f.push('missing always-run receipt/upload');
  need('- name: Fail closed when steering fan-in is unresolved','unresolved fan-in terminal failure');
  need("steps.inputs.outputs.ready != 'true'",'waiting cannot succeed');
  return f;
}
const t=fs.readFileSync(target,'utf8'),f=validate(t);
if(f.length){console.error(f);process.exit(1)}
const muts=[
  ['test "$BASE_SOURCE_SHA" = "$AUTOBALANCE_SOURCE_SHA"',':'],
  ['test "$BASE_SOURCE_SHA" = "$EXPECTED_GENERATION_SHA"',':'],
  ['test "$TRIGGER_SOURCE_SHA" = "$CURRENT_SHA"',':'],
  ['test "$TRIGGER_REPOSITORY" = "$GITHUB_REPOSITORY"',':'],
  ["- 'KIDULTS ASI Self-Driving Control Loop v1'",'- INVALID'],
  ['sort_by(.created_at) | reverse | .[0] // empty','.[0] // empty'],
  ['test "$BASE_RUN_ID" = "$TRIGGER_RUN_ID"',':'],
  ['test "$AUTOBALANCE_RUN_ID" = "$TRIGGER_RUN_ID"',':'],
  ["STEERING_PEER_FRESHNESS_SLO_SECONDS: '5400'","STEERING_PEER_FRESHNESS_SLO_SECONDS: '999999'"],
  ['UPSTREAM_STEERING_TIMESTAMP_MALFORMED','IGNORED_TIMESTAMP_MALFORMED'],
  ['UPSTREAM_STEERING_TIMESTAMP_FUTURE','IGNORED_TIMESTAMP_FUTURE'],
  ['UPSTREAM_STEERING_GENERATION_STALE','IGNORED_STALE'],
  ["status:'VERIFIED_FAIL'","status:'VERIFIED_EXACT_GENERATION_BINDING'"],
  ["if: steps.inputs.outputs.ready == 'true'","if: always()"],
  ['if length==1 then .[0] else empty end','.[0] // empty'],
  ['mixed_generation_allowed:false','mixed_generation_allowed:true'],
  ['- name: Ensure terminal fail-closed steering receipt','- name: OMIT terminal fail-closed steering receipt'],
  ["failure_code:'STEERING_PIPELINE_TERMINAL_FAILURE'","failure_code:'VERIFIED_PASS'"],
  ["steps.inputs.outputs.ready != 'true'","steps.inputs.outputs.ready == 'true'"]
];
for(const [a,b] of muts){
  if(!t.includes(a)||validate(t.replaceAll(a,b)).length===0){console.error('mutation not rejected',a);process.exit(1)}
}
console.log(JSON.stringify({status:'VERIFIED_PASS',control:'ASI_STEERING_LATEST_EXACT_TRIGGER_FRESHNESS_TERMINAL_RECEIPT',mutation_cases_rejected:muts.length,production:'HOLD',public_release:'HOLD'},null,2));
