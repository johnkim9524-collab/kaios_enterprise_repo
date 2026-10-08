import {canonicalJson,sha256} from './canonical-json-v1.mjs';

export const INTERNAL_RECOVERY_CHECKS=Object.freeze([
  'CORE_FOUR_CONTENT','DISTINCT_NATURAL_GENERATIONS','PROTECTED_LANDING',
  'AWS_CONFIGURATION_AND_IMMUTABILITY','NATIVE_DISPATCH','NATIVE_RESUME_REUSE',
  'FINALIZER_RESERVATION_AND_IMMUTABLE_TERMINAL',
]);
const fail=code=>{throw new Error(`INTERNAL_OPERATING_RECOVERY_${code}`);};
function validateProof(proof,sourceSha){
  if(!/^[a-f0-9]{40}$/.test(sourceSha||'')||proof?.source_sha!==sourceSha
    ||proof?.id!=='kidults-whole-platform-operating-proof-v1'
    ||proof?.repository!=='johnkim9524-collab/kaios_enterprise_repo')fail('SOURCE_BINDING');
  const {receipt_digest,...body}=proof;
  if(receipt_digest!==sha256(canonicalJson(body)))fail('DIGEST');
  for(const key of ['production','public','g5','provider_activation'])if(proof[key]!=='HOLD')fail('AUTHORITY');
  if(!Array.isArray(proof.operating_checks))fail('CHECK_SET');
}
export function observeInternalOperatingRecovery(proof,sourceSha){
  validateProof(proof,sourceSha);
  const pending=[];
  for(const id of INTERNAL_RECOVERY_CHECKS){
    const matches=proof.operating_checks.filter(c=>c.id===id);
    if(matches.length!==1)fail('CHECK_SET');
    const c=matches[0];
    if(c.state==='VERIFIED_PASS'){
      if(!Array.isArray(c.evidence_refs)||!c.evidence_refs.length)fail(id);
    }else if(['UNVERIFIED','VERIFIED_HOLD'].includes(c.state))pending.push({id,state:c.state,reason:c.reason??'EVIDENCE_PENDING'});
    else fail(id);
  }
  const receipt={id:'kidults-internal-operating-recovery-observation-v1',scope:'READ_ONLY_RECOVERY_OBSERVATION',
    state:pending.length?'VERIFIED_INCOMPLETE':'VERIFIED_PASS',source_sha:sourceSha,
    source_proof_digest:proof.receipt_digest,pending_checks:pending,
    operating_recovery_proven:pending.length===0,
    recovery_receipt:pending.length?null:verifyInternalOperatingRecovery(proof,sourceSha),
    observation_success_is_operating_completion:false,whole_platform_runtime_proven:false,
    natural_chain_terminal_authority:false,promotion_authority:false,
    production:'HOLD',public:'HOLD',g5:'HOLD',provider_activation:'HOLD'};
  return {...receipt,receipt_digest:sha256(canonicalJson(receipt))};
}
export function verifyInternalOperatingRecovery(proof,sourceSha){
  validateProof(proof,sourceSha);
  for(const id of INTERNAL_RECOVERY_CHECKS){
    const matches=proof.operating_checks.filter(c=>c.id===id);
    if(matches.length!==1||matches[0].state!=='VERIFIED_PASS'
      ||!Array.isArray(matches[0].evidence_refs)||matches[0].evidence_refs.length===0)fail(id);
  }
  const checks=proof.operating_checks.filter(c=>INTERNAL_RECOVERY_CHECKS.includes(c.id));
  const receipt={id:'kidults-internal-operating-recovery-v1',scope:'INTERNAL_OPERATING_RECOVERY_ONLY',
    state:'VERIFIED_PASS',source_sha:sourceSha,source_proof_digest:proof.receipt_digest,
    required_checks:INTERNAL_RECOVERY_CHECKS,verified_checks:checks,
    whole_platform_authority:false,whole_platform_runtime_proven:false,
    natural_chain_terminal_authority:false,promotion_authority:false,
    business_runtime_state:proof.assurance_runtime_readiness?.state??'UNKNOWN',
    production:'HOLD',public:'HOLD',g5:'HOLD',provider_activation:'HOLD'};
  return {...receipt,receipt_digest:sha256(canonicalJson(receipt))};
}
