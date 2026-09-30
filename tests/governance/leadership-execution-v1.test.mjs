import assert from 'node:assert/strict';
import test from 'node:test';
import {loadLeadershipState,validateLeadershipState,validateExecutionPlan,REQUIRED_PLAN_FIELDS,HOLD_FIELDS} from '../../scripts/governance/validate-leadership-execution-v1.mjs';
const state=loadLeadershipState(process.cwd());
const sha='13f53fa2211fac1abf580d5b34f23ef2d4498211';
const plan={task_id:'TEST_ONLY',role_id:'integration-conductor',source_sha:sha,goal:'Fixture goal',terminal_evidence:'Fixture terminal receipt',current_facts:['Fixture exact source'],hypotheses_and_unknowns:['Fixture hypothesis'],critical_bottleneck:'Fixture bound role mismatch',chosen_route:'Fixture minimal correction',excluded_work:['Production'],decisive_precheck:'Fixture role resolver parity',limits:{max_retries:2,max_elapsed_seconds:120,max_planning_seconds:10,max_incremental_spend:0,cost_observability:'NO_VENDOR_CALLS'},pivot_rule:'Fixture stop unchanged failure',handoff:'Fixture proof references',same_failure_retry_without_new_evidence:false,authority_granted_by_plan:false};
test('current configuration is consistent without claiming actor readiness',()=>assert.deepEqual(validateLeadershipState(state),[]));
test('complete bounded plan passes schema only',()=>assert.deepEqual(validateExecutionPlan(plan,sha),[]));
for(const field of REQUIRED_PLAN_FIELDS)test('missing plan field rejected: '+field,()=>{const x=structuredClone(plan);delete x[field];assert.ok(validateExecutionPlan(x,sha).length>0)});
const cases=[
 ['self review',x=>x.roles.leadership_governance.deputy_and_track_r_may_be_same_holder=true,'GOVERNANCE_FALSE_REQUIRED:deputy_and_track_r_may_be_same_holder'],
 ['same vendor independence',x=>x.roles.leadership_governance.same_vendor_counts_as_independent=true,'GOVERNANCE_FALSE_REQUIRED:same_vendor_counts_as_independent'],
 ['override R',x=>x.roles.leadership_governance.kpmo_may_overrule_track_r_findings=true,'GOVERNANCE_FALSE_REQUIRED:kpmo_may_overrule_track_r_findings'],
 ['Track B takeover',x=>x.roles.leadership_governance.track_r_may_replace_track_b=true,'GOVERNANCE_FALSE_REQUIRED:track_r_may_replace_track_b'],
 ['lower qualification bar',x=>x.roles.leadership_governance.permanent_kpmo_target_score=85,'QUALIFICATION_BAR_CHANGED'],
 ['fake qualification pass',x=>x.roles.leadership_governance.qualification_pass_claimed=true,'QUALIFICATION_BAR_CHANGED'],
 ['fake external launcher',x=>x.roles.leadership_governance.external_launcher_enforcement='PASS','EXTERNAL_LAUNCHER_PROOF_INFLATION'],
 ['fake dispatch',x=>x.records['agent-aegis'].dispatch_enabled=true,'UNPROVEN_ROLE_ACTIVATION:agent-aegis'],
 ['fake deputy acceptance',x=>x.records['agent-codex-deputy'].role_acceptance_receipt='fake','UNPROVEN_ROLE_ACTIVATION:agent-codex-deputy'],
 ['swapped R holder',x=>x.records['role-track-r'].holder_id='agent-atlas','ROLE_IDENTITY_MISMATCH:track-r-red-team'],
 ['R reporting to KPMO',x=>x.records['agent-aegis'].reports_to='integration-conductor','ROLE_REPORTING_MISMATCH:track-r-red-team'],
 ['old C history erased',x=>x.historicalWork.status='PENDING','TRACK_C_HISTORY_REWRITTEN'],
 ['old C acceptance made current',x=>x.records['agent-track-c'].current_session_readiness='VERIFIED','TRACK_C_HISTORY_CURRENT_CONFLATION:agent-track-c'],
 ['Track C scope erased',x=>delete x.records['track-c-portal-v502-experience-layer'].role_acceptance_scope,'TRACK_C_OPERATIONAL_SCOPE_MISMATCH'],
 ['role index stale',x=>x.indexes.role.records.find(r=>r.id==='role-track-c').status='ACTIVE','INDEX_STATUS_MISMATCH:role-track-c'],
 ['role count stale',x=>x.indexes.role.record_count--,'INDEX_COUNT_MISMATCH:role'],
 ['class absent',x=>x.contract.inheritance.applies_to=x.contract.inheritance.applies_to.filter(v=>v!=='TRACK_R'),'BOOTSTRAP_CLASS_MISSING:TRACK_R'],
 ['verifier role drift',x=>x.sources.verifier=x.sources.verifier.replace("TRACK_R: 'track-r-red-team'","TRACK_R: 'integration-conductor'"),'BOOTSTRAP_ROLE_MAP_MISMATCH:verifier:TRACK_R'],
 ['strategy receipt missing',x=>x.sources.verifier=x.sources.verifier.replaceAll('strategy_contract_sha256','removed'),'STRATEGY_RECEIPT_BINDING_MISSING:verifier'],
 ['reminder removed',x=>x.documents['AGENTS.md']=x.documents['AGENTS.md'].replaceAll('mandatory_execution_strategy','removed'),'BOOTSTRAP_REMINDER_MISSING:AGENTS.md'],
 ['routine approval restored',x=>x.roles.mandatory_execution_strategy.routine_owner_approval_required=true,'STRATEGY_FALSE_REQUIRED:routine_owner_approval_required'],
 ['paid run without observability',x=>x.roles.mandatory_execution_strategy.missing_cost_observability_allows_paid_dispatch=true,'STRATEGY_FALSE_REQUIRED:missing_cost_observability_allows_paid_dispatch'],
 ['reading inflated to performance',x=>x.roles.mandatory_execution_strategy.reading_receipt_proves_execution_quality=true,'STRATEGY_FALSE_REQUIRED:reading_receipt_proves_execution_quality'],
 ['retry unbounded',x=>x.roles.mandatory_execution_strategy.maximum_retries_per_root=99,'STRATEGY_BOUNDS_REQUIRED']
];
for(const [name,mutate,code]of cases)test(name+' rejected',()=>{const x=structuredClone(state);mutate(x);assert.ok(validateLeadershipState(x).includes(code),code)});
for(const gate of HOLD_FIELDS)test('HOLD cannot disappear: '+gate,()=>{const x=structuredClone(state);x.roles.leadership_governance.protected_holds=x.roles.leadership_governance.protected_holds.filter(v=>v!==gate);assert.ok(validateLeadershipState(x).includes('HOLD_MISSING:'+gate))});
for(const [name,mutate,code]of [
 ['wrong SHA',x=>x.source_sha='0'.repeat(40),'PLAN_EXACT_SHA_REQUIRED'],
 ['unbounded retries',x=>x.limits.max_retries=3,'PLAN_RETRY_BOUND_REQUIRED'],
 ['zero time bound',x=>x.limits.max_elapsed_seconds=0,'PLAN_TIME_BOUND_REQUIRED'],
 ['planning exceeds total',x=>x.limits.max_planning_seconds=121,'PLAN_PLANNING_BOUND_REQUIRED'],
 ['unbudgeted spend',x=>x.limits.max_incremental_spend=1,'PLAN_EXISTING_BUDGET_AUTHORITY_REQUIRED'],
 ['cost unknown',x=>delete x.limits.cost_observability,'PLAN_COST_OBSERVABILITY_REQUIRED'],
 ['unchanged retry',x=>x.same_failure_retry_without_new_evidence=true,'PLAN_UNCHANGED_RETRY_FORBIDDEN'],
 ['plan grants authority',x=>x.authority_granted_by_plan=true,'PLAN_CANNOT_GRANT_AUTHORITY']
])test(name+' plan rejected',()=>{const x=structuredClone(plan);mutate(x);assert.ok(validateExecutionPlan(x,sha).includes(code),code)});
import {CORE_TRACK_IDS,validateTrackRoster} from '../../scripts/kidults/registry/lib/validate-track-roster-v1.mjs';
const approvedRoster=[...CORE_TRACK_IDS,'track-r-red-team-assurance'];
const roster=()=>({record_count:approvedRoster.length,records:approvedRoster.map(id=>({id}))});
test('six approved tracks pass exact schema-backed roster',()=>assert.deepEqual(validateTrackRoster(roster(),approvedRoster),[]));
for(const [name,mutate]of [
 ['missing Track R',x=>{x.records.pop();x.record_count--}],
 ['unapproved Track',x=>{x.records.push({id:'track-unapproved'});x.record_count++}],
 ['duplicate Track',x=>{x.records[5]=x.records[0]}],
 ['stale numeric count',x=>{x.record_count=5}]
])test(name+' roster rejected',()=>{const x=roster();mutate(x);assert.ok(validateTrackRoster(x,approvedRoster).length>0)});
test('schema cannot drop core track',()=>assert.ok(validateTrackRoster(roster(),approvedRoster.slice(1)).some(e=>e.startsWith('CORE_TRACK_SCHEMA_MISSING'))));
test('duplicate schema ids fail closed',()=>assert.deepEqual(validateTrackRoster(roster(),[...approvedRoster,approvedRoster[0]]),['APPROVED_TRACK_SCHEMA_INVALID']));
