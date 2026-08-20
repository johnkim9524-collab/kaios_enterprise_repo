import {createHash} from 'node:crypto';
const COMPUTABLE_CONFIDENCE=new Set(['HIGH','MEDIUM','LOW']);
const REQUIRED_PROOF_CHECKS=['calibration:PASS','drift:PASS','liquidity:PASS','reconciliation:PASS','valuation:PASS'];
const REGISTRY={id:'owned-intelligence-hardening-proof-registry-v1',version:'1.0.0',ref:'coordination/kidults/registry/owned-intelligence-hardening-proof-registry-v1.json',digest:'sha256:27636efd78eae996120e5bd117050376c8aab9c9635fd97389c9976e501025a7'};
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const digest=v=>`sha256:${createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex')}`;
export const nonEmptyStrings=value=>Array.isArray(value)&&value.length>0&&value.every(item=>typeof item==='string'&&item.trim().length>0);
export const ownedIntelligenceProofIneligibility=proof=>{
  const reasons=[];if(!proof||typeof proof!=='object')return ['OWNED_INTELLIGENCE_STRUCTURED_PROOF_MISSING'];const {digest:given,...payload}=proof;
  if(proof.producer!=='owned-intelligence-redteam-v2.2')reasons.push('OWNED_INTELLIGENCE_PROOF_PRODUCER_INVALID');
  if(proof.methodology_version!=='2.2.0')reasons.push('OWNED_INTELLIGENCE_PROOF_VERSION_INVALID');
  if(proof.registry_state!=='REGISTERED'||proof.registry_id!==REGISTRY.id||proof.registry_version!==REGISTRY.version||proof.registry_ref!==REGISTRY.ref||proof.registry_contract_digest!==REGISTRY.digest)reasons.push('OWNED_INTELLIGENCE_PROOF_REGISTRY_BINDING_INVALID');
  if(proof.gate_state!=='ALLOW_SHADOW_ONLY')reasons.push('OWNED_INTELLIGENCE_HARDENING_GATE_NOT_ALLOW');
  const checks=Array.isArray(proof.checks)?[...new Set(proof.checks)].sort():[];if(JSON.stringify(checks)!==JSON.stringify([...REQUIRED_PROOF_CHECKS].sort()))reasons.push('OWNED_INTELLIGENCE_PROOF_CHECKS_INVALID');
  if(typeof given!=='string'||given!==digest(payload))reasons.push('OWNED_INTELLIGENCE_PROOF_DIGEST_INVALID');
  return reasons;
};
export const factorIneligibility=factor=>{
  const reasons=[];if(factor?.state!=='VERIFIED')reasons.push('STATE_NOT_VERIFIED');const value=Number(factor?.value);if(!Number.isFinite(value))reasons.push('VALUE_NOT_FINITE');else if(value<0||value>1)reasons.push('VALUE_OUT_OF_RANGE');
  if(!nonEmptyStrings(factor?.evidence_refs))reasons.push('EVIDENCE_REFS_MISSING');if(!nonEmptyStrings(factor?.provenance_refs))reasons.push('PROVENANCE_REFS_MISSING');if(typeof factor?.rights_state!=='string'||!factor.rights_state.startsWith('ALLOW'))reasons.push('RIGHTS_NOT_ALLOW');if(!COMPUTABLE_CONFIDENCE.has(factor?.confidence))reasons.push('CONFIDENCE_NOT_COMPUTABLE');if(typeof factor?.methodology_ref!=='string'||!factor.methodology_ref.trim())reasons.push('METHODOLOGY_REF_MISSING');
  if(factor?.origin==='OWNED_INTELLIGENCE')reasons.push(...ownedIntelligenceProofIneligibility(factor.hardening_proof));return reasons;
};
export const factorEligibility=factor=>{const reasons=factorIneligibility(factor),value=Number(factor?.value);return {eligible:reasons.length===0,reasons,value:Number.isFinite(value)?value:null};};
export const missingFactors=(cell,factors)=>factors.filter(factor=>factorIneligibility(cell?.factors?.[factor]).length>0);
