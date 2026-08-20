export const nonEmptyStrings=value=>Array.isArray(value)&&value.length>0&&value.every(item=>typeof item==='string'&&item.trim().length>0);

export const factorIneligibility=factor=>{
  const reasons=[];
  if(factor?.state!=='VERIFIED')reasons.push('STATE_NOT_VERIFIED');
  const value=Number(factor?.value);
  if(!Number.isFinite(value))reasons.push('VALUE_NOT_FINITE');
  else if(value<0||value>1)reasons.push('VALUE_OUT_OF_RANGE');
  if(!nonEmptyStrings(factor?.evidence_refs))reasons.push('EVIDENCE_REFS_MISSING');
  if(!nonEmptyStrings(factor?.provenance_refs))reasons.push('PROVENANCE_REFS_MISSING');
  if(typeof factor?.rights_state!=='string'||!factor.rights_state.startsWith('ALLOW'))reasons.push('RIGHTS_NOT_ALLOW');
  if(!['HIGH','MEDIUM','LOW'].includes(factor?.confidence))reasons.push('CONFIDENCE_NOT_COMPUTABLE');
  if(typeof factor?.methodology_ref!=='string'||!factor.methodology_ref.trim())reasons.push('METHODOLOGY_REF_MISSING');
  return reasons;
};

export const factorEligible=factor=>factorIneligibility(factor).length===0;
export const factorValue=factor=>Number(factor?.value);

export const verifiedFactorRightsProvenanceEligible=factor=>{
  if(factor?.state!=='VERIFIED')return true;
  const reasons=factorIneligibility(factor);
  return !reasons.some(reason=>['EVIDENCE_REFS_MISSING','PROVENANCE_REFS_MISSING','RIGHTS_NOT_ALLOW'].includes(reason));
};
