import crypto from 'node:crypto';

const SHA=/^[0-9a-f]{40}$/;
const DIGEST=/^sha256:[0-9a-f]{64}$/;
const RUN=/^[1-9][0-9]{0,19}$/;
const fail=code=>{const error=new Error(code);error.code=code;throw error;};
export const canonicalClaimKey=({namespace,canonicalKey})=>{
  if(!/^[A-Z0-9_.:-]{1,96}$/.test(namespace||'')) fail('CANONICAL_NAMESPACE_INVALID');
  if(!DIGEST.test(canonicalKey||'')) fail('CANONICAL_KEY_INVALID');
  return `CANONICAL#${namespace}#${canonicalKey}`;
};
const validOwner=value=>RUN.test(String(value||''));
const validSha=value=>SHA.test(String(value||''));
const validDigest=value=>DIGEST.test(String(value||''));
export const createClaim=({namespace,canonicalKey,runId,headSha,nowMs,leaseMs})=>{
  if(!validOwner(runId)||!validSha(headSha)) fail('CANONICAL_CLAIM_BINDING_INVALID');
  if(!Number.isInteger(nowMs)||!Number.isInteger(leaseMs)||leaseMs<60_000||leaseMs>900_000) fail('CANONICAL_LEASE_INVALID');
  return {pk:canonicalClaimKey({namespace,canonicalKey}),sk:'CLAIM',state:'LEASED',
    owner_run_id:String(runId),head_sha:headSha,lease_epoch:1,lease_expires_at_ms:nowMs+leaseMs,
    canonical_receipt_digest:null,committed_at_ms:null};
};
export const takeoverClaim=({claim,runId,headSha,nowMs,leaseMs})=>{
  if(claim?.state!=='LEASED'||!validOwner(claim.owner_run_id)||!validSha(claim.head_sha)) fail('CANONICAL_PRIOR_CLAIM_INVALID');
  if(nowMs<=claim.lease_expires_at_ms) fail('CANONICAL_LEASE_STILL_ACTIVE');
  if(String(runId)===claim.owner_run_id) fail('CANONICAL_TAKEOVER_SAME_OWNER');
  if(!validOwner(runId)||!validSha(headSha)) fail('CANONICAL_TAKEOVER_BINDING_INVALID');
  if(!Number.isInteger(leaseMs)||leaseMs<60_000||leaseMs>900_000) fail('CANONICAL_LEASE_INVALID');
  return {...claim,owner_run_id:String(runId),head_sha:headSha,
    lease_epoch:Number(claim.lease_epoch)+1,lease_expires_at_ms:nowMs+leaseMs};
};
export const commitClaim=({claim,runId,headSha,receiptDigest,nowMs})=>{
  if(claim?.state!=='LEASED') fail('CANONICAL_COMMIT_STATE_INVALID');
  if(String(runId)!==claim.owner_run_id||headSha!==claim.head_sha) fail('CANONICAL_COMMIT_OWNER_MISMATCH');
  if(nowMs>claim.lease_expires_at_ms) fail('CANONICAL_COMMIT_LEASE_EXPIRED');
  if(!validDigest(receiptDigest)) fail('CANONICAL_RECEIPT_DIGEST_INVALID');
  return {...claim,state:'COMMITTED',canonical_receipt_digest:receiptDigest,
    committed_at_ms:nowMs,lease_expires_at_ms:null};
};
export const createAlias=({claim,aliasRunId,headSha,receiptDigest})=>{
  if(claim?.state!=='COMMITTED'||!validDigest(claim.canonical_receipt_digest)) fail('CANONICAL_ALIAS_LEADER_INVALID');
  if(!validOwner(aliasRunId)||String(aliasRunId)===claim.owner_run_id) fail('CANONICAL_ALIAS_RUN_INVALID');
  if(headSha!==claim.head_sha||receiptDigest!==claim.canonical_receipt_digest) fail('CANONICAL_ALIAS_BINDING_INVALID');
  return {pk:claim.pk,sk:`ALIAS#${aliasRunId}`,state:'DEDUPED_ALIAS',
    alias_run_id:String(aliasRunId),canonical_run_id:claim.owner_run_id,head_sha:headSha,
    canonical_receipt_digest:receiptDigest,lease_epoch:claim.lease_epoch};
};
export const claimDigest=claim=>`sha256:${crypto.createHash('sha256').update(JSON.stringify(claim)).digest('hex')}`;
