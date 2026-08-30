#!/usr/bin/env node
import fs from 'node:fs';
const p=process.argv[2]||'/tmp/asi-rights-analysis-fast-lane-v1.json';const x=JSON.parse(fs.readFileSync(p,'utf8'));const a=(v,c)=>{if(!v)throw new Error(c)};
a(x.id==='kidults-asi-rights-analysis-fast-lane-v1'&&x.version==='1.0.0','IDENTITY');a(x.state==='LAUNCH_RIGHTS_FAST_LANE_READY_FAIL_CLOSED','STATE');
a(x.items.length===12&&x.summary.fast_lane_sources===12,'FAST_LANE_12');a(new Set(x.items.map(i=>i.vertical)).size===8&&x.summary.verticals_covered===8,'VERTICALS_8');a(new Set(x.items.map(i=>i.idempotency_key)).size===12,'DEDUPE');
a(x.items.length<=x.capacity.automated_official_evidence_wip_limit,'AUTOMATED_WIP');a(x.capacity.track_z_commercial_wip_limit===6&&x.capacity.counsel_exception_wip_limit===3,'HUMAN_WIP');
for(const i of x.items){a(i.lane==='AUTOMATED_OFFICIAL_EVIDENCE'&&i.owner==='KPMO_RIGHTS_OPS','LANE');for(const atom of ['collect','store','derive','commercial_use'])a(i.rights[atom]==='UNKNOWN','FALSE_RIGHT:'+atom);a(i.decision==='HOLD'&&i.external_action_authorized===false&&i.acquisition_authorized===false&&i.production_authorized===false,'FALSE_PROMOTION')}
a(x.truth_boundary.rights_clear_for_current_sold===0&&x.truth_boundary.active_adapters===0,'BASELINE');a(x.truth_boundary.production_authorized===false&&x.truth_boundary.public==='HOLD'&&x.truth_boundary.production==='HOLD'&&x.truth_boundary.g5==='HOLD','RELEASE');
const mutate=JSON.parse(JSON.stringify(x));mutate.items[0].rights.commercial_use='ALLOW';mutate.items[0].decision='PASS';let rejected=false;try{for(const atom of ['collect','store','derive','commercial_use'])a(mutate.items[0].rights[atom]==='UNKNOWN','MUTATION')}catch{rejected=true}a(rejected,'FALSE_RIGHT_MUTATION_ACCEPTED');
console.log(JSON.stringify({suite:'KIDULTS_ASI_RIGHTS_ANALYSIS_FAST_LANE_V1',result:'PASS',fast_lane:12,verticals:8,production:'HOLD'}));
