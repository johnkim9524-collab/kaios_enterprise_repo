import fs from 'node:fs';
import { readPortalProjection } from '../../../apps/kidults-enterprise-staging/public/portal-r001/projection-store.js';

const fixturePath='apps/kidults-enterprise-staging/public/portal-r001/data/projection-control-fixture.json';
const fixture=JSON.parse(fs.readFileSync(fixturePath,'utf8'));
const clone=value=>structuredClone(value);
const assert=(condition,message)=>{if(!condition)throw new Error(message)};

function validLiveEnvelope(){
  const data=clone(fixture);
  const asOf=new Date(Date.now()-60_000).toISOString();
  const pair=`sha256:${'a'.repeat(64)}`;
  const correlation=`sha256:${'c'.repeat(64)}`;
  delete data.fixture_type;
  data.projection={
    state:'LIVE_APPROVED',projection_id:'qa-projection-001',assessment_id:'qa-assessment-001',
    replay_id:'qa-replay-001',exact_pair_digest:pair,correlation_id:correlation,
    production:false,public:false,promotable:true,synthetic:false,
    assessment_recommendation:'PUBLISHABLE_INTERNAL',overall_rankability:true,
    as_of:asOf,rights_state:'APPROVED',freshness:'CURRENT'
  };
  data.release={state:'HOLD'};
  data.audit={
    projection_id:'qa-projection-001',assessment_id:'qa-assessment-001',replay_id:'qa-replay-001',
    exact_pair_digest:pair,correlation_id:correlation,rebuild_state:'PASS',replay_state:'PASS',
    rollback_state:'READY',reason_category:'QA_LIVE_APPROVED'
  };
  data.signals=[
    {signal_id:'qa-scale',label:'Market Scale',value:'QA VALUE',state:'LIVE_APPROVED',as_of:asOf,confidence:'HIGH',evidence_refs:['qa-evidence-001']},
    {signal_id:'qa-liquidity',label:'Liquidity',value:'QA VERIFIED',state:'LIVE_APPROVED',as_of:asOf,confidence:'MEDIUM',evidence_refs:['qa-evidence-002']}
  ];
  data.objects=[{
    object_id:'qa-object-001',title:'QA Reference Object',maker:'QA Maker',model:'QA Model',year:'1960',
    aliases:['QA Alias'],market_observations:['QA governed observation'],comparables:['QA governed comparable'],
    evidence_refs:['qa-evidence-001'],confidence:'HIGH',evidence_coverage:'COMPLETE',
    source_owner_independence:'VERIFIED',rights_state:'APPROVED',limitations:['QA simulation only']
  }];
  data.kidult_100={state:'LIVE_APPROVED',index_value:1000,change:null,as_of:asOf,constituents:['qa-object-001'],methodology_version:'qa-method-v1'};
  data.research_archive={state:'LIVE_APPROVED',items:[{research_id:'qa-research-001',title:'QA Projection Research',snapshot_id:'qa-snapshot-001',published_at:asOf,projection_id:'qa-projection-001'}]};
  data.evidence_methodology={coverage:'COMPLETE',independence:'VERIFIED',freshness:'CURRENT',rights:'APPROVED',methodology_version:'qa-method-v1',lineage_version:'qa-lineage-v1'};
  return data;
}

async function evaluate(payload,{fetchFailure=false,jsonFailure=false}={}){
  globalThis.fetch=async()=>{
    if(fetchFailure)throw new Error('SYNTHETIC_FETCH_FAILURE');
    return {ok:true,status:200,json:async()=>{if(jsonFailure)throw new Error('SYNTHETIC_JSON_FAILURE');return clone(payload)}};
  };
  return readPortalProjection({url:'https://synthetic.invalid/projection.json'});
}

const baseline=await evaluate(validLiveEnvelope());
assert(baseline.projection.state==='LIVE_APPROVED','valid LIVE_APPROVED baseline did not remain live');

const cases=[
  ['MISSING_PROJECTION_ID','INVALID',d=>{d.projection.projection_id=null}],
  ['MISSING_ASSESSMENT_ID','INVALID',d=>{d.projection.assessment_id=null}],
  ['MISSING_REPLAY_ID','INVALID',d=>{d.projection.replay_id=null}],
  ['MISSING_EXACT_PAIR','INVALID',d=>{d.projection.exact_pair_digest=null}],
  ['MALFORMED_EXACT_PAIR','INVALID',d=>{d.projection.exact_pair_digest='sha256:abc'}],
  ['MISSING_CORRELATION','INVALID',d=>{d.projection.correlation_id=null}],
  ['PRODUCTION_TRUE','INVALID',d=>{d.projection.production=true}],
  ['PUBLIC_TRUE','INVALID',d=>{d.projection.public=true}],
  ['PROMOTABLE_FALSE','INVALID',d=>{d.projection.promotable=false}],
  ['SYNTHETIC_TRUE','INVALID',d=>{d.projection.synthetic=true}],
  ['CONDITIONAL_ASSESSMENT','INVALID',d=>{d.projection.assessment_recommendation='CONDITIONAL'}],
  ['NON_RANKABLE','INVALID',d=>{d.projection.overall_rankability=false}],
  ['RELEASE_ESCALATION','INVALID',d=>{d.release.state='RELEASED'}],
  ['RIGHTS_WAITING','RIGHTS_BLOCKED',d=>{d.projection.rights_state='WAITING'}],
  ['RIGHTS_SYNTHETIC','RIGHTS_BLOCKED',d=>{d.projection.rights_state='ALLOW_SYNTHETIC_TEST_ONLY'}],
  ['RIGHTS_DISCOVERY','RIGHTS_BLOCKED',d=>{d.projection.rights_state='ALLOW_DISCOVERY_METADATA_ONLY'}],
  ['FRESHNESS_STALE','STALE',d=>{d.projection.freshness='STALE'}],
  ['FRESHNESS_PREFIX_FAKE','INVALID',d=>{d.projection.freshness='CURRENT_FAKE'}],
  ['CORRELATION_MISMATCH','INVALID',d=>{d.audit.correlation_id=`sha256:${'d'.repeat(64)}`}],
  ['AUDIT_PROJECTION_MISMATCH','INVALID',d=>{d.audit.projection_id='qa-projection-002'}],
  ['AUDIT_ASSESSMENT_MISMATCH','INVALID',d=>{d.audit.assessment_id='qa-assessment-002'}],
  ['AUDIT_REPLAY_MISMATCH','INVALID',d=>{d.audit.replay_id='qa-replay-002'}],
  ['AUDIT_PAIR_MISMATCH','INVALID',d=>{d.audit.exact_pair_digest=`sha256:${'b'.repeat(64)}`}],
  ['AUDIT_REBUILD_NOT_PASS','INVALID',d=>{d.audit.rebuild_state='WAITING'}],
  ['AUDIT_REPLAY_NOT_PASS','INVALID',d=>{d.audit.replay_state='WAITING'}],
  ['AUDIT_ROLLBACK_NOT_READY','INVALID',d=>{d.audit.rollback_state='WAITING'}],
  ['INVALID_AS_OF_FORMAT','INVALID',d=>{d.projection.as_of='2026-08-21'}],
  ['FUTURE_AS_OF','INVALID',d=>{d.projection.as_of='2099-01-01T00:00:00Z'}],
  ['OLD_AS_OF_CURRENT','INVALID',d=>{d.projection.as_of='2000-01-01T00:00:00Z'}],
  ['INVALID_CALENDAR_AS_OF','INVALID',d=>{d.projection.as_of='2026-02-30T00:00:00Z'}],
  ['MISSING_SIGNAL_EVIDENCE','INVALID',d=>{d.signals[0].evidence_refs=[]}],
  ['DUPLICATE_SIGNAL_EVIDENCE','INVALID',d=>{d.signals[0].evidence_refs=['qa-evidence-001','qa-evidence-001']}],
  ['EMPTY_SIGNAL_VALUE','INVALID',d=>{d.signals[0].value=''}],
  ['OBJECT_SIGNAL_VALUE','INVALID',d=>{d.signals[0].value={fake:true}}],
  ['BLOCKED_SIGNAL_CONFIDENCE','INVALID',d=>{d.signals[0].confidence='PENDING'}],
  ['INCOMPLETE_OBJECT_EVIDENCE','INVALID',d=>{d.objects[0].evidence_refs=[]}],
  ['DUPLICATE_OBJECT_EVIDENCE','INVALID',d=>{d.objects[0].evidence_refs=['qa-evidence-001','qa-evidence-001']}],
  ['INVALID_OBJECT_ALIASES','INVALID',d=>{d.objects[0].aliases={fake:true}}],
  ['BLOCKED_OBJECT_CONFIDENCE','INVALID',d=>{d.objects[0].confidence='UNVERIFIED'}],
  ['BLOCKED_OBJECT_COVERAGE','INVALID',d=>{d.objects[0].evidence_coverage='NO_EVIDENCE'}],
  ['OBJECT_RIGHTS_MISMATCH','INVALID',d=>{d.objects[0].rights_state='WAITING'}],
  ['DUPLICATE_VERTICAL_ID','INVALID',d=>{d.verticals[1].vertical_id=d.verticals[0].vertical_id}],
  ['DUPLICATE_SIGNAL_ID','INVALID',d=>{d.signals.push({...d.signals[0]})}],
  ['DUPLICATE_OBJECT_ID','INVALID',d=>{d.objects.push({...d.objects[0]})}],
  ['K100_NULL_CONSTITUENT','INVALID',d=>{d.kidult_100.constituents=[null]}],
  ['K100_UNKNOWN_CONSTITUENT','INVALID',d=>{d.kidult_100.constituents=['qa-object-unknown']}],
  ['DUPLICATE_K100_CONSTITUENT','INVALID',d=>{d.kidult_100.constituents=['qa-object-001','qa-object-001']}],
  ['INVALID_K100_CHANGE','INVALID',d=>{d.kidult_100.change={fake:true}}],
  ['DUPLICATE_RESEARCH_ID','INVALID',d=>{d.research_archive.items.push({...d.research_archive.items[0],snapshot_id:'qa-snapshot-002'})}],
  ['DUPLICATE_RESEARCH_SNAPSHOT','INVALID',d=>{d.research_archive.items.push({...d.research_archive.items[0],research_id:'qa-research-002'})}],
  ['ARCHIVE_PROJECTION_MISMATCH','INVALID',d=>{d.research_archive.items[0].projection_id='qa-projection-002'}],
  ['METHODOLOGY_RIGHTS_MISMATCH','INVALID',d=>{d.evidence_methodology.rights='BLOCKED'}],
  ['METHODOLOGY_FRESHNESS_MISMATCH','INVALID',d=>{d.evidence_methodology.freshness='STALE'}],
  ['METHODOLOGY_COVERAGE_WAITING','INVALID',d=>{d.evidence_methodology.coverage='WAITING'}],
  ['METHODOLOGY_INDEPENDENCE_WAITING','INVALID',d=>{d.evidence_methodology.independence='WAITING'}],
  ['MALFORMED_OBJECT_COLLECTION','INVALID',d=>{d.objects=[null]}],
  ['MALFORMED_SIGNAL_COLLECTION','INVALID',d=>{d.signals='not-an-array'}],
  ['CONTROL_FIXTURE_LIVE','INVALID',d=>{d.fixture_type='NON_PROMOTABLE_CONTROL'}],
  ['SYNTHETIC_FIXTURE_LIVE','INVALID',d=>{d.fixture_type='SYNTHETIC_TEST'}]
];

const results=[];
for(const [name,expected,mutate] of cases){
  const payload=validLiveEnvelope();
  mutate(payload);
  const evaluated=await evaluate(payload);
  assert(evaluated.projection.state===expected,`${name} expected ${expected}, got ${evaluated.projection.state}`);
  assert(evaluated.projection.state!=='LIVE_APPROVED',`${name} false-live regression`);
  results.push({name,expected,actual:evaluated.projection.state});
}

for(const [name,options] of [['FETCH_FAILURE',{fetchFailure:true}],['JSON_FAILURE',{jsonFailure:true}]]){
  const evaluated=await evaluate(validLiveEnvelope(),options);
  assert(evaluated.projection.state==='INVALID',`${name} must fail closed to INVALID`);
  assert(evaluated.fixture_type==='NON_PROMOTABLE_CONTROL',`${name} must return non-promotable fallback`);
  results.push({name,expected:'INVALID',actual:evaluated.projection.state});
}

// Mutation self-test: every declared critical category must have at least one executable case.
const requiredCategories={
  replay:/REPLAY/, pair:/PAIR|DIGEST/, correlation:/CORRELATION/, assessment:/ASSESSMENT/, rights:/RIGHTS/,
  temporal:/AS_OF|FRESHNESS/, evidence:/EVIDENCE/, object:/OBJECT/, k100:/K100/, research:/RESEARCH|ARCHIVE/,
  methodology:/METHODOLOGY/, identity:/PROJECTION_ID|VERTICAL_ID|SIGNAL_ID|OBJECT_ID/, transport:/FETCH_FAILURE|JSON_FAILURE/,
  release:/PUBLIC_TRUE|PRODUCTION_TRUE|RELEASE_ESCALATION/, synthetic:/SYNTHETIC|CONTROL_FIXTURE/
};
const resultNames=results.map(r=>r.name);
for(const [category,re] of Object.entries(requiredCategories))assert(resultNames.some(name=>re.test(name)),`critical adversarial category missing: ${category}`);

console.log(JSON.stringify({
  suite:'KIDULTS_PORTAL_R001_ADVERSARIAL_NONREGRESSION_V2',
  result:'PASS',
  governing_issue:971,
  valid_live_baseline:'PASS',
  fail_closed_cases:results.length,
  required_categories:Object.keys(requiredCategories),
  transport_failure_fallback:'INVALID_NON_PROMOTABLE',
  empirical_gate_effect:'NONE',
  live_approved_projection_effect:'NONE',
  production:'HOLD',
  public:'HOLD',
  g5:'EXPLICIT_APPROVAL_REQUIRED'
},null,2));
