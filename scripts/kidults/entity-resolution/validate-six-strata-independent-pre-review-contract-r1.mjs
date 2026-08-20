import fs from 'node:fs';

const contractPath='coordination/kidults/entity-resolution/six-strata-independent-pre-review-contract-r1.json';
const samplingPath='coordination/kidults/entity-resolution/empirical-validation-sampling-plan-r1.json';
const packetPath='coordination/kidults/entity-resolution/independent-label-review-packet-contract-r1.json';
const operationalPath='coordination/kidults/entity-resolution/human-review-gate-operational-contract-r1.json';
const rosterPath='coordination/kidults/entity-resolution/independent-reviewer-assignment-receipt-r1.json';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const fail=m=>{throw new Error(m)};
const c=read(contractPath);
const s=read(samplingPath);
const p=read(packetPath);
const o=read(operationalPath);
const r=read(rosterPath);

if(c.production!=='HOLD'||c.public_release!=='HOLD') fail('RELEASE_BOUNDARY_WEAKENED');
if(c.status!=='READYNESS_ONLY_HUMAN_REVIEWS_NOT_CLAIMED') fail('FALSE_PRE_REVIEW_COMPLETION_STATE');
if(c.parent_issue!==833) fail('PARENT_ISSUE_MISMATCH');

const expectedEligible=[
  'er-stratum-designer-maker-edition',
  'er-stratum-pressing-edition-media',
  'er-stratum-provenance-unique-object',
  'er-stratum-serialized-reference',
  'er-stratum-variant-release-heavy',
  'er-stratum-vehicle-mechanical-asset'
].sort();
const eligible=[...c.eligible_strata].sort();
if(JSON.stringify(eligible)!==JSON.stringify(expectedEligible)) fail('ELIGIBLE_SIX_STRATA_DRIFT');
if(JSON.stringify(c.excluded_strata)!==JSON.stringify(['er-stratum-graded-population'])) fail('GRADED_MUST_REMAIN_EXCLUDED');

const planById=new Map(s.strata.map(x=>[x.stratum_id,x]));
if(s.dataset_target.total_cases!==840||s.dataset_target.blind_holdout_cases!==420||s.strata.length!==7) fail('FINAL_SAMPLING_GATE_WEAKENED');
let cases=0;
for(const id of eligible){
  const x=planById.get(id);
  if(!x||x.cases!==120||x.blind!==60) fail(`ELIGIBLE_STRATUM_PLAN_INVALID:${id}`);
  cases+=x.cases;
}
if(planById.get('er-stratum-graded-population')?.cases!==120) fail('GRADED_TARGET_MUST_REMAIN_120');
if(cases!==720) fail('EXACT_720_PRE_REVIEW_CASES_REQUIRED');

const lim=c.pre_review_limits;
if(lim.eligible_strata_count!==6||lim.cases_per_stratum!==120||lim.eligible_case_count!==720) fail('PRE_REVIEW_CASE_LIMIT_INVALID');
if(lim.reviewers_per_case!==2||lim.maximum_pre_review_records!==1440) fail('PRE_REVIEW_RECORD_LIMIT_INVALID');
if(lim.graded_cases_remaining!==120||lim.graded_review_records_remaining!==240) fail('GRADED_REMAINDER_INVALID');

const f=c.final_gate_invariants;
if(f.total_cases!==840||f.blind_holdout_cases!==420||f.blind_cases_per_stratum!==60||f.required_review_records!==1680) fail('FINAL_GATE_INVARIANT_WEAKENED');
for(const k of ['final_empirical_pass_from_pre_review_lane','final_holdout_seal_from_pre_review_lane','model_freeze_from_pre_review_lane','track_b_input_from_pre_review_lane']) if(f[k]!==false) fail(`PRE_REVIEW_MAY_NOT_PROMOTE:${k}`);

if(o.input.total_cases_required!==840||o.packet.case_count_per_packet!==840||o.holdout_commitment.blind_case_count_required!==420||o.holdout_commitment.blind_cases_per_stratum_required!==60||o.human_completion.required_review_records!==1680||o.human_completion.records_per_reviewer!==840) fail('FULL_OPERATIONAL_GATE_CHANGED');
if(p.completion_state.reviewer_a!=='NOT_ASSIGNED'||p.completion_state.reviewer_b!=='NOT_ASSIGNED'||p.completion_state.labels!=='NOT_COLLECTED'||p.completion_state.empirical_attestation!=='NOT_CREATED'||p.completion_state.track_b!=='NOT_STARTED') fail('FULL_PACKET_CONTRACT_FALSE_COMPLETION');

if(!Array.isArray(r.reviewers)||r.reviewers.length!==2||r.labels!=='NOT_COLLECTED'||r.empirical_attestation!=='NOT_CREATED'||r.track_b!=='NOT_STARTED') fail('ROSTER_RECEIPT_INVALID');
const ids=r.reviewers.map(x=>x.reviewer_id).sort();
if(JSON.stringify(ids)!==JSON.stringify(['REVIEWER_A','REVIEWER_B'])) fail('ROSTER_SLOT_INVALID');
for(const x of r.reviewers){
  if(x.real_person!==true||x.distinct_from_other_reviewer!==true||x.independent_from_resolver_decision_path!==true||x.must_not_see_other_reviewer_labels!==true) fail(`ROSTER_INDEPENDENCE_INVALID:${x.reviewer_id}`);
}
if(r.model_predictions_hidden_until_both_labels_frozen!==true) fail('MODEL_PREDICTION_ISOLATION_WEAKENED');

for(const field of ['model_prediction','model_score','other_reviewer_label','adjudicated_label','benchmark_result']) if(!c.reviewer_isolation.prohibited_reviewer_input_fields.includes(field)) fail(`PROHIBITED_FIELD_MISSING:${field}`);
if(c.reviewer_isolation.reviewer_a_must_not_see_reviewer_b_labels!==true||c.reviewer_isolation.reviewer_b_must_not_see_reviewer_a_labels!==true||c.reviewer_isolation.model_predictions_hidden_until_independent_labels_frozen!==true) fail('REVIEWER_ISOLATION_WEAKENED');

const carry=c.carry_forward_to_exact_840;
const req=new Set(carry.requirements);
for(const x of ['CASE_ID_EXISTS_IN_FINAL_840','CASE_EVIDENCE_BINDING_SHA256_EXACT_MATCH','SAME_FINAL_VERIFIED_REVIEWER_SLOT','PACKET_AND_REVIEW_DIGEST_VALID','CHRONOLOGY_COMPATIBLE_WITH_FINAL_MODEL_FREEZE','NO_PROHIBITED_FIELD_LEAKAGE','FINAL_FULL_GATE_RECONCILIATION_ACCEPTS_RECORD']) if(!req.has(x)) fail(`CARRY_FORWARD_GUARD_MISSING:${x}`);
if(carry.changed_case_or_evidence_binding!=='INVALIDATE_AND_REREVIEW'||carry.maximum_carried_records!==1440||carry.final_required_records_after_reconciliation!==1680) fail('CARRY_FORWARD_BOUNDARY_WEAKENED');

const state=c.completion_state;
if(state.roster!=='READY_VIA_827_830'||state.pre_review_packets!=='NOT_CREATED'||state.human_review_records!=='NOT_COLLECTED'||state.carry_forward_reconciliation!=='NOT_RUN'||state.adjudication!=='NOT_STARTED'||state.final_blind_holdout!=='NOT_SEALED'||state.empirical_attestation!=='NOT_CREATED'||state.track_b!=='NOT_STARTED') fail('FALSE_COMPLETION_CLAIM');

console.log(JSON.stringify({status:'PASS_READINESS_ONLY',eligible_strata:6,eligible_cases:720,max_pre_review_records:1440,final_cases:840,final_reviews:1680,graded_remaining:120,production:'HOLD'}));
