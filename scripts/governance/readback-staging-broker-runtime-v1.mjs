import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {buildTemplates} from './build-resume-broker-template-v1.mjs';
const canonical=v=>Array.isArray(v)?v.map(canonical):v && typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const stable=v=>JSON.stringify(canonical(v));
const digest=v=>`sha256:${createHash('sha256').update(stable(v)).digest('hex')}`;
export function readbackStagingBrokerRuntime({template,configuration,cutover,env,templates=buildTemplates()}){
 const unwrap=v=>typeof v==='string'?JSON.parse(v):v;
 template=unwrap(template);
 const failures=[];
 const sha=env.GITHUB_SHA;
 if(env.GITHUB_EVENT_NAME!=='workflow_dispatch'||env.GITHUB_ACTOR!=='johnkim9524-collab'||env.GITHUB_REPOSITORY!=='johnkim9524-collab/kaios_enterprise_repo'
  ||env.GITHUB_RUN_ATTEMPT!=='1'||env.GITHUB_REF!=='refs/heads/main'||! /^[a-f0-9]{40}$/.test(sha||'')||env.DEPLOY_MAIN_SHA!==sha
  ||! /^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID||''))throw Error('BROKER_READBACK_NATIVE_CONTEXT');
 const hasResume=Object.hasOwn(template?.Resources||{},'ResumeOperationTable');
 const expected=hasResume?templates.desired:templates.original;
 if(stable(template)!==stable(expected))failures.push('DEPLOYED_TEMPLATE_DRIFT');
 if(configuration?.function!=='kidults-autonomous-event-token-broker-staging'||configuration?.timeout!==180
  ||configuration?.runtime!==expected.Resources.BrokerFunction.Properties.Runtime||configuration?.handler!==expected.Resources.BrokerFunction.Properties.Handler)failures.push('LAMBDA_CONFIGURATION_DRIFT');
 if(!hasResume)failures.push('RESUME_TEMPLATE_NOT_DEPLOYED');
 const floor=configuration?.activation_run_floor;
 if(configuration?.table!=='kidults-autonomous-resume-staging-ledger')failures.push('RESUME_TABLE_CONFIGURATION_MISSING');
 if(typeof floor!=='string'||! /^[1-9][0-9]{0,19}$/.test(floor))failures.push('CUTOVER_NOT_ACTIVE');
 if(!Array.isArray(cutover)||cutover.length!==1||cutover[0]!==floor)failures.push('CUTOVER_PARAMETER_MISMATCH');
 const receipt={id:'kidults-staging-broker-runtime-readback-v1',version:'1.0.0',state:failures.length?'VERIFIED_FAIL':'VERIFIED_PASS',
  repository:env.GITHUB_REPOSITORY,workflow_sha:sha,run_id:env.GITHUB_RUN_ID,run_attempt:1,operation:'READ_ONLY_STAGING_BROKER_CONFIGURATION',
  template_sha256:digest(template),resume_template_present:hasResume,timeout_seconds:typeof configuration?.timeout==='number'?configuration.timeout:null,
  resume_table_configuration_verified:configuration?.table==='kidults-autonomous-resume-staging-ledger',
  activation_run_floor:typeof floor==='string'&&/^[0-9]{1,20}$/.test(floor)?floor:null,failures,
  native_ledger_operations_proven:false,native_dispatch_proven:false,whole_platform_runtime_proven:false,
  authority_granted:false,production:'HOLD',public:'HOLD',g5:'HOLD'};
 return {...receipt,receipt_sha256:digest(receipt)};
}
export function failedReadbackReceipt(env,code){
 const receipt={id:'kidults-staging-broker-runtime-readback-v1',version:'1.0.0',state:'VERIFIED_FAIL',
  repository:'johnkim9524-collab/kaios_enterprise_repo',workflow_sha:/^[a-f0-9]{40}$/.test(env.GITHUB_SHA||'')?env.GITHUB_SHA:null,
  run_id:/^[1-9][0-9]{0,19}$/.test(env.GITHUB_RUN_ID||'')?env.GITHUB_RUN_ID:null,run_attempt:1,
  operation:'READ_ONLY_STAGING_BROKER_CONFIGURATION',failures:[code],
  native_ledger_operations_proven:false,native_dispatch_proven:false,whole_platform_runtime_proven:false,
  authority_granted:false,production:'HOLD',public:'HOLD',g5:'HOLD'};
 return {...receipt,receipt_sha256:digest(receipt)};
}
if(process.argv[1]?.endsWith('/readback-staging-broker-runtime-v1.mjs')){
 const args=process.argv.slice(2),value=f=>{const i=args.indexOf(f);if(i<0||!args[i+1])throw Error('BROKER_READBACK_ARGUMENT');return args[i+1];};
 const output=value('--output'),write=r=>fs.writeFileSync(output,JSON.stringify(r,null,2)+'\n');
 if(args.includes('--initialize'))write(failedReadbackReceipt(process.env,'READBACK_NOT_STARTED'));
 else if(args.includes('--record-failure')){
  let prior;try{prior=JSON.parse(fs.readFileSync(output,'utf8'));}catch{}
  if(prior?.state!=='VERIFIED_FAIL'||prior.failures?.includes('READBACK_NOT_STARTED'))write(failedReadbackReceipt(process.env,'NATIVE_READ_OR_VALIDATION_FAILED'));
 }else{
  let r;
  try{
   const read=f=>JSON.parse(fs.readFileSync(value(f),'utf8'));
   r=readbackStagingBrokerRuntime({template:read('--template'),configuration:read('--configuration'),cutover:read('--cutover'),env:process.env});
  }catch{r=failedReadbackReceipt(process.env,'NATIVE_CONTEXT_OR_INPUT_INVALID');}
  write(r);console.log(JSON.stringify({state:r.state,failures:r.failures,runtime_health_proven:false}));
  if(r.state!=='VERIFIED_PASS')process.exitCode=1;
 }
}
