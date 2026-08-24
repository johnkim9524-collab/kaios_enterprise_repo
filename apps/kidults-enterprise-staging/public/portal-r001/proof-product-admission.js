import {validProofProductDateTime,validateProofProductProjectionSchema} from './proof-product-schema-validator.js';

const APPROVED_STATES=new Set(['APPROVED_INTERNAL','APPROVED_PUBLIC']);
const PRODUCT_TYPES=new Set(['OBJECT_PASSPORT','MARKET_PROJECTION_API','KIDULT_100_INDEX']);
const CLOSED_FIELD_STATES=new Set(['UNAVAILABLE','UNKNOWN','PENDING','RIGHTS_BLOCKED','STALE','NOT_APPLICABLE']);
const PURPOSE_RIGHT={INTERNAL_ANALYSIS:'internal_analysis',PUBLIC_DISPLAY:'public_display',API_REDISTRIBUTION:'api_redistribution'};
const SURFACE_PURPOSE={PORTAL_RENDER:'PUBLIC_DISPLAY',PUBLIC_API_RESPONSE:'API_REDISTRIBUTION',EXPORT:'API_REDISTRIBUTION'};
const UNBOUND_SURFACES=new Set(['PUBLIC_API_RESPONSE','EXPORT']);
const REQUIRED_ROOT=[
  'record_type','contract_version','projection_id','product_type','projection_state','display_eligibility',
  'scope','method_version','lineage','evidence_summary','rights','freshness','confidence','rankability',
  'limitations','missing_data','actions','audit','payload','generated_at','updated_at'
];

const plainObject=value=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const nonEmpty=value=>typeof value==='string'&&value.trim().length>0;
const allowedDecision=value=>['ALLOWED','BLOCKED','UNKNOWN'].includes(value);
const parsedTime=value=>{
  if(!nonEmpty(value)||!validProofProductDateTime(value))return null;
  const parsed=Date.parse(value);
  return Number.isFinite(parsed)?parsed:null;
};

function expectedRightsSummary(rights){
  const decisions=['internal_analysis','public_display','api_redistribution'].map(key=>rights[key]);
  if(decisions.some(value=>!allowedDecision(value)))return null;
  if(decisions.every(value=>value==='ALLOWED'))return 'CLEARED';
  if(decisions.some(value=>value==='ALLOWED'))return 'PARTIAL';
  if(decisions.every(value=>value==='BLOCKED'))return 'BLOCKED';
  return 'UNKNOWN';
}

function collectFields(value,fields=[]){
  if(Array.isArray(value))value.forEach(item=>collectFields(item,fields));
  else if(plainObject(value)){
    if(nonEmpty(value.field_id))fields.push(value);
    Object.values(value).forEach(item=>collectFields(item,fields));
  }
  return fields;
}

function structuralErrors(projection){
  const errors=validateProofProductProjectionSchema(projection).map(error=>`SCHEMA:${error}`);
  if(!plainObject(projection))return errors.length?errors:['PROJECTION_ENVELOPE_MISSING'];
  for(const key of REQUIRED_ROOT)if(!Object.hasOwn(projection,key))errors.push(`ROOT_FIELD_MISSING:${key}`);
  if(projection.record_type!=='kidults_proof_product_projection')errors.push('RECORD_TYPE_INVALID');
  if(projection.contract_version!=='1.0.0')errors.push('CONTRACT_VERSION_INVALID');
  if(!nonEmpty(projection.projection_id))errors.push('PROJECTION_ID_MISSING');
  if(!PRODUCT_TYPES.has(projection.product_type))errors.push('PRODUCT_TYPE_INVALID');
  if(!plainObject(projection.scope)||!plainObject(projection.lineage)||!plainObject(projection.evidence_summary)||
    !plainObject(projection.rights)||!plainObject(projection.freshness)||!plainObject(projection.confidence)||
    !plainObject(projection.rankability)||!plainObject(projection.audit)||!plainObject(projection.payload))errors.push('STRUCTURAL_OBJECT_MISSING');
  for(const key of ['limitations','missing_data','actions'])if(!Array.isArray(projection[key]))errors.push(`ROOT_ARRAY_INVALID:${key}`);
  if(!nonEmpty(projection.method_version))errors.push('METHOD_VERSION_MISSING');

  for(const field of collectFields(projection.payload)){
    const hasValue=Object.hasOwn(field,'value');
    if(CLOSED_FIELD_STATES.has(field.state)&&hasValue)errors.push(`CLOSED_FIELD_VALUE_PRESENT:${field.field_id}`);
    if(hasValue){
      if(!['VERIFIED','INFERRED'].includes(field.state))errors.push(`VALUE_FIELD_STATE_INVALID:${field.field_id}`);
      if(!Array.isArray(field.evidence_references)||field.evidence_references.length===0||field.evidence_references.some(value=>!nonEmpty(value)))errors.push(`VALUE_FIELD_EVIDENCE_MISSING:${field.field_id}`);
      if(field.rights_state!=='CLEARED')errors.push(`VALUE_FIELD_RIGHTS_INVALID:${field.field_id}`);
      if(field.freshness_state!=='CURRENT')errors.push(`VALUE_FIELD_FRESHNESS_INVALID:${field.field_id}`);
      if(!['LOW','MEDIUM','HIGH'].includes(field.confidence_classification))errors.push(`VALUE_FIELD_CONFIDENCE_INVALID:${field.field_id}`);
    }
    if(field.state==='RIGHTS_BLOCKED'&&field.rights_state!=='BLOCKED')errors.push(`RIGHTS_BLOCKED_CONTRADICTION:${field.field_id}`);
    if(field.state==='STALE'&&field.freshness_state!=='STALE')errors.push(`STALE_FIELD_CONTRADICTION:${field.field_id}`);
  }

  if(APPROVED_STATES.has(projection.projection_state)){
    const {lineage,evidence_summary:evidence,freshness,confidence,rankability,rights}=projection;
    for(const key of ['snapshot_id','evidence_package_id','assessment_id'])if(!nonEmpty(lineage[key]))errors.push(`APPROVED_LINEAGE_MISSING:${key}`);
    if(evidence.state!=='PAIRED'||!Number.isInteger(evidence.source_count)||evidence.source_count<1||
      !Number.isInteger(evidence.independent_source_family_count)||evidence.independent_source_family_count<1||
      !Array.isArray(evidence.evidence_references)||evidence.evidence_references.length<1)errors.push('APPROVED_EVIDENCE_NOT_PAIRED');
    if(freshness.state!=='CURRENT'||!nonEmpty(freshness.observed_at)||!nonEmpty(freshness.valid_until))errors.push('APPROVED_FRESHNESS_NOT_CURRENT');
    if(confidence.state!=='ASSESSED'||!['LOW','MEDIUM','HIGH'].includes(confidence.classification)||
      typeof confidence.value!=='number'||confidence.value<0||confidence.value>1||!nonEmpty(confidence.method_version))errors.push('APPROVED_CONFIDENCE_NOT_ASSESSED');
    if(rankability.state!=='RANKABLE'||!nonEmpty(rankability.assessment_id))errors.push('APPROVED_RANKABILITY_INVALID');
    if(!nonEmpty(rights.profile_id))errors.push('APPROVED_RIGHTS_PROFILE_MISSING');
  }
  if(projection.projection_state==='APPROVED_INTERNAL'&&(projection.display_eligibility!=='INTERNAL_ONLY'||projection.rights?.internal_analysis!=='ALLOWED'))errors.push('APPROVED_INTERNAL_DISPLAY_OR_RIGHTS_INVALID');
  if(projection.projection_state==='APPROVED_PUBLIC'&&(projection.display_eligibility!=='PUBLIC_ALLOWED'||projection.rights?.public_display!=='ALLOWED'))errors.push('APPROVED_PUBLIC_DISPLAY_OR_RIGHTS_INVALID');
  if(projection.display_eligibility==='PUBLIC_ALLOWED'&&projection.projection_state!=='APPROVED_PUBLIC')errors.push('PUBLIC_ALLOWED_WITHOUT_APPROVED_PUBLIC');
  if(projection.projection_state==='APPROVED_PUBLIC'&&projection.product_type==='MARKET_PROJECTION_API'&&projection.rights?.api_redistribution!=='ALLOWED')errors.push('PUBLIC_MARKET_API_REDISTRIBUTION_BLOCKED');
  return errors;
}

function semanticErrors(projection,{purpose,trustedNow,clockAuthority}){
  const errors=[];
  const rights=projection.rights||{};
  const expected=expectedRightsSummary(rights);
  if(expected===null||rights.state!==expected)errors.push('RIGHTS_SUMMARY_CONTRADICTION');
  if(!Object.hasOwn(PURPOSE_RIGHT,purpose))errors.push('CONSUMER_PURPOSE_UNSUPPORTED');
  else if(APPROVED_STATES.has(projection.projection_state)&&rights[PURPOSE_RIGHT[purpose]]!=='ALLOWED')errors.push(`CONSUMER_RIGHT_BLOCKED:${purpose}`);

  if(APPROVED_STATES.has(projection.projection_state)){
    if(projection.lineage?.assessment_id!==projection.rankability?.assessment_id)errors.push('ASSESSMENT_ID_REBOUND');
    if(clockAuthority!=='KIDULTS_CONTROL_PLANE')errors.push('TRUSTED_CLOCK_REQUIRED');
  }

  const generated=parsedTime(projection.generated_at);
  const updated=parsedTime(projection.updated_at);
  if(generated===null)errors.push('GENERATED_AT_INVALID');
  if(updated===null)errors.push('UPDATED_AT_INVALID');
  if(generated!==null&&updated!==null&&generated>updated)errors.push('TIMESTAMP_ORDER_INVALID');

  const now=trustedNow instanceof Date?trustedNow.getTime():parsedTime(trustedNow);
  if(APPROVED_STATES.has(projection.projection_state)&&now===null)errors.push('TRUSTED_NOW_INVALID');
  if(now!==null&&updated!==null&&updated>now)errors.push('UPDATED_AT_IN_FUTURE');

  const observedRaw=projection.freshness?.observed_at;
  const validUntilRaw=projection.freshness?.valid_until;
  if(projection.freshness?.state==='CURRENT'){
    const observed=parsedTime(observedRaw);
    const validUntil=parsedTime(validUntilRaw);
    if(observed===null||validUntil===null)errors.push('CURRENT_FRESHNESS_TIME_INVALID');
    else{
      if(observed>validUntil)errors.push('FRESHNESS_WINDOW_REVERSED');
      if(now!==null&&observed>now)errors.push('FRESHNESS_OBSERVED_IN_FUTURE');
      if(now!==null&&now>=validUntil)errors.push('FRESHNESS_EXPIRED_AT_CONSUMPTION');
    }
  }else if((observedRaw===null)!==(validUntilRaw===null))errors.push('FRESHNESS_TIME_PAIR_INCOMPLETE');
  else if(observedRaw!==null&&validUntilRaw!==null){
    const observed=parsedTime(observedRaw);
    const validUntil=parsedTime(validUntilRaw);
    if(observed===null||validUntil===null||observed>validUntil)errors.push('CLOSED_FRESHNESS_WINDOW_INVALID');
  }
  return errors;
}

function receipt(projection,context,{accepted,reason,errors,stateOnly}){
  return Object.freeze({
    record_type:'kidults_projection_consumption_receipt',version:'1.0.0',decision:accepted?'ACCEPTED':'REJECTED',
    reason,errors:Object.freeze([...errors]),surface:context.surface,purpose:context.purpose,
    projection_id:nonEmpty(projection?.projection_id)?projection.projection_id:null,
    assessment_id:nonEmpty(projection?.lineage?.assessment_id)?projection.lineage.assessment_id:null,
    rankability_assessment_id:nonEmpty(projection?.rankability?.assessment_id)?projection.rankability.assessment_id:null,
    rights_state:projection?.rights?.state||'UNKNOWN',freshness_state:projection?.freshness?.state||'UNKNOWN',
    valid_until:projection?.freshness?.valid_until||null,clock_authority:context.clockAuthority||'NONE',
    release_authority:context.releaseAuthority||'HOLD',state_only:stateOnly,payload_exposed:false,
    production:'HOLD',public:'HOLD',g5:'HOLD',
    autonomous_effect:'One executable admission function governs Portal, API and export.',
    global_effect:'Consumer validation is product- and geography-neutral.',
    irreplaceable_value_effect:'KIDULTS-owned Projection semantics remain provider-independent.',
    transparency_effect:'Every decision records identity, rights, freshness, purpose and rejection reason.'
  });
}

export function admitProofProductProjection(projection,context={}){
  const requestedSurface=context.surface||'UNKNOWN';
  const normalized={
    surface:requestedSurface,
    purpose:SURFACE_PURPOSE[requestedSurface]||'UNKNOWN',
    trustedNow:null,
    clockAuthority:'NO_BOUND_CONTROL_PLANE',
    releaseAuthority:'HOLD'
  };
  const errors=[];
  if(UNBOUND_SURFACES.has(requestedSurface))errors.push('SURFACE_NOT_IMPLEMENTED_HOLD');
  else if(requestedSurface!=='PORTAL_RENDER')errors.push('SURFACE_UNSUPPORTED');
  const structural=structuralErrors(projection);
  const semantic=structural.length?[]:semanticErrors(projection,normalized);
  errors.push(...structural,...semantic);
  const approved=APPROVED_STATES.has(projection?.projection_state);
  const stateOnly=!approved;
  if(approved)errors.push('RELEASE_AUTHORITY_HOLD');
  if(normalized.surface==='PORTAL_RENDER'&&approved)errors.push('CLIENT_VALUE_RENDER_DISABLED');
  const accepted=errors.length===0;
  const resultReceipt=receipt(projection,normalized,{accepted,reason:accepted?(stateOnly?'STATE_ONLY_ACCEPTED':'APPROVED_TEST_ADMISSION'):errors[0],errors,stateOnly});
  // Public/browser evaluation never releases the raw Projection or payload.
  // A future server-only signed-capability consumer must attach approved values after verification.
  return Object.freeze({accepted,state_only:stateOnly,projection:null,payload:null,receipt:resultReceipt});
}

export const proofProductConsumerContract=Object.freeze({
  version:'1.0.0',surfaces:['PORTAL_RENDER','PUBLIC_API_RESPONSE','EXPORT'],
  bound_surfaces:['PORTAL_RENDER_STATE_ONLY'],unbound_surfaces:['PUBLIC_API_RESPONSE','EXPORT'],
  purposes:['PUBLIC_DISPLAY','API_REDISTRIBUTION'],schema_only_sufficient:false,
  browser_clock_authoritative:false,caller_asserted_authority_accepted:false,
  fixture_validation_bypass:false,
  approved_release_capability_exposed:false,release_authority_default:'HOLD',
  production:'HOLD',public:'HOLD',g5:'HOLD'
});
