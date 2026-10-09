import test from 'node:test';
import assert from 'node:assert/strict';
import {POSTMERGE_RECOVERY_INCIDENT as I,buildPostmergeRecoveryRequest} from '../../../scripts/kidults/kpmo/lib/autonomous-postmerge-recovery-v1.mjs';
import {createRecoveryGitHubObservation} from '../../../scripts/kidults/kpmo/lib/postmerge-recovery-github-observation-v1.mjs';

const SHA='1d7981f6c09e2b7ad52fe5a819c59a54ea01525c';
const NOW=Date.parse('2026-10-03T22:40:00Z');
function fixture(){
  const repo={full_name:I.repository,id:Number(I.repository_id)};
  const request=buildPostmergeRecoveryRequest({sourceSha:SHA,issuedAt:'2026-10-03T22:39:00Z',expiresAt:'2026-10-03T22:59:00Z'});
  const reservation={authorization_generation:I.original_generation,nonce_digest:I.original_nonce_digest,run_id:I.original_run_id,head_sha:I.original_head_sha,state:'RESERVED'};
  const f={request,reservation,calls:[],branchReads:0,http:200,invalidJson:false,oversized:false,secondMain:null};
  f.responses={
    '':repo,'branches/main':{name:'main',protected:true,commit:{sha:SHA}},
    [`actions/runs/${I.original_run_id}`]:{id:Number(I.original_run_id),status:'completed',conclusion:'cancelled',run_attempt:1,event:'repository_dispatch',head_sha:I.original_base_sha,path:'.github/workflows/kidults-autonomous-independent-verification-authorization-v1.yml',repository:repo},
    [`pulls/${I.pull_request}`]:{number:I.pull_request,merged:true,merge_commit_sha:I.original_merge_sha,head:{sha:I.original_head_sha,repo},base:{sha:I.original_base_sha,repo}},
    [`git/commits/${I.original_merge_sha}`]:{sha:I.original_merge_sha,tree:{sha:I.original_tree_sha},parents:[{sha:I.original_base_sha},{sha:I.original_head_sha}]},
    [`compare/${I.original_merge_sha}...${SHA}`]:{base_commit:{sha:I.original_merge_sha},merge_base_commit:{sha:I.original_merge_sha},behind_by:0,status:'ahead'},
  };
  f.fetch=async(url,options)=>{
    assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer fixture-token');
    assert.equal(options.headers['X-GitHub-Api-Version'],'2022-11-28');
    const prefix=`https://api.github.com/repos/${I.repository}`;assert.ok(url===prefix||url.startsWith(prefix+'/'));
    const fullRoute=url.slice(prefix.length).replace(/^\//,'');f.calls.push(fullRoute);
    if(fullRoute.startsWith('compare/'))assert.ok(fullRoute.endsWith('?per_page=1&page=2'));
    const route=fullRoute.split('?')[0];
    if(route==='branches/main')f.branchReads++;
    const data=route==='branches/main'&&f.branchReads===2&&f.secondMain?f.secondMain:f.responses[route];
    assert.ok(data,'unexpected route '+route);
    const body=f.oversized?'x'.repeat(1048577):f.invalidJson?'invalid-json':JSON.stringify(data);
    return new Response(body,{status:f.http,headers:{'content-type':'application/json'}});
  };
  f.run=()=>createRecoveryGitHubObservation({token:'fixture-token',fetchImpl:f.fetch,now:()=>NOW}).observe(f.request,f.reservation);
  return f;
}
test('authenticated read-only observation binds exact root, main and merge ancestry',async()=>{
  const f=fixture(),observed=await f.run();assert.equal(observed.main_sha,SHA);assert.equal(observed.original_merge_to_main.head_sha,SHA);
  assert.equal(f.branchReads,2);assert.equal(f.calls.length,7);assert.equal(observed.reservation.run_id,I.original_run_id);
});
for(const [name,mutate,code] of [
  ['repository substitution',f=>f.responses[''].id=1,'RECOVERY_REPOSITORY'],
  ['unprotected main',f=>f.responses['branches/main'].protected=false,'RECOVERY_MAIN_IDENTITY'],
  ['original run restarted',f=>f.responses[`actions/runs/${I.original_run_id}`].run_attempt=2,'RECOVERY_ORIGINAL_RUN_NOT_FENCED'],
  ['original run still active',f=>f.responses[`actions/runs/${I.original_run_id}`].status='in_progress','RECOVERY_ORIGINAL_RUN_NOT_FENCED'],
  ['merge parent reversal',f=>f.responses[`git/commits/${I.original_merge_sha}`].parents.reverse(),'RECOVERY_MERGE_TREE_OR_PARENT_DRIFT'],
  ['merge tree drift',f=>f.responses[`git/commits/${I.original_merge_sha}`].tree.sha='b'.repeat(40),'RECOVERY_MERGE_TREE_OR_PARENT_DRIFT'],
  ['main ancestry drift',f=>f.responses[`compare/${I.original_merge_sha}...${SHA}`].behind_by=1,'RECOVERY_MAIN_NOT_DESCENDANT'],
  ['closed unmerged PR',f=>f.responses[`pulls/${I.pull_request}`].merged=false,'RECOVERY_MERGED_PR_BINDING'],
  ['main changes during observation',f=>f.secondMain={name:'main',protected:true,commit:{sha:'b'.repeat(40)}},'RECOVERY_MAIN_CHANGED_DURING_OBSERVATION'],
  ['HTTP 503',f=>f.http=503,'RECOVERY_GITHUB_HTTP_503'],
  ['invalid JSON',f=>f.invalidJson=true,'RECOVERY_GITHUB_INVALID_JSON'],
  ['response overflow',f=>f.oversized=true,'RECOVERY_GITHUB_RESPONSE_BOUND'],
  ['source drift',f=>f.request=buildPostmergeRecoveryRequest({sourceSha:'b'.repeat(40),issuedAt:f.request.issued_at,expiresAt:f.request.expires_at}),'RECOVERY_SOURCE_DRIFT'],
])test(`reject ${name}`,async()=>{const f=fixture();mutate(f);await assert.rejects(f.run(),new RegExp(code));});
test('expired pre-consume request makes no HTTP request',async()=>{
  const f=fixture();f.request=buildPostmergeRecoveryRequest({sourceSha:SHA,issuedAt:'2026-10-03T21:00:00Z',expiresAt:'2026-10-03T21:20:00Z'});
  await assert.rejects(f.run(),/RECOVERY_AUTHORITY_EXPIRED/);assert.equal(f.calls.length,0);
});
test('consumed historical sealing requires protected main descendant proof of consumed source',async()=>{
  const f=fixture(),prior='b'.repeat(40);f.reservation.state='CONSUMED';
  f.request=buildPostmergeRecoveryRequest({sourceSha:prior,issuedAt:'2026-10-03T21:00:00Z',expiresAt:'2026-10-03T21:20:00Z'});
  f.responses[`compare/${prior}...${SHA}`]={base_commit:{sha:prior},merge_base_commit:{sha:prior},behind_by:0,status:'ahead'};
  const observed=await f.run();assert.equal(observed.recovery_source_to_main.head_sha,SHA);
  f.responses[`compare/${prior}...${SHA}`].behind_by=1;
  await assert.rejects(f.run(),/RECOVERY_CONSUMED_HISTORY_NOT_DESCENDANT/);
});
