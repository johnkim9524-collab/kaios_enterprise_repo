import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {canonicalJson,sha256} from '../../../scripts/kidults/kpmo/lib/autonomous-internal-landing-v1.mjs';
import {POSTMERGE_RECOVERY_INCIDENT as I,buildPostmergeRecoveryRequest} from '../../../scripts/kidults/kpmo/lib/autonomous-postmerge-recovery-v1.mjs';
import {createRecoverySignedLedgerClient} from '../../../scripts/kidults/kpmo/lib/postmerge-recovery-signed-ledger-client-v1.mjs';

const SHA='1d7981f6c09e2b7ad52fe5a819c59a54ea01525c',NOW=Date.parse('2026-10-03T22:40:00Z');
function fixture(role='KPMO'){
  const request=buildPostmergeRecoveryRequest({sourceSha:SHA,issuedAt:'2026-10-03T22:39:00Z',expiresAt:'2026-10-03T22:59:00Z'});
  const key='arn:aws:kms:ap-northeast-2:528314240275:key/key-1';
  const roleName=role==='FINALIZER'?'finalizer':'kpmo';
  const f={request,calls:[],signed:[],identity:{Account:'528314240275',Arn:`arn:aws:sts::528314240275:assumed-role/kidults-autonomous-${roleName}-staging-role/run-9001`},signature:{KeyId:key,SigningAlgorithm:'ECDSA_SHA_256',Signature:Buffer.from('fixture-signature').toString('base64')},metadata:{StatusCode:200},response:{ok:true,state:'SIGNED_RECOVERY_APPROVAL_STORED'}};
  f.env={GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:I.repository,GITHUB_REPOSITORY_ID:I.repository_id,GITHUB_REF:'refs/heads/main',GITHUB_SHA:SHA,GITHUB_WORKFLOW_SHA:SHA,GITHUB_RUN_ID:'9001',GITHUB_RUN_ATTEMPT:'1',GITHUB_WORKFLOW_REF:`${I.repository}/.github/workflows/kidults-autonomous-kpmo-authorization-v1.yml@refs/heads/main`};
  f.aws=async args=>{
    f.calls.push(args);
    if(args[0]==='sts')return f.identity;
    if(args[0]==='kms'){
      const file=args[args.indexOf('--message')+1].slice(8);f.signed.push(fs.readFileSync(file));
      assert.equal(fs.statSync(file).mode&0o777,0o600);assert.equal(args[args.indexOf('--message-type')+1],'DIGEST');return f.signature;
    }
    assert.equal(args[0],'lambda');assert.equal(args[args.indexOf('--function-name')+1],'kidults-autonomous-ledger-writer-staging');
    const event=JSON.parse(args[args.indexOf('--payload')+1]);
    assert.ok(f.signed.at(-1).equals(Buffer.from(sha256(canonicalJson(event.envelope)).slice(7),'hex')));
    f.lastEnvelope=event.envelope;fs.writeFileSync(args.at(-1),JSON.stringify(f.response));return f.metadata;
  };
  f.client=()=>createRecoverySignedLedgerClient({role,signingKeyArn:key,sourceSha:SHA,env:f.env,aws:f.aws,now:()=>NOW});return f;
}
test('protected workload signs canonical envelope digest and invokes only existing writer',async()=>{
  const f=fixture(),client=await f.client();await client.createApproval({request:f.request,evidence:{state:'VERIFIED_PASS'}});
  assert.equal(f.lastEnvelope.action,'CREATE_RECOVERY_APPROVAL');assert.equal(f.lastEnvelope.workload.workload_id,'kidults-kpmo-v1');
  assert.deepEqual(f.calls.map(x=>x[0]),['sts','kms','lambda']);
});
for(const [name,mutate,code] of [
  ['SSO profile',f=>f.env.AWS_PROFILE='kidults-provisioning','ADMIN_PROFILE_FORBIDDEN'],
  ['default SSO profile',f=>f.env.AWS_DEFAULT_PROFILE='kidults-provisioning','ADMIN_PROFILE_FORBIDDEN'],
  ['local execution',f=>f.env.GITHUB_ACTIONS='false','WORKFLOW_CONTEXT'],
  ['attempt replay',f=>f.env.GITHUB_RUN_ATTEMPT='2','WORKFLOW_CONTEXT'],
  ['foreign checkout',f=>f.env.GITHUB_SHA='b'.repeat(40),'WORKFLOW_CONTEXT'],
  ['untrusted workflow',f=>f.env.GITHUB_WORKFLOW_REF=`${I.repository}/.github/workflows/untrusted.yml@refs/heads/main`,'WORKFLOW_REF'],
  ['wrong account',f=>f.identity.Account='111111111111','WORKLOAD_ROLE'],
  ['provisioning admin identity',f=>f.identity.Arn='arn:aws:sts::528314240275:assumed-role/AWSReservedSSO_KIDULTS-Provisioning-Admin/admin','WORKLOAD_ROLE'],
])test(`reject ${name} before signing`,async()=>{const f=fixture();mutate(f);await assert.rejects(f.client(),new RegExp(code));assert.equal(f.signed.length,0);});
test('role approval client cannot consume reservation',async()=>{
  const f=fixture(),client=await f.client();await assert.rejects(client.consumeOnce({request:f.request,recoveryRunId:'9001',expected_original_run_id:I.original_run_id,expected_original_head_sha:I.original_head_sha,expected_state:'RESERVED',preserve_original_owner:true,terminal:{}}),/FINALIZER_REQUIRED/);assert.equal(f.signed.length,0);
});
test('finalizer cannot mint role approval',async()=>{const f=fixture('FINALIZER'),client=await f.client();await assert.rejects(client.createApproval({request:f.request,evidence:{}}),/APPROVAL_ROLE_REQUIRED/);assert.equal(f.signed.length,0);});
test('owner fence mismatch rejects without signing',async()=>{const f=fixture('FINALIZER'),client=await f.client();await assert.rejects(client.consumeOnce({request:f.request,expected_original_run_id:'9'}),/CONSUME_FENCE/);assert.equal(f.signed.length,0);});
test('signed context response is checked against fixed original key',async()=>{
  const f=fixture();f.response={ok:true,state:'SIGNED_RECOVERY_CONTEXT_READ',reservation:{pk:{S:`RESERVE#${I.original_generation}`},sk:{S:`NONCE#${I.original_nonce_digest}`},run_id:{S:I.original_run_id},head_sha:{S:I.original_head_sha},state:{S:'RESERVED'}}};
  const client=await f.client(),context=await client.readContext(f.request);assert.equal(context.run_id,I.original_run_id);
  f.response.reservation.pk.S='RESERVE#foreign';await assert.rejects(client.readContext(f.request),/RESERVATION_KEY/);
});
test('Lambda failure is surfaced without invoking again',async()=>{
  const f=fixture();f.metadata.FunctionError='Unhandled';const client=await f.client();
  await assert.rejects(client.createApproval({request:f.request,evidence:{}}),/LEDGER_TRANSPORT/);assert.equal(f.calls.filter(x=>x[0]==='lambda').length,1);
});
test('wrong signing key output rejects before Lambda',async()=>{
  const f=fixture();f.signature.KeyId+='-foreign';const client=await f.client();await assert.rejects(client.createApproval({request:f.request,evidence:{}}),/CLIENT_SIGNATURE/);assert.equal(f.calls.filter(x=>x[0]==='lambda').length,0);
});
test('foreign request source cannot produce a fresh approval',async()=>{
  const f=fixture(),client=await f.client();const request=buildPostmergeRecoveryRequest({sourceSha:'b'.repeat(40),issuedAt:f.request.issued_at,expiresAt:f.request.expires_at});
  await assert.rejects(client.createApproval({request,evidence:{}}),/SOURCE_BINDING/);assert.equal(f.signed.length,0);
});
