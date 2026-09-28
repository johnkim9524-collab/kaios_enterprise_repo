import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const sha='a'.repeat(40), login='kidults-clock[bot]';
function execute(mutate=x=>x){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'clock-intake-'));
  const event=mutate({action:'kidults.natural.clock.v1',repository:{full_name:'johnkim9524-collab/kaios_enterprise_repo'},sender:{type:'Bot',login},client_payload:{dispatch_id:`kidults-natural-clock-v1:P0B:${sha}:${'n'.repeat(32)}`,exact_main_sha:sha,issued_at:new Date().toISOString(),nonce:'n'.repeat(32),slot:'P0B',source:'AWS_EVENTBRIDGE_SCHEDULER'}});
  const eventPath=path.join(dir,'event.json'); fs.writeFileSync(eventPath,JSON.stringify(event));
  return spawnSync(process.execPath,['scripts/kidults/kpmo/run-natural-clock-intake-v1.mjs'],{cwd:process.cwd(),encoding:'utf8',env:{...process.env,GITHUB_EVENT_PATH:eventPath,GITHUB_EVENT_NAME:'repository_dispatch',GITHUB_REPOSITORY:'johnkim9524-collab/kaios_enterprise_repo',KIDULTS_NATURAL_CLOCK_APP_LOGIN:login,KIDULTS_NATURAL_CLOCK_SLOT:'P0B',KIDULTS_LIVE_MAIN_SHA:sha,KIDULTS_NATURAL_CLOCK_RECEIPT_PATH:path.join(dir,'receipt.json')}});
}
test('accepts expected app, route and exact main',()=>assert.equal(execute().status,0));
test('rejects another sender',()=>{const r=execute(x=>({...x,sender:{type:'Bot',login:'other[bot]'}}));assert.notEqual(r.status,0);assert.match(r.stderr,/SENDER_INVALID/);});
test('rejects cross-slot delivery',()=>{const r=execute(x=>({...x,client_payload:{...x.client_payload,slot:'RESERVE'}}));assert.notEqual(r.status,0);assert.match(r.stderr,/SLOT_ROUTE_INVALID/);});
