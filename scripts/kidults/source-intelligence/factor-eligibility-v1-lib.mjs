const COMPUTABLE_CONFIDENCE=new Set(['HIGH','MEDIUM','LOW']);

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
  if(!COMPUTABLE_CONFIDENCE.has(factor?.confidence))reasons.push('CONFIDENCE_NOT_COMPUTABLE');
  if(typeof factor?.methodology_ref!=='string'||!factor.methodology_ref.trim())reasons.push('METHODOLOGY_REF_MISSING');
  return reasons;
};

export const factorEligibility=factor=>{
  const reasons=factorIneligibility(factor);
  const value=Number(factor?.value);
  return {eligible:reasons.length===0,reasons,value:Number.isFinite(value)?value:null};
};

export const missingFactors=(cell,factors)=>factors.filter(factor=>factorIneligibility(cell?.factors?.[factor]).length>0);
