#!/usr/bin/env node
import fs from 'node:fs';

const POLICY = 'coordination/kidults/governance/autonomous-closure-ownership-policy-v1.json';
const fail = code => { throw new Error(code); };
const assert = (value, code) => { if (!value) fail(code); };
const policy = JSON.parse(fs.readFileSync(POLICY, 'utf8'));
const terminalStates = new Set(['COMPLETE_VERIFIED', 'PROTECTED_STOP_BLOCKED', 'BOUNDED_RETRY_EXHAUSTED_BLOCKED']);
const allowedReturns = new Set(policy.reporting_gate.user_return_allowed_only_for);

assert(policy.rule_id === 'AI-022', 'POLICY_RULE_ID');
assert(policy.whole_authority_chain_change_unit?.indivisible === true, 'WHOLE_AUTHORITY_CHAIN_UNIT_REQUIRED');
assert(policy.whole_authority_chain_change_unit?.producer_consumer_event_mismatch_fails_closed === true, 'TRIGGER_MISMATCH_FAIL_CLOSED');
assert(policy.whole_authority_chain_change_unit?.unregistered_event_fails_closed === true, 'UNREGISTERED_TRIGGER_FAIL_CLOSED');
assert(policy.whole_authority_chain_change_unit?.exact_triggering_run_bound_required === true, 'EXACT_TRIGGER_BINDING_REQUIRED');
assert(policy.single_root_incident.one_accountable_completion_owner === true, 'SINGLE_COMPLETION_OWNER');
assert(policy.continuation.same_root_incident_and_completion_owner_retained_until_terminal_state === true, 'DURABLE_WORK_ACCOUNTABILITY');
assert(policy.continuation.authorized_reversible_work_continues_without_routine_owner_prompt === true, 'AUTONOMOUS_CONTINUATION');
assert(policy.continuation.pr_creation_ci_success_merge_or_single_workflow_success_is_terminal === false, 'INTERMEDIATE_TERMINAL_FORBIDDEN');
assert(policy.reporting_gate.evidence_based_nonblocking_observability_allowed === true, 'NONBLOCKING_OBSERVABILITY_REQUIRED');
assert(policy.reporting_gate.observability_may_require_owner_reply_or_terminate_work === false, 'TELEMETRY_IS_NOT_CONTROL_HANDOFF');
assert(policy.reporting_gate.routine_request_for_next_or_repeat_approval_allowed === false, 'OWNER_REPROMPT_FORBIDDEN');
assert(policy.completion_gate.exact_landed_main_required === true, 'EXACT_MAIN_REQUIRED');
assert(policy.completion_gate.producer_health_sentinel_success_required === true, 'SENTINEL_REQUIRED');

export function validateWorkContinuityPolicy(candidate) {
  const required = {
  "development_branch_resume_contract": "coordination/kidults/governance/resume-contract-v1.json#development_branch_resume",
  "durable_checkpoint_required": true,
  "original_session_provenance_preserved": true,
  "root_incident_and_completion_owner_must_match": true,
  "fresh_exact_source_bootstrap_and_consumption_required": true,
  "existing_actor_identity_and_authority_gates_required": true,
  "previous_writer_fencing_and_exclusive_lease_required": true,
  "remaining_budget_and_root_retry_count_preserved": true,
  "completed_side_effects_must_not_be_reexecuted": true,
  "ambiguous_side_effects_reconciled_before_retry": true,
  "checkpoint_schema_validation_is_identity_authentication": false,
  "resume_grants_or_extends_authority": false,
  "resume_resets_budget_or_retry_count": false,
  "runtime_implementation_claimed_by_policy": false
};
  assert(candidate?.continuation?.same_root_incident_and_completion_owner_retained_until_terminal_state === true, 'DURABLE_WORK_ACCOUNTABILITY');
  assert(candidate?.single_root_incident?.one_accountable_completion_owner === true, 'SINGLE_COMPLETION_OWNER');
  assert(candidate?.continuation?.authorized_reversible_work_continues_without_routine_owner_prompt === true, 'AUTONOMOUS_CONTINUATION');
  assert(candidate?.continuation?.pr_creation_ci_success_merge_or_single_workflow_success_is_terminal === false, 'INTERMEDIATE_TERMINAL_FORBIDDEN');
  assert(candidate?.reporting_gate?.user_return_means_control_handoff_not_telemetry === true, 'TELEMETRY_SCOPE_REQUIRED');
  assert(candidate?.authority_boundary?.policy_grants_no_new_credentials_spend_contract_release_or_irreversible_authority === true, 'POLICY_GRANTS_NO_AUTHORITY');
  for (const [key, value] of Object.entries(required)) {
    assert(candidate?.session_resume?.[key] === value, 'SESSION_RESUME_CONTROL:' + key);
  }
  assert(candidate?.reporting_gate?.evidence_based_nonblocking_observability_allowed === true, 'NONBLOCKING_OBSERVABILITY_REQUIRED');
  assert(candidate?.reporting_gate?.observability_may_require_owner_reply_or_terminate_work === false, 'TELEMETRY_IS_NOT_CONTROL_HANDOFF');
  assert(candidate?.reporting_gate?.routine_request_for_next_or_repeat_approval_allowed === false, 'OWNER_REPROMPT_FORBIDDEN');
  assert(candidate?.completion_gate?.exact_landed_main_required === true, 'EXACT_MAIN_REQUIRED');
  assert(candidate?.completion_gate?.producer_health_sentinel_success_required === true, 'SENTINEL_REQUIRED');
  assert(candidate?.completion_gate?.unresolved_p0_or_p1_in_scope_allowed === 0, 'UNRESOLVED_DEFECTS_FORBIDDEN');
  for (const key of ['production','public','g5']) assert(candidate?.authority_boundary?.[key] === 'HOLD', 'HOLD_BOUNDARY:' + key);
  assert(candidate?.authority_boundary?.owner_reserved_gates_preserved === true, 'OWNER_RESERVED_GATES_REQUIRED');
  return {state:'POLICY_CONFIGURATION_VALIDATED', grants_dispatch_authority:false};
}
validateWorkContinuityPolicy(policy);

export function validateClosureReceipt(receipt) {
  assert(receipt?.id === 'kidults-autonomous-closure-receipt-v1', 'RECEIPT_ID');
  assert(typeof receipt.root_incident_id === 'string' && receipt.root_incident_id.length > 0, 'ROOT_INCIDENT_ID');
  assert(typeof receipt.completion_owner === 'string' && receipt.completion_owner.length > 0, 'COMPLETION_OWNER');
  assert(typeof receipt.task_session_id === 'string' && receipt.task_session_id.length > 0, 'TASK_SESSION_ID');
  assert(terminalStates.has(receipt.state), 'TERMINAL_STATE');
  assert(receipt.production === 'HOLD' && receipt.public === 'HOLD' && receipt.g5 === 'HOLD', 'HOLD_BOUNDARY');
  if (receipt.state === 'COMPLETE_VERIFIED') {
    assert(/^[0-9a-f]{40}$/.test(receipt.exact_landed_main_sha || ''), 'EXACT_MAIN_SHA');
    assert(Array.isArray(receipt.whole_authority_chain) && receipt.whole_authority_chain.length > 0 && receipt.whole_authority_chain.every(node => node?.state === 'VERIFIED_PASS'), 'WHOLE_CHAIN_PASS');
    assert(receipt.producer_health_sentinel?.state === 'VERIFIED_PASS', 'SENTINEL_PASS');
    assert(Array.isArray(receipt.unresolved_in_scope) && receipt.unresolved_in_scope.length === 0, 'UNRESOLVED_IN_SCOPE');
    assert(receipt.user_return_reason === 'COMPLETE_VERIFIED', 'COMPLETE_RETURN_REASON');
  } else {
    assert(typeof receipt.root_blocker?.code === 'string' && receipt.root_blocker.code !== 'UNKNOWN', 'EXACT_ROOT_BLOCKER');
    assert(typeof receipt.root_blocker?.unblock_condition === 'string' && receipt.root_blocker.unblock_condition.length > 0, 'UNBLOCK_CONDITION');
    assert(allowedReturns.has(receipt.user_return_reason), 'BLOCKED_RETURN_REASON');
  }
}

const good = {
  id: 'kidults-autonomous-closure-receipt-v1', root_incident_id: 'INCIDENT-1', completion_owner: 'KPMO', task_session_id: 'SESSION-1',
  state: 'COMPLETE_VERIFIED', exact_landed_main_sha: 'a'.repeat(40),
  whole_authority_chain: policy.mandatory_state_machine.map(name => ({name, state: 'VERIFIED_PASS'})),
  producer_health_sentinel: {state: 'VERIFIED_PASS'}, unresolved_in_scope: [], user_return_reason: 'COMPLETE_VERIFIED',
  production: 'HOLD', public: 'HOLD', g5: 'HOLD',
};
validateClosureReceipt(good);
for (const mutate of [
  value => { value.exact_landed_main_sha = null; },
  value => { value.whole_authority_chain[0].state = 'WAITING'; },
  value => { value.producer_health_sentinel.state = 'VERIFIED_FAIL'; },
  value => { value.unresolved_in_scope = ['P1']; },
  value => { value.user_return_reason = 'PR_MERGED'; },
]) {
  const candidate = structuredClone(good); mutate(candidate);
  let rejected = false; try { validateClosureReceipt(candidate); } catch { rejected = true; }
  assert(rejected, 'NEGATIVE_MUTATION_NOT_REJECTED');
}

const receiptIndex = process.argv.indexOf('--receipt');
if (receiptIndex >= 0) {
  const path = process.argv[receiptIndex + 1];
  assert(path && fs.existsSync(path), 'RECEIPT_PATH');
  validateClosureReceipt(JSON.parse(fs.readFileSync(path, 'utf8')));
}
console.log(JSON.stringify({id:'kidults-autonomous-closure-ownership-validation-v1',state:'VERIFIED_PASS',rule_id:'AI-022',negative_mutations_rejected:5,production:'HOLD',public:'HOLD',g5:'HOLD'}));
