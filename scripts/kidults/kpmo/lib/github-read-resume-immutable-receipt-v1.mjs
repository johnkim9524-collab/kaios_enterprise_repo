import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {canonicalJson,sha256} from './canonical-json-v1.mjs';

const requireReceipt=(ok,code)=>{if(!ok)throw new Error(`GITHUB_READ_RESUME_IMMUTABLE_${code}`);};
const awsCli=args=>{
  try{return JSON.parse(execFileSync('aws',args,
    {encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe']}));}
  catch(error){
    const match=String(error.stderr||'').match(/An error occurred \(([^)]+)\) when calling/);
    if(match)error.aws_code=match[1];
    throw error;
  }
};
const checksum=bytes=>Buffer.from(sha256(bytes).slice(7),'hex').toString('base64');

export function githubReadResumeReceiptKey(receipt){
  requireReceipt(receipt?.id==='kidults-github-read-resume-terminal-receipt-v1','ID');
  const original=receipt.original,consumer=receipt.consumer;
  requireReceipt(/^[1-9][0-9]{0,19}$/.test(String(original?.run_id))&&Number.isSafeInteger(original?.run_attempt)
    &&original.run_attempt>=1&&/^[a-f0-9]{40}$/.test(original?.source_sha||''),'ORIGINAL_BINDING');
  requireReceipt(/^[1-9][0-9]{0,19}$/.test(String(consumer?.run_id))&&Number.isSafeInteger(consumer?.run_attempt)
    &&consumer.run_attempt>=1&&/^[a-f0-9]{40}$/.test(receipt.exact_main_sha||''),'CONSUMER_BINDING');
  return `receipts/read-resume/${original.run_id}/${original.run_attempt}/${receipt.exact_main_sha}/${consumer.run_id}-${consumer.run_attempt}.json`;
}

export async function sealGithubReadResumeReceipt({receipt,bucket,keyArn,aws=awsCli,tempRoot=os.tmpdir(),now=()=>new Date()}){
  const requireProof=requireReceipt;
  requireProof(receipt?.state==='READ_RESUME_TERMINAL','STATE');
  requireProof(typeof bucket==='string'&&/^kidults-autonomous-[a-z0-9-]+$/.test(bucket),'BUCKET');
  requireProof(/^arn:aws:kms:ap-northeast-2:528314240275:key\/[A-Za-z0-9-]+$/.test(keyArn||''),'KEY');
  const key=githubReadResumeReceiptKey(receipt);
  const {receipt_digest,...core}=receipt;
  requireProof(receipt_digest===sha256(canonicalJson(core)),'DIGEST');
  const bytes=Buffer.from(`${canonicalJson(receipt)}\n`,'utf8');
  requireProof(bytes.length<=49152,'PAYLOAD_BOUND');
  const expectedChecksum=checksum(bytes);
  const issued=new Date(receipt.created_at);
  requireProof(Number.isFinite(issued.getTime())&&issued.toISOString()===receipt.created_at,'CREATED_AT');
  issued.setUTCFullYear(issued.getUTCFullYear()+10);
  issued.setTime(Math.ceil(issued.getTime()/1000)*1000);
  const directory=fs.mkdtempSync(path.join(tempRoot,'kidults-read-resume-receipt-'));
  fs.chmodSync(directory,0o700);
  const body=path.join(directory,'receipt.json');
  fs.writeFileSync(body,bytes,{mode:0o600,flag:'wx'});
  const call=args=>aws([...args,'--region','ap-northeast-2','--output','json']);
  const verify=async version=>{
    const head=await call(['s3api','head-object','--bucket',bucket,'--key',key,'--checksum-mode','ENABLED',...(version?['--version-id',version]:[])]);
    requireProof(typeof head.VersionId==='string'&&head.VersionId.length>0&&(!version||head.VersionId===version),'VERSION');
    requireProof(head.ContentLength===bytes.length&&head.ChecksumSHA256===expectedChecksum,'CHECKSUM');
    requireProof(head.ObjectLockMode==='COMPLIANCE'&&Date.parse(head.ObjectLockRetainUntilDate)>=issued.getTime(),'RETENTION');
    requireProof(head.ServerSideEncryption==='aws:kms'&&head.SSEKMSKeyId===keyArn,'ENCRYPTION');
    const output=path.join(directory,'readback.json');
    await call(['s3api','get-object','--bucket',bucket,'--key',key,'--version-id',head.VersionId,
      '--checksum-mode','ENABLED',output]);
    const stat=fs.lstatSync(output);
    requireProof(stat.isFile()&&!stat.isSymbolicLink()&&stat.size===bytes.length
      &&fs.readFileSync(output).equals(bytes),'BODY_READBACK');
    return {state:'OBJECT_LOCK_COMPLIANCE_VERIFIED',key,version_id:head.VersionId,receipt_digest,
      object_lock_mode:'COMPLIANCE',checksum_verified:true,retention_verified:true,encryption_verified:true,
      body_readback_verified:true,checksum_sha256:sha256(bytes),retain_until:head.ObjectLockRetainUntilDate,
      encryption_key_arn:keyArn};
  };
  try{
    let version;
    try{
      const put=await call(['s3api','put-object','--bucket',bucket,'--key',key,'--body',body,
        '--if-none-match','*','--content-type','application/json','--server-side-encryption','aws:kms',
        '--ssekms-key-id',keyArn,'--checksum-algorithm','SHA256','--checksum-sha256',expectedChecksum,
        '--object-lock-mode','COMPLIANCE','--object-lock-retain-until-date',issued.toISOString()]);
      requireProof(typeof put.VersionId==='string'&&put.VersionId.length>0,'PUT_VERSION');
      version=put.VersionId;
    }catch(error){
      if(!['PreconditionFailed','ConditionalRequestConflict','412','409'].includes(error.aws_code))throw error;
    }
    return await verify(version);
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
}

export function buildGithubReadResumeTerminalReceipt({result,event,consumer,exactMainSha,createdAt=new Date().toISOString()}){
  const terminalStates=new Set(['READ_ONLY_CHECKPOINT_RESUMED','READ_ONLY_CHECKPOINTS_RESUMED','NO_CHECKPOINT_ARTIFACT',
    'RESUME_DEFERRED_WINDOW','RESUME_SCHEDULED','HOLD']);
  requireReceipt(result&&terminalStates.has(result.state)&&result.actual_authority_granted===false,'RESULT');
  requireReceipt(/^[a-f0-9]{40}$/.test(exactMainSha||''),'EXACT_MAIN_SHA');
  const workflowRun=event?.workflow_run;
  const originalRunId=event?.resume_schedule?.resume_binding?.run_id??workflowRun?.id;
  const originalAttempt=event?.resume_schedule?.resume_binding?.run_attempt??workflowRun?.run_attempt;
  const originalSha=event?.resume_schedule?.resume_binding?.source_sha??workflowRun?.head_sha;
  let routeCount=0;
  if(result.state==='READ_ONLY_CHECKPOINT_RESUMED'){
    requireReceipt(result.method==='GET'&&typeof result.route==='string'&&result.checkpoint_consumed===true
      &&result.route_count===1,'ROUTE_COUNT');
    routeCount=1;
  }else if(result.state==='READ_ONLY_CHECKPOINTS_RESUMED'){
    requireReceipt(Array.isArray(result.results)&&result.results.length>=1&&result.results.length<=8
      &&result.route_count===result.results.length&&result.results.every(item=>item?.method==='GET'
        &&typeof item.route==='string'&&item.checkpoint_consumed===true&&item.route_count===1),'ROUTE_COUNT');
    routeCount=result.results.length;
  }else requireReceipt(result.route_count===undefined||result.route_count===0,'ROUTE_COUNT');
  const base={id:'kidults-github-read-resume-terminal-receipt-v1',version:'1.0.0',state:'READ_RESUME_TERMINAL',
    created_at:createdAt,exact_main_sha:exactMainSha,
    original:{run_id:String(originalRunId),run_attempt:Number(originalAttempt),source_sha:originalSha},
    consumer:{run_id:String(consumer.run_id),run_attempt:Number(consumer.run_attempt)},
    outcome:{state:result.state,method:result.method??null,route_count:routeCount,
      actual_authority_granted:false,read_only:true}};
  const receipt_digest=sha256(canonicalJson(base));
  return {...base,receipt_digest};
}
