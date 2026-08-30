import {createHash,createHmac,randomUUID,timingSafeEqual} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {admitProofProductProjectionWithVerifiedCapability} from './public/portal-r001/proof-product-admission.js';

const VERSION='kidults_projection_capability_v1';
const MAX_TTL_SECONDS=300;
const SURFACES=new Set(['PORTAL_RENDER','PUBLIC_API_RESPONSE','EXPORT']);

function canonical(value){
  if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;
  if(value&&typeof value==='object')return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

export function projectionDigest(projection){
  return createHash('sha256').update(canonical(projection)).digest('hex');
}

function secretBuffer(secret){
  const value=Buffer.isBuffer(secret)?secret:Buffer.from(String(secret||''));
  if(value.length<32)throw new Error('PROJECTION_CAPABILITY_SECRET_TOO_SHORT');
  return value;
}

function sign(encoded,secret){return createHmac('sha256',secretBuffer(secret)).update(encoded).digest('base64url')}

function exactIdentity(projection){
  return {
    projection_id:projection?.projection_id||null,
    assessment_id:projection?.lineage?.assessment_id||null,
    rankability_assessment_id:projection?.rankability?.assessment_id||null,
    snapshot_id:projection?.lineage?.snapshot_id||null,
    evidence_package_id:projection?.lineage?.evidence_package_id||null,
    projection_digest:projectionDigest(projection)
  };
}

export function issueProjectionCapability({projection,surface,secret,now=new Date(),ttlSeconds=120}){
  if(!SURFACES.has(surface))throw new Error('CAPABILITY_SURFACE_UNSUPPORTED');
  if(!Number.isInteger(ttlSeconds)||ttlSeconds<1||ttlSeconds>MAX_TTL_SECONDS)throw new Error('CAPABILITY_TTL_INVALID');
  const issuedAt=Math.floor(now.getTime()/1000);
  const claims={
    version:VERSION,jti:randomUUID(),surface,
    purpose:surface==='PORTAL_RENDER'?'PUBLIC_DISPLAY':'API_REDISTRIBUTION',
    issued_at:issuedAt,expires_at:issuedAt+ttlSeconds,...exactIdentity(projection)
  };
  const encoded=Buffer.from(canonical(claims)).toString('base64url');
  return Object.freeze({token:`${encoded}.${sign(encoded,secret)}`,claims:Object.freeze(claims)});
}

export function verifyProjectionCapability({token,projection,surface,secret,now=new Date()}){
  if(typeof token!=='string'||!token.includes('.'))throw new Error('CAPABILITY_MALFORMED');
  const [encoded,supplied,...extra]=token.split('.');
  if(extra.length||!encoded||!supplied)throw new Error('CAPABILITY_MALFORMED');
  const expected=sign(encoded,secret);
  const suppliedBytes=Buffer.from(supplied);
  const expectedBytes=Buffer.from(expected);
  if(suppliedBytes.length!==expectedBytes.length||!timingSafeEqual(suppliedBytes,expectedBytes))throw new Error('CAPABILITY_SIGNATURE_INVALID');
  let claims;
  try{claims=JSON.parse(Buffer.from(encoded,'base64url').toString('utf8'))}catch{throw new Error('CAPABILITY_CLAIMS_INVALID')}
  const current=Math.floor(now.getTime()/1000);
  if(claims.version!==VERSION)throw new Error('CAPABILITY_VERSION_INVALID');
  if(claims.surface!==surface||!SURFACES.has(surface))throw new Error('CAPABILITY_SURFACE_MISMATCH');
  if(current<claims.issued_at||current>=claims.expires_at||claims.expires_at-claims.issued_at>MAX_TTL_SECONDS)throw new Error('CAPABILITY_EXPIRED_OR_TIME_INVALID');
  const identity=exactIdentity(projection);
  for(const [key,value] of Object.entries(identity))if(claims[key]!==value)throw new Error(`CAPABILITY_BINDING_MISMATCH:${key}`);
  return Object.freeze(claims);
}

export function loadProjection(path){
  const projection=JSON.parse(readFileSync(path,'utf8'));
  if(projection?.record_type!=='kidults_proof_product_projection')throw new Error('PROJECTION_RECORD_TYPE_INVALID');
  return projection;
}

export function authorizeProjection({projection,surface,secret,now=new Date(),token=null}){
  const issued=token?null:issueProjectionCapability({projection,surface,secret,now});
  const effectiveToken=token||issued.token;
  const claims=verifyProjectionCapability({token:effectiveToken,projection,surface,secret,now});
  const capabilityDigest=createHash('sha256').update(effectiveToken).digest('hex');
  const admission=admitProofProductProjectionWithVerifiedCapability(projection,{
    surface,trustedNow:now,clockAuthority:'KIDULTS_CONTROL_PLANE',releaseAuthority:'SIGNED_SERVER_CAPABILITY',
    capabilityVerified:true,capabilityId:claims.jti,capabilityDigest
  });
  if(!admission.accepted)throw Object.assign(new Error(admission.receipt.reason),{receipt:admission.receipt});
  return Object.freeze({token:effectiveToken,claims,admission});
}

const ACTION_IDS=new Set(['COMPARE','WATCHLIST']);
const SIGNAL_FIELDS=['market_observations','comparables','liquidity','scarcity','condition','risks'];
const publicFieldValue=field=>['VERIFIED','INFERRED'].includes(field?.state)?field.value:null;
const list=value=>Array.isArray(value)?value:value==null?[]:[value];
const uniqueStrings=values=>[...new Set(values.filter(value=>typeof value==='string'&&value.length>0))];

function safePortalDestination(destination){
  if(typeof destination!=='string'||destination.length===0||/[\\\u0000-\u001f\u007f]/.test(destination))throw new Error('ACTION_DESTINATION_UNSAFE');
  let parsed;
  try{parsed=new URL(destination,'https://portal.kidults.invalid/portal/')}catch{throw new Error('ACTION_DESTINATION_UNSAFE')}
  if(parsed.origin!=='https://portal.kidults.invalid'||parsed.username||parsed.password)throw new Error('ACTION_DESTINATION_UNSAFE');
  return destination;
}

function portalActions(projection,objectId){
  if(projection.product_type!=='OBJECT_PASSPORT')return [];
  const actions=[];
  const seen=new Set();
  for(const action of projection.actions||[]){
    if(!ACTION_IDS.has(action?.action_id)||action?.state!=='ENABLED')continue;
    if(seen.has(action.action_id))throw new Error('ACTION_ID_DUPLICATE');
    seen.add(action.action_id);
    actions.push(Object.freeze({
      action_id:action.action_id,state:'ENABLED',destination:safePortalDestination(action.destination),
      canonical_object_id:objectId
    }));
  }
  return actions;
}

function objectPassportView(projection){
  if(projection.product_type!=='OBJECT_PASSPORT')return {objects:[],signals:[],evidence:[],actions:[]};
  const fields=projection.payload.fields;
  const objectId=projection.payload.canonical_object_id;
  const actions=portalActions(projection,objectId);
  const evidenceRefs=uniqueStrings([
    ...(projection.evidence_summary.evidence_references||[]),
    ...Object.values(fields).flatMap(field=>field.evidence_references||[])
  ]);
  const maker=publicFieldValue(fields.maker);
  const model=publicFieldValue(fields.model);
  const identity=publicFieldValue(fields.identity);
  const title=identity||[maker,model].filter(Boolean).join(' ')||objectId;
  const limitations=uniqueStrings([
    ...(projection.limitations||[]),
    ...Object.values(fields).flatMap(field=>field.limitations||[])
  ]);
  const object=Object.freeze({
    object_id:objectId,canonical_object_id:objectId,title,maker,model,
    variant:publicFieldValue(fields.variant),year:publicFieldValue(fields.year),aliases:[],
    market_observations:list(publicFieldValue(fields.market_observations)),
    comparables:list(publicFieldValue(fields.comparables)),evidence_refs:evidenceRefs,
    confidence:projection.confidence.classification,
    evidence_coverage:projection.evidence_summary.source_count>1?'SUFFICIENT':'BOUNDED',
    source_owner_independence:projection.evidence_summary.independent_source_family_count>1?'MULTI_SOURCE_VERIFIED':'VERIFIED',
    rights_state:projection.rights.state,limitations,actions
  });
  const signals=SIGNAL_FIELDS.flatMap(fieldId=>{
    const field=fields[fieldId];
    const value=publicFieldValue(field);
    if(value===null)return [];
    return [Object.freeze({
      signal_id:`${objectId}:${fieldId}`,label:fieldId,value,state:'LIVE_APPROVED',
      confidence:field.confidence_classification,evidence_refs:[...(field.evidence_references||[])],
      as_of:projection.freshness.observed_at,canonical_object_id:objectId
    })];
  });
  const evidence=evidenceRefs.map(evidenceRef=>Object.freeze({
    evidence_ref:evidenceRef,state:'LIVE_APPROVED',canonical_object_id:objectId
  }));
  return {objects:[object],signals,evidence,actions};
}

export function toPortalView(projection,receipt){
  const collector=projection.payload?.collector_lens||{};
  const marketSignals=Object.values(collector).filter(field=>field?.state==='VERIFIED').slice(0,6).map(field=>({
    label:field.field_id,value:field.value,state:'LIVE_APPROVED',confidence:field.confidence_classification,
    evidence_refs:[...(field.evidence_references||[])],as_of:projection.freshness.observed_at
  }));
  const passport=objectPassportView(projection);
  return Object.freeze({
    source:'SIGNED_SERVER_CAPABILITY',
    projection:{state:'LIVE_APPROVED',projection_id:projection.projection_id,as_of:projection.freshness.observed_at,
      assessment_id:projection.lineage.assessment_id,rights_state:projection.rights.state,freshness:projection.freshness.state,
      product_type:projection.product_type,canonical_object_id:projection.product_type==='OBJECT_PASSPORT'?projection.payload.canonical_object_id:null},
    release:{state:'READY'},verticals:[],signals:passport.signals.length?passport.signals:marketSignals,
    objects:passport.objects,evidence:passport.evidence,actions:passport.actions,
    evidence_methodology:{coverage:`${projection.evidence_summary.source_count} sources`,independence:`${projection.evidence_summary.independent_source_family_count} families`,freshness:projection.freshness.state,rights:projection.rights.state,methodology_version:projection.method_version,lineage_version:projection.contract_version},
    kidult_100:{state:'NOT_AVAILABLE',index_value:null,change:null,as_of:null,constituents:[],methodology_version:null},
    research_archive:{state:'NOT_AVAILABLE',items:[]},
    audit:{projection_id:projection.projection_id,assessment_id:projection.lineage.assessment_id,replay_id:null,
      exact_pair_digest:receipt.capability_digest,correlation_id:receipt.capability_id,rebuild_state:'NOT_AVAILABLE',replay_state:'NOT_AVAILABLE',rollback_state:'NOT_AVAILABLE',reason_category:'SIGNED_CAPABILITY_ADMISSION'}
  });
}

export const projectionCapabilityContract=Object.freeze({version:VERSION,max_ttl_seconds:MAX_TTL_SECONDS,
  surfaces:[...SURFACES],binding:['projection_digest','projection_id','assessment_id','rankability_assessment_id','snapshot_id','evidence_package_id','surface','purpose'],
  trusted_clock:'KIDULTS_CONTROL_PLANE',browser_issuance:false,static_approved_projection:false,production:'HOLD',public:'HOLD',g5:'HOLD'});
