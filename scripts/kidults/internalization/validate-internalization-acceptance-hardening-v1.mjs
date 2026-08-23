import fs from 'node:fs';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const f=read('coordination/kidults/internalization/internalization-acceptance-fixtures-v1.json');
const rights=read('coordination/kidults/internalization/rights-intelligence-policy-v1.json');
const econ=read('coordination/kidults/internalization/provider-economics-contract-v1.json');
const rep=read('coordination/kidults/internalization/source-reputation-contract-v1.json');
const integrity=read('coordination/kidults/internalization/market-integrity-contract-v1.json');
const ontology=read('coordination/kidults/internalization/canonical-ontology-evolution-contract-v1.json');
const history=read('coordination/kidults/internalization/historical-learning-memory-contract-v1.json');
const removal=read('coordination/kidults/internalization/provider-removal-simulation-contract-v1.json');
const errs=[];

if(f.contains_raw_provider_data!==false) errs.push('acceptance fixtures must not contain raw provider data');

// #1154 Rights acceptance
if((f.rights_negative_cases||[]).length<10) errs.push('rights negative cases must be >=10');
const rightExpected=new Set(['HOLD','NO_GO']);
for(const c of f.rights_negative_cases||[]) if(!rightExpected.has(c.expected)) errs.push(`invalid rights expected state ${c.id}`);
for(const p of ['PSA','GEMRATE','CGC_CCG','CLASSIC_COM']) {
  const x=f.rights_provider_fixtures?.find(v=>v.provider_id===p);
  if(!x || x.raw_fields!==false) errs.push(`missing non-raw rights fixture ${p}`);
}
for(const d of ['entity','territory','environment','user_role']) if(!rights.scope_dimensions?.includes(d)) errs.push(`rights scope dimension missing ${d}`);
if(rights.fail_closed_rules?.unknown_required_right!=='HOLD' || rights.fail_closed_rules?.expired_authority!=='HOLD' || rights.fail_closed_rules?.contradictory_authority!=='HOLD') errs.push('rights fail-closed semantics drift');

// #1155 Economics acceptance
if((f.economics_provider_fixtures||[]).length!==7) errs.push('economics fixtures must cover 7 providers');
for(const x of f.economics_provider_fixtures||[]) {
  if(!['PARTIAL_KNOWN','UNKNOWN'].includes(x.external_price_state)) errs.push(`${x.provider_id} price state must preserve UNKNOWN/PARTIAL`);
  if(x.comparison_axis!=='MAKE_BUY_PARTNER_FALLBACK') errs.push(`${x.provider_id} comparison axis drift`);
}
if(!econ.metrics?.includes('internal_engineering_cost_avoided')) errs.push('economics must include internal engineering avoided cost');
if(!econ.recommendations?.includes('MAKE') || !econ.recommendations?.includes('BUY') || !econ.recommendations?.includes('PARTNER')) errs.push('economics make/buy/partner recommendation missing');

// #1156 Source reputation acceptance
if((f.source_reputation_initial_fixtures||[]).length!==7) errs.push('reputation fixtures must cover 7 providers');
for(const x of f.source_reputation_initial_fixtures||[]) if(x.state!=='UNKNOWN' || x.measured!==false || x.time_versioned!==true || x.evidence_required!==true) errs.push(`${x.provider_id} reputation initial truth drift`);
if(rep.requirements?.marketing_claim_auto_promotion!==false || rep.requirements?.provider_removal_deletes_history!==false) errs.push('reputation ownership boundary drift');

// #1157 Market-integrity acceptance
if((f.market_integrity_mutations||[]).length<20) errs.push('market integrity mutations must be >=20');
if(new Set(f.market_integrity_mutations||[]).size!==(f.market_integrity_mutations||[]).length) errs.push('market integrity mutations must be unique/deterministic');
if(integrity.requirements?.evidence_reference_required!==true || integrity.requirements?.provenance_required!==true) errs.push('integrity evidence/provenance requirement drift');
if(integrity.requirements?.provider_native_flag_required!==false || integrity.requirements?.unknown_state_supported!==true || integrity.requirements?.false_positive_containment_required!==true) errs.push('integrity independence/UNKNOWN/FP containment drift');

// #1158 Ontology acceptance
const graders=(f.ontology_provider_fixtures||[]).filter(x=>x.type==='GRADER');
const markets=(f.ontology_provider_fixtures||[]).filter(x=>x.type==='MARKET');
if(graders.length<4 || markets.length<3) errs.push('ontology fixture floor 4 graders + 3 markets not met');
for(const x of f.ontology_provider_fixtures||[]) if(x.canonical!==false || x.adapter_required!==true) errs.push(`${x.provider_id} taxonomy boundary drift`);
for(const op of ['MERGE','SPLIT','DEPRECATE']) {
  const x=f.ontology_replay_cases?.find(v=>v.operation===op);
  if(!x || x.deterministic_replay!==true || x.downstream_contract_stable!==true) errs.push(`ontology replay case failed ${op}`);
}
if(ontology.provider_independence?.provider_taxonomy_is_canonical!==false || ontology.requirements?.downstream_contract_stable_on_provider_removal!==true) errs.push('ontology provider-independence drift');

// #1160 Historical learning acceptance
const hcases=new Map((f.historical_memory_cases||[]).map(x=>[x.case,x]));
if(hcases.get('RAW_PROVIDER_PAYLOAD_REMOVED')?.replay_without_raw!==true) errs.push('history raw-free replay missing');
if(hcases.get('TERMINATION_DELETE_REQUIRED_RAW')?.raw_reclassified_as_owned!==false) errs.push('raw ownership boundary drift');
if(hcases.get('PROVIDER_REMOVAL')?.provider_removal_simulation_required!==true) errs.push('history provider removal linkage missing');
if(history.separation_rules?.raw_provider_payload_required_for_replay!==false || history.requirements?.termination_policy_link_required!==true || history.requirements?.provider_removal_simulation_required!==true) errs.push('historical memory contract drift');
if(!removal.required_continuity_invariants?.includes('historical_learning_continuity')) errs.push('removal contract missing history continuity');

if(errs.length){console.error(errs.join('\n'));process.exit(1);}
console.log(JSON.stringify({
  suite:'KIDULTS_INTERNALIZATION_ACCEPTANCE_HARDENING_V1',result:'PASS',
  rights_negative_cases:f.rights_negative_cases.length,
  rights_provider_fixtures:f.rights_provider_fixtures.length,
  economics_provider_fixtures:f.economics_provider_fixtures.length,
  reputation_provider_fixtures:f.source_reputation_initial_fixtures.length,
  market_integrity_mutations:f.market_integrity_mutations.length,
  ontology_graders:graders.length,ontology_market_providers:markets.length,
  ontology_replay_cases:f.ontology_replay_cases.length,
  historical_memory_cases:f.historical_memory_cases.length,
  production:'HOLD'
},null,2));
