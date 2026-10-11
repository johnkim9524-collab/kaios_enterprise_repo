import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createInterruptedRecoverySignedLedgerClient,createInterruptedRecoveryAwsTransport} from '../../../scripts/kidults/kpmo/lib/interrupted-recovery-signed-ledger-client-v1.mjs';
import {canonicalJson,sha256} from '../../../scripts/kidults/kpmo/lib/canonical-json-v1.mjs';
const repo='johnkim9524-collab/kaios_enterprise_repo',source='e'.repeat(40),key='arn:aws:kms:ap-northeast-2:528314240275:key/key-1',now=Date.parse('2026-10-11T00:01:00Z');
function fixture(role='FINALIZER'){
 const request={id:'kidults-interrupted-reservation-postmerge-request-v1',version:'1.0.0',repository:repo,repository_id:'1281328888',pull_request:42,
   base_sha:'a'.repeat(40),head_sha:'b'.repeat(40),head_tree_sha:'c'.repeat(40),merge_sha:'d'.repeat(40),source_sha:source,original_run_id:'100',original_run_attempt:1,
   original_generation:'pr-42-original-generation',nonce_digest:'sha256:'+'f'.repeat(64),issued_at:'2026-10-11T00:00:00Z',expires_at:'2026-10-11T00:20:00Z',production:'HOLD',public:'HOLD',g5:'HOLD',provider_activation:'HOLD'};
 const f={request,calls:[],response:{ok:true,state:'RESERVED'},metadata:{StatusCode:200},identity:{Account:'528314240275',Arn:`arn:aws:sts::528314240275:assumed-role/kidults-autonomous-${role==='FINALIZER'?'finalizer':'kpmo'}-staging-role/run-400`}};
 f.env={GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:repo,GITHUB_REPOSITORY_ID:'1281328888',GITHUB_REF:'refs/heads/main',GITHUB_SHA:source,GITHUB_WORKFLOW_SHA:source,
 GITHUB_RUN_ID:'400',GITHUB_RUN_ATTEMPT:'1',GITHUB_EVENT_NAME:'repository_dispatch',GITHUB_WORKFLOW_REF:`${repo}/.github/workflows/kidults-autonomous-kpmo-authorization-v1.yml@refs/heads/main`,KIDULTS_AUTONOMOUS_SIGNING_KEY_ARN:key};
 f.aws=async args=>{f.calls.push(args);if(args[0]==='sts')return f.identity;
 if(args[0]==='kms'){f.digest=fs.readFileSync(args[args.indexOf('--message')+1].slice(8));return {KeyId:key,SigningAlgorithm:'ECDSA_SHA_256',Signature:Buffer.from('signature').toString('base64')};}
 assert.equal(args[0],'lambda');assert.equal(args[args.indexOf('--function-name')+1],'kidults-autonomous-ledger-writer-staging');
 f.envelope=JSON.parse(args[args.indexOf('--payload')+1]).envelope;assert.deepEqual(f.digest,Buffer.from(sha256(canonicalJson(f.envelope)).slice(7),'hex'));
 fs.writeFileSync(args.at(-1),JSON.stringify(f.response));return f.metadata;};
 f.client=()=>createInterruptedRecoverySignedLedgerClient({role,signingKeyArn:key,sourceSha:source,env:f.env,aws:f.aws,now:()=>now});return f;
}
test('generic finalizer signs exact engine input without replacing original owner',async()=>{const f=fixture(),c=await f.client();await c.claim({request:f.request,run_id:'400',expected_revision:0,lease_seconds:120});assert.equal(f.envelope.action,'CLAIM_MERGED_RECOVERY');assert.equal(f.envelope.request.original_run_id,'100');assert.equal(f.envelope.run_attempt,1);assert.deepEqual(f.calls.map(x=>x[0]),['sts','kms','lambda']);});
test('expired history can be read but cannot claim fresh authority',async()=>{const f=fixture();f.request.expires_at='2026-10-11T00:00:30Z';const c=await f.client();await c.read({request:f.request,run_id:'400'});await assert.rejects(c.claim({request:f.request,run_id:'400',expected_revision:0,lease_seconds:120}),/EXPIRED/);assert.equal(f.calls.filter(x=>x[0]==='lambda').length,1);});
for(const [name,mutate] of [
 ['admin profile',f=>f.env.AWS_PROFILE='admin'],['default profile',f=>f.env.AWS_DEFAULT_PROFILE='admin'],
 ['rerun',f=>f.env.GITHUB_RUN_ATTEMPT='2'],['manual event',f=>f.env.GITHUB_EVENT_NAME='workflow_dispatch'],
 ['foreign workflow',f=>f.env.GITHUB_WORKFLOW_REF='foreign'],['source drift',f=>f.env.GITHUB_SHA='a'.repeat(40)],
 ['unregistered key',f=>f.env.KIDULTS_AUTONOMOUS_SIGNING_KEY_ARN=key+'other'],['admin identity',f=>f.identity.Arn='arn:aws:sts::528314240275:assumed-role/admin/session'],
])test('reject '+name+' before KMS',async()=>{const f=fixture();mutate(f);await assert.rejects(f.client());assert.equal(f.calls.filter(x=>x[0]==='kms').length,0);});
test('run impersonation and quarantined operation never sign',async()=>{const f=fixture(),c=await f.client();await assert.rejects(c.read({request:f.request,run_id:'401'}),/EXECUTION_BINDING/);f.request.pull_request=1677;await assert.rejects(c.read({request:f.request,run_id:'400'}),/QUARANTINE/);assert.equal(f.calls.filter(x=>x[0]==='kms').length,0);});
test('role cannot perform finalizer CAS; finalizer cannot approve',async()=>{const f=fixture('KPMO'),c=await f.client();await assert.rejects(c.supersede({request:f.request,run_id:'400'}),/FINALIZER_REQUIRED/);const g=fixture();await assert.rejects((await g.client()).createApproval({request:g.request,evidence:{source_sha:source}}),/APPROVAL_ROLE/);});
test('ambiguous Lambda failure invokes once only',async()=>{const f=fixture(),c=await f.client();f.metadata.FunctionError='Unhandled';await assert.rejects(c.consume({request:f.request,run_id:'400',revision:1,terminal:{}}),/NO_RETRY/);assert.equal(f.calls.filter(x=>x[0]==='lambda').length,1);});
test('fresh source drift rejects but read-only historical request remains bound',async()=>{const f=fixture(),c=await f.client();f.request.source_sha='a'.repeat(40);await assert.rejects(c.claim({request:f.request,run_id:'400',expected_revision:0,lease_seconds:120}),/SOURCE_BINDING/);await c.read({request:f.request,run_id:'400'});assert.equal(f.envelope.request.source_sha,'a'.repeat(40));});
test('actual subprocess contract overrides ambient CLI retries and bounds network timeouts',()=>{
 let calls=0;
 const transport=createInterruptedRecoveryAwsTransport({env:{AWS_MAX_ATTEMPTS:'9',AWS_RETRY_MODE:'adaptive'},execute:(command,args,options)=>{
   calls++;assert.equal(command,'aws');assert.equal(options.env.AWS_MAX_ATTEMPTS,'1');assert.equal(options.env.AWS_RETRY_MODE,'standard');
   assert.equal(args[args.indexOf('--cli-connect-timeout')+1],'5');assert.equal(args[args.indexOf('--cli-read-timeout')+1],'20');assert.equal(options.timeout,30000);
   throw new Error('ambiguous HTTP outcome');
 }});
 assert.throws(()=>transport(['lambda','invoke']),/ambiguous HTTP outcome/);assert.equal(calls,1);
});
