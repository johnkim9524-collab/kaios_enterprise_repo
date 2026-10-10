import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {buildTemplates} from '../../scripts/governance/build-resume-broker-template-v1.mjs';
import {readbackStagingBrokerRuntime} from '../../scripts/governance/readback-staging-broker-runtime-v1.mjs';
const templates=buildTemplates();
const input=()=>({templates,template:structuredClone(templates.desired),cutover:['100'],configuration:{function:'kidults-autonomous-event-token-broker-staging',
 timeout:180,runtime:templates.desired.Resources.BrokerFunction.Properties.Runtime,handler:templates.desired.Resources.BrokerFunction.Properties.Handler,
 table:'kidults-autonomous-resume-staging-ledger',activation_run_floor:'100'},env:{GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_ACTOR:'johnkim9524-collab',
 GITHUB_REPOSITORY:'johnkim9524-collab/kaios_enterprise_repo',GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_ID:'200',GITHUB_REF:'refs/heads/main',GITHUB_SHA:'a'.repeat(40),DEPLOY_MAIN_SHA:'a'.repeat(40)}});
test('exact active configuration verifies without claiming live ledger or dispatch',()=>{
 const r=readbackStagingBrokerRuntime(input());assert.equal(r.state,'VERIFIED_PASS');assert.equal(r.resume_template_present,true);
 assert.equal(r.native_ledger_operations_proven,false);assert.equal(r.native_dispatch_proven,false);assert.equal(r.whole_platform_runtime_proven,false);
});
for(const [name,mutate,code] of [
 ['normal template',x=>x.template=templates.original,'RESUME_TEMPLATE_NOT_DEPLOYED'],
 ['disabled cutover',x=>{x.configuration.activation_run_floor='0';x.cutover=['0'];},'CUTOVER_NOT_ACTIVE'],
 ['missing floor',x=>delete x.configuration.activation_run_floor,'CUTOVER_NOT_ACTIVE'],
 ['parameter mismatch',x=>x.cutover=['101'],'CUTOVER_PARAMETER_MISMATCH'],
 ['wrong table',x=>x.configuration.table='other','RESUME_TABLE_CONFIGURATION_MISSING'],
 ['old timeout',x=>x.configuration.timeout=30,'LAMBDA_CONFIGURATION_DRIFT'],
 ['code drift',x=>x.template.Resources.BrokerFunction.Properties.Code.ZipFile='wrong','DEPLOYED_TEMPLATE_DRIFT'],
 ['namespace drift',x=>x.template.Resources.BrokerRole.Properties.Policies.at(-1).PolicyDocument.Statement[0].Condition={},'DEPLOYED_TEMPLATE_DRIFT'],
 ['injection floor',x=>x.configuration.activation_run_floor='100\nSECRET=value','CUTOVER_NOT_ACTIVE']
])test(`bounded readback rejects ${name} and retains failure`,()=>{const x=input();mutate(x);const r=readbackStagingBrokerRuntime(x);
 assert.equal(r.state,'VERIFIED_FAIL');assert.ok(r.failures.includes(code));assert.equal(r.authority_granted,false);assert.ok(!JSON.stringify(r).includes('SECRET='));});
for(const [key,value] of Object.entries({GITHUB_EVENT_NAME:'push',GITHUB_ACTOR:'other',GITHUB_RUN_ATTEMPT:'2',GITHUB_REF:'refs/heads/feature',DEPLOY_MAIN_SHA:'b'.repeat(40)}))
 test(`native context rejects ${key}`,()=>{const x=input();x.env[key]=value;assert.throws(()=>readbackStagingBrokerRuntime(x),/BROKER_READBACK_NATIVE_CONTEXT/);});
test('configuration receipt never serializes unselected configuration secrets',()=>{const x=input();x.configuration.secret='DO_NOT_SERIALIZE';x.configuration.Environment={secret:'DO_NOT_SERIALIZE'};
 assert.ok(!JSON.stringify(readbackStagingBrokerRuntime(x)).includes('DO_NOT_SERIALIZE'));});
test('actual workflow readback branch stops before any CloudFormation mutation',()=>{
 const s=fs.readFileSync('.github/workflows/kidults-autonomous-event-broker-deploy-v1.yml','utf8');
 const branch=s.split('          if [ "$READBACK_ONLY" = true ]; then\n')[2].split('\n          fi')[0].replace(/^            /gm,'');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'broker-readback-'));
 try{
  const commands=path.join(dir,'commands');
  const script=`set -euo pipefail\nassert_current_main(){ :; }\naws(){ printf '%s\\n' "$*" >> "$CALLS"; printf '{}'; }\nnode(){ :; }\n${branch}\nprintf MUTATION_REACHED\n`;
  const r=spawnSync('bash',['--noprofile','--norc','-c',script],{cwd:dir,encoding:'utf8',env:{...process.env,CALLS:commands,STACK_NAME:'kidults-autonomous-event-token-broker-staging',OWNER_TIMEOUT_OPT_IN:'false'}});
  assert.equal(r.status,0,r.stderr);assert.equal(r.stdout,'');const calls=fs.readFileSync(commands,'utf8');
  assert.match(calls,/lambda get-function/);assert.match(calls,/cloudformation describe-stacks/);assert.doesNotMatch(calls,/create-change-set|execute-change-set|update-function|put-role/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('CLI malformed response and native context rejection both preserve bounded terminal failure',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'broker-cli-')),file=path.join(dir,'bad.json'),out=path.join(dir,'receipt.json');
 try{
  for(const bad of ['{malformed',JSON.stringify({Environment:{secret:'NEVER_ECHO_THIS'}})]){
   fs.writeFileSync(file,bad);
   const r=spawnSync(process.execPath,['scripts/governance/readback-staging-broker-runtime-v1.mjs','--template',file,'--configuration',file,'--cutover',file,'--output',out],{encoding:'utf8',env:{...process.env,...input().env,GITHUB_ACTOR:'wrong'}});
   assert.notEqual(r.status,0);const receipt=JSON.parse(fs.readFileSync(out));assert.equal(receipt.state,'VERIFIED_FAIL');
   assert.deepEqual(receipt.failures,['NATIVE_CONTEXT_OR_INPUT_INVALID']);assert.ok(!JSON.stringify(receipt).includes('NEVER_ECHO_THIS'));
  }
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('actual workflow initializes failure before AWS reads and retains it on denial or timeout',()=>{
 const s=fs.readFileSync('.github/workflows/kidults-autonomous-event-broker-deploy-v1.yml','utf8');
 const init=s.split("          trap 'unset CREDS OIDC_JSON OIDC_TOKEN AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_REGION' EXIT\n")[1].split('          test -n "$AWS_ROLE_ARN"')[0].replace(/^          /gm,'');
 const source=path.resolve('scripts/governance/readback-staging-broker-runtime-v1.mjs');
 for(const status of [22,28]){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'broker-read-fail-'));
  try{
   const script=`set -euo pipefail\nnode(){ '${process.execPath}' '${source}' "\${@:2}"; }\n${init}\naws(){ return ${status}; }\naws lambda get-function\nprintf MUTATION_REACHED\n`;
   const r=spawnSync('bash',['--noprofile','--norc','-c',script],{cwd:dir,encoding:'utf8',env:{...process.env,...input().env,READBACK_ONLY:'true'}});
   assert.equal(r.status,status,r.stderr);assert.equal(r.stdout,'');const receipt=JSON.parse(fs.readFileSync(path.join(dir,'out/autonomous-event-broker-deploy-v1/runtime-readback.json')));
   assert.deepEqual(receipt.failures,['NATIVE_READ_OR_VALIDATION_FAILED']);assert.equal(receipt.authority_granted,false);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
 }
});
