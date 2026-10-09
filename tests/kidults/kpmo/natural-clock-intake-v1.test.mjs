import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const sha='a'.repeat(40), login='kidults-clock[bot]';
function execute(mutate=x=>x){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'clock-intake-'));
  const event=mutate({action:'kidults.natural.clock.p0b.v1',repository:{full_name:'johnkim9524-collab/kaios_enterprise_repo'},sender:{type:'Bot',login},client_payload:{dispatch_id:`kidults-natural-clock-v1:P0B:${sha}:${'n'.repeat(32)}`,exact_main_sha:sha,issued_at:new Date().toISOString(),nonce:'n'.repeat(32),slot:'P0B',source:'AWS_EVENTBRIDGE_SCHEDULER'}});
  const eventPath=path.join(dir,'event.json'); fs.writeFileSync(eventPath,JSON.stringify(event));
  return spawnSync(process.execPath,['scripts/kidults/kpmo/run-natural-clock-intake-v1.mjs'],{cwd:process.cwd(),encoding:'utf8',env:{...process.env,GITHUB_EVENT_PATH:eventPath,GITHUB_EVENT_NAME:'repository_dispatch',GITHUB_REPOSITORY:'johnkim9524-collab/kaios_enterprise_repo',KIDULTS_NATURAL_CLOCK_APP_LOGIN:login,KIDULTS_NATURAL_CLOCK_SLOT:'P0B',KIDULTS_LIVE_MAIN_SHA:sha,KIDULTS_NATURAL_CLOCK_RECEIPT_PATH:path.join(dir,'receipt.json')}});
}
test('accepts expected app, route and exact main',()=>assert.equal(execute().status,0));
test('rejects another sender',()=>{const r=execute(x=>({...x,sender:{type:'Bot',login:'other[bot]'}}));assert.notEqual(r.status,0);assert.match(r.stderr,/SENDER_INVALID/);});
test('rejects cross-slot delivery',()=>{const r=execute(x=>({...x,client_payload:{...x.client_payload,slot:'RESERVE'}}));assert.notEqual(r.status,0);assert.match(r.stderr,/SLOT_ROUTE_INVALID/);});

const workflows=[
  'kidults-asi-global-any-site-hourly-pooling-v2.yml',
  'kidults-asi-p0b-bounded-discovery-candidates-v1.yml',
  'kidults-asi-sharded-source-reserve-v1.yml',
  'kidults-platform-continuous-assurance-v1.yml',
  'kpmo-continuous-assurance-sentinel-health-v1.yml',
];
function executeMainRead(workflow,{status=0,response=sha}={}){
  const source=fs.readFileSync(`.github/workflows/${workflow}`,'utf8');
  const start=source.indexOf('      - name: Verify independent natural-clock receipt');
  assert.ok(start>=0);
  const end=source.indexOf('\n      - ',start+1);
  const step=source.slice(start,end<0?undefined:end);
  const run=step.slice(step.indexOf('        run: |')+'        run: |'.length)
    .trim().split('\n').map(line=>line.replace(/^          /,'')).join('\n');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'clock-main-read-'));
  try{
    fs.writeFileSync(path.join(dir,'gh'),'#!/bin/bash\nprintf "%s\\n" "$MOCK_RESPONSE"\nexit "$MOCK_STATUS"\n',{mode:0o700});
    fs.writeFileSync(path.join(dir,'node'),'#!/bin/bash\nprintf "INTAKE_REACHED:%s\\n" "$KIDULTS_LIVE_MAIN_SHA"\n',{mode:0o700});
    fs.writeFileSync(path.join(dir,'git'),'#!/bin/bash\nprintf "%s\\n" "$MOCK_CHECKOUT_SHA"\n',{mode:0o700});
    return spawnSync('/bin/bash',['-c',run],{encoding:'utf8',env:{
      PATH:`${dir}:/usr/bin:/bin`,GITHUB_REPOSITORY:'johnkim9524-collab/kaios_enterprise_repo',
      MOCK_RESPONSE:response,MOCK_STATUS:String(status),MOCK_CHECKOUT_SHA:sha,
      KIDULTS_EXACT_SOURCE_SHA:sha,EXPECTED_SHA:sha,
    }});
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
for(const workflow of workflows){
  test(`${workflow}: successful live main reaches intake with exported exact SHA`,()=>{
    const r=executeMainRead(workflow);assert.equal(r.status,0,r.stderr);assert.match(r.stdout,new RegExp(`INTAKE_REACHED:${sha}`));
  });
  for(const [name,options,code] of [
    ['rate-limit failure with empty stdout',{status:1,response:''},'READ_FAILED'],
    ['transport failure with valid-looking stdout',{status:1,response:sha},'READ_FAILED'],
    ['empty successful response',{response:''},'RESPONSE_INVALID'],
    ['non-SHA successful response',{response:'null'},'RESPONSE_INVALID'],
  ])test(`${workflow}: ${name} stops before intake`,()=>{
    const r=executeMainRead(workflow,options);assert.notEqual(r.status,0);
    assert.match(r.stderr,new RegExp(`NATURAL_CLOCK_LIVE_MAIN_${code}`));
    assert.doesNotMatch(r.stdout,/INTAKE_REACHED/);
    assert.doesNotMatch(r.stderr,/EXACT_MAIN_MISMATCH/);
  });
}
