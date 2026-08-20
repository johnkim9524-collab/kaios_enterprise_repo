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
for(const c of x.cells){
  if(!c.ineligible_factors||typeof c.ineligible_factors!=='object'||Array.isArray(c.ineligible_factors))fail('INELIGIBLE_FACTOR_MAP_REQUIRED');
  for(const [factor,reasons] of Object.entries(c.ineligible_factors)){
    if(!Array.isArray(reasons)||reasons.length<1||reasons.some(reason=>typeof reason!=='string'||!reason))fail(`INELIGIBLE_FACTOR_REASON_INVALID:${factor}`);
  }
  for(const planName of ['collection_plan','analytical_plan']){
    const plan=c[planName];
    if(!plan||!Array.isArray(plan.missing_factors))fail('PLAN_SHAPE');
    for(const factor of plan.missing_factors)if(!c.ineligible_factors[factor]?.length)fail(`MISSING_FACTOR_WITHOUT_REASON:${c.category_scope}:${c.macroregion_id}:${factor}`);
    if(plan.missing_factors.length>0){
      if(plan.state!=='NOT_COMPUTABLE_MISSING_FACTORS'||plan.normalized_score!==null)fail(`MISSING_FACTOR_COMPUTATION:${c.category_scope}:${c.macroregion_id}:${planName}`);
    }else if(plan.state!=='SHADOW_SCORE_COMPUTED_NOT_ACTIVATED'||!Number.isFinite(plan.normalized_score)){
      fail(`COMPUTABLE_PLAN_INVALID:${c.category_scope}:${c.macroregion_id}:${planName}`);
    }
    if(planName==='collection_plan'&&plan.collection_quota!==null)fail('QUOTA_NON_NULL');
    if(planName==='analytical_plan'&&plan.analytical_weight!==null)fail('WEIGHT_NON_NULL');
  }
  if(c.live_mutation_authorized!==false)fail('CELL_MUTATION_AUTH');
}
const evidenceComplete=x.regional_collection_quota_plan?.computable_cells===x.cells.length&&x.regional_analytical_weight_plan?.computable_cells===x.cells.length;
if(x.activation_gates?.EVIDENCE_COMPLETENESS_PASS!==evidenceComplete)fail('EVIDENCE_COMPLETENESS_STATE_MISMATCH');
if(x.activation_gates?.DETERMINISTIC_RERUN_PASS!==true||x.activation_gates?.SNAPSHOT_HASH_PRESENT!==true)fail('DETERMINISM_OR_HASH');
const expectedActivationState=evidenceComplete?'HOLD_PENDING_ACTIVATION_GATES':'HOLD_INCOMPLETE_EMPIRICAL_FACTOR_SURFACE';
const expectedValidationState=evidenceComplete?'PENDING_REQUIRED_SHADOW_VALIDATION':'NOT_RUN_INCOMPLETE_FACTOR_SURFACE';
if(x.activation_state!==expectedActivationState)fail('ACTIVATION_STATE');
if(x.activation_gates?.CONCENTRATION_BIAS_PASS!==expectedValidationState||x.activation_gates?.SOURCE_REMOVAL_SENSITIVITY_PASS!==expectedValidationState)fail('ACTIVATION_GATE_TRANSITION');
if(x.activation_gates?.SHADOW_DELTA_REVIEW_PASS!=='PENDING_FOUNDER_OR_GATE_REVIEW')fail('DELTA_REVIEW_MUST_REMAIN_PENDING');
console.log(JSON.stringify({status:'PASS',cells:x.cells.length,collection_state:x.regional_collection_quota_plan.state,analytical_state:x.regional_analytical_weight_plan.state,verified_factor_cells:x.shadow_delta_report.verified_factor_cells,snapshot_hash:x.snapshot_hash,production:'HOLD'}));