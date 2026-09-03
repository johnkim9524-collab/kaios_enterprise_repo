#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { classifyAnySiteCandidate } from './asi-any-site-source-family-common-v1.mjs';

const canonicalFamilies=['PRIMARY_OR_OFFICIAL_AUTHORITY','OPEN_MARKETPLACE_OR_DEALER','GRADING_AUTHENTICATION_OR_CONDITION','MEDIA_COMMUNITY_OR_EVENT_CONTEXT','MUSEUM_OR_INSTITUTIONAL_CONTEXT','UNCLASSIFIED_ANY_SITE_CANDIDATE'];
const classifyDiscoveryPopulation=candidates=>{
  const counts=Object.fromEntries(canonicalFamilies.map(f=>[f,0]));
  for(const candidate of candidates){
    const family=classifyAnySiteCandidate(candidate).source_family_hint;
    if(!(family in counts))throw new Error(`NONCANONICAL_SOURCE_FAMILY:${family}`);
    counts[family]++;
  }
  return counts;
};
if(process.argv.includes('--self-test')){
  const fixtures=[
    {endpoint_url:'https://brand.example/item',source_name:'official manufacturer'},
    {endpoint_url:'https://auction.example/lot'},
    {endpoint_url:'https://grading.example/cert'},
    {endpoint_url:'https://community.example/post'},
    {endpoint_url:'https://museum.example/archive'},
    {endpoint_url:'https://example.invalid/resource'}
  ];
  const counts=classifyDiscoveryPopulation(fixtures);
  for(const family of canonicalFamilies)if(counts[family]!==1)throw new Error(`SOURCE_FAMILY_SELF_TEST_FAILED:${family}:${counts[family]}`);
  console.log(JSON.stringify({status:'PASS',control:'AUTOBALANCE_DISCOVERY_POPULATION_CLASSIFIER',source_families:canonicalFamilies.length}));
  process.exit(0);
}

const discoveryPath=process.argv[2]||'discovery-out/global-low-risk-discovery-governed-v2.json';
const gate1Path=process.argv[3]||'/tmp/asi-gate1-safe-candidate-pool-v1.json';
const gate2Path=process.argv[4]||'/tmp/asi-gate2-independent-reverification-v1.json';
const gate3Path=process.argv[5]||'/tmp/asi-gate3-admission-runtime-v1.json';
const admittedPath=process.argv[6]||'/tmp/asi-admitted-metadata-pool-control-v1.json';
const out=process.argv[7]||'/tmp/asi-throughput-coverage-autobalance-v1.json';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const d=read(discoveryPath),g1=read(gate1Path),g2=read(gate2Path),g3=read(gate3Path);const ap=fs.existsSync(admittedPath)?read(admittedPath):{};
const scopes=JSON.parse(fs.readFileSync('coordination/kidults/scope-data/collection-scope-data-requirement-matrix-v1.1.json','utf8')).scopes||[];
const macroregions=['NORTH_AMERICA','EUROPE','JAPAN','KOREA','GREATER_CHINA','SOUTHEAST_ASIA','OCEANIA','LATAM_MEA'];
const candidates=d.candidates||[];
if(!Number.isInteger(d.candidate_count)||d.candidate_count!==candidates.length)throw new Error(`DISCOVERY_CANDIDATE_COUNT_MISMATCH:${d.candidate_count}:${candidates.length}`);
const discoveryIds=new Set();
for(const candidate of candidates){if(!candidate.candidate_id||discoveryIds.has(candidate.candidate_id))throw new Error(`DISCOVERY_ID_INVALID_OR_DUPLICATE:${candidate.candidate_id||'MISSING'}`);discoveryIds.add(candidate.candidate_id);}
const gate1Partition=[...(g1.safe_candidate_pool||[]),...(g1.review_required_queue||[]),...(g1.hard_block_queue||[])];
const gate1Ids=new Set();
for(const candidate of gate1Partition){if(!candidate.candidate_id||!discoveryIds.has(candidate.candidate_id)||gate1Ids.has(candidate.candidate_id))throw new Error(`GATE1_NOT_UNIQUE_DISCOVERY_SUBSET:${candidate.candidate_id||'MISSING'}`);gate1Ids.add(candidate.candidate_id);}
if(gate1Partition.length>candidates.length)throw new Error(`GATE1_PARTITION_EXCEEDS_DISCOVERY:${gate1Partition.length}:${candidates.length}`);
const byScope=Object.fromEntries(scopes.map(s=>[s.scope_id,0]));const byRegion=Object.fromEntries(macroregions.map(r=>[r,0]));const byProvider={};const byFamily=classifyDiscoveryPopulation(candidates);
for(const c of candidates){for(const s of c.scope_hints||[c.scope_hint].filter(Boolean))if(s in byScope)byScope[s]++;for(const r of c.target_regions||[])if(r in byRegion)byRegion[r]++;for(const p of c.discovery_providers||[c.discovery_provider].filter(Boolean))byProvider[p]=(byProvider[p]||0)+1;}
const safeRate=candidates.length?g1.safe_candidate_count/candidates.length:0;const gate2Rate=g1.safe_candidate_count?g2.verified_for_gate3_count/g1.safe_candidate_count:0;const gate3Rate=g2.verified_for_gate3_count?g3.admitted_count/g2.verified_for_gate3_count:0;const activeAdmitted=ap.active_admitted_count??g3.admitted_count??0;
function budgets(counts,kind){const vals=Object.values(counts);const max=Math.max(1,...vals);return Object.entries(counts).map(([id,count])=>({id,count,coverage_ratio:Number((count/max).toFixed(4)),priority_weight:Number((1+(max-count)/max*2).toFixed(4)),reason:count===0?`ZERO_${kind}_COVERAGE`:(count<max*0.35?`LOW_${kind}_COVERAGE`:'NORMAL')})).sort((a,b)=>b.priority_weight-a.priority_weight||a.id.localeCompare(b.id));}
const scopeBudget=budgets(byScope,'SCOPE'),regionBudget=budgets(byRegion,'REGION'),familyBudget=budgets(byFamily,'SOURCE_FAMILY');
const providerValues=Object.values(byProvider);const providerConcentration=providerValues.length?Math.max(...providerValues)/Math.max(1,providerValues.reduce((a,b)=>a+b,0)):1;
const throughput={discovered:candidates.length,live_external:d.live_external_candidate_count||0,gate1_safe:g1.safe_candidate_count||0,gate2_verified:g2.verified_for_gate3_count||0,gate3_admitted:g3.admitted_count||0,active_admitted:activeAdmitted,safe_rate:Number(safeRate.toFixed(4)),gate2_pass_rate:Number(gate2Rate.toFixed(4)),gate3_admit_rate:Number(gate3Rate.toFixed(4))};
const output={id:'kidults-asi-throughput-coverage-autobalance-v1',version:'1.1.0',status:'SHADOW_AUTOBALANCE_PLAN_READY',throughput,coverage:{scope_counts:byScope,region_counts:byRegion,provider_counts:byProvider,source_family_counts:byFamily,source_family_population:'DISCOVERY_UNIVERSE',source_family_input_count:candidates.length,gate1_input_candidate_count:gate1Partition.length,gate1_partition_count:gate1Partition.length,provider_concentration:Number(providerConcentration.toFixed(4))},next_cycle_budget:{scope_priorities:scopeBudget,region_priorities:regionBudget,source_family_priorities:familyBudget,max_priority_scope_ids:scopeBudget.filter(x=>x.priority_weight===scopeBudget[0]?.priority_weight).map(x=>x.id),max_priority_region_ids:regionBudget.filter(x=>x.priority_weight===regionBudget[0]?.priority_weight).map(x=>x.id),max_priority_source_family_ids:familyBudget.filter(x=>x.priority_weight===familyBudget[0]?.priority_weight).map(x=>x.id),provider_diversification_required:providerConcentration>0.6},rules:{discovery_budget_can_rebalance:true,source_family_budget_can_rebalance:true,rights_gate_can_never_be_weakened:true,production_or_public_scope_can_never_expand:true,zero_coverage_gets_highest_priority:true,provider_concentration_threshold:0.6,unclassified_family_does_not_narrow_universe:true},public_release:'HOLD',production:'HOLD'};
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify({status:output.status,throughput,top_scopes:scopeBudget.slice(0,5),top_regions:regionBudget.slice(0,3),top_source_families:familyBudget.slice(0,3),provider_concentration:output.coverage.provider_concentration,production:'HOLD'},null,2));
