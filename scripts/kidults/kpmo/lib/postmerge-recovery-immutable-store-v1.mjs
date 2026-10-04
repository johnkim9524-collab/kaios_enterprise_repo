// Production transport component only; no entry point, dispatch or deployment.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {canonicalJson,sha256} from './autonomous-internal-landing-v1.mjs';
import {POSTMERGE_RECOVERY_INCIDENT as I,recoveryObjectKey,validateStoredRecoveryTerminal} from './autonomous-postmerge-recovery-v1.mjs';

const assert=(condition,code)=>{if(!condition)throw new Error(code);};
const fixedKey=recoveryObjectKey(I);
const cli=args=>{
  try{return JSON.parse(execFileSync('aws',[...args,'--region','ap-northeast-2','--output','json'],
    {encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe']}));}
  catch(error){
    // Only a precise AWS error is classified; timeouts/503 never mean absence.
    const match=String(error.stderr||'').match(/An error occurred \(([^)]+)\) when calling/);
    if(match)error.aws_code=match[1];throw error;
  }
};
const base64Digest=bytes=>Buffer.from(sha256(bytes).slice(7),'hex').toString('base64');

export function createRecoveryImmutableStore({bucket,keyArn,aws=cli,tempRoot=os.tmpdir(),now=()=>new Date()}){
  assert(typeof bucket==='string'&&/^kidults-autonomous-[a-z0-9-]+$/.test(bucket),'RECOVERY_BUCKET_CONFIG');
  assert(/^arn:aws:kms:ap-northeast-2:528314240275:key\/[A-Za-z0-9-]+$/.test(keyArn),'RECOVERY_RECEIPT_KEY_CONFIG');
  const temporary=async operation=>{
    const dir=fs.mkdtempSync(path.join(tempRoot,'kpmo-recovery-immutable-'));fs.chmodSync(dir,0o700);
    try{return await operation(dir);}finally{fs.rmSync(dir,{recursive:true,force:true});}
  };
  const expected=({key,terminal})=>{
    assert(key===fixedKey,'RECOVERY_IMMUTABLE_KEY');
    validateStoredRecoveryTerminal(terminal,terminal.request);
    const bytes=Buffer.from(canonicalJson(terminal),'utf8');
    assert(bytes.length<=49152,'RECOVERY_PAYLOAD_BOUND');return bytes;
  };
  const readImmutable=async({key,terminal,version_id})=>{
    const bytes=expected({key,terminal});
    let head;
    try{head=await aws(['s3api','head-object','--bucket',bucket,'--key',key,'--checksum-mode','ENABLED',
      ...(version_id?['--version-id',version_id]:[])]);}
    catch(error){if(!version_id&&['404','NoSuchKey','NotFound'].includes(error.aws_code))return null;throw error;}
    assert(typeof head.VersionId==='string'&&head.VersionId.length>0&&(!version_id||head.VersionId===version_id),'RECOVERY_IMMUTABLE_VERSION');
    assert(head.ContentLength===bytes.length&&head.ChecksumSHA256===base64Digest(bytes),'RECOVERY_IMMUTABLE_CHECKSUM');
    assert(head.ServerSideEncryption==='aws:kms'&&head.SSEKMSKeyId===keyArn,'RECOVERY_IMMUTABLE_ENCRYPTION');
    const lock=await aws(['s3api','get-object-retention','--bucket',bucket,'--key',key,'--version-id',head.VersionId]);
    const minimum=new Date(terminal.request.issued_at);minimum.setUTCFullYear(minimum.getUTCFullYear()+10);
    const until=Date.parse(lock.Retention?.RetainUntilDate);
    assert(lock.Retention?.Mode==='COMPLIANCE'&&Number.isFinite(until)&&until>=minimum.getTime(),'RECOVERY_IMMUTABLE_RETENTION');
    await temporary(async dir=>{
      const file=path.join(dir,'body.json');
      await aws(['s3api','get-object','--bucket',bucket,'--key',key,'--version-id',head.VersionId,'--checksum-mode','ENABLED',file]);
      const stat=fs.lstatSync(file);assert(stat.isFile()&&!stat.isSymbolicLink()&&stat.size===bytes.length,'RECOVERY_IMMUTABLE_BODY_FILE');
      assert(fs.readFileSync(file).equals(bytes),'RECOVERY_IMMUTABLE_BODY');
    });
    return {state:'OBJECT_LOCK_COMPLIANCE_VERIFIED',key,version_id:head.VersionId,receipt_digest:terminal.receipt_digest,
      object_lock_mode:'COMPLIANCE',checksum_verified:true,retention_verified:true,encryption_verified:true,
      checksum_sha256:sha256(bytes),retain_until:new Date(until).toISOString(),encryption_key_arn:keyArn};
  };
  const sealIfAbsent=async({key,terminal,if_none_match,object_lock_mode,retention_years})=>{
    const bytes=expected({key,terminal});
    assert(if_none_match==='*'&&object_lock_mode==='COMPLIANCE'&&retention_years===10,'RECOVERY_IMMUTABLE_WRITE_BOUNDARY');
    const retain=now();assert(retain instanceof Date&&Number.isFinite(retain.getTime()),'RECOVERY_CLOCK');
    retain.setUTCFullYear(retain.getUTCFullYear()+10);
    let version;
    try{
      const result=await temporary(async dir=>{
        const file=path.join(dir,'body.json');fs.writeFileSync(file,bytes,{mode:0o600,flag:'wx'});
        return aws(['s3api','put-object','--bucket',bucket,'--key',key,'--body',file,'--if-none-match','*',
          '--content-type','application/json','--server-side-encryption','aws:kms','--ssekms-key-id',keyArn,
          '--checksum-algorithm','SHA256','--checksum-sha256',base64Digest(bytes),
          '--object-lock-mode','COMPLIANCE','--object-lock-retain-until-date',retain.toISOString()]);
      });
      assert(typeof result.VersionId==='string'&&result.VersionId.length>0,'RECOVERY_IMMUTABLE_VERSION');version=result.VersionId;
    }catch(error){
      if(!['PreconditionFailed','ConditionalRequestConflict','412','409'].includes(error.aws_code))throw error;
      // A concurrent existing object must be read and verified, never rewritten.
    }
    const result=await readImmutable({key,terminal,version_id:version});
    assert(result!==null,'RECOVERY_IMMUTABLE_READBACK_MISSING');return result;
  };
  return {readImmutable,sealIfAbsent};
}

export const recoveryImmutableAckFields=immutable=>Object.fromEntries(
  ['key','version_id','receipt_digest','object_lock_mode','checksum_sha256','retain_until','encryption_key_arn'].map(k=>[k,immutable[k]]));
