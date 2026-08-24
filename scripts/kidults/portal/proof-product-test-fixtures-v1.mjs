const collectorFields=['what_changed','why_it_matters','comparable_context','liquidity','risk','possible_action'];
const institutionalFields=['universe','coverage','market_scale','depth','turnover','concentration','exposure','confidence'];

const verifiedField=field_id=>({
  field_id,state:'VERIFIED',value:`fixture-${field_id}`,
  evidence_references:[`fixture:evidence:${field_id}`],rights_state:'CLEARED',
  freshness_state:'CURRENT',confidence_classification:'HIGH',limitations:['TEST_FIXTURE_ONLY']
});

const closedField=field_id=>({
  field_id,state:'UNAVAILABLE',evidence_references:[],rights_state:'UNKNOWN',freshness_state:'UNKNOWN',
  confidence_classification:'NOT_ASSESSED',reason:'No approved Projection',
  opening_conditions:['Immutable Candidate/Evidence pair and Track B assessment'],limitations:['NO_PROJECTION']
});

const payload=fieldFactory=>({
  axes:[{axis_id:'time',label:'Observation period',unit:'date'}],
  filters:['PERIOD','CURRENCY','GEOGRAPHY','VENUE','VERTICAL'],
  collector_lens:Object.fromEntries(collectorFields.map(key=>[key,fieldFactory(key)])),
  institutional_lens:Object.fromEntries(institutionalFields.map(key=>[key,fieldFactory(key)]))
});

const baseProjection=productPayload=>({
  record_type:'kidults_proof_product_projection',contract_version:'1.0.0',projection_id:'fixture-approved-market-v1',
  product_type:'MARKET_PROJECTION_API',projection_state:'APPROVED_PUBLIC',display_eligibility:'PUBLIC_ALLOWED',
  scope:{verticals:['COLLECTIBLES'],period:{start:'2026-08-01T00:00:00Z',end:'2026-08-22T00:00:00Z'},geographies:['GLOBAL'],venues:['FIXTURE'],currencies:['USD']},
  method_version:'fixture-method-v1',lineage:{snapshot_id:'fixture-snapshot-v1',evidence_package_id:'fixture-evidence-v1',assessment_id:'fixture-assessment-v1',previous_projection_id:null},
  evidence_summary:{state:'PAIRED',source_count:2,independent_source_family_count:2,evidence_references:['fixture:evidence:1','fixture:evidence:2']},
  rights:{state:'CLEARED',internal_analysis:'ALLOWED',public_display:'ALLOWED',api_redistribution:'ALLOWED',profile_id:'fixture-rights-v1'},
  freshness:{state:'CURRENT',observed_at:'2026-08-22T10:00:00Z',valid_until:'2026-08-22T12:00:00Z'},
  confidence:{state:'ASSESSED',classification:'HIGH',value:0.95,method_version:'fixture-confidence-v1'},
  rankability:{state:'RANKABLE',assessment_id:'fixture-assessment-v1',reasons:['TEST FIXTURE — no live Track B assessment']},
  limitations:['TEST_FIXTURE_ONLY','NO_LIVE_PROJECTION'],missing_data:[],
  actions:[{action_id:'VIEW_GOVERNANCE',state:'ENABLED',destination:'/governance',reason:''}],
  audit:{governance_record_uri:'/governance',projection_record_uri:'/governance/projections/fixture-approved-market-v1',events:[]},
  payload:productPayload,generated_at:'2026-08-22T10:00:00Z',updated_at:'2026-08-22T10:05:00Z'
});

export function approvedProjectionFixture(){
  return baseProjection(payload(verifiedField));
}

export function stateOnlyProjectionFixture(projectionState='AWAITING_APPROVED_PROJECTION'){
  const projection=baseProjection(payload(closedField));
  Object.assign(projection,{
    projection_id:`fixture-${projectionState.toLowerCase().replaceAll('_','-')}-market-v1`,
    projection_state:projectionState,
    display_eligibility:['RIGHTS_BLOCKED','STALE','SUPERSEDED','REVOKED'].includes(projectionState)?'BLOCKED':'STATE_ONLY'
  });
  projection.lineage={previous_projection_id:null};
  projection.evidence_summary={state:'NOT_PAIRED',source_count:null,independent_source_family_count:null,evidence_references:[]};
  projection.rights={state:'UNKNOWN',internal_analysis:'UNKNOWN',public_display:'UNKNOWN',api_redistribution:'UNKNOWN',profile_id:null};
  projection.freshness={state:'UNKNOWN',observed_at:null,valid_until:null};
  projection.confidence={state:'NOT_ASSESSED',classification:'NOT_ASSESSED',value:null,method_version:null};
  projection.rankability={state:'PENDING',assessment_id:null,reasons:['Track B not started']};
  return projection;
}
