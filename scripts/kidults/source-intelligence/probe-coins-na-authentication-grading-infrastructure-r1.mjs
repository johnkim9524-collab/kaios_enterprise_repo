import fs from 'node:fs/promises';

const config=JSON.parse(await fs.readFile('coordination/kidults/source-intelligence/coins-na-authentication-grading-infrastructure-r1.json','utf8'));
const outPath=process.argv[2]||'/tmp/coins-na-authentication-grading-infrastructure-r1.json';

if(config.rights_state!=='HOLD_SECOND_SOURCE_RIGHTS_NOT_CLEARED') throw new Error('EXPECTED_RIGHTS_HOLD');
if(config.factor_state!=='UNKNOWN_RIGHTS_HOLD') throw new Error('EXPECTED_UNKNOWN_FACTOR_STATE');
const ngc=(config.sources||[]).find(x=>x.source_owner_id==='ngc');
if(!ngc||ngc.transport_state!=='PROHIBITED_AUTOMATED_WEBSITE_ACCESS_WITHOUT_PRIOR_WRITTEN_CONSENT') throw new Error('NGC_TRANSPORT_NOT_QUARANTINED');

const assertion={
  factor_id:config.factor_id,
  category_scope:config.category_scope,
  macroregion_id:config.macroregion_id,
  value_or_unknown:'UNKNOWN',
  observed_at:null,
  source_observation_ids:[],
  evidence_refs:config.rights_evidence_refs||[],
  rights_state:config.rights_state,
  provenance_refs:config.rights_evidence_refs||[],
  methodology_version:'regional-market-factor-registry-v1/1.0.0',
  confidence:'NOT_VERIFIED',
  freshness_state:'NOT_VERIFIED_RIGHTS_HOLD'
};
const artifact={
  id:config.id,
  version:config.version,
  status:'NOT_VERIFIED_RIGHTS_HOLD',
  factor_assertion:assertion,
  independent_source_owner_count:0,
  source_observations:[],
  network_probe_performed:false,
  quarantined_source_owner_ids:['ngc'],
  excluded_transport_lanes:config.excluded_transport_lanes||[],
  authentication_grading_infrastructure_claim:false,
  market_scale_claim:false,
  market_maturity_claim:false,
  transaction_activity_claim:false,
  price_claim:false,
  liquidity_claim:false,
  demand_claim:false,
  sales_claim:false,
  market_share_claim:false,
  global_weight_claim:false,
  public_release:'HOLD',
  production:'HOLD',
  truth_boundary:config.truth_boundary
};
await fs.writeFile(outPath,JSON.stringify(artifact,null,2)+'\n');
console.log(JSON.stringify({status:artifact.status,network_probe_performed:false,factor_id:assertion.factor_id,rights_state:assertion.rights_state,verified_market_factor:false,production:'HOLD'},null,2));
