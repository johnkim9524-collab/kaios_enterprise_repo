import fs from 'node:fs';
import crypto from 'node:crypto';
const p=process.argv[2]||'/tmp/empirical-regional-rebalancer-wave1-r1.json';
const x=JSON.parse(fs.readFileSync(p,'utf8'));
const fail=m=>{throw new Error(m)};
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const copy=structuredClone(x);delete copy.snapshot_hash;const digest=`sha256:${crypto.createHash('sha256').update(JSON.stringify(canonical(copy))).digest('hex')}`;
if(x.id!=='kidults-empirical-regional-rebalancer-wave1-r1'||x.production!=='HOLD'||x.public_release!=='HOLD')fail('BOUNDARY');
if(x.snapshot_hash!==digest)fail('SNAPSHOT_HASH_MISMATCH');
if(!Array.isArray(x.cells)||x.cells.length<1)fail('CELLS_REQUIRED');
if(x.regional_collection_quota_plan?.live_quota_mutations!==0||x.regional_analytical_weight_plan?.live_weight_mutations!==0)fail('LIVE_MUTATION');
if(x.shadow_delta_report?.collection_quota_delta_applied!==0||x.shadow_delta_report?.analytical_weight_delta_applied!==0)fail('DELTA_MUTATION');
if(x.shadow_delta_report?.bootstrap_reinterpreted_as_market_share!==false||x.shadow_delta_report?.raw_record_count_weight!==0)fail('TRUTH_BOUNDARY');
for(const c of x.cells){for(const planName of ['collection_plan','analytical_plan']){const plan=c[planName];if(!plan||!Array.isArray(plan.missing_factors))fail('PLAN_SHAPE');if(plan.missing_factors.length>0){if(plan.state!=='NOT_COMPUTABLE_MISSING_FACTORS'||plan.normalized_score!==null)fail(`MISSING_FACTOR_COMPUTATION:${c.category_scope}:${c.macroregion_id}:${planName}`);}if(planName==='collection_plan'&&plan.collection_quota!==null)fail('QUOTA_NON_NULL');if(planName==='analytical_plan'&&plan.analytical_weight!==null)fail('WEIGHT_NON_NULL');}if(c.live_mutation_authorized!==false)fail('CELL_MUTATION_AUTH');}
if(x.activation_gates?.EVIDENCE_COMPLETENESS_PASS!==false)fail('EVIDENCE_COMPLETENESS_MUST_FAIL_CURRENT_STATE');
if(x.activation_gates?.DETERMINISTIC_RERUN_PASS!==true||x.activation_gates?.SNAPSHOT_HASH_PRESENT!==true)fail('DETERMINISM_OR_HASH');
if(x.activation_state!=='HOLD_INCOMPLETE_EMPIRICAL_FACTOR_SURFACE')fail('ACTIVATION_STATE');
console.log(JSON.stringify({status:'PASS',cells:x.cells.length,collection_state:x.regional_collection_quota_plan.state,analytical_state:x.regional_analytical_weight_plan.state,verified_factor_cells:x.shadow_delta_report.verified_factor_cells,snapshot_hash:x.snapshot_hash,production:'HOLD'}));