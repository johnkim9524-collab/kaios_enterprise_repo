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

export function toPortalView(projection,receipt){
  const collector=projection.payload?.collector_lens||{};
  const signals=Object.values(collector).filter(field=>field?.state==='VERIFIED').slice(0,6).map(field=>({
    label:field.field_id,value:field.value,state:'LIVE_APPROVED',confidence:field.confidence_classification,
    evidence_refs:[...(field.evidence_references||[])],as_of:projection.freshness.observed_at
  }));
  return Object.freeze({
    source:'SIGNED_SERVER_CAPABILITY',
    projection:{state:'LIVE_APPROVED',projection_id:projection.projection_id,as_of:projection.freshness.observed_at,
      assessment_id:projection.lineage.assessment_id,rights_state:projection.rights.state,freshness:projection.freshness.state},
    release:{state:'READY'},verticals:[],signals,objects:[],evidence:[],
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
