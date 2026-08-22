#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const discoveryPath=process.argv[2]||'discovery-out/global-low-risk-discovery.json';
const gate1Path=process.argv[3]||'/tmp/asi-gate1-safe-candidate-pool-v1.json';
const gate2Path=process.argv[4]||'/tmp/asi-gate2-independent-reverification-v1.json';
const gate3Path=process.argv[5]||'/tmp/asi-gate3-admission-runtime-v1.json';
const admittedPath=process.argv[6]||'/tmp/asi-admitted-metadata-pool-control-v1.json';
const out=process.argv[7]||'/tmp/asi-throughput-coverage-autobalance-v1.json';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const d=read(discoveryPath),g1=read(gate1Path),g2=read(gate2Path),g3=read(gate3Path);
const ap=fs.existsSync(admittedPath)?read(admittedPath):{};
const scopes=JSON.parse(fs.readFileSync('coordination/kidults/scope-data/collection-scope-data-requirement-matrix-v1.1.json','utf8')).scopes||[];
const macroregions=['NORTH_AMERICA','EUROPE','JAPAN','KOREA','GREATER_CHINA','SOUTHEAST_ASIA','OCEANIA','LATAM_MEA'];
const candidates=d.candidates||[];

const byScope=Object.fromEntries(scopes.map(s=>[s.scope_id,0]));
const byRegion=Object.fromEntries(macroregions.map(r=>[r,0]));
const byProvider={};
for(const c of candidates){
  for(const s of c.scope_hints||[c.scope_hint].filter(Boolean)) if(s in byScope) byScope[s]++;
  const rs=c.target_regions||[]; for(const r of rs) if(r in byRegion) byRegion[r]++;
  for(const p of c.discovery_providers||[c.discovery_provider].filter(Boolean)) byProvider[p]=(byProvider[p]||0)+1;
}
const safeRate=d.candidate_count?g1.safe_candidate_count/d.candidate_count:0;
const gate2Rate=g1.safe_candidate_count?g2.verified_for_gate3_count/g1.safe_candidate_count:0;
const gate3Rate=g2.verified_for_gate3_count?g3.admitted_count/g2.verified_for_gate3_count:0;
const activeAdmitted=ap.active_admitted_count??g3.admitted_count??0;

function budgets(counts,kind){
  const vals=Object.values(counts);const max=Math.max(1,...vals);return Object.entries(counts).map(([id,count])=>({id,count,coverage_ratio:Number((count/max).toFixed(4)),priority_weight:Number((1+(max-count)/max*2).toFixed(4)),reason:count===0?`ZERO_${kind}_COVERAGE`:(count<max*0.35?`LOW_${kind}_COVERAGE`:'NORMAL')})).sort((a,b)=>b.priority_weight-a.priority_weight||a.id.localeCompare(b.id));
}
const scopeBudget=budgets(byScope,'SCOPE');
const regionBudget=budgets(byRegion,'REGION');
const providerValues=Object.values(byProvider);const providerMax=Math.max(1,...providerValues);
const providerConcentration=providerValues.length?Math.max(...providerValues)/Math.max(1,providerValues.reduce((a,b)=>a+b,0)):1;
const throughput={discovered:d.candidate_count||0,live_external:d.live_external_candidate_count||0,gate1_safe:g1.safe_candidate_count||0,gate2_verified:g2.verified_for_gate3_count||0,gate3_admitted:g3.admitted_count||0,active_admitted:activeAdmitted,safe_rate:Number(safeRate.toFixed(4)),gate2_pass_rate:Number(gate2Rate.toFixed(4)),gate3_admit_rate:Number(gate3Rate.toFixed(4))};
const output={id:'kidults-asi-throughput-coverage-autobalance-v1',version:'1.0.0',status:'SHADOW_AUTOBALANCE_PLAN_READY',throughput,coverage:{scope_counts:byScope,region_counts:byRegion,provider_counts:byProvider,provider_concentration:Number(providerConcentration.toFixed(4))},next_cycle_budget:{scope_priorities:scopeBudget,region_priorities:regionBudget,max_priority_scope_ids:scopeBudget.filter(x=>x.priority_weight===scopeBudget[0]?.priority_weight).map(x=>x.id),max_priority_region_ids:regionBudget.filter(x=>x.priority_weight===regionBudget[0]?.priority_weight).map(x=>x.id),provider_diversification_required:providerConcentration>0.6},rules:{discovery_budget_can_rebalance:true,rights_gate_can_never_be_weakened:true,production_or_public_scope_can_never_expand:true,zero_coverage_gets_highest_priority:true,provider_concentration_threshold:0.6},public_release:'HOLD',production:'HOLD'};
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({status:output.status,throughput,top_scopes:scopeBudget.slice(0,5),top_regions:regionBudget.slice(0,3),provider_concentration:output.coverage.provider_concentration,production:'HOLD'},null,2));