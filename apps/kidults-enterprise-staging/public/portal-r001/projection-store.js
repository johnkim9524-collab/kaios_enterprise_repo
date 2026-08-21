const INTELLIGENCE_STATES=new Set(['LIVE_APPROVED','WAITING','STALE','INVALID','RIGHTS_BLOCKED','NOT_AVAILABLE','NO_PROJECTION']);
const STRUCTURAL_STATES=new Set(['AVAILABLE','PARTIAL','UNAVAILABLE']);
const RELEASE_STATES=new Set(['HOLD','READY','RELEASED']);
const LIVE_FRESHNESS=new Set(['CURRENT','FRESH']);
const LIVE_RIGHTS=new Set(['APPROVED','PUBLISHABLE_INTERNAL','PUBLISHABLE_PUBLIC','FIELD_BY_PURPOSE_RIGHTS_PASS','PUBLICATION_APPROVED']);
const LIVE_RECOMMENDATIONS=new Set(['PUBLISHABLE_INTERNAL','PUBLISHABLE_PUBLIC']);
const LIVE_CONFIDENCE=new Set(['HIGH','MEDIUM']);
const LIVE_COVERAGE=new Set(['COMPLETE','SUFFICIENT','BOUNDED']);
const LIVE_INDEPENDENCE=new Set(['VERIFIED','MULTI_SOURCE_VERIFIED','SOURCE_OWNER_INDEPENDENT']);
const LIVE_MAX_AGE_MS=31*24*60*60*1000;

const nonEmpty=value=>typeof value==='string'&&value.trim().length>0;
const strictIso=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const parsedStrictIso=value=>{
  if(!nonEmpty(value)||!strictIso.test(value))return null;
  const parsed=Date.parse(value);
  if(!Number.isFinite(parsed))return null;
  const [base,fraction='']=value.slice(0,-1).split('.');
  const normalized=`${base}.${fraction.padEnd(3,'0')}Z`;
  return new Date(parsed).toISOString()===normalized?parsed:null;
};
const validDate=value=>{const parsed=parsedStrictIso(value);return parsed!==null&&parsed<=Date.now()+300000};
const validLiveDate=value=>{const parsed=parsedStrictIso(value);return parsed!==null&&parsed<=Date.now()+300000&&parsed>=Date.now()-LIVE_MAX_AGE_MS};
const validDigest=value=>nonEmpty(value)&&/^sha256:[0-9a-f]{64}$/.test(value);
const validDisplayScalar=value=>(typeof value==='number'&&Number.isFinite(value))||nonEmpty(value);
const uniqueNonEmpty=values=>Array.isArray(values)&&values.every(nonEmpty)&&new Set(values).size===values.length;
const liveRightsApproved=value=>nonEmpty(value)&&LIVE_RIGHTS.has(value);
const liveFreshnessApproved=value=>nonEmpty(value)&&LIVE_FRESHNESS.has(value);

const invalidProjection=reason=>({
  source:'CONTROL_FALLBACK',
  fixture_type:'NON_PROMOTABLE_CONTROL',
  projection:{state:'INVALID',projection_id:null,as_of:null,assessment_id:null,rights_state:'WAITING',freshness:'NOT_AVAILABLE'},
  release:{state:'HOLD'},
  structural:{core_verticals:{value:8,state:'AVAILABLE'}},
  audit:{projection_id:null,assessment_id:null,replay_id:null,exact_pair_digest:null,correlation_id:null,rebuild_state:'NOT_AVAILABLE',replay_state:'NOT_AVAILABLE',rollback_state:'NOT_AVAILABLE',reason_category:reason||'LOAD_FAILURE'},
  overview:[],verticals:[],signals:[],objects:[],evidence:[],
  evidence_methodology:{coverage:'NOT_AVAILABLE',independence:'NOT_AVAILABLE',freshness:'NOT_AVAILABLE',rights:'WAITING',methodology_version:null,lineage_version:null},
  kidult_100:{state:'NOT_AVAILABLE',index_value:null,change:null,as_of:null,constituents:[],methodology_version:null},
  research_archive:{state:'NOT_AVAILABLE',items:[]}
});

export function normalizeIntelligenceState(value){return INTELLIGENCE_STATES.has(value)?value:'INVALID'}
export function normalizeStructuralState(value){return STRUCTURAL_STATES.has(value)?value:'UNAVAILABLE'}
export function normalizeReleaseState(value){return RELEASE_STATES.has(value)?value:'HOLD'}

function normalizeArray(data,key,predicate){
  const supplied=Object.hasOwn(data,key);
  const isArray=Array.isArray(data[key]);
  const source=isArray?data[key]:[];
  const valid=source.filter(predicate);
  data[key]=valid;
  return {supplied,malformed:(supplied&&!isArray)||valid.length!==source.length};
}

function normalizeCollections(data){
  const required=[];
  required.push(normalizeArray(data,'verticals',item=>nonEmpty(item)||(item&&typeof item==='object'&&!Array.isArray(item)&&nonEmpty(item.vertical_id)&&nonEmpty(item.label))));
  required.push(normalizeArray(data,'signals',item=>nonEmpty(item)||(item&&typeof item==='object'&&!Array.isArray(item)&&nonEmpty(item.label))));
  required.push(normalizeArray(data,'objects',item=>item&&typeof item==='object'&&!Array.isArray(item)&&nonEmpty(item.object_id)&&nonEmpty(item.title)));
  const optional=[
    normalizeArray(data,'overview',item=>item&&typeof item==='object'&&!Array.isArray(item)),
    normalizeArray(data,'evidence',item=>item&&typeof item==='object'&&!Array.isArray(item)&&nonEmpty(item.label))
  ];
  return required.some(result=>!result.supplied||result.malformed)||optional.some(result=>result.malformed);
}

function normalizeContentRecords(data){
  let malformed=false;
  if(!data.kidult_100||typeof data.kidult_100!=='object'||Array.isArray(data.kidult_100)){
    data.kidult_100={state:'NOT_AVAILABLE',index_value:null,change:null,as_of:null,constituents:[],methodology_version:null};
    malformed=true;
  }else{
    data.kidult_100.state=normalizeIntelligenceState(data.kidult_100.state);
    if(!Array.isArray(data.kidult_100.constituents)){data.kidult_100.constituents=[];malformed=true}
  }
  if(!data.research_archive||typeof data.research_archive!=='object'||Array.isArray(data.research_archive)){
    data.research_archive={state:'NOT_AVAILABLE',items:[]};
    malformed=true;
  }else{
    data.research_archive.state=normalizeIntelligenceState(data.research_archive.state);
    if(!Array.isArray(data.research_archive.items)){data.research_archive.items=[];malformed=true}
  }
  if(!data.evidence_methodology||typeof data.evidence_methodology!=='object'||Array.isArray(data.evidence_methodology)){
    data.evidence_methodology={coverage:'NOT_AVAILABLE',independence:'NOT_AVAILABLE',freshness:'NOT_AVAILABLE',rights:'WAITING',methodology_version:null,lineage_version:null};
    malformed=true;
  }
  return malformed;
}

function liveContentComplete(data){
  const verticalIds=data.verticals.map(item=>item?.vertical_id);
  const signalIds=data.signals.map(item=>item?.signal_id);
  const objectIdsList=data.objects.map(item=>item?.object_id);
  const verticalsComplete=data.verticals.length===8&&uniqueNonEmpty(verticalIds)&&data.verticals.every(item=>item&&typeof item==='object'&&nonEmpty(item.label)&&normalizeStructuralState(item.structural_state)==='AVAILABLE');
  const signalsComplete=data.signals.length>0&&uniqueNonEmpty(signalIds)&&data.signals.every(item=>item&&typeof item==='object'&&nonEmpty(item.label)&&validDisplayScalar(item.value)&&normalizeIntelligenceState(item.state)==='LIVE_APPROVED'&&validLiveDate(item.as_of)&&LIVE_CONFIDENCE.has(item.confidence)&&uniqueNonEmpty(item.evidence_refs)&&item.evidence_refs.length>0);
  const objectsComplete=data.objects.length>0&&uniqueNonEmpty(objectIdsList)&&data.objects.every(item=>nonEmpty(item.maker)&&nonEmpty(item.model)&&nonEmpty(item.year)&&Array.isArray(item.aliases)&&uniqueNonEmpty(item.aliases)&&Array.isArray(item.market_observations)&&item.market_observations.length>0&&item.market_observations.every(nonEmpty)&&Array.isArray(item.comparables)&&item.comparables.length>0&&item.comparables.every(nonEmpty)&&uniqueNonEmpty(item.evidence_refs)&&item.evidence_refs.length>0&&LIVE_CONFIDENCE.has(item.confidence)&&LIVE_COVERAGE.has(item.evidence_coverage)&&LIVE_INDEPENDENCE.has(item.source_owner_independence)&&item.rights_state===data.projection.rights_state&&Array.isArray(item.limitations)&&item.limitations.length>0&&item.limitations.every(nonEmpty));
  const k100=data.kidult_100;
  const objectIds=new Set(objectIdsList);
  const kidultComplete=normalizeIntelligenceState(k100.state)==='LIVE_APPROVED'&&Number.isFinite(k100.index_value)&&(k100.change===null||Number.isFinite(k100.change))&&validLiveDate(k100.as_of)&&uniqueNonEmpty(k100.constituents)&&k100.constituents.length>0&&k100.constituents.every(id=>objectIds.has(id))&&nonEmpty(k100.methodology_version);
  const archive=data.research_archive;
  const researchComplete=normalizeIntelligenceState(archive.state)==='LIVE_APPROVED'&&archive.items.length>0&&uniqueNonEmpty(archive.items.map(item=>item?.research_id))&&uniqueNonEmpty(archive.items.map(item=>item?.snapshot_id))&&archive.items.every(item=>item&&nonEmpty(item.title)&&validDate(item.published_at)&&item.projection_id===data.projection.projection_id);
  const methodology=data.evidence_methodology;
  const methodologyComplete=LIVE_COVERAGE.has(methodology.coverage)&&LIVE_INDEPENDENCE.has(methodology.independence)&&methodology.freshness===data.projection.freshness&&methodology.rights===data.projection.rights_state&&nonEmpty(methodology.methodology_version)&&nonEmpty(methodology.lineage_version);
  const auditComplete=data.audit.rebuild_state==='PASS'&&data.audit.replay_state==='PASS'&&data.audit.rollback_state==='READY'&&nonEmpty(data.audit.reason_category);
  return verticalsComplete&&signalsComplete&&objectsComplete&&kidultComplete&&researchComplete&&methodologyComplete&&auditComplete;
}

function downgrade(data,state,reason){
  data.projection.state=state;
  data.audit.reason_category=reason;
  return data;
}

function validateEnvelope(data){
  if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('PROJECTION_ENVELOPE_MISSING');
  if(!data.projection||typeof data.projection!=='object'||Array.isArray(data.projection))throw new Error('PROJECTION_STATE_MISSING');
  data.release=data.release&&typeof data.release==='object'?data.release:{state:'HOLD'};
  const requestedRelease=normalizeReleaseState(data.release.state);
  data.release.state='HOLD';
  data.structural=data.structural&&typeof data.structural==='object'?data.structural:{};
  if(data.structural.core_verticals)data.structural.core_verticals.state=normalizeStructuralState(data.structural.core_verticals.state);
  data.audit=data.audit&&typeof data.audit==='object'&&!Array.isArray(data.audit)?data.audit:{};
  const malformedCollections=normalizeCollections(data)||normalizeContentRecords(data);
  const requestedState=normalizeIntelligenceState(data.projection.state);
  data.projection.state=requestedState;

  if(requestedState!=='LIVE_APPROVED')return data;
  if(requestedRelease!=='HOLD')return downgrade(data,'INVALID','STAGING_RELEASE_ESCALATION_ATTEMPT');
  if(nonEmpty(data.fixture_type))return downgrade(data,'INVALID','FIXTURE_LIVE_ATTEMPT');
  if(!liveRightsApproved(data.projection.rights_state))return downgrade(data,'RIGHTS_BLOCKED','LIVE_RIGHTS_NOT_APPROVED');
  if(String(data.projection.freshness||'').startsWith('STALE'))return downgrade(data,'STALE','LIVE_PROJECTION_STALE');
  const projectionCorrelation=data.projection.correlation_id;
  const auditCorrelation=data.audit.correlation_id;
  const correlationBound=validDigest(projectionCorrelation)&&validDigest(auditCorrelation)&&projectionCorrelation===auditCorrelation;
  const auditBound=data.audit.projection_id===data.projection.projection_id&&data.audit.assessment_id===data.projection.assessment_id&&data.audit.replay_id===data.projection.replay_id&&data.audit.exact_pair_digest===data.projection.exact_pair_digest;
  const requiredIdentity=nonEmpty(data.projection.projection_id)&&nonEmpty(data.projection.assessment_id)&&nonEmpty(data.projection.replay_id)&&validDigest(data.projection.exact_pair_digest)&&data.projection.production===false&&data.projection.public===false&&data.projection.promotable===true&&data.projection.synthetic===false&&LIVE_RECOMMENDATIONS.has(data.projection.assessment_recommendation)&&data.projection.overall_rankability===true&&validLiveDate(data.projection.as_of)&&correlationBound&&auditBound;
  if(!requiredIdentity||!liveFreshnessApproved(data.projection.freshness)||malformedCollections||!liveContentComplete(data))return downgrade(data,'INVALID','LIVE_ENVELOPE_INCOMPLETE');
  return data;
}

export async function readPortalProjection({url='./data/projection-control-fixture.json'}={}){
  try{
    const response=await fetch(url,{cache:'no-store',headers:{Accept:'application/json'}});
    if(!response.ok)throw new Error(`HTTP_${response.status}`);
    return Object.freeze(validateEnvelope(await response.json()));
  }catch(error){
    return Object.freeze(invalidProjection(error?.message));
  }
}

export const portalProjectionContract=Object.freeze({
  version:'portal-read-contract-001',
  intelligence_states:[...INTELLIGENCE_STATES],
  structural_states:[...STRUCTURAL_STATES],
  release_states:[...RELEASE_STATES],
  live_envelope_requires:['projection_id','assessment_id','replay_id','exact_pair_digest','correlation_id','production=false','public=false','promotable','synthetic','assessment_recommendation','overall_rankability','as_of','freshness','rights_state'],
  content_surfaces:['overview','core_verticals','object_intelligence','market_signals','kidult_100','research_archive','evidence_methodology','safe_audit','workspace'],
  raw_provider_payloads:false,
  credentials:false,
  track_b_bypass:false
});
