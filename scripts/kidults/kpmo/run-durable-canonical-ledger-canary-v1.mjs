import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';

const digest=value=>'sha256:'+crypto.createHash('sha256').update(String(value)).digest('hex');
const fail=code=>{const error=new Error(code);error.code=code;throw error;};
const required=name=>{const value=process.env[name];if(!value)fail('CANARY_ENV_REQUIRED');return value;};
const output='out/durable-canonical-ledger-canary-v1/receipt.json';
let stage='VALIDATE_EXECUTION_BINDING',sequence=0;
const responseEvidence=[];
const receipt={id:'kidults-durable-canonical-ledger-canary-v1',version:'1.1.0',state:'VERIFIED_FAIL',
 duplicate_claim_rejected:false,wrong_alias_rejected:false,
 evidence_scope:'LEDGER_CONTROL_CANARY_NOT_BUSINESS_RUNTIME',business_runtime_proven:false,
 production:'HOLD',public:'HOLD',g5:'HOLD'};
const aws=args=>execFileSync('aws',args,{encoding:'utf8',timeout:30000,env:process.env,stdio:['ignore','pipe','pipe']}).trim();
try{
 const runId=required('GITHUB_RUN_ID'),headSha=required('GITHUB_SHA');
 if(!/^[1-9][0-9]{0,19}$/.test(runId)||!/^[a-f0-9]{40}$/.test(headSha))fail('CANARY_EXECUTION_BINDING_INVALID');
 const writer=required('KIDULTS_AUTONOMOUS_LANDING_LEDGER_WRITER_FUNCTION');
 const keyArn=required('KIDULTS_AUTONOMOUS_SIGNING_KEY_ARN');
 const workloadId=required('KIDULTS_AUTONOMOUS_WORKLOAD_ID');
 const environment=required('KIDULTS_AUTONOMOUS_ENVIRONMENT');
 const runnerTemp=required('RUNNER_TEMP');
 const generation='canonical-canary-'+runId,nonceDigest=digest('canonical-canary:'+runId);
 const canonicalKey=digest('canonical-key:'+runId),expectedPk='CANONICAL#'+generation+'#'+canonicalKey;
 Object.assign(receipt,{generation,canonical_key:canonicalKey,exact_main_sha:headSha,run_id:runId});
 const sign=core=>{
  const file=path.join(runnerTemp,`canonical-canary-${process.pid}-${++sequence}.bin`);
  try{
   const hash=crypto.createHash('sha256').update(JSON.stringify(core,Object.keys(core).sort())).digest();
   fs.writeFileSync(file,hash,{mode:0o600});
   return aws(['kms','sign','--region','ap-northeast-2','--key-id',keyArn,'--message',`fileb://${file}`,'--message-type','DIGEST','--signing-algorithm','ECDSA_SHA_256','--query','Signature','--output','text']);
  }finally{try{fs.unlinkSync(file)}catch{}}
 };
 const invoke=(action,extra={},expectFailure=null)=>{
  const base={action,authorization_generation:generation,nonce_digest:nonceDigest,run_id:runId,head_sha:headSha,
   finalizer_workload_id:workloadId,finalizer_environment:environment,signing_key_arn:keyArn,...extra};
  const signed={...base,signature_b64:sign(base)};
  const out=path.join(runnerTemp,`canonical-writer-${process.pid}-${++sequence}.json`);
  try{
   const meta=JSON.parse(aws(['lambda','invoke','--region','ap-northeast-2','--function-name',writer,'--cli-binary-format','raw-in-base64-out','--payload',JSON.stringify(signed),'--output','json',out]));
   if(meta.StatusCode!==200)fail('CANARY_INVOKE_STATUS_INVALID');
   if(fs.statSync(out).size>1048576)fail('CANARY_RESPONSE_TOO_LARGE');
   const body=JSON.parse(fs.readFileSync(out,'utf8'));
   if(expectFailure){
    if(!['Handled','Unhandled'].includes(meta.FunctionError))fail('CANARY_EXPECTED_FAILURE_MISSING');
    const duplicate=expectFailure==='DUPLICATE_CLAIM'
     &&body.errorType==='ConditionalCheckFailedException'
     &&typeof body.errorMessage==='string'
     &&/^An error occurred \(ConditionalCheckFailedException\) when calling the PutItem operation:/.test(body.errorMessage);
    const wrongAlias=expectFailure==='WRONG_ALIAS'
     &&body.errorType==='ValueError'&&body.errorMessage==='CANONICAL_ALIAS_BINDING_INVALID';
    if(!duplicate&&!wrongAlias)fail('CANARY_EXPECTED_FAILURE_CLASS_MISMATCH');
    responseEvidence.push({stage,action,outcome:'EXPECTED_REJECTION_VERIFIED',response_digest:digest(JSON.stringify(body))});
    return;
   }
   if(meta.FunctionError||body.ok!==true)fail('CANARY_WRITER_REJECTED');
   const expectedState={CREATE_CANONICAL_CLAIM:'LEASED',COMMIT_CANONICAL_CLAIM:'COMMITTED',CREATE_CANONICAL_ALIAS:'DEDUPED_ALIAS'}[action];
   if(body.action!==action||body.pk!==expectedPk||body.state!==expectedState
     ||(action==='CREATE_CANONICAL_CLAIM'&&(body.sk!=='CLAIM'||body.lease_epoch!==1))
     ||(action==='COMMIT_CANONICAL_CLAIM'&&body.lease_epoch!==1))fail('CANARY_WRITER_RESPONSE_BINDING_INVALID');
   responseEvidence.push({stage,action,outcome:'SUCCESS_RESPONSE_VERIFIED',response_digest:digest(JSON.stringify(body))});
   return body;
  }finally{try{fs.unlinkSync(out)}catch{}}
 };
 const lease=Math.floor(Date.now()/1000)+300,receiptDigest=digest('canonical-receipt:'+runId);
 stage='CREATE_CLAIM';
 const leader=invoke('CREATE_CANONICAL_CLAIM',{canonical_key:canonicalKey,lease_expires_at_epoch:String(lease)});
 receipt.leader_state=leader.state;
 stage='DUPLICATE_CLAIM_NEGATIVE';
 invoke('CREATE_CANONICAL_CLAIM',{canonical_key:canonicalKey,lease_expires_at_epoch:String(lease)},'DUPLICATE_CLAIM');
 receipt.duplicate_claim_rejected=true;
 stage='COMMIT_CLAIM';
 const committed=invoke('COMMIT_CANONICAL_CLAIM',{canonical_key:canonicalKey,canonical_receipt_digest:receiptDigest,lease_epoch:'1',now_epoch:String(Math.floor(Date.now()/1000))});
 receipt.committed_state=committed.state;
 const aliasRun=(BigInt(runId)+1n).toString();
 stage='WRONG_ALIAS_NEGATIVE';
 invoke('CREATE_CANONICAL_ALIAS',{canonical_key:canonicalKey,canonical_receipt_digest:digest('wrong'),canonical_run_id:runId,alias_run_id:aliasRun},'WRONG_ALIAS');
 receipt.wrong_alias_rejected=true;
 stage='CREATE_ALIAS';
 const alias=invoke('CREATE_CANONICAL_ALIAS',{canonical_key:canonicalKey,canonical_receipt_digest:receiptDigest,canonical_run_id:runId,alias_run_id:aliasRun});
 receipt.alias_state=alias.state;
 receipt.state='VERIFIED_PASS';
}catch(error){
 // Never copy provider error text, payloads, command lines, environment or KMS
 // material into the receipt. Preserve the first failed stage without retry.
 receipt.failed_stage=stage;
 receipt.failure_code=typeof error?.code==='string'&&/^CANARY_[A-Z_]+$/.test(error.code)
  ?error.code:error instanceof SyntaxError?'CANARY_RESPONSE_JSON_INVALID':'CANARY_EXECUTION_FAILED';
 process.exitCode=1;
}
receipt.response_evidence=responseEvidence;
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
process.stdout.write(JSON.stringify(receipt)+'\n');
