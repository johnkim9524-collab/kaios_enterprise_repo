const INTELLIGENCE_STATES=new Set(['LIVE_APPROVED','WAITING','STALE','INVALID','RIGHTS_BLOCKED','NOT_AVAILABLE','NO_PROJECTION']);
const STRUCTURAL_STATES=new Set(['AVAILABLE','PARTIAL','UNAVAILABLE']);
const RELEASE_STATES=new Set(['HOLD','READY','RELEASED']);

const invalidProjection=reason=>({
  source:'CONTROL_FALLBACK',
  fixture_type:'NON_PROMOTABLE_CONTROL',
  projection:{state:'INVALID',projection_id:null,as_of:null,assessment_id:null,rights_state:'WAITING',freshness:'NOT_AVAILABLE'},
  release:{state:'HOLD'},
  structural:{core_verticals:{value:8,state:'AVAILABLE'}},
  audit:{correlation_id:null,rebuild_state:'NOT_AVAILABLE',replay_state:'NOT_AVAILABLE',rollback_state:'NOT_AVAILABLE',reason_category:reason||'LOAD_FAILURE'},
  overview:[],verticals:[],signals:[],evidence:[]
});

export function normalizeIntelligenceState(value){return INTELLIGENCE_STATES.has(value)?value:'INVALID'}
export function normalizeStructuralState(value){return STRUCTURAL_STATES.has(value)?value:'UNAVAILABLE'}
export function normalizeReleaseState(value){return RELEASE_STATES.has(value)?value:'HOLD'}

function validateEnvelope(data){
  if(!data||typeof data!=='object')throw new Error('PROJECTION_ENVELOPE_MISSING');
  if(!data.projection||typeof data.projection!=='object')throw new Error('PROJECTION_STATE_MISSING');
  data.projection.state=normalizeIntelligenceState(data.projection.state);
  data.release=data.release||{state:'HOLD'};
  data.release.state=normalizeReleaseState(data.release.state);
  data.structural=data.structural||{};
  if(data.structural.core_verticals){data.structural.core_verticals.state=normalizeStructuralState(data.structural.core_verticals.state)}
  data.audit=data.audit||{};
  return data;
}

export async function readPortalProjection({url='./data/projection-control-fixture.json'}={}){
  try{
    const response=await fetch(url,{cache:'no-store',headers:{'Accept':'application/json'}});
    if(!response.ok)throw new Error(`HTTP_${response.status}`);
    const data=validateEnvelope(await response.json());
    return Object.freeze(data);
  }catch(error){
    return Object.freeze(invalidProjection(error?.message));
  }
}

export const portalProjectionContract=Object.freeze({
  version:'portal-read-contract-001',
  intelligence_states:[...INTELLIGENCE_STATES],
  structural_states:[...STRUCTURAL_STATES],
  release_states:[...RELEASE_STATES],
  raw_provider_payloads:false,
  credentials:false,
  track_b_bypass:false
});
