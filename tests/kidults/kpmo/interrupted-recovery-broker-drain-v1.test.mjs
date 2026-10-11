import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createInterruptedRecoveryBrokerDrain} from '../../../scripts/kidults/kpmo/lib/interrupted-recovery-broker-drain-v1.mjs';
const sha=x=>x.repeat(40),now=Date.parse('2026-10-11T10:00:00Z');
function fixture(){
 const request={repository:'johnkim9524-collab/kaios_enterprise_repo',repository_id:'1281328888',pull_request:42,base_sha:sha('a'),head_sha:sha('b'),head_tree_sha:sha('c'),merge_sha:sha('d'),original_run_id:'100',original_generation:'original-generation',nonce_digest:'sha256:'+'f'.repeat(64)};
 const env={GITHUB_SHA:sha('e'),GITHUB_RUN_ID:'200',KIDULTS_AUTONOMOUS_EVENT_TOKEN_BROKER_FUNCTION:'kidults-autonomous-event-token-broker-staging',KIDULTS_AUTONOMOUS_EVENT_BROKER_ROLE_ARN:'arn:aws:iam::528314240275:role/kidults-autonomous-event-broker-invoker-staging-role',ACTIONS_ID_TOKEN_REQUEST_URL:'https://synthetic.invalid/?x=1',ACTIONS_ID_TOKEN_REQUEST_TOKEN:'synthetic',AWS_ACCESS_KEY_ID:'must-remove',AWS_SECRET_ACCESS_KEY:'must-remove',AWS_SESSION_TOKEN:'must-remove',AWS_PROFILE:'must-remove'};
 const receipt={state:'POSTMERGE_RECONCILIATION_CONTEXT_ONLY',token_drain:'TOKEN_DRAIN_VERIFIED_NOT_RECOVERY_AUTHORITY',repository:request.repository,repository_id:request.repository_id,pull_request:42,source_sha:env.GITHUB_SHA,head_sha:request.head_sha,head_tree_sha:request.head_tree_sha,merge:{merge_sha:request.merge_sha,ordered_parents:[request.base_sha,request.head_sha]},original_execution:{run_id:'100',run_attempt:1,source_sha:request.base_sha,authorization_generation:request.original_generation,nonce_digest:request.nonce_digest},mutation_attempted:false,recovery_authority:false,signature:'synthetic-service-signature',production:'HOLD',public:'HOLD',g5:'HOLD',observed_at:'2026-10-11T09:59:00Z',expires_at:'2026-10-11T10:04:00Z'};
 const f={request,env,receipt,invocations:0,oidc:0};
 f.call=()=>createInterruptedRecoveryBrokerDrain({env,now:()=>now,fetchImpl:async()=>{f.oidc++;return {ok:true,redirected:false,json:async()=>({value:'x'.repeat(120)})};},transportFactory:({env:isolated})=>async args=>{
   f.invocations++;for(const k of ['AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','AWS_SESSION_TOKEN','AWS_PROFILE'])assert.equal(isolated[k],undefined);
   assert.equal(isolated.AWS_ROLE_ARN,env.KIDULTS_AUTONOMOUS_EVENT_BROKER_ROLE_ARN);
   assert.equal(fs.statSync(isolated.AWS_WEB_IDENTITY_TOKEN_FILE).mode&0o777,0o600);
   const payload=JSON.parse(args[args.indexOf('--payload')+1]);assert.equal(payload.action,'READ_FINALIZER_RECOVERY_CONTEXT');
   fs.writeFileSync(args.at(-1),JSON.stringify({ok:true,receipt}));return {StatusCode:200};
 }})(request);return f;
}
test('drain uses one existing read-only broker RPC with isolated credentials',async()=>{const f=fixture();assert.equal((await f.call()).recovery_authority,false);assert.equal(f.invocations,1);});
for(const [name,mutate] of [['wrong original',f=>f.receipt.original_execution.run_id='101'],['changed main',f=>f.receipt.source_sha=sha('f')],['expired',f=>f.receipt.expires_at='2026-10-11T10:00:00Z'],['promotion',f=>f.receipt.public='PASS'],['mutation',f=>f.receipt.mutation_attempted=true],['authority',f=>f.receipt.recovery_authority=true]])test('drain rejects '+name+' without retry',async()=>{const f=fixture();mutate(f);await assert.rejects(f.call(),/BINDING/);assert.equal(f.invocations,1);});
test('unknown operation and wrong broker config fail before OIDC',async()=>{const f=fixture();f.request.pull_request=1677;await assert.rejects(f.call());assert.equal(f.oidc,0);f.env.KIDULTS_AUTONOMOUS_EVENT_TOKEN_BROKER_FUNCTION='other';assert.throws(()=>f.call(),/CONFIG/);assert.equal(f.oidc,0);});
