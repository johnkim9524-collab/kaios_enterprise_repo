import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';

const required=n=>{const v=process.env[n];if(!v)throw Error('CANARY_ENV_REQUIRED:'+n);return v;};
const canonical=v=>JSON.stringify(v,Object.keys(v).sort());
const digest=v=>'sha256:'+crypto.createHash('sha256').update(String(v)).digest('hex');
const runId=required('GITHUB_RUN_ID'),headSha=required('GITHUB_SHA');
const writer=required('KIDULTS_AUTONOMOUS_LANDING_LEDGER_WRITER_FUNCTION');
const keyArn=required('KIDULTS_AUTONOMOUS_SIGNING_KEY_ARN');
const workloadId=required('KIDULTS_AUTONOMOUS_WORKLOAD_ID');
const environment=required('KIDULTS_AUTONOMOUS_ENVIRONMENT');
const runnerTemp=required('RUNNER_TEMP');
const generation='canonical-canary-'+runId;
const nonceDigest=digest('canonical-canary:'+runId);
let sequence=0;
const aws=(args)=>execFileSync('aws',args,{encoding:'utf8',timeout:30000,env:process.env,stdio:['ignore','pipe','pipe']}).trim();
const sign=core=>{
 const file=path.join(runnerTemp,`canonical-canary-${process.pid}-${++sequence}.bin`);
 try{
  const hash=crypto.createHash('sha256').update(JSON.stringify(core,Object.keys(core).sort())).digest();
  fs.writeFileSync(file,hash,{mode:0o600});
  return aws(['kms','sign','--region','ap-northeast-2','--key-id',keyArn,'--message',`fileb://${file}`,'--message-type','DIGEST','--signing-algorithm','ECDSA_SHA_256','--query','Signature','--output','text']);
 }finally{try{fs.unlinkSync(file)}catch{}}
};
const invoke=(action,extra={},expectFailure=false)=>{
 const base={action,authorization_generation:generation,nonce_digest:nonceDigest,run_id:runId,head_sha:headSha,
  finalizer_workload_id:workloadId,finalizer_environment:environment,signing_key_arn:keyArn,...extra};
 const signed={...base,signature_b64:sign(base)};
 const out=path.join(runnerTemp,`canonical-writer-${process.pid}-${++sequence}.json`);
 try{
  const meta=JSON.parse(aws(['lambda','invoke','--region','ap-northeast-2','--function-name',writer,'--cli-binary-format','raw-in-base64-out','--payload',JSON.stringify(signed),'--output','json',out]));
  const body=JSON.parse(fs.readFileSync(out,'utf8'));
  if(expectFailure){if(!meta.FunctionError)throw Error('CANARY_EXPECTED_FAILURE_MISSING:'+action);return {meta,body};}
  if(meta.FunctionError||body.ok!==true)throw Error('CANARY_WRITER_REJECTED:'+action);
  return body;
 }finally{try{fs.unlinkSync(out)}catch{}}
};
const canonicalKey=digest('canonical-key:'+runId);
const now=Math.floor(Date.now()/1000);
const lease=now+300;
const receiptDigest=digest('canonical-receipt:'+runId);
const leader=invoke('CREATE_CANONICAL_CLAIM',{canonical_key:canonicalKey,lease_expires_at_epoch:String(lease)});
invoke('CREATE_CANONICAL_CLAIM',{canonical_key:canonicalKey,lease_expires_at_epoch:String(lease)},true);
const committed=invoke('COMMIT_CANONICAL_CLAIM',{canonical_key:canonicalKey,canonical_receipt_digest:receiptDigest,lease_epoch:'1',now_epoch:String(now)});
const aliasRun=(BigInt(runId)+1n).toString();
invoke('CREATE_CANONICAL_ALIAS',{canonical_key:canonicalKey,canonical_receipt_digest:digest('wrong'),canonical_run_id:runId,alias_run_id:aliasRun},true);
const alias=invoke('CREATE_CANONICAL_ALIAS',{canonical_key:canonicalKey,canonical_receipt_digest:receiptDigest,canonical_run_id:runId,alias_run_id:aliasRun});
const receipt={id:'kidults-durable-canonical-ledger-canary-v1',state:'VERIFIED_PASS',generation,canonical_key:canonicalKey,
 leader_state:leader.state,committed_state:committed.state,alias_state:alias.state,duplicate_claim_rejected:true,wrong_alias_rejected:true,
 exact_main_sha:headSha,run_id:runId,production:'HOLD',public:'HOLD',g5:'HOLD'};
fs.mkdirSync('out/durable-canonical-ledger-canary-v1',{recursive:true});
fs.writeFileSync('out/durable-canonical-ledger-canary-v1/receipt.json',JSON.stringify(receipt,null,2)+'\n');
process.stdout.write(JSON.stringify(receipt)+'\n');
