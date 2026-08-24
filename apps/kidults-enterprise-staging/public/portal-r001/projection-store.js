import {admitProofProductProjection} from './proof-product-admission.js';

const INTELLIGENCE_STATES=new Set(['LIVE_APPROVED','WAITING','STALE','INVALID','RIGHTS_BLOCKED','NOT_AVAILABLE','NO_PROJECTION']);
const STRUCTURAL_STATES=new Set(['AVAILABLE','PARTIAL','UNAVAILABLE']);
const RELEASE_STATES=new Set(['HOLD','READY','RELEASED']);
const CONTROL_RECORD_TYPE='kidults_non_promotable_control_projection';
const CONTROL_SCHEMA_VERSION='1.0.0';
const SAFE_STRUCTURAL_VERTICALS=Object.freeze([
  ['toys-models','Toys & Models'],
  ['watches-jewelry','Watches & Jewelry'],
  ['automobiles-mobility','Automobiles & Mobility'],
  ['fashion-accessories','Fashion & Accessories'],
  ['design-furniture','Design & Furniture'],
  ['technology-cameras','Technology & Cameras'],
  ['gaming-music-screen','Gaming / Music / Screen Culture'],
  ['cards-comics-memorabilia','Cards / Comics / Memorabilia']
].map(([vertical_id,label])=>Object.freeze({vertical_id,label,structural_state:'AVAILABLE'})));

const invalidProjection=reason=>({
  source:'CONTROL_FALLBACK',
  projection:{state:'INVALID',projection_id:null,as_of:null,assessment_id:null,rights_state:'WAITING',freshness:'NOT_AVAILABLE'},
  release:{state:'HOLD'},
  structural:{core_verticals:{value:8,state:'AVAILABLE'}},
  audit:{projection_id:null,assessment_id:null,replay_id:null,exact_pair_digest:null,correlation_id:null,rebuild_state:'NOT_AVAILABLE',replay_state:'NOT_AVAILABLE',rollback_state:'NOT_AVAILABLE',reason_category:reason||'LOAD_FAILURE'},
  // Product taxonomy is an immutable KIDULTS-owned structural catalog, not market Evidence.
  overview:[],verticals:[...SAFE_STRUCTURAL_VERTICALS],signals:[],objects:[],evidence:[],
  evidence_methodology:{coverage:'NOT_AVAILABLE',independence:'NOT_AVAILABLE',freshness:'NOT_AVAILABLE',rights:'WAITING',methodology_version:null,lineage_version:null},
  kidult_100:{state:'NOT_AVAILABLE',index_value:null,change:null,as_of:null,constituents:[],methodology_version:null},
  research_archive:{state:'NOT_AVAILABLE',items:[]}
});

export function normalizeIntelligenceState(value){return INTELLIGENCE_STATES.has(value)?value:'INVALID'}
export function normalizeStructuralState(value){return STRUCTURAL_STATES.has(value)?value:'UNAVAILABLE'}
export function normalizeReleaseState(value){return RELEASE_STATES.has(value)?value:'HOLD'}

function exactSignedPortalEnvelope(candidate){
  const view=candidate?.portal_view;
  const receipt=candidate?.consumption_receipt;
  return candidate?.ok===true&&Number.isInteger(candidate?.capability_expires_at)&&candidate?.revalidate_after_ms===5000&&view?.source==='SIGNED_SERVER_CAPABILITY'&&
    view?.projection?.state==='LIVE_APPROVED'&&view?.release?.state==='READY'&&
    receipt?.decision==='ACCEPTED'&&receipt?.surface==='PORTAL_RENDER'&&receipt?.purpose==='PUBLIC_DISPLAY'&&
    receipt?.release_authority==='SIGNED_SERVER_CAPABILITY'&&receipt?.clock_authority==='KIDULTS_CONTROL_PLANE'&&
    typeof receipt?.capability_digest==='string'&&receipt.capability_digest.length===64&&
    receipt?.payload_exposed===true&&receipt?.projection_id===view?.projection?.projection_id&&
    receipt?.assessment_id===view?.projection?.assessment_id&&receipt?.rights_state==='CLEARED'&&
    receipt?.freshness_state==='CURRENT'&&receipt?.production==='HOLD'&&receipt?.public==='HOLD'&&receipt?.g5==='HOLD';
}

export async function readPortalProjection({url='/api/v1/projection',controlUrl='./data/projection-control-fixture.json'}={}){
  try{
    const response=await fetch(url,{cache:'no-store',headers:{Accept:'application/json'}});
    if(!response.ok)throw new Error(`HTTP_${response.status}`);
    const candidate=await response.json();
    if(exactSignedPortalEnvelope(candidate))return Object.freeze({...candidate.portal_view,runtime_revalidate_after_ms:candidate.revalidate_after_ms});
    if(candidate?.record_type==='kidults_proof_product_projection'){
      const admission=admitProofProductProjection(candidate,{
        surface:'PORTAL_RENDER',
        purpose:'PUBLIC_DISPLAY',
        trustedNow:null,
        clockAuthority:'UNTRUSTED_BROWSER',
        releaseAuthority:'HOLD'
      });
      const fallback=invalidProjection(admission.receipt.reason);
      fallback.projection.state=admission.accepted&&admission.state_only?'NO_PROJECTION':'INVALID';
      fallback.audit.projection_id=admission.receipt.projection_id;
      fallback.audit.assessment_id=admission.receipt.assessment_id;
      fallback.audit.reason_category=admission.receipt.reason;
      fallback.audit.consumption_receipt=admission.receipt;
      return Object.freeze(fallback);
    }
    const exactControl=candidate?.record_type===CONTROL_RECORD_TYPE&&
      candidate?.schema_version===CONTROL_SCHEMA_VERSION&&
      candidate?.fixture_type==='NON_PROMOTABLE_CONTROL'&&candidate?.release?.state==='HOLD'&&
      candidate?.projection?.state==='NO_PROJECTION'&&candidate?.projection?.synthetic===true&&
      candidate?.projection?.promotable===false&&candidate?.projection?.production===false&&candidate?.projection?.public===false;
    if(exactControl){
      const fallback=invalidProjection('NO_GOVERNED_PROJECTION');
      fallback.fixture_type='NON_PROMOTABLE_CONTROL';
      fallback.projection.state='NO_PROJECTION';
      return Object.freeze(fallback);
    }
    throw new Error('PROJECTION_RECORD_TYPE_INVALID');
  }catch(error){
    if(url===controlUrl||url!=='/api/v1/projection')return Object.freeze(invalidProjection(error?.message));
    try{return await readPortalProjection({url:controlUrl,controlUrl})}
    catch{return Object.freeze(invalidProjection(error?.message))}
  }
}

export const portalProjectionContract=Object.freeze({
  version:'portal-read-contract-001',
  intelligence_states:[...INTELLIGENCE_STATES],
  structural_states:[...STRUCTURAL_STATES],
  release_states:[...RELEASE_STATES],
  canonical_record_type:'kidults_proof_product_projection',
  control_record_type:CONTROL_RECORD_TYPE,
  approved_browser_render:'SIGNED_SAME_ORIGIN_SERVER_ENVELOPE_ONLY',
  state_only_browser_render:'NO_PROJECTION_PAYLOADLESS',
  structural_catalog:'IMMUTABLE_KIDULTS_OWNED_EIGHT_VERTICAL_TAXONOMY',
  content_surfaces:['overview','core_verticals','object_intelligence','market_signals','kidult_100','research_archive','evidence_methodology','safe_audit','workspace'],
  raw_provider_payloads:false,
  credentials:false,
  track_b_bypass:false,
  proof_product_admission:'EXECUTED_BEFORE_RENDER',
  browser_clock_authoritative:false,
  approved_projection_release_authority:'SIGNED_SERVER_CAPABILITY',
  static_approved_projection:false,toctou_control:'SERVER_RELOAD_AND_READMISSION_PER_REQUEST'
});
