import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {canonicalJson,sha256} from '../../../scripts/kidults/kpmo/lib/autonomous-internal-landing-v1.mjs';
import {buildPostmergeRecoveryRequest,buildPostmergeRecoveryTerminal,recoveryObjectKey} from '../../../scripts/kidults/kpmo/lib/autonomous-postmerge-recovery-v1.mjs';
import {createRecoveryImmutableStore,recoveryImmutableAckFields} from '../../../scripts/kidults/kpmo/lib/postmerge-recovery-immutable-store-v1.mjs';

function fixture(){
  const request=buildPostmergeRecoveryRequest({sourceSha:'1d7981f6c09e2b7ad52fe5a819c59a54ea01525c',issuedAt:'2026-10-03T15:00:00.000Z',expiresAt:'2026-10-03T15:20:00.000Z'});
  const hold={production:'HOLD',public:'HOLD',g5:'HOLD'};
  const node=run_id=>({state:'VERIFIED_PASS',source_sha:request.source_sha,run_id,receipt_digest:'sha256:'+'a'.repeat(64),...hold});
  const evidence={state:'VERIFIED_PASS',source_sha:request.source_sha,...hold,push_suite:{...node('1'),required_success_count:6,required_failure_count:0},canonical_truth:node('2'),sentinel:{...node('3'),producers:['SHADOW','REQUIREMENT','RESERVE','CANONICAL_TRUTH'].map(id=>({id,state:'VERIFIED_PASS'})),failed_producers:[],waiting_producers:[]},success_authority_gate:node('4')};
  const terminal=buildPostmergeRecoveryTerminal({request,recoveryRunId:'9001',evidence}),key=recoveryObjectKey(request);
  const keyArn='arn:aws:kms:ap-northeast-2:528314240275:key/receipt-key';
  const f={terminal,key,keyArn,puts:0,object:null,headOverride:{},retentionOverride:{},bodyOverride:null,headError:null,putError:null};
  const aws=async args=>{
    const get=name=>args[args.indexOf(name)+1];
    assert.equal(get('--bucket'),'kidults-autonomous-receipts-test');assert.equal(get('--key'),key);
    if(args[1]==='put-object'){
      f.puts++;assert.equal(get('--if-none-match'),'*');assert.equal(get('--object-lock-mode'),'COMPLIANCE');
      if(f.putError)throw f.putError;
      if(f.object)throw Object.assign(new Error('existing object'),{aws_code:'PreconditionFailed'});
      const body=fs.readFileSync(get('--body'));assert.equal(fs.statSync(get('--body')).mode&0o777,0o600);
      assert.equal(get('--checksum-sha256'),Buffer.from(sha256(body).slice(7),'hex').toString('base64'));
      f.object={body,version:'immutable-1',retention:get('--object-lock-retain-until-date')};return {VersionId:f.object.version};
    }
    if(args[1]==='head-object'){
      if(f.headError)throw f.headError;
      if(!f.object)throw Object.assign(new Error('missing'),{aws_code:'404'});
      assert.equal(get('--checksum-mode'),'ENABLED');
      return {VersionId:f.object.version,ContentLength:f.object.body.length,ChecksumSHA256:Buffer.from(sha256(f.object.body).slice(7),'hex').toString('base64'),ServerSideEncryption:'aws:kms',SSEKMSKeyId:keyArn,...f.headOverride};
    }
    assert.equal(get('--version-id'),f.object.version);
    if(args[1]==='get-object-retention')return {Retention:{Mode:'COMPLIANCE',RetainUntilDate:f.object.retention,...f.retentionOverride}};
    assert.equal(args[1],'get-object');fs.writeFileSync(args.at(-1),f.bodyOverride||f.object.body);return {};
  };
  f.store=createRecoveryImmutableStore({bucket:'kidults-autonomous-receipts-test',keyArn,aws,now:()=>new Date('2026-10-03T15:01:00Z')});
  f.input={key,terminal,if_none_match:'*',object_lock_mode:'COMPLIANCE',retention_years:10};return f;
}
test('conditional immutable write verifies actual body, exact version, checksum and retention',async()=>{
  const f=fixture(),record=await f.store.sealIfAbsent(f.input);assert.equal(record.state,'OBJECT_LOCK_COMPLIANCE_VERIFIED');
  assert.equal(record.checksum_sha256,sha256(Buffer.from(canonicalJson(f.terminal))));assert.equal(f.puts,1);
  assert.equal(record.version_id,'immutable-1');assert.equal(Object.keys(recoveryImmutableAckFields(record)).length,7);
});
test('existing immutable version is consumed by read without another put',async()=>{
  const f=fixture();await f.store.sealIfAbsent(f.input);const record=await f.store.readImmutable(f.input);
  assert.equal(record.version_id,'immutable-1');assert.equal(f.puts,1);
});
test('conditional collision verifies the existing object and does not retry put',async()=>{
  const f=fixture();await f.store.sealIfAbsent(f.input);const record=await f.store.sealIfAbsent(f.input);
  assert.equal(record.version_id,'immutable-1');assert.equal(f.puts,2);
});
test('only exact absent-key errors become null',async()=>{
  const f=fixture();assert.equal(await f.store.readImmutable(f.input),null);
  f.headError=Object.assign(new Error('service unavailable'),{aws_code:'ServiceUnavailable'});
  await assert.rejects(f.store.readImmutable(f.input),/service unavailable/);assert.equal(f.puts,0);
});
test('missing explicit immutable version is not interpreted as absent key',async()=>{
  const f=fixture();await assert.rejects(f.store.readImmutable({...f.input,version_id:'original'}),/missing/);
});
for(const [name,mutate,code] of [
  ['version drift',f=>f.headOverride.VersionId='foreign-version','RECOVERY_IMMUTABLE_VERSION'],
  ['checksum drift',f=>f.headOverride.ChecksumSHA256='wrong','RECOVERY_IMMUTABLE_CHECKSUM'],
  ['size drift',f=>f.headOverride.ContentLength=1,'RECOVERY_IMMUTABLE_CHECKSUM'],
  ['encryption drift',f=>f.headOverride.SSEKMSKeyId=f.keyArn+'-other','RECOVERY_IMMUTABLE_ENCRYPTION'],
  ['non KMS encryption',f=>f.headOverride.ServerSideEncryption='AES256','RECOVERY_IMMUTABLE_ENCRYPTION'],
  ['governance lock',f=>f.retentionOverride.Mode='GOVERNANCE','RECOVERY_IMMUTABLE_RETENTION'],
  ['short retention',f=>f.retentionOverride.RetainUntilDate='2036-10-02T15:00:00Z','RECOVERY_IMMUTABLE_RETENTION'],
  ['body drift despite matching metadata',f=>{const body=Buffer.from(canonicalJson(f.terminal));body[0]=32;f.bodyOverride=body;},'RECOVERY_IMMUTABLE_BODY'],
])test(`reject ${name}`,async()=>{const f=fixture();await f.store.sealIfAbsent(f.input);mutate(f);await assert.rejects(f.store.readImmutable({...f.input,version_id:'immutable-1'}),new RegExp(code));assert.equal(f.puts,1);});
test('foreign object key rejects before any AWS call',async()=>{const f=fixture();await assert.rejects(f.store.sealIfAbsent({...f.input,key:'receipts/foreign.json'}),/RECOVERY_IMMUTABLE_KEY/);assert.equal(f.puts,0);});
test('unconditional put is forbidden',async()=>{const f=fixture();await assert.rejects(f.store.sealIfAbsent({...f.input,if_none_match:undefined}),/WRITE_BOUNDARY/);assert.equal(f.puts,0);});
test('put transport failure is surfaced without a duplicate retry',async()=>{const f=fixture();f.putError=new Error('connection lost');await assert.rejects(f.store.sealIfAbsent(f.input),/connection lost/);assert.equal(f.puts,1);});
