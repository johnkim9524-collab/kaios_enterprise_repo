import {test} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {verifyBrokerCallerIdentity} from '../../../scripts/kidults/staging-operations/lib/broker-caller-identity-v1.mjs';
const {privateKey,publicKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
const jwk={...publicKey.export({format:'jwk'}),kid:'canonical-key',alg:'RS256',use:'sig'};
const repository='johnkim9524-collab/kaios_enterprise_repo',sourceSha='a'.repeat(40),seconds=1800000000;
const paths={FINALIZER:'kidults-autonomous-track-authorization-v1.yml',DISPATCHER:'kidults-autonomous-dispatcher-v1.yml'};
function fixture(callerClass='FINALIZER'){
  const environment=`KIDULTS-AUTONOMOUS-${callerClass}`,workflow_ref=`${repository}/.github/workflows/${paths[callerClass]}@refs/heads/main`;
  const claims={iss:'https://token.actions.githubusercontent.com',aud:'sts.amazonaws.com',repository,repository_id:'123',ref:'refs/heads/main',sha:sourceSha,
    environment,workflow_ref,sub:`repo:${repository}:environment:${environment}:workflow_ref:${workflow_ref}`,run_id:'101',run_attempt:'1',iat:seconds-10,nbf:seconds-10,exp:seconds+290};
  const run={id:101,run_attempt:1,repository:{id:123,full_name:repository},head_repository:{full_name:repository},head_branch:'main',head_sha:sourceSha,
    path:`.github/workflows/${paths[callerClass]}`,event:callerClass==='FINALIZER'?'repository_dispatch':'schedule',status:'in_progress'};
  return {claims,run,callerClass};
}
const sign=(claims,header={alg:'RS256',kid:jwk.kid})=>{
  const body=[header,claims].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.');
  return `${body}.${crypto.sign('RSA-SHA256',Buffer.from(body),privateKey).toString('base64url')}`;
};
async function verify(f,overrides={}){
  let nativeReads=0;
  const result=await verifyBrokerCallerIdentity({token:sign(f.claims),repository,repositoryId:'123',sourceSha,callerClass:f.callerClass,runId:'101',now:()=>seconds*1000,
    request:async(url,options)=>{assert.equal(url,'https://token.actions.githubusercontent.com/.well-known/jwks');assert.equal(options.redirect,'error');return {ok:true,text:async()=>JSON.stringify({keys:[jwk]})};},
    nativeRequest:async(url,options)=>{nativeReads++;assert.equal(url,`https://api.github.com/repos/${repository}/actions/runs/101`);assert.equal(options.redirect,'error');return {ok:true,text:async()=>JSON.stringify(f.run)};},...overrides});
  return {result,nativeReads};
}
for(const callerClass of ['FINALIZER','DISPATCHER'])test(`canonical signed ${callerClass} identity binds its native first attempt`,async()=>{
  const r=await verify(fixture(callerClass));assert.equal(r.result.caller_class,callerClass);assert.equal(r.nativeReads,1);
});
for(const [label,mutate] of [
  ['Dispatcher identity at public mint',f=>f.callerClass='FINALIZER'],
  ['repository',f=>f.claims.repository='fork/repo'],['repository ID',f=>f.claims.repository_id='999'],
  ['environment',f=>f.claims.environment='KIDULTS-AUTONOMOUS-DISPATCHER'],['workflow',f=>f.claims.workflow_ref='untrusted@main'],
  ['subject',f=>f.claims.sub='untrusted'],['source',f=>f.claims.sha='b'.repeat(40)],['ref',f=>f.claims.ref='refs/heads/feature'],
  ['expiry',f=>f.claims.exp=seconds],['future',f=>f.claims.nbf=seconds+1],['overlong TTL',f=>f.claims.exp=seconds+601],
  ['audience array',f=>f.claims.aud=['sts.amazonaws.com','other']],['attempt',f=>f.claims.run_attempt='2'],['run ID',f=>f.claims.run_id='102'],
])test(`signed identity rejects ${label} before native credential read`,async()=>{
  const f=label.startsWith('Dispatcher')?fixture('DISPATCHER'):fixture();mutate(f);
  await assert.rejects(verify(f,{nativeRequest:async()=>{throw Error('must not mint or read native run');}}),/BROKER_CALLER_IDENTITY_DENIED:CLAIMS/);
});
for(const header of [{alg:'none',kid:jwk.kid},{alg:'RS256',kid:'unknown'},{alg:'RS256',kid:jwk.kid,jku:'https://evil.invalid'}])test('untrusted JWT algorithm/key/source fails closed',async()=>{
  const f=fixture();await assert.rejects(verify(f,{token:sign(f.claims,header)}),/BROKER_CALLER_IDENTITY_DENIED/);
});
test('forged signature cannot reach native credential read',async()=>{
  const f=fixture(),token=sign(f.claims);const forged=token.slice(0,token.lastIndexOf('.')+1)+Buffer.alloc(256).toString('base64url');
  await assert.rejects(verify(f,{token:forged,nativeRequest:async()=>{throw Error('must not read');}}),/JWT_SIGNATURE/);
});
for(const mutate of [f=>f.run.run_attempt=2,f=>f.run.head_sha='b'.repeat(40),f=>f.run.path='.github/workflows/other.yml',f=>f.run.status='completed',f=>f.run.repository.id=999])test('native metadata drift rejects otherwise valid signed identity',async()=>{
  const f=fixture();mutate(f);await assert.rejects(verify(f),/NATIVE_RUN/);
});
