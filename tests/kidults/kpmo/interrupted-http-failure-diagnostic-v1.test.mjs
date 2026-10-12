import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {githubHttpFailureDiagnostic} from '../../../scripts/kidults/kpmo/lib/github-http-failure-diagnostic-v1.mjs';
const diag=(headers={},message='private message',status=403)=>githubHttpFailureDiagnostic({apiPath:'/actions/runs/38187913321?private=secret',response:{status,headers:new Headers(headers)},payload:{message,token:'private token'}});
test('primary quota headers retain exact reset and actual five-component request id',()=>{
 const d=diag({'x-ratelimit-limit':'1000','x-ratelimit-remaining':'0','x-ratelimit-reset':'1791766800','x-ratelimit-resource':'core','retry-after':'60','x-github-request-id':'9C10:1674:2257EAA:28ED415:6ACC1083'});
 assert.equal(d.classification,'PRIMARY_RATE_LIMIT_EXHAUSTED');assert.equal(d.endpoint,'ACTION_RUN_READBACK');assert.equal(d.rate_limit,1000);assert.equal(d.rate_reset_epoch,1791766800);assert.equal(d.retry_after_seconds,60);assert.equal(d.request_id,'9C10:1674:2257EAA:28ED415:6ACC1083');assert.equal(d.retry_authorized,false);assert.equal(d.actual_authority_granted,false);assert.equal(JSON.stringify(d).includes('private'),false);
});
test('only registered server messages classify secondary limit and integration denial',()=>{
 assert.equal(diag({},'You have exceeded a secondary rate limit. private details').classification,'SECONDARY_RATE_LIMIT_REPORTED');
 assert.equal(diag({},'Resource not accessible by integration').classification,'INTEGRATION_ACCESS_DENIED_REPORTED');
 assert.equal(diag({},'permission problem private').classification,'HTTP_FAILURE_CAUSE_UNVERIFIED');
 assert.equal(diag({},'private',429).classification,'HTTP_THROTTLED');
});
test('invalid metadata and hostile header values are omitted',()=>{
 const d=diag({'x-ratelimit-limit':'-1','x-ratelimit-remaining':'0 secret','x-ratelimit-reset':'999999999999','retry-after':'https://private/secret','x-ratelimit-resource':'private token','x-github-request-id':'private-token'});
 for(const key of ['rate_limit','rate_remaining','rate_reset_epoch','rate_reset_at','retry_after_seconds','rate_resource','request_id'])assert.equal(d[key],null,key);
 assert.equal(d.classification,'HTTP_FAILURE_CAUSE_UNVERIFIED');assert.equal(JSON.stringify(d).includes('private'),false);
});
test('real CLI retains first readback403 and failed status publication separately without retry/window',()=>{
 const root=process.cwd(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'handoff-http-regression-'));
 try{
  const receiptPath=path.join(dir,'receipt.json'),callsPath=path.join(dir,'calls.jsonl'),preload=path.join(dir,'trusted-fetch-fixture.mjs');
  fs.writeFileSync(preload,`import fs from 'node:fs';globalThis.fetch=async(url,options)=>{const p=new URL(url).pathname;fs.appendFileSync(${JSON.stringify(callsPath)},JSON.stringify({path:p,method:options.method||'GET'})+'\\n');if(p.endsWith('/actions/runs/38187913321')||(options.method==='POST'&&JSON.parse(options.body).state==='failure'))return new Response(JSON.stringify({message:'private response token',documentation_url:'private'}),{status:403,headers:{'x-ratelimit-remaining':'0','x-ratelimit-reset':'1791766800','x-github-request-id':'9C10:1674:2257EAA:28ED415:6ACC1083'}});const payload=p.endsWith('/check-runs')?{check_runs:[]}:/\\/(files|timeline|comments)$/.test(p)?[]:{};return new Response(JSON.stringify(payload),{status:options.method==='POST'?201:200});};`);
  const sha='a'.repeat(40),env={...process.env,GH_TOKEN:'private token',GH_REPOSITORY:'johnkim9524-collab/kaios_enterprise_repo',PR_NUMBER:'2664',EXPECTED_HEAD_SHA:sha,EXPECTED_BASE_SHA:'b'.repeat(40),EXPECTED_HEAD_TREE_SHA:'c'.repeat(40),HANDOFF_AUTHORIZATION_ID:'DIRECT-PR-2664-'+sha.slice(0,12),HANDOFF_PURPOSE:'WRITER_FAILURE_DIAGNOSTIC_RECOVERY',LANDING_ACTOR:'johnkim9524-collab',GITHUB_REF:'refs/heads/main',GITHUB_RUN_ID:'38187913321',GITHUB_RUN_ATTEMPT:'1',HANDOFF_RECEIPT_PATH:receiptPath};delete env.NODE_OPTIONS;
  const r=spawnSync(process.execPath,['--import',pathToFileURL(preload).href,'scripts/kidults/kpmo/run-direct-owner-landing-handoff-v1.mjs'],{cwd:root,env,encoding:'utf8',timeout:30000});
  assert.equal(r.status,1);assert.match(r.stderr,/DIRECT_OWNER_HANDOFF_GITHUB_API_403/);
  const receipt=JSON.parse(fs.readFileSync(receiptPath));assert.equal(receipt.state,'VERIFIED_FAIL');assert.equal(receipt.http_diagnostic.endpoint,'ACTION_RUN_READBACK');assert.equal(receipt.failure_status_publish_diagnostic.endpoint,'PUBLISH_STATUS');assert.equal(receipt.http_diagnostic.classification,'PRIMARY_RATE_LIMIT_EXHAUSTED');assert.equal(receipt.merge_performed_by_workflow,false);assert.equal(receipt.handoff_opened_at,undefined);assert.equal(JSON.stringify(receipt).includes('private'),false);
  const calls=fs.readFileSync(callsPath,'utf8').trim().split('\n').map(JSON.parse);assert.equal(calls.filter(c=>c.path.endsWith('/actions/runs/38187913321')).length,1);assert.equal(calls.filter(c=>c.method==='POST').length,2);assert.equal(calls.some(c=>c.path.endsWith('/merge')),false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
