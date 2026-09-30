import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateWorkContinuityPolicy, validateClosureReceipt} from '../../scripts/governance/validate-autonomous-closure-ownership-v1.mjs';
const policy=JSON.parse(fs.readFileSync('coordination/kidults/governance/autonomous-closure-ownership-policy-v1.json','utf8'));
test('work continuity policy is configuration only and grants no dispatch',()=>{
  assert.equal(policy.version,'1.1.0');
  assert.equal(Object.hasOwn(policy.continuation,'same_task_session_retains_accountability_until_terminal_state'),false);
  assert.equal(Object.hasOwn(policy.reporting_gate,'routine_intermediate_progress_report_allowed'),false);
  assert.deepEqual(validateWorkContinuityPolicy(policy),{state:'POLICY_CONFIGURATION_VALIDATED',grants_dispatch_authority:false});
});
for(const [key,value] of Object.entries(policy.session_resume)){
  test('resume control cannot be inverted: '+key,()=>{const x=structuredClone(policy);x.session_resume[key]=!value;assert.throws(()=>validateWorkContinuityPolicy(x),/SESSION_RESUME_CONTROL/)});
  test('resume control cannot be omitted: '+key,()=>{const x=structuredClone(policy);delete x.session_resume[key];assert.throws(()=>validateWorkContinuityPolicy(x),/SESSION_RESUME_CONTROL/)});
}
const mutations=[
 ['silent wait for prompt',x=>x.continuation.authorized_reversible_work_continues_without_routine_owner_prompt=false],
 ['PR pass ends task',x=>x.continuation.pr_creation_ci_success_merge_or_single_workflow_success_is_terminal=true],
 ['telemetry masks handoff',x=>x.reporting_gate.user_return_means_control_handoff_not_telemetry=false],
 ['policy grants privileges',x=>x.authority_boundary.policy_grants_no_new_credentials_spend_contract_release_or_irreversible_authority=false],
 ['abandon durable owner',x=>x.continuation.same_root_incident_and_completion_owner_retained_until_terminal_state=false],
 ['split final responsibility',x=>x.single_root_incident.one_accountable_completion_owner=false],
 ['disable observations',x=>x.reporting_gate.evidence_based_nonblocking_observability_allowed=false],
 ['telemetry awaits reply',x=>x.reporting_gate.observability_may_require_owner_reply_or_terminate_work=true],
 ['restore routine approval',x=>x.reporting_gate.routine_request_for_next_or_repeat_approval_allowed=true],
 ['skip exact main',x=>x.completion_gate.exact_landed_main_required=false],
 ['skip sentinel',x=>x.completion_gate.producer_health_sentinel_success_required=false],
 ['permit residual P1',x=>x.completion_gate.unresolved_p0_or_p1_in_scope_allowed=1],
 ['release production',x=>x.authority_boundary.production='GO'],
 ['release public',x=>x.authority_boundary.public='GO'],
 ['release G5',x=>x.authority_boundary.g5='GO'],
 ['remove reserved gates',x=>x.authority_boundary.owner_reserved_gates_preserved=false]
];
for(const [name,mutate] of mutations)test('reject '+name,()=>{const x=structuredClone(policy);mutate(x);assert.throws(()=>validateWorkContinuityPolicy(x))});
// Synthetic schema fixtures; these never attest a live workflow or agent.
const receipt={id:'kidults-autonomous-closure-receipt-v1',root_incident_id:'TEST_ONLY_ROOT',completion_owner:'TEST_ONLY_OWNER',task_session_id:'TEST_ONLY_SESSION',state:'COMPLETE_VERIFIED',exact_landed_main_sha:'a'.repeat(40),whole_authority_chain:[{name:'TEST_ONLY_NODE',state:'VERIFIED_PASS'}],producer_health_sentinel:{state:'VERIFIED_PASS'},unresolved_in_scope:[],user_return_reason:'COMPLETE_VERIFIED',production:'HOLD',public:'HOLD',g5:'HOLD'};
for(const [name,value] of [['empty',[]],['missing',null],['invalid node',[null]],['pending',[{state:'WAITING'}]],['failed',[{state:'VERIFIED_FAIL'}]]])test('reject '+name+' completion chain',()=>{const x=structuredClone(receipt);x.whole_authority_chain=value;assert.throws(()=>validateClosureReceipt(x),/WHOLE_CHAIN_PASS/)});
test('nonempty schema fixture is not live operational proof',()=>assert.doesNotThrow(()=>validateClosureReceipt(receipt)));
