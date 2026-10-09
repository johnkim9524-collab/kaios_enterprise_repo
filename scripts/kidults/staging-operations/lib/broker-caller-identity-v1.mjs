import crypto from 'node:crypto';

const issuer='https://token.actions.githubusercontent.com';
const paths=['kidults-autonomous-track-authorization-v1.yml','kidults-autonomous-kpmo-authorization-v1.yml','kidults-autonomous-independent-verification-authorization-v1.yml'];
const fail=code=>{throw new Error(`BROKER_CALLER_IDENTITY_DENIED:${code}`);};
// Identity is verified independently of caller-selected profiles or AWS session
// names. JWT/JWKS content and credentials never enter a receipt or error.
export async function verifyBrokerCallerIdentity({token,repository,repositoryId,sourceSha,callerClass,runId,request,nativeRequest=request,now=()=>Date.now()}){
  if(typeof token!=='string'||token.length>16384||! /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)
    ||!['FINALIZER','DISPATCHER'].includes(callerClass)||! /^[a-f0-9]{40}$/.test(sourceSha||''))fail('INPUT');
  const parts=token.split('.');let header,claims;
  try{header=JSON.parse(Buffer.from(parts[0],'base64url'));claims=JSON.parse(Buffer.from(parts[1],'base64url'));}catch{fail('JWT_JSON');}
  if(header.alg!=='RS256'||typeof header.kid!=='string'||header.kid.length>128||header.jku||header.x5u||header.crit)fail('JWT_HEADER');
  const get=async (url,transport=request)=>{
    const response=await transport(url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(10000),headers:{Accept:'application/json'}});
    if(!response.ok)fail('CANONICAL_READ');
    const text=await response.text();if(Buffer.byteLength(text)>131072)fail('CANONICAL_READ_BOUND');
    try{return JSON.parse(text);}catch{fail('CANONICAL_JSON');}
  };
  const jwks=await get(`${issuer}/.well-known/jwks`);
  if(!Array.isArray(jwks.keys)||jwks.keys.length<1||jwks.keys.length>16)fail('JWKS_BOUND');
  const keys=jwks.keys.filter(k=>k.kid===header.kid&&k.kty==='RSA'&&k.use==='sig'&&k.alg==='RS256');
  if(keys.length!==1)fail('JWKS_KEY');
  let key;try{key=crypto.createPublicKey({key:keys[0],format:'jwk'});}catch{fail('JWKS_KEY');}
  if(key.asymmetricKeyDetails?.modulusLength<2048||!crypto.verify('RSA-SHA256',Buffer.from(`${parts[0]}.${parts[1]}`),key,Buffer.from(parts[2],'base64url')))fail('JWT_SIGNATURE');
  const seconds=Math.floor(now()/1000),workflowPaths=callerClass==='FINALIZER'?paths:['kidults-autonomous-dispatcher-v1.yml'];
  const environment=callerClass==='FINALIZER'?'KIDULTS-AUTONOMOUS-FINALIZER':'KIDULTS-AUTONOMOUS-DISPATCHER';
  const allowed=workflowPaths.map(p=>`${repository}/.github/workflows/${p}@refs/heads/main`);
  if(claims.iss!==issuer||claims.aud!=='sts.amazonaws.com'||claims.repository!==repository||String(claims.repository_id)!==String(repositoryId)
    ||claims.ref!=='refs/heads/main'||claims.sha!==sourceSha||claims.environment!==environment||!allowed.includes(claims.workflow_ref)
    ||claims.sub!==`repo:${repository}:environment:${environment}:workflow_ref:${claims.workflow_ref}`
    ||claims.run_attempt!=='1'||! /^[1-9][0-9]{0,15}$/.test(String(claims.run_id))||(runId!==undefined&&String(claims.run_id)!==String(runId))
    ||!Number.isSafeInteger(claims.exp)||!Number.isSafeInteger(claims.nbf)||!Number.isSafeInteger(claims.iat)
    ||claims.exp<=seconds||claims.nbf>seconds||claims.iat>seconds||claims.exp-claims.iat>600||claims.exp<=claims.iat)fail('CLAIMS');
  const run=await get(`https://api.github.com/repos/${repository}/actions/runs/${claims.run_id}`,nativeRequest);
  const workflowPath=claims.workflow_ref.slice(repository.length+1).split('@')[0];
  if(run.id!==Number(claims.run_id)||run.run_attempt!==1||run.repository?.full_name!==repository||String(run.repository?.id)!==String(repositoryId)
    ||run.head_repository?.full_name!==repository||run.head_branch!=='main'||run.head_sha!==sourceSha||run.path!==workflowPath
    ||!['in_progress','queued','pending','waiting'].includes(run.status)
    ||!(callerClass==='FINALIZER'?['repository_dispatch','workflow_dispatch']:['schedule','workflow_run','workflow_dispatch']).includes(run.event))fail('NATIVE_RUN');
  return {caller_class:callerClass,run_id:String(run.id),source_sha:sourceSha};
}
