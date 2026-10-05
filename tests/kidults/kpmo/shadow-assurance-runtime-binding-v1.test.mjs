import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {SPECS} from '../../../scripts/kidults/kpmo/resolve-continuous-assurance-sentinel-health-v1.mjs';

const observed=JSON.parse(fs.readFileSync('tests/fixtures/kpmo/shadow-push-runtime-binding-v1.json'));
const workflow=fs.readFileSync('.github/workflows/kidults-platform-continuous-assurance-v1.yml','utf8');
const block=workflow.split('      - name: Validate exact ASI SHADOW upstream evidence binding\n')[1].split('\n      - name:')[0];
const predicate=block.match(/'(.id==\$run[\s\S]*?\.conclusion=="success")'/)[1];
const expected={run:observed.id,attempt:observed.run_attempt,sha:observed.head_sha,repo:observed.repository.full_name,event:observed.event};
function evaluate(record,binding=expected,filter=predicate){
 const args=['-e'];
 for(const [key,value] of Object.entries(binding))args.push(typeof value==='number'?'--argjson':'--arg',key,String(value));
 args.push(filter);
 return spawnSync('jq',args,{input:JSON.stringify(record),encoding:'utf8',timeout:5000}).status;
}
test('captured protected SHADOW push reproduces the former consumer rejection and passes the actual corrected workflow predicate',()=>{
 assert.equal(observed.id,37208156514);
 assert.equal(evaluate(observed,expected,predicate.replace('and .event==$event','and .event=="workflow_run"')),1);
 assert.equal(evaluate(observed),0);
});
for(const event of SPECS.find(s=>s.id==='SHADOW').events)test(`registered ${event} is bound to the exact triggering event`,()=>{
 assert.equal(evaluate({...observed,event},{...expected,event}),0);
 if(event!==expected.event)assert.equal(evaluate({...observed,event}),1);
});
for(const [label,change] of [
 ['source SHA',{head_sha:'a'.repeat(40)}],['repository',{repository:{full_name:'other/repo'}}],
 ['branch',{head_branch:'feature'}],['workflow path',{path:'.github/workflows/other.yml'}],
 ['workflow name',{name:'Unregistered SHADOW'}],['run id',{id:observed.id+1}],
 ['attempt',{run_attempt:observed.run_attempt+1}],['failed producer',{conclusion:'failure'}],
 ['nonterminal producer',{status:'in_progress'}],['pull request event',{event:'pull_request'}],
 ['consumer event substituted for producer event',{event:'workflow_run'}],
 ['unregistered native event',{event:'repository_dispatch'}],
])test(`actual workflow predicate refuses ${label} drift`,()=>assert.equal(evaluate({...observed,...change}),1));
test('registered event allowlist still rejects unregistered events when the trigger repeats them',()=>{
 for(const event of ['workflow_run','pull_request','repository_dispatch','unknown'])
  assert.equal(evaluate({...observed,event},{...expected,event}),1);
});
test('the executable binding uses protected trigger attempt/event and retains artifact identity/digest checks',()=>{
 assert.ok(block.includes('SHADOW_UPSTREAM_RUN_ATTEMPT: ${{ github.event.workflow_run.run_attempt }}'));
 assert.ok(block.includes('SHADOW_UPSTREAM_EVENT: ${{ github.event.workflow_run.event }}'));
 assert.ok(block.includes('--argjson attempt "$SHADOW_UPSTREAM_RUN_ATTEMPT"'));
 assert.ok(block.includes('--arg event "$SHADOW_UPSTREAM_EVENT"'));
 assert.equal((block.match(/\.workflow_run\.id==\$run[^\n]*\.workflow_run\.head_sha==\$sha/g)||[]).length,3);
 assert.ok(block.includes('test "$SHADOW_ARTIFACT_COUNT" -eq 1'));
 assert.ok(block.includes('[[ "$SHADOW_ARTIFACT_DIGEST" =~ ^sha256:[0-9a-fA-F]{64}$ ]]'));
});
