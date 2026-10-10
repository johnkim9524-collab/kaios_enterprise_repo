import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const source=fs.readFileSync('scripts/kidults/kpmo/run-protected-lifecycle-operation-v1.sh','utf8');
const repository='johnkim9524-collab/kaios_enterprise_repo';
const binding={pull_request:42,old_base_sha:'a'.repeat(40),expected_head_sha:'b'.repeat(40),current_main_sha:'c'.repeat(40),changed_paths:['src/a.js']};
const target=[42,binding.old_base_sha,binding.expected_head_sha,binding.current_main_sha].join(':');
const valid={ok:true,state:'EXECUTED_VERIFIED',receipt:{id:'kidults-broker-lifecycle-receipt-v1',state:'VERIFIED_PASS',signature:'protected-test-signature',
  binding:{repository,operation_kind:'STALE_BASE_CONVERGENCE',exact_target:target},production:'HOLD',public:'HOLD',g5:'HOLD'}};
const mocks=String.raw`
curl(){ [[ "$CASE" != oidc_transport ]] || return 7; printf '%s' "$OIDC_BODY"; }
aws(){
  if [[ "$1" == sts ]]; then
    [[ "$CASE" != sts_failed ]] || return 7
    printf '%s' "$CREDS_BODY"
  else
    echo invoke >> trace
    [[ "$CASE" != invoke_failed ]] || return 7
    local output; for output; do :; done
    printf '%s' "$BROKER_BODY" > "$output"
    printf '%s' "$METADATA_BODY"
  fi
}
export -f curl aws
`;
for(const [name,options] of [
  ['success',{}],['reuse',{response:{...valid,state:'REUSED_SUCCESS'}}],
  ['oidc_transport',{}],['oidc_invalid',{oidc:'{"value":null}'}],['sts_failed',{}],['sts_partial',{creds:'key secret'}],
  ['sts_extra',{creds:'key secret session extra'}],['sts_none',{creds:'None secret session'}],['invoke_failed',{}],
  ['function_error',{metadata:'{"StatusCode":200,"FunctionError":"Unhandled"}'}],['metadata_invalid',{metadata:'invalid'}],
  ['body_invalid',{raw:'invalid'}],['hold',{response:{...valid,ok:false,state:'HOLD_RECONCILE'}}],
  ['wrong_target',{response:{...valid,receipt:{...valid.receipt,binding:{...valid.receipt.binding,exact_target:'wrong'}}}}],
  ['exposed_token',{response:{...valid,token:'must-not-escape'}}],
])test(`protected lifecycle actual shell ${name}`,()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'protected-lifecycle-'));
  try{
    fs.writeFileSync(path.join(root,'operation.sh'),source);
    const result=spawnSync('bash',['--noprofile','--norc','-c',`${mocks}\nbash operation.sh "$BINDING" STALE_BASE_CONVERGENCE receipt.json`],{
      cwd:root,encoding:'utf8',timeout:10000,env:{PATH:process.env.PATH,CASE:name,BINDING:JSON.stringify(binding),OIDC_BODY:options.oidc||'{"value":"OFFLINE_OIDC"}',
        CREDS_BODY:options.creds||'key secret session',BROKER_BODY:options.raw||JSON.stringify(options.response||valid),METADATA_BODY:options.metadata||'{"StatusCode":200}',
        GITHUB_REPOSITORY:repository,GITHUB_REPOSITORY_ID:'123',GITHUB_RUN_ID:'101',GITHUB_RUN_ATTEMPT:'1',AWS_ROLE_ARN:'offline',BROKER_FUNCTION:'offline',
        ACTIONS_ID_TOKEN_REQUEST_TOKEN:'offline',ACTIONS_ID_TOKEN_REQUEST_URL:'https://offline.invalid/token'}});
    assert.ifError(result.error);
    const receipt=JSON.parse(fs.readFileSync(path.join(root,'receipt.json')));
    if(['success','reuse'].includes(name)){assert.equal(result.status,0,result.stderr);assert.equal(receipt.ok,true);}
    else{assert.notEqual(result.status,0,name);assert.equal(receipt.state,'HOLD_RECONCILE');assert.equal(receipt.retry_without_reconciliation,false);}
    const invokes=fs.existsSync(path.join(root,'trace'))?fs.readFileSync(path.join(root,'trace'),'utf8').trim().split('\n').length:0;
    assert.ok(invokes<=1);assert.equal(result.stdout,'');
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
