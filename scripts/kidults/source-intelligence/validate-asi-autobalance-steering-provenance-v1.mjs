#!/usr/bin/env node
import fs from 'node:fs';
const target=process.argv[2]||'.github/workflows/kidults-asi-autobalance-steering-overlay-live-v1.yml';
function validate(t){
  const f=[];
  const need=(x,l)=>{if(!t.includes(x))f.push('missing '+l)};
  const reject=(x,l)=>{if(t.includes(x))f.push('forbidden '+l)};
  reject('git merge-base --is-ancestor','ancestor fallback');
  need("- 'KIDULTS ASI Throughput Coverage Autobalance Live v1'",'autobalance trigger');
  need("- 'KIDULTS ASI Self-Driving Control Loop v1'",'self-driving trigger');
  need("github.event.workflow_run.event != 'pull_request'",'workflow-run PR authority rejection');
  need('TRIGGER_EVENT: ${{ github.event.workflow_run.event || \'\' }}','trigger event binding');
  need('test "$TRIGGER_SOURCE_SHA" = "$CURRENT_SHA"','workflow_run exact current');
  need('EXPECTED_GENERATION_SHA="$PR_BASE_SHA"','PR base compatibility');
  need('test "$BASE_SOURCE_SHA" = "$EXPECTED_GENERATION_SHA"','base generation');
  need('test "$AUTOBALANCE_SOURCE_SHA" = "$EXPECTED_GENERATION_SHA"','autobalance generation');
  need('test "$BASE_SOURCE_SHA" = "$AUTOBALANCE_SOURCE_SHA"','cross-input equality');
  need('test "$TRIGGER_REPOSITORY" = "$GITHUB_REPOSITORY"','trigger repository');
  need('KIDULTS ASI Self-Driving Control Loop v1|.github/workflows/kidults-asi-self-driving-control-loop-v1.yml|schedule','self-driving schedule trigger path');
  need('KIDULTS ASI Throughput Coverage Autobalance Live v1|.github/workflows/kidults-asi-throughput-coverage-autobalance-live-v1.yml|schedule','autobalance schedule trigger path');
  need('(.event=="schedule" or .event=="workflow_dispatch" or .event=="push")','self-driving runtime event filter');
  need('(.event=="schedule" or .event=="workflow_dispatch")','autobalance runtime event filter');
  need("case \"$BASE_EVENT\" in schedule|workflow_dispatch|push)",'base runtime event enforcement');
  need("case \"$AUTOBALANCE_EVENT\" in schedule|workflow_dispatch)",'autobalance runtime event enforcement');
  need('STEERING_BASE_EVENT=$BASE_EVENT','base event receipt env');
  need('STEERING_AUTOBALANCE_EVENT=$AUTOBALANCE_EVENT','autobalance event receipt env');
  need("event:e.STEERING_BASE_EVENT",'base event receipt');
  need("event:e.STEERING_AUTOBALANCE_EVENT",'autobalance event receipt');
  need('pull_request_producer_authority:false','PR producer authority false');
  need('.workflow_run.id==$run','artifact run');
  need('.workflow_run.head_sha==$sha','artifact SHA');
  if((t.match(/if length==1 then \.\[0\] else empty end/g)||[]).length<2)f.push('missing exact cardinality');
  need('^sha256:[0-9a-f]{64}$','digest');
  need("status:'WAITING_FOR_EXACT_GENERATION_PEER'",'waiting receipt status');
  need("status:'VERIFIED_EXACT_GENERATION_BINDING'",'verified receipt status');
  const readyGate="if: steps.inputs.outputs.ready == 'true'";
  if((t.split(readyGate).length-1)<3)f.push('missing complete ready gating');
  need("echo 'ready=false' >> \"$GITHUB_OUTPUT\"",'wait output');
  need("echo 'ready=true' >> \"$GITHUB_OUTPUT\"",'ready output');
  need('expected_generation_sha:e.STEERING_EXPECTED_GENERATION_SHA','receipt generation');
  need('mixed_generation_allowed:false','mixed-generation prohibition');
  need('promotion_allowed:false','promotion hold');
  need('/tmp/asi-autobalance-steering-provenance-v1.json','receipt artifact');
  need("public_release:'HOLD'",'public HOLD');
  need("production:'HOLD'",'production HOLD');
  return f;
}
const t=fs.readFileSync(target,'utf8'),f=validate(t);
if(f.length){console.error(f);process.exit(1)}
const muts=[
  ['test "$BASE_SOURCE_SHA" = "$AUTOBALANCE_SOURCE_SHA"',':'],
  ['test "$BASE_SOURCE_SHA" = "$EXPECTED_GENERATION_SHA"',':'],
  ['test "$TRIGGER_SOURCE_SHA" = "$CURRENT_SHA"',':'],
  ['test "$TRIGGER_REPOSITORY" = "$GITHUB_REPOSITORY"',':'],
  ["github.event.workflow_run.event != 'pull_request'","true"],
  ['(.event=="schedule" or .event=="workflow_dispatch" or .event=="push")','true'],
  ['(.event=="schedule" or .event=="workflow_dispatch")','true'],
  ["pull_request_producer_authority:false","pull_request_producer_authority:true"],
  ["status:'WAITING_FOR_EXACT_GENERATION_PEER'","status:'VERIFIED_EXACT_GENERATION_BINDING'"],
  ["if: steps.inputs.outputs.ready == 'true'","if: always()"],
  ['if length==1 then .[0] else empty end','.[0] // empty'],
  ['mixed_generation_allowed:false','mixed_generation_allowed:true']
];
for(const [a,b] of muts){
  if(!t.includes(a)||validate(t.replace(a,b)).length===0){console.error('mutation not rejected',a);process.exit(1)}
}
console.log(JSON.stringify({status:'VERIFIED_PASS',control:'ASI_STEERING_RUNTIME_EVENT_BOUND_DUAL_INPUT_EXACT_GENERATION_READINESS',mutation_cases_rejected:muts.length,pull_request_producer_authority:false,production:'HOLD',public_release:'HOLD'},null,2));
