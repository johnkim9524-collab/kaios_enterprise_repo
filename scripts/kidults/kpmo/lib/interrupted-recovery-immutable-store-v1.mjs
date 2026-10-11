import {verifyInterruptedRecoveryNativeTrigger} from './interrupted-recovery-native-trigger-v1.mjs';
// Protected S3 adapter only; never dispatches, deploys or creates authority.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {canonicalJson,sha256} from './canonical-json-v1.mjs';
import {interruptedRecoveryObjectKey,validateInterruptedRecoveryTerminal} from './interrupted-reservation-recovery-v1.mjs';
import {createInterruptedRecoveryAwsTransport} from './interrupted-recovery-signed-ledger-client-v1.mjs';
const check=(ok,code)=>{if(!ok)throw new Error('INTERRUPTED_IMMUTABLE_'+code);};
const repo='johnkim9524-collab/kaios_enterprise_repo';
const version=v=>typeof v==='string'&&v.length>0&&v.length<=1024&&v!=='null'&&!/[\x00-\x20]/.test(v);
export async function createInterruptedRecoveryImmutableStore({bucket,keyArn,sourceSha,env=process.env,aws,ledger,tempRoot=os.tmpdir()}){
  check(typeof ledger?.read==='function','SIGNED_LEDGER_REQUIRED');
  env={...env};aws??=createInterruptedRecoveryAwsTransport({env});
  check(/^kidults-autonomous-[a-z0-9-]+$/.test(bucket||''),'BUCKET');
  check(/^arn:aws:kms:ap-northeast-2:528314240275:key\/[A-Za-z0-9-]+$/.test(keyArn||''),'KEY');
  check(!env.AWS_PROFILE&&!env.AWS_DEFAULT_PROFILE,'ADMIN_PROFILE');
  check(/^[a-f0-9]{40}$/.test(sourceSha||'')&&env.GITHUB_ACTIONS==='true'&&env.GITHUB_REPOSITORY===repo
    &&env.GITHUB_REPOSITORY_ID==='1281328888'&&env.GITHUB_REF==='refs/heads/main'&&env.GITHUB_SHA===sourceSha
    &&env.GITHUB_WORKFLOW_SHA===sourceSha&&env.GITHUB_RUN_ATTEMPT==='1'&&/^[1-9][0-9]{0,15}$/.test(env.GITHUB_RUN_ID||'')
    &&['repository_dispatch','workflow_run'].includes(env.GITHUB_EVENT_NAME)&&['track','kpmo','independent-verification'].some(x=>
      env.GITHUB_WORKFLOW_REF===`${repo}/.github/workflows/kidults-autonomous-${x}-authorization-v1.yml@refs/heads/main`),'CONTEXT');
  if(env.GITHUB_EVENT_NAME==='workflow_run')await verifyInterruptedRecoveryNativeTrigger({env});
  const identity=await aws(['sts','get-caller-identity']);
  check(identity.Account==='528314240275'&&/^arn:aws:sts::528314240275:assumed-role\/kidults-autonomous-finalizer-staging-role\/[^/]+$/.test(identity.Arn||''),'IDENTITY');
  const call=async args=>{try{return await aws(args);}catch(error){
    const match=String(error.stderr||'').match(/An error occurred \(([^)]+)\) when calling/);
    if(match)error.aws_code=match[1];throw error;
  }};
  const temporary=async fn=>{
    const dir=fs.mkdtempSync(path.join(tempRoot,'kpmo-interrupted-immutable-'));fs.chmodSync(dir,0o700);
    try{return await fn(dir);}finally{fs.rmSync(dir,{recursive:true,force:true});}
  };
  const prepare=({request,terminal,key})=>{
    check(key===interruptedRecoveryObjectKey(request),'OBJECT_KEY');
    const digest=validateInterruptedRecoveryTerminal(terminal,request);
    check(request.original_run_id!==env.GITHUB_RUN_ID,'SOURCE_OWNER');
    const bytes=Buffer.from(canonicalJson(terminal));check(bytes.length<=49152,'PAYLOAD');
    const date=new Date(request.issued_at),month=date.getUTCMonth();date.setUTCFullYear(date.getUTCFullYear()+10);
    if(date.getUTCMonth()!==month)date.setUTCDate(0);
    date.setTime(Math.ceil(date.getTime()/1000)*1000);
    return {bytes,digest,checksum:Buffer.from(digest.slice(7),'hex').toString('base64'),minimum:date};
  };
  const read=async(input,pinned)=>{
    const p=prepare(input);
    // The protected signed writer, not caller flags, authenticates consumed
    // history even when the current native source has advanced.
    const consumed=await ledger.read({request:input.request,run_id:env.GITHUB_RUN_ID});
    check(consumed?.state==='CONSUMED'&&consumed.request_digest===sha256(canonicalJson(input.request))
      &&canonicalJson(consumed.terminal)===canonicalJson(input.terminal),'CONSUMED_LEDGER_BINDING');
    let head;
    try{head=await call(['s3api','head-object','--bucket',bucket,'--key',input.key,'--checksum-mode','ENABLED',...(pinned?['--version-id',pinned]:[])]);}
    catch(error){if(!pinned&&['404','NoSuchKey','NotFound'].includes(error.aws_code))return null;throw error;}
    check(version(head.VersionId)&&(!pinned||head.VersionId===pinned),'VERSION');
    check(head.ContentLength===p.bytes.length&&head.ChecksumSHA256===p.checksum,'CHECKSUM');
    check(head.ServerSideEncryption==='aws:kms'&&head.SSEKMSKeyId===keyArn,'ENCRYPTION');
    const lock=await call(['s3api','get-object-retention','--bucket',bucket,'--key',input.key,'--version-id',head.VersionId]);
    const until=Date.parse(lock.Retention?.RetainUntilDate);
    check(lock.Retention?.Mode==='COMPLIANCE'&&Number.isFinite(until)&&until>=p.minimum.getTime(),'RETENTION');
    await temporary(async dir=>{
      const file=path.join(dir,'body.json');
      await call(['s3api','get-object','--bucket',bucket,'--key',input.key,'--version-id',head.VersionId,'--checksum-mode','ENABLED',file]);
      const stat=fs.lstatSync(file);check(stat.isFile()&&!stat.isSymbolicLink()&&stat.size===p.bytes.length,'BODY_FILE');
      check(fs.readFileSync(file).equals(p.bytes),'BODY');
    });
    return {bucket,key:input.key,version_id:head.VersionId,sha256:p.digest,retention_mode:'COMPLIANCE',retain_until:new Date(until).toISOString(),encryption_key_arn:keyArn};
  };
  return {read:input=>read(JSON.parse(canonicalJson(input))),seal:async input=>{
    input=JSON.parse(canonicalJson(input)); // Freeze the tuple across asynchronous S3 calls.
    const p=prepare(input);check(input.if_none_match==='*','WRITE_BOUNDARY');
    const existing=await read(input);if(existing)return existing;
    let pinned;
    try{
      const result=await temporary(async dir=>{
        const file=path.join(dir,'body.json');fs.writeFileSync(file,p.bytes,{mode:0o600,flag:'wx'});
        return call(['s3api','put-object','--bucket',bucket,'--key',input.key,'--body',file,'--if-none-match','*',
          '--content-type','application/json','--server-side-encryption','aws:kms','--ssekms-key-id',keyArn,
          '--checksum-algorithm','SHA256','--checksum-sha256',p.checksum,'--object-lock-mode','COMPLIANCE',
          '--object-lock-retain-until-date',p.minimum.toISOString()]);
      });
      if(version(result?.VersionId))pinned=result.VersionId;
    }catch(error){ /* Every ambiguous write is reconciled by GET; never retried. */ }
    const result=await read(input,pinned);check(result!==null,'WRITE_UNKNOWN_NO_RETRY');return result;
  }};
}
