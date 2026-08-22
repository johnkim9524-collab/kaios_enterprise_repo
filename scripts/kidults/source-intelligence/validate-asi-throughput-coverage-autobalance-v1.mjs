#!/usr/bin/env node
import fs from 'node:fs';
const p=process.argv[2]||'/tmp/asi-throughput-coverage-autobalance-v1.json';
const x=JSON.parse(fs.readFileSync(p,'utf8'));
const fail=m=>{throw new Error(m)};
if(x.id!=='kidults-asi-throughput-coverage-autobalance-v1')fail('bad id');
if(x.status!=='SHADOW_AUTOBALANCE_PLAN_READY')fail('bad status');
if(x.public_release!=='HOLD'||x.production!=='HOLD')fail('release boundary weakened');
if(x.rules?.rights_gate_can_never_be_weakened!==true)fail('rights gate weakening permitted');
if(x.rules?.production_or_public_scope_can_never_expand!==true)fail('scope expansion permitted');
if(x.rules?.zero_coverage_gets_highest_priority!==true)fail('zero coverage not prioritized');
const s=x.next_cycle_budget?.scope_priorities||[];const r=x.next_cycle_budget?.region_priorities||[];
if(s.length!==32)fail('scope budget must cover 32 scopes');
if(r.length!==8)fail('region budget must cover 8 macroregions');
for(const a of [...s,...r]){if(!(a.priority_weight>=1&&a.priority_weight<=3))fail('invalid priority weight');if(a.count===0&&a.priority_weight<2.9)fail('zero coverage not highest priority');}
for(const k of ['discovered','live_external','gate1_safe','gate2_verified','gate3_admitted','active_admitted'])if(!Number.isFinite(Number(x.throughput?.[k]))||Number(x.throughput[k])<0)fail(`invalid throughput ${k}`);
for(const k of ['safe_rate','gate2_pass_rate','gate3_admit_rate']){const v=Number(x.throughput?.[k]);if(!Number.isFinite(v)||v<0||v>1)fail(`invalid rate ${k}`);}
if(Number(x.coverage?.provider_concentration)<0||Number(x.coverage?.provider_concentration)>1)fail('invalid provider concentration');
console.log(JSON.stringify({status:'PASS',scopes:s.length,regions:r.length,throughput:x.throughput,provider_concentration:x.coverage.provider_concentration,production:'HOLD'},null,2));