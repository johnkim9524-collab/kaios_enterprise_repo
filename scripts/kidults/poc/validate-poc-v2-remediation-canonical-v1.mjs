#!/usr/bin/env node
import fs from 'node:fs';
const p=process.argv[2]||'coordination/kidults/poc/poc-v2-remediation-canonical-contract-v1.json';
const x=JSON.parse(fs.readFileSync(p,'utf8'));
if(x.canonical_changes.regional_depth.layers.length!==3) throw new Error('REGIONAL_SPLIT_REQUIRED');
for(const r of ['SUPPLY_SCARCITY','TRADABLE_AVAILABILITY','OBSERVED_MARKET_ACTIVITY','VERIFIED_TRANSACTION_ACTIVITY','LIQUIDITY','FAILED_SALE_RATE','TIME_TO_SALE']) if(!x.canonical_changes.scarcity_liquidity.layers.includes(r)) throw new Error('MISSING_MARKET_LAYER_'+r);
if(x.canonical_changes.dynamic_vertical.auto_promotion!==false) throw new Error('NO_AUTO_VERTICAL_PROMOTION');
if(x.canonical_changes.provider_strategy.platform_wide_provider_assumption!==false) throw new Error('NO_PLATFORM_WIDE_PROVIDER_ASSUMPTION');
if(x.canonical_changes.normalization.confidence_required!==true) throw new Error('NORMALIZATION_CONFIDENCE_REQUIRED');
if(x.canonical_changes.poc_scaling.forced_completion_prohibited!==true) throw new Error('NO_FORCED_POC_COMPLETION');
if(x.empirical_baseline.attention.mapped!==60||x.empirical_baseline.regional.multi_region!==55||x.empirical_baseline.challenger.slots!==160) throw new Error('EMPIRICAL_BASELINE_MISMATCH');
if(x.open_p0.length!==2) throw new Error('EXPECTED_TWO_OPEN_P0');
if(x.provider_contact!=='HOLD'||x.production!=='HOLD') throw new Error('GATES_MUST_HOLD');
for(const t of ['A','B','C','D','E']) if(!x.track_alignment[t]) throw new Error('TRACK_ALIGNMENT_'+t);
console.log(JSON.stringify({status:'PASS',open_p0:x.open_p0,regional_layers:x.canonical_changes.regional_depth.layers,market_layers:x.canonical_changes.scarcity_liquidity.layers.length,next_cycle:x.next_cycle,provider_contact:x.provider_contact,production:x.production},null,2));
