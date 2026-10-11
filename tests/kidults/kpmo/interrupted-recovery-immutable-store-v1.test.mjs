import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import {atomicOriginalFixture} from './atomic-original-terminal-fixture-v1.mjs';
import {sealAutonomousTerminal} from '../../../scripts/kidults/kpmo/lib/autonomous-terminal-immutable-v1.mjs';
import {canonicalJson,sha256} from '../../../scripts/kidults/kpmo/lib/canonical-json-v1.mjs';
import {createInterruptedRecoveryImmutableStore} from '../../../scripts/kidults/kpmo/lib/interrupted-recovery-immutable-store-v1.mjs';
import {interruptedRecoveryObjectKey} from '../../../scripts/kidults/kpmo/lib/interrupted-reservation-recovery-v1.mjs';
const repo='johnkim9524-collab/kaios_enterprise_repo',source='e'.repeat(40),keyArn='arn:aws:kms:ap-northeast-2:528314240275:key/receipt-key';
function fixture(mode='normal'){
 const hold={production:'HOLD',public:'HOLD',g5:'HOLD',provider_activation:'HOLD'};
 const request={id:'kidults-interrupted-reservation-postmerge-request-v1',version:'1.0.0',repository:repo,repository_id:'1281328888',pull_request:42,
 base_sha:'a'.repeat(40),head_sha:'b'.repeat(40),head_tree_sha:'c'.repeat(40),merge_sha:'d'.repeat(40),source_sha:source,
 original_run_id:'100',original_run_attempt:1,original_generation:'pr-42-original-generation',nonce_digest:'sha256:'+'f'.repeat(64),
 issued_at:'2024-02-29T00:00:00.000Z',expires_at:'2024-02-29T00:20:00.000Z',...hold};
 const terminal={id:'kidults-interrupted-reservation-terminal-v1',state:'VERIFIED_PASS',request_digest:sha256(canonicalJson(request)),evidence_digest:'sha256:'+'1'.repeat(64),recovery_run_id:'400',revision:1,merge_sha:request.merge_sha,head_sha:request.head_sha,...hold};
 const env={GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:repo,GITHUB_REPOSITORY_ID:'1281328888',GITHUB_REF:'refs/heads/main',GITHUB_SHA:source,GITHUB_WORKFLOW_SHA:source,GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_ID:'400',GITHUB_EVENT_NAME:'repository_dispatch',GITHUB_WORKFLOW_REF:`${repo}/.github/workflows/kidults-autonomous-kpmo-authorization-v1.yml@refs/heads/main`};
 let stored=null,puts=0;const arg=(a,k)=>a[a.indexOf(k)+1];
 const aws=a=>{
 if(a[0]==='sts')return {Account:'528314240275',Arn:'arn:aws:sts::528314240275:assumed-role/kidults-autonomous-finalizer-staging-role/native'};
 if(a[1]==='head-object'){
 if(!stored)throw Object.assign(Error('missing'),{aws_code:'NoSuchKey'});
 return {VersionId:'version1',ContentLength:stored.bytes.length,ChecksumSHA256:mode==='checksum'?'bad':stored.checksum,ObjectLockMode:'COMPLIANCE',ObjectLockRetainUntilDate:stored.until,ServerSideEncryption:'aws:kms',SSEKMSKeyId:mode==='encryption'?'bad':keyArn};}
 if(a[1]==='get-object-retention')return {Retention:{Mode:mode==='retention'?'GOVERNANCE':'COMPLIANCE',RetainUntilDate:stored.until}};
 if(a[1]==='get-object'){fs.writeFileSync(a[a.indexOf('--checksum-mode')+2],mode==='body'?Buffer.alloc(stored.bytes.length):stored.bytes);return {};}
 if(a[1]==='put-object'){
 puts++;assert.equal(arg(a,'--if-none-match'),'*');
 assert.equal(fs.statSync(arg(a,'--body')).mode&0o777,0o600);
 if(stored)throw Error('PreconditionFailed');
 if(mode!=='unsettled')stored={bytes:fs.readFileSync(arg(a,'--body')),checksum:arg(a,'--checksum-sha256'),until:arg(a,'--object-lock-retain-until-date')};
 if(['lost','unsettled'].includes(mode))throw Error('timeout');
 return {VersionId:'version1'};}
 throw Error('unexpected '+a[1]);};
 return {config:{bucket:'kidults-autonomous-receipts',keyArn,sourceSha:source,env,aws,ledger:{read:async()=>({state:'CONSUMED',request_digest:sha256(canonicalJson(request)),terminal:structuredClone(terminal)})}},input:{request,terminal,key:interruptedRecoveryObjectKey(request),if_none_match:'*'},puts:()=>puts,stored:()=>stored};
}
test('expired consumed history seals exact bytes once and returns writer ACK; leap-day retention is stable',async()=>{
 const f=fixture(),store=await createInterruptedRecoveryImmutableStore(f.config),a=await store.seal(f.input);
 assert.equal(a.retain_until,'2034-02-28T00:00:00.000Z');assert.equal(a.sha256,sha256(canonicalJson(f.input.terminal)));
 assert.deepEqual(await store.seal(f.input),a);assert.equal(f.puts(),1);assert.equal(Object.keys(a).length,7);
});
test('lost put response reconciles exact remote object without second put',async()=>{const f=fixture('lost'),s=await createInterruptedRecoveryImmutableStore(f.config);await s.seal(f.input);assert.equal(f.puts(),1);});
test('unsettled put stays HOLD without retry',async()=>{const f=fixture('unsettled'),s=await createInterruptedRecoveryImmutableStore(f.config);await assert.rejects(s.seal(f.input),/WRITE_UNKNOWN_NO_RETRY/);assert.equal(f.puts(),1);});
for(const mode of ['checksum','body','retention','encryption'])test('remote '+mode+' corruption rejected',async()=>{const f=fixture(mode),s=await createInterruptedRecoveryImmutableStore(f.config);await assert.rejects(s.seal(f.input));assert.equal(f.puts(),1);});
for(const change of [{AWS_PROFILE:'admin'},{GITHUB_EVENT_NAME:'workflow_dispatch'},{GITHUB_RUN_ATTEMPT:'2'}])test('non-native credential/context rejected '+JSON.stringify(change),async()=>{const f=fixture();Object.assign(f.config.env,change);await assert.rejects(createInterruptedRecoveryImmutableStore(f.config));assert.equal(f.puts(),0);});
test('foreign object key and altered terminal denied before put',async()=>{const f=fixture(),s=await createInterruptedRecoveryImmutableStore(f.config);await assert.rejects(s.seal({...f.input,key:'other'}));await assert.rejects(s.seal({...f.input,terminal:{...f.input.terminal,production:'PASS'}}));assert.equal(f.puts(),0);});

test('advanced current source can seal only exact authenticated consumed history',async()=>{const f=fixture();f.config.sourceSha='9'.repeat(40);f.config.env.GITHUB_SHA=f.config.sourceSha;f.config.env.GITHUB_WORKFLOW_SHA=f.config.sourceSha;const s=await createInterruptedRecoveryImmutableStore(f.config);await s.seal(f.input);assert.equal(f.puts(),1);});
for(const state of ['RESERVED','UNKNOWN'])test('ledger '+state+' never seals',async()=>{const f=fixture();f.config.ledger.read=async()=>({state});const s=await createInterruptedRecoveryImmutableStore(f.config);await assert.rejects(s.seal(f.input),/CONSUMED_LEDGER_BINDING/);assert.equal(f.puts(),0);});
test('foreign consumed terminal rejected before any S3 write',async()=>{const f=fixture();f.config.ledger.read=async()=>({state:'CONSUMED',request_digest:sha256(canonicalJson(f.input.request)),terminal:{...f.input.terminal,revision:2}});const s=await createInterruptedRecoveryImmutableStore(f.config);await assert.rejects(s.seal(f.input),/CONSUMED_LEDGER_BINDING/);assert.equal(f.puts(),0);});

function originalFixture(mode='normal'){
 const f=fixture(mode),t=atomicOriginalFixture().terminal;
 f.input.terminal=t;f.input.request.nonce_digest=t.binding.nonce_digest;f.input.original=true;
 f.input.key=`receipts/${f.input.request.original_generation}/${f.input.request.merge_sha}/terminal.json`;
 f.config.ledger.readContext=async()=>({state:'ORIGINAL_CONSUMED_TERMINAL_ARCHIVE_PENDING',terminal:structuredClone(t)});
 return f;
}
test('native original v3 S3 bytes and later recovery bytes are identical despite canonical stored-key order',async()=>{
 const f=originalFixture();const first=sealAutonomousTerminal({receipt:f.input.terminal,bucket:f.config.bucket,keyArn:f.config.keyArn,aws:f.config.aws,tempRoot:os.tmpdir()});
 const s=await createInterruptedRecoveryImmutableStore(f.config);f.input.terminal=JSON.parse(canonicalJson(f.input.terminal));
 const recovered=await s.seal(f.input);assert.equal(first.version_id,recovered.version_id);assert.equal(f.puts(),1);
 assert.equal(recovered.sha256,'sha256:'+crypto.createHash('sha256').update(f.stored().bytes).digest('hex'));
});
test('lost original archive put reply reconciles one version without another put',async()=>{const f=originalFixture('lost'),s=await createInterruptedRecoveryImmutableStore(f.config);await s.seal(f.input);assert.equal(f.puts(),1);});
test('concurrent original sealers reconcile one conditional immutable version',async()=>{const f=originalFixture(),s=await createInterruptedRecoveryImmutableStore(f.config);const [a,b]=await Promise.all([s.seal(f.input),s.seal(f.input)]);assert.deepEqual(a,b);assert.ok(f.puts()<=2);});
test('original consumed archive refuses a different server-persisted body before S3',async()=>{const f=originalFixture();f.config.ledger.readContext=async()=>({state:'ORIGINAL_CONSUMED_TERMINAL_ARCHIVE_PENDING',terminal:{...f.input.terminal,created_at:'2026-10-11T00:02:00.000Z'}});const s=await createInterruptedRecoveryImmutableStore(f.config);await assert.rejects(s.seal(f.input),/CONSUMED_LEDGER_BINDING/);assert.equal(f.puts(),0);});
