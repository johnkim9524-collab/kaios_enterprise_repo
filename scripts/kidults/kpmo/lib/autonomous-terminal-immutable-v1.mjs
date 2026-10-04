import fs from 'node:fs';
import path from 'node:path';
import {canonicalJson,sha256} from './autonomous-internal-landing-v1.mjs';
const requireProof=(ok,code)=>{if(!ok)throw new Error(`AUTONOMOUS_IMMUTABLE_${code}`);};
export function terminalObjectKey(receipt){
  const generation=receipt?.binding?.authorization_generation;
  requireProof(typeof generation==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/.test(generation),'GENERATION');
  requireProof(/^[a-f0-9]{40}$/.test(receipt?.merge?.merge_sha||''),'MERGE_SHA');
  return `receipts/${generation}/${receipt.merge.merge_sha}/terminal.json`;
}

// The object identity is the operation, never a session or newly computed digest.
// Conditional collisions and lost replies reconcile the same immutable version.
export function sealAutonomousTerminal({receipt,bucket,keyArn,aws,tempRoot}){
  requireProof(receipt?.id==='kidults-autonomous-internal-landing-terminal-receipt-v1'&&receipt.state==='RECEIPT_SEALED','TERMINAL');
  const {receipt_digest,...core}=receipt;
  requireProof(receipt_digest===sha256(canonicalJson(core)),'RECEIPT_DIGEST');
  requireProof(['production','public','g5'].every(k=>receipt[k]==='HOLD'),'HOLD');
  requireProof(receipt.durable_reservation?.state==='CONSUMED'&&receipt.durable_reservation.conditional_write===true&&receipt.postmerge?.state==='VERIFIED_PASS','RESERVATION');
  requireProof(typeof bucket==='string'&&/^kidults-autonomous-[a-z0-9-]+$/.test(bucket),'BUCKET');
  requireProof(/^arn:aws:kms:ap-northeast-2:528314240275:key\/[A-Za-z0-9-]+$/.test(keyArn),'KEY');
  const key=terminalObjectKey(receipt),envelope={id:'kidults-autonomous-internal-landing-immutable-envelope-v1',version:'1.0.0',receipt,
    receipt_sha256:sha256(canonicalJson(receipt)),production:'HOLD',public:'HOLD',g5:'HOLD'};
  const bytes=Buffer.from(`${JSON.stringify(envelope,null,2)}\n`);
  requireProof(bytes.length<=49152,'PAYLOAD_BOUND');
  const checksum=Buffer.from(sha256(bytes).slice(7),'hex').toString('base64');
  const retain=new Date(receipt.created_at);requireProof(Number.isFinite(retain.getTime())&&retain.toISOString()===receipt.created_at,'CREATED_AT');retain.setUTCFullYear(retain.getUTCFullYear()+10);
  // S3 stores Object Lock dates at whole-second precision. Round the requested
  // deadline up so serialization cannot shorten the ten-year minimum.
  retain.setTime(Math.ceil(retain.getTime()/1000)*1000);
  const directory=fs.mkdtempSync(path.join(tempRoot,'kidults-terminal-'));fs.chmodSync(directory,0o700);
  const file=path.join(directory,'body.json');fs.writeFileSync(file,bytes,{mode:0o600,flag:'wx'});
  const call=args=>aws([...args,'--region','ap-northeast-2','--output','json']);
  let version,writeError;
  const verifyReadback=head=>{
    requireProof(typeof head.VersionId==='string'&&head.VersionId.length>0&&(!version||head.VersionId===version),'VERSION');
    requireProof(head.ContentLength===bytes.length&&head.ChecksumSHA256===checksum,'CHECKSUM');
    requireProof(head.ObjectLockMode==='COMPLIANCE'&&Date.parse(head.ObjectLockRetainUntilDate)>=retain.getTime(),'RETENTION');
    requireProof(head.ServerSideEncryption==='aws:kms'&&head.SSEKMSKeyId===keyArn,'ENCRYPTION');
    const readPath=path.join(directory,'readback.json');
    call(['s3api','get-object','--bucket',bucket,'--key',key,'--version-id',head.VersionId,'--checksum-mode','ENABLED',readPath]);
    const stat=fs.lstatSync(readPath);
    requireProof(stat.isFile()&&!stat.isSymbolicLink()&&stat.size===bytes.length&&fs.readFileSync(readPath).equals(bytes),'BODY');
    return {state:'OBJECT_LOCK_COMPLIANCE_VERIFIED',bucket,key,version_id:head.VersionId,checksum_sha256:checksum,
      receipt_sha256:envelope.receipt_sha256,kms_key_arn:keyArn,retain_until:head.ObjectLockRetainUntilDate,
      conditional_write:true,body_readback_verified:true,reconciled_write_response:!!writeError};
  };
  try{
    let existing;
    try{existing=call(['s3api','head-object','--bucket',bucket,'--key',key,'--checksum-mode','ENABLED']);}catch{}
    // A failed HEAD does not establish absence. The conditional write is the
    // atomic fence; an existing readable success is consumed without a write.
    if(existing)return {...verifyReadback(existing),reused_existing_version:true};
    try{
      const put=call(['s3api','put-object','--bucket',bucket,'--key',key,'--body',file,'--if-none-match','*',
        '--content-type','application/json','--server-side-encryption','aws:kms','--ssekms-key-id',keyArn,
        '--checksum-algorithm','SHA256','--checksum-sha256',checksum,'--object-lock-mode','COMPLIANCE',
        '--object-lock-retain-until-date',retain.toISOString()]);
      requireProof(typeof put.VersionId==='string'&&put.VersionId.length>0,'VERSION');version=put.VersionId;
    }catch(error){writeError=error;}
    let head;
    try{head=call(['s3api','head-object','--bucket',bucket,'--key',key,'--checksum-mode','ENABLED',...(version?['--version-id',version]:[])]);}
    catch{throw new Error('AUTONOMOUS_IMMUTABLE_OUTCOME_UNKNOWN_RECONCILE_NO_RETRY');}
    return verifyReadback(head);
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
}
