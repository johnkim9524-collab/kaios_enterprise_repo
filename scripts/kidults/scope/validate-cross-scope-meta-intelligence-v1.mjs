#!/usr/bin/env node
import fs from 'node:fs';
const p=process.argv[2]||'coordination/kidults/scope/cross-scope-meta-intelligence-contract-v1.json';
const x=JSON.parse(fs.readFileSync(p,'utf8'));
const required=['DOWNSIDE_RISK_INTELLIGENCE','CONFIDENCE_DECAY_EVIDENCE_AGING','MARKET_INTEGRITY_MANIPULATION_DETECTION','DECISION_UTILITY','SOURCE_RESILIENCE_SUBSTITUTABILITY','CROSS_SCOPE_NORMALIZATION_INTEGRITY','PRODUCT_CLUSTER_LIFECYCLE','COUNTERFACTUAL_SIMULATION'];
const ids=new Set(x.meta_layers.map(v=>v.id));
for(const r of required) if(!ids.has(r)) throw new Error('MISSING_META_LAYER_'+r);
const guards=new Set(x.mandatory_truth_guards||[]);
for(const g of ['EVIDENCE_BEFORE_METRICS','MISSING_NE_ZERO','ANOMALY_NE_FRAUD','SIMULATION_NE_OBSERVATION','NORMALIZED_SCORE_REQUIRES_NORMALIZATION_CONFIDENCE','PROVIDER_NE_TRUTH']) if(!guards.has(g)) throw new Error('MISSING_GUARD_'+g);
if(x.provider_contact!=='HOLD_PENDING_GLOBAL_MARKET_EVIDENCE_POC_V2') throw new Error('PROVIDER_CONTACT_GATE');
if(x.production!=='HOLD') throw new Error('PRODUCTION_MUST_HOLD');
for(const t of ['A','B','C','D','E']) if(!x.track_alignment[t]) throw new Error('TRACK_ALIGNMENT_'+t);
console.log(JSON.stringify({status:'PASS',meta_layers:x.meta_layers.length,truth_guards:x.mandatory_truth_guards.length,tracks:Object.keys(x.track_alignment).length,provider_contact:x.provider_contact,production:x.production},null,2));
