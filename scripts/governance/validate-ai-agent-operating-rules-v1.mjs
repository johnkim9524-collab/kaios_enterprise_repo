#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const files = {
  agents: 'AGENTS.md',
  policy: '.github/AI_AGENT_OPERATING_RULES.md',
  copilot: '.github/copilot-instructions.md',
  contract: 'coordination/kidults/governance/ai-agent-operating-rules-v1.json',
  githubBootstrapContract: 'coordination/kidults/governance/ai-agent-github-bootstrap-contract-v1.json',
  githubBootstrapEntrypoint: 'scripts/governance/bootstrap-ai-agent-from-github-v1.mjs',
  githubBootstrapValidator: 'scripts/governance/validate-ai-agent-github-bootstrap-v1.mjs',
  githubBootstrapVerifier: 'scripts/governance/verify-ai-agent-bootstrap-receipt-v1.mjs',
  platform: 'coordination/kidults/kpmo/operating-principles-and-resilience-controls-v1.json',
  schema: 'coordination/kidults/governance/ai-agent-status-receipt-schema-v1.json',
  registry: 'coordination/kidults/registry/ai-agent-governance-registry-v1.json',
  reserveWorkflow: '.github/workflows/kidults-asi-sharded-source-reserve-v1.yml',
  scaleWorkflow: '.github/workflows/kidults-asi-source-fabric-scale-pi1.yml'
};

const fail = (message) => { throw new Error(message); };
const resolvePath = (p) => path.isAbsolute(p) ? p : path.join(root, p);
const readText = (p) => fs.readFileSync(resolvePath(p), 'utf8');
const readJson = (p) => JSON.parse(readText(p));
const assert = (condition, message) => { if (!condition) fail(message); };
const exactJson = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasTopLevelTrigger = (text, trigger) => new RegExp(`^  ${escapeRegex(trigger)}:\\s*$`, 'm').test(text);

for (const [name, p] of Object.entries(files)) {
  assert(fs.existsSync(resolvePath(p)), `MISSING_${name.toUpperCase()}:${p}`);
}

const agents = readText(files.agents);
const policy = readText(files.policy);
const copilot = readText(files.copilot);
const contract = readJson(files.contract);
const githubBootstrapContract = readJson(files.githubBootstrapContract);
const platform = readJson(files.platform);
const schema = readJson(files.schema);
const registry = readJson(files.registry);
const reserveWorkflow = readText(files.reserveWorkflow);
const scaleWorkflow = readText(files.scaleWorkflow);

const requiredPlatformPrinciples = [
  'AUTONOMOUS',
  'GLOBAL',
  'IRREPLACEABLE_VALUE',
  'TRANSPARENT'
];
assert(platform.id === 'kidults-operating-principles-and-resilience-controls-v1', 'PLATFORM_ID');
assert(platform.version === '1.1.0', 'PLATFORM_VERSION');
assert(platform.status === 'ACTIVE_MANDATORY_FAIL_CLOSED', 'PLATFORM_STATUS');
assert(platform.owner === 'KPMO', 'PLATFORM_OWNER');
assert(platform.precedence === 'HIGHEST_PLATFORM_OPERATING_PRINCIPLES', 'PLATFORM_PRECEDENCE');
assert(JSON.stringify(platform.constitutional_order) === JSON.stringify(requiredPlatformPrinciples), 'PLATFORM_ORDER');
assert(JSON.stringify(Object.keys(platform.operating_principles)) === JSON.stringify(requiredPlatformPrinciples), 'PLATFORM_PRINCIPLE_KEYS');
assert(platform.mandatory_inheritance?.all_tracks === true, 'PLATFORM_TRACK_INHERITANCE');
assert(platform.mandatory_inheritance?.all_ai_agents === true, 'PLATFORM_AI_INHERITANCE');
assert(platform.mandatory_inheritance?.all_workflows === true, 'PLATFORM_WORKFLOW_INHERITANCE');
assert(platform.mandatory_inheritance?.child_rule_can_weaken_or_reorder === false, 'PLATFORM_CHILD_WEAKENING');
assert(platform.mandatory_inheritance?.self_exemption_allowed === false, 'PLATFORM_SELF_EXEMPTION');
assert(platform.autonomous_activation_rule?.manual_only_normal_activation_forbidden === true, 'PLATFORM_MANUAL_ONLY_FORBIDDEN');
for (const field of ['autonomous_effect','global_effect','irreplaceable_value_effect','transparency_effect']) {
  assert(platform.material_change_decision_test?.required_fields?.includes(field), `PLATFORM_EFFECT_FIELD:${field}`);
}

assert(contract.id === 'kidults-ai-agent-operating-rules-v1', 'CONTRACT_ID');
assert(contract.version === '1.7.0', 'CONTRACT_VERSION');
assert(typeof contract.change_rationale === 'string' && contract.change_rationale.length > 20, 'CONTRACT_CHANGE_RATIONALE');
assert(contract.status === 'MANDATORY_FAIL_CLOSED', 'CONTRACT_STATUS');
assert(contract.owner === 'KPMO', 'CONTRACT_OWNER');
assert(contract.effective_scope === 'REPOSITORY_WIDE_ALL_AI_AGENTS_AND_AGENT_DISPATCHING_AUTOMATIONS', 'CONTRACT_SCOPE');
assert(contract.platform_constitution?.path === files.platform, 'CONTRACT_PLATFORM_PATH');
assert(contract.platform_constitution?.precedence === platform.precedence, 'CONTRACT_PLATFORM_PRECEDENCE');
assert(JSON.stringify(contract.platform_constitution?.ordered_principles) === JSON.stringify(requiredPlatformPrinciples), 'CONTRACT_PLATFORM_ORDER');
assert(contract.platform_constitution?.mandatory_inheritance === true, 'CONTRACT_PLATFORM_INHERITANCE');
assert(contract.platform_constitution?.agent_self_exemption_allowed === false, 'CONTRACT_PLATFORM_SELF_EXEMPTION');
assert(contract.platform_constitution?.child_rule_can_weaken_or_reorder === false, 'CONTRACT_PLATFORM_CHILD_WEAKENING');
assert(contract.platform_constitution?.manual_only_normal_activation_for_governed_ready_runner_forbidden === true, 'CONTRACT_MANUAL_ONLY_FORBIDDEN');
assert(contract.enforcement?.production === 'HOLD', 'CONTRACT_PRODUCTION_BOUNDARY');
assert(contract.enforcement?.public_release === 'HOLD', 'CONTRACT_PUBLIC_BOUNDARY');
assert(contract.enforcement?.no_agent_self_exemption === true, 'SELF_EXEMPTION_MUST_BE_FALSE');
assert(contract.enforcement?.policy_and_contract_must_change_together === true, 'POLICY_CONTRACT_SYNC');
assert(contract.enforcement?.proactive_internal_remediation_required === true, 'PROACTIVE_REMEDIATION_REQUIRED');
assert(contract.enforcement?.verified_closure_and_forward_proposal_required === true, 'VERIFIED_CLOSURE_FORWARD_PROPOSAL_REQUIRED');
assert(contract.enforcement?.global_scale_stewardship_required === true, 'GLOBAL_SCALE_STEWARDSHIP_REQUIRED');
assert(contract.github_bootstrap_contract_path === files.githubBootstrapContract, 'CONTRACT_GITHUB_BOOTSTRAP_PATH');
assert(contract.enforcement?.github_canonical_bootstrap_required === true, 'GITHUB_BOOTSTRAP_REQUIRED');
assert(contract.enforcement?.bootstrap_receipt_before_task_required === true, 'GITHUB_BOOTSTRAP_RECEIPT_REQUIRED');
assert(contract.enforcement?.bootstrap_independent_verification_and_consumption_required === true, 'GITHUB_BOOTSTRAP_INDEPENDENT_VERIFICATION_REQUIRED');
assert(contract.enforcement?.bootstrap_agent_task_session_nonce_binding_required === true, 'GITHUB_BOOTSTRAP_BINDINGS_REQUIRED');
assert(contract.enforcement?.bootstrap_reads_exact_committed_git_blobs === true, 'GITHUB_BOOTSTRAP_COMMITTED_BLOBS_REQUIRED');
assert(contract.enforcement?.local_expected_sha_establishes_github_provenance === false, 'LOCAL_SHA_MUST_NOT_ESTABLISH_GITHUB_PROVENANCE');
assert(contract.enforcement?.github_event_context_establishes_current_github_state === false, 'GITHUB_CONTEXT_CURRENT_STATE_ESCALATION');
assert(contract.enforcement?.current_github_state_requires_authenticated_remote_working_ref_verification === true, 'GITHUB_CURRENT_STATE_REMOTE_VERIFICATION_REQUIRED');
assert(githubBootstrapContract.id === 'kidults-ai-agent-github-bootstrap-contract-v1', 'GITHUB_BOOTSTRAP_CONTRACT_ID');
assert(githubBootstrapContract.version === '1.3.0', 'GITHUB_BOOTSTRAP_CONTRACT_VERSION');
assert(typeof githubBootstrapContract.change_rationale === 'string' && githubBootstrapContract.change_rationale.length > 20, 'GITHUB_BOOTSTRAP_CHANGE_RATIONALE');
assert(githubBootstrapContract.status === 'MANDATORY_FAIL_CLOSED', 'GITHUB_BOOTSTRAP_CONTRACT_STATUS');
assert(githubBootstrapContract.bootstrap_entrypoint?.path === files.githubBootstrapEntrypoint, 'GITHUB_BOOTSTRAP_ENTRYPOINT');
assert(githubBootstrapContract.bootstrap_entrypoint?.validator_path === files.githubBootstrapValidator, 'GITHUB_BOOTSTRAP_VALIDATOR');
assert(githubBootstrapContract.bootstrap_entrypoint?.receipt_verifier_path === files.githubBootstrapVerifier, 'GITHUB_BOOTSTRAP_RECEIPT_VERIFIER');
assert(githubBootstrapContract.task_dispatch_gate?.bootstrap_receipt_required === true, 'GITHUB_BOOTSTRAP_DISPATCH_GATE');
assert(githubBootstrapContract.task_dispatch_gate?.independent_receipt_verification_required === true, 'GITHUB_BOOTSTRAP_INDEPENDENT_RECEIPT_VERIFICATION');
assert(githubBootstrapContract.task_dispatch_gate?.receipt_consumption_required === true, 'GITHUB_BOOTSTRAP_RECEIPT_CONSUMPTION');
assert(githubBootstrapContract.task_dispatch_gate?.receipt_alone_grants_task_authority === false, 'GITHUB_BOOTSTRAP_RECEIPT_AUTHORITY_BOUNDARY');
assert(githubBootstrapContract.inheritance?.agent_self_exemption_allowed === false, 'GITHUB_BOOTSTRAP_SELF_EXEMPTION');

const expectedSourceAttestationFields = [
  'scope',
  'current_github_state_claims_allowed',
  'authority_relationship',
  'remote_ref_presence_does_not_authorize_or_promote',
  'promotion_eligible',
  'github_event',
  'remote'
];
const expectedWorktreeStateFields = [
  'baseline_algorithm',
  'baseline_digest',
  'require_clean_enforced',
  'status'
];
const expectedWorktreeAlgorithm = 'SHA256_GIT_STATUS_INDEX_DIFF_AND_UNTRACKED_CONTENT_V1';
const expectedReceiptAuthorityBoundary = {
  repository_worktree_mutation_performed: false,
  git_metadata_receipt_write_performed: true,
  github_write_performed: false,
  orchestrator_nonce_read_performed: true,
  orchestrator_nonce_persisted_or_logged: false,
  other_secret_or_credential_read_performed: false,
  task_authority_granted_by_bootstrap: false,
  merge_authority_granted_by_bootstrap: false,
  promotion_or_release_authority_granted_by_bootstrap: false,
  bound_execution_scope: 'EXACT_COMMITTED_GOVERNANCE_TRUST_CLOSURE',
  full_worktree_immutability_claimed: false,
  production: 'HOLD',
  public_release: 'HOLD'
};

assert(githubBootstrapContract.task_dispatch_gate?.external_expected_sha_required === true, 'GITHUB_BOOTSTRAP_EXTERNAL_EXPECTED_SHA_REQUIRED');
assert(githubBootstrapContract.task_dispatch_gate?.expected_sha_must_equal_working_sha === true, 'GITHUB_BOOTSTRAP_EXPECTED_SHA_WORKING_SHA_BINDING');
assert(githubBootstrapContract.task_dispatch_gate?.expected_sha_match_state_must_be_true === true, 'GITHUB_BOOTSTRAP_EXPECTED_SHA_MATCH_STATE');
assert(githubBootstrapContract.task_dispatch_gate?.verified_result_must_bind_same_agent_task_session_nonce_and_sha === true, 'GITHUB_BOOTSTRAP_VERIFIED_RESULT_BINDINGS');
assert(exactJson(githubBootstrapContract.github_provenance_policy?.source_attestation_required_fields, expectedSourceAttestationFields), 'GITHUB_BOOTSTRAP_SOURCE_ATTESTATION_FIELDS_EXACT');
assert(githubBootstrapContract.github_provenance_policy?.remote_authority_relationship_evaluation === 'NOT_EVALUATED', 'GITHUB_BOOTSTRAP_REMOTE_AUTHORITY_NOT_EVALUATED');
assert(githubBootstrapContract.github_provenance_policy?.remote_ref_presence_does_not_authorize_or_promote === true, 'GITHUB_BOOTSTRAP_REMOTE_REF_NO_AUTHORITY');
assert(githubBootstrapContract.github_provenance_policy?.bootstrap_promotion_eligible === false, 'GITHUB_BOOTSTRAP_PROMOTION_INELIGIBLE');
assert(githubBootstrapContract.github_provenance_policy?.promotion_requires_separate_protected_gate === true, 'GITHUB_BOOTSTRAP_PROMOTION_PROTECTED_GATE');
assert(exactJson(githubBootstrapContract.worktree_baseline_policy?.receipt_field_set, expectedWorktreeStateFields), 'GITHUB_BOOTSTRAP_WORKTREE_FIELDS_EXACT');
assert(githubBootstrapContract.worktree_baseline_policy?.algorithm === expectedWorktreeAlgorithm, 'GITHUB_BOOTSTRAP_WORKTREE_ALGORITHM');
assert(githubBootstrapContract.worktree_baseline_policy?.baseline_must_remain_stable_during_bootstrap === true, 'GITHUB_BOOTSTRAP_WORKTREE_BASELINE_STABILITY');
assert(githubBootstrapContract.worktree_baseline_policy?.baseline_rechecked_immediately_before_consumption === true, 'GITHUB_BOOTSTRAP_WORKTREE_RECHECK');
assert(githubBootstrapContract.worktree_baseline_policy?.full_worktree_immutability_claimed === false, 'GITHUB_BOOTSTRAP_NO_FULL_WORKTREE_IMMUTABILITY_CLAIM');
assert(githubBootstrapContract.identity_and_replay_policy?.receipt_integrity_algorithm === 'HMAC_SHA256_WITH_ORCHESTRATOR_NONCE', 'GITHUB_BOOTSTRAP_HMAC_REQUIRED');
assert(githubBootstrapContract.identity_and_replay_policy?.unkeyed_receipt_digest_allowed === false, 'GITHUB_BOOTSTRAP_UNKEYED_DIGEST_FORBIDDEN');
assert(githubBootstrapContract.identity_and_replay_policy?.generated_receipt_filename_is_fixed_length_digest === true, 'GITHUB_BOOTSTRAP_FIXED_DIGEST_FILENAME');
assert(githubBootstrapContract.identity_and_replay_policy?.raw_orchestrator_nonce_allowed_in_receipt_consumption_marker_or_process_output === false, 'GITHUB_BOOTSTRAP_RAW_NONCE_OUTPUT_FORBIDDEN');
assert(exactJson(githubBootstrapContract.receipt_authority_boundary, expectedReceiptAuthorityBoundary), 'GITHUB_BOOTSTRAP_RECEIPT_AUTHORITY_BOUNDARY_EXACT');
assert(githubBootstrapContract.trust_model?.full_root_of_trust_requires_an_external_pinned_or_protected_base_launcher === true, 'GITHUB_BOOTSTRAP_EXTERNAL_ROOT_LAUNCHER_REQUIRED');
assert(githubBootstrapContract.trust_model?.clean_github_actions_checkout_alone_is_a_full_root_of_trust === false, 'GITHUB_BOOTSTRAP_CLEAN_CHECKOUT_NOT_ROOT_OF_TRUST');
assert(githubBootstrapContract.dispatcher_integration?.repository_dispatch_jobs_trust_tier === 'REPOSITORY_BOUND_NOT_FULL_ROOT_OF_TRUST', 'GITHUB_BOOTSTRAP_REPOSITORY_TRUST_TIER');
assert(githubBootstrapContract.dispatcher_integration?.absence_of_an_external_dispatcher_hook_cannot_be_repaired_by_repository_policy_alone === true, 'GITHUB_BOOTSTRAP_EXTERNAL_HOOK_LIMITATION');

assert(exactJson(contract.enforcement?.required_bootstrap_receipt_fields, githubBootstrapContract.required_receipt_fields), 'OPERATING_BOOTSTRAP_RECEIPT_FIELDS_MISMATCH');
assert(exactJson(registry.mandatory_inheritance?.required_bootstrap_receipt_fields, githubBootstrapContract.required_receipt_fields), 'REGISTRY_BOOTSTRAP_RECEIPT_FIELDS_MISMATCH');
assert(exactJson(contract.enforcement?.bootstrap_fail_closed_conditions, githubBootstrapContract.fail_closed_conditions), 'OPERATING_BOOTSTRAP_FAIL_LIST_MISMATCH');
assert(exactJson(registry.mandatory_inheritance?.bootstrap_fail_closed_conditions, githubBootstrapContract.fail_closed_conditions), 'REGISTRY_BOOTSTRAP_FAIL_LIST_MISMATCH');

const mirroredBootstrapSemantics = {
  external_expected_sha_required: true,
  expected_sha_must_equal_working_sha: true,
  expected_sha_match_state_must_be_true: true,
  source_attestation_required_fields: expectedSourceAttestationFields,
  remote_authority_relationship_evaluation: 'NOT_EVALUATED',
  remote_ref_presence_does_not_authorize_or_promote: true,
  bootstrap_promotion_eligible: false,
  promotion_requires_separate_protected_gate: true,
  receipt_integrity_algorithm: 'HMAC_SHA256_WITH_ORCHESTRATOR_NONCE',
  unkeyed_receipt_digest_allowed: false,
  generated_receipt_filename_is_fixed_length_digest: true,
  raw_orchestrator_nonce_allowed_in_receipt_consumption_marker_or_process_output: false,
  external_dispatcher_requires_durable_protected_nonce_store: true,
  receipt_worktree_state_required_fields: expectedWorktreeStateFields,
  worktree_baseline_algorithm: expectedWorktreeAlgorithm,
  worktree_baseline_digest_continuity_scope: 'BOOTSTRAP_TO_RECEIPT_CONSUMPTION',
  worktree_baseline_digest_establishes_full_worktree_immutability: false,
  ci_release_and_promotion_require_clean_worktree: true,
  general_coding_agent_dirty_worktree_allowed: true,
  fixed_receipt_filename_verifier_binding_required: true,
  full_root_of_trust_requires_an_external_pinned_or_protected_base_launcher: true,
  clean_github_actions_checkout_alone_is_a_full_root_of_trust: false,
  merge_promotion_and_release_require_separate_protected_gate: true,
  merge_authority_granted_by_bootstrap: false,
  promotion_or_release_authority_granted_by_bootstrap: false
};
for (const [key, expected] of Object.entries(mirroredBootstrapSemantics)) {
  assert(exactJson(contract.enforcement?.[key], expected), `OPERATING_BOOTSTRAP_SEMANTIC_MISMATCH:${key}`);
  assert(exactJson(registry.mandatory_inheritance?.[key], expected), `REGISTRY_BOOTSTRAP_SEMANTIC_MISMATCH:${key}`);
}
assert(contract.enforcement?.repository_dispatch_jobs_trust_tier === githubBootstrapContract.dispatcher_integration?.repository_dispatch_jobs_trust_tier, 'OPERATING_BOOTSTRAP_TRUST_TIER_MISMATCH');
assert(registry.dispatcher_integration?.repository_dispatch_jobs_trust_tier === githubBootstrapContract.dispatcher_integration?.repository_dispatch_jobs_trust_tier, 'REGISTRY_BOOTSTRAP_TRUST_TIER_MISMATCH');
assert(contract.enforcement?.full_root_launcher_reference === githubBootstrapContract.dispatcher_integration?.full_root_launcher_reference, 'OPERATING_BOOTSTRAP_ROOT_LAUNCHER_MISMATCH');
assert(registry.dispatcher_integration?.full_root_launcher_reference === githubBootstrapContract.dispatcher_integration?.full_root_launcher_reference, 'REGISTRY_BOOTSTRAP_ROOT_LAUNCHER_MISMATCH');
assert(contract.enforcement?.absence_of_an_external_dispatcher_hook_cannot_be_repaired_by_repository_policy_alone === true, 'OPERATING_EXTERNAL_DISPATCHER_LIMITATION');
assert(registry.dispatcher_integration?.absence_of_an_external_dispatcher_hook_cannot_be_repaired_by_repository_policy_alone === true, 'REGISTRY_EXTERNAL_DISPATCHER_LIMITATION');
assert(contract.enforcement?.actual_in_repository_ai_model_dispatch_job_count === 0, 'OPERATING_ACTUAL_AI_MODEL_DISPATCH_JOB_COUNT');
assert(contract.enforcement?.repository_defense_in_depth_bootstrap_jobs_are_ai_or_model_dispatchers === false, 'OPERATING_DEFENSE_IN_DEPTH_DISPATCH_CLASSIFICATION');
assert(contract.enforcement?.external_ai_model_dispatchers_must_implement_equivalent_bootstrap_gate === true, 'OPERATING_EXTERNAL_AI_MODEL_DISPATCH_GATE');
assert(exactJson(githubBootstrapContract.dispatcher_integration?.actual_ai_model_dispatch_jobs, []), 'GITHUB_BOOTSTRAP_ACTUAL_AI_MODEL_DISPATCH_JOBS');
assert(githubBootstrapContract.dispatcher_integration?.repository_defense_in_depth_bootstrap_jobs_are_ai_or_model_dispatchers === false, 'GITHUB_BOOTSTRAP_DEFENSE_IN_DEPTH_DISPATCH_CLASSIFICATION');
assert(exactJson(registry.dispatcher_integration?.actual_ai_model_dispatch_jobs, githubBootstrapContract.dispatcher_integration?.actual_ai_model_dispatch_jobs), 'REGISTRY_ACTUAL_AI_MODEL_DISPATCH_JOBS_MISMATCH');
assert(exactJson(registry.dispatcher_integration?.repository_defense_in_depth_bootstrap_jobs, githubBootstrapContract.dispatcher_integration?.repository_defense_in_depth_bootstrap_jobs), 'REGISTRY_DEFENSE_IN_DEPTH_BOOTSTRAP_JOBS_MISMATCH');
const globalScale = contract.global_scale_operating_standard;
assert(globalScale?.scope === 'ENTIRE_VALUE_CHAIN', 'GLOBAL_SCALE_SCOPE');
assert(globalScale?.platform_position === 'GLOBAL_LEADING_PLATFORM', 'GLOBAL_SCALE_POSITION');
assert(globalScale?.boutique_or_local_only_assumptions_allowed === false, 'GLOBAL_SCALE_BOUTIQUE_FORBIDDEN');
assert(globalScale?.required_dimensions?.length === 7, 'GLOBAL_SCALE_DIMENSION_COUNT');
assert(globalScale?.architecture_coverage_counts_as_empirical_global_proof === false, 'GLOBAL_SCALE_EMPIRICAL_BOUNDARY');
assert(globalScale?.authorized_internal_bottleneck_remediation_required === true, 'GLOBAL_SCALE_BOTTLENECK_REMEDIATION');
assert(globalScale?.scale_claim_requires_measured_evidence === true, 'GLOBAL_SCALE_MEASURED_EVIDENCE');

const requiredPrinciples = [
  'ABSOLUTE_HONESTY',
  'COMPLETE_TRANSPARENCY',
  'EVIDENCE_BEFORE_STATUS',
  'NO_FABRICATED_PROGRESS',
  'EXECUTION_TRUTH',
  'LIVE_STATE_VERIFICATION',
  'IMMEDIATE_BLOCKER_DISCLOSURE',
  'IMMEDIATE_CORRECTION',
  'FIX_WITHIN_AUTHORITY',
  'NO_UNSUPPORTED_CONTINUITY_CLAIMS',
  'NO_CAPABILITY_INFLATION',
  'REGISTRY_IS_TRUTH',
  'LABEL_FACT_INFERENCE_PLAN_UNKNOWN',
  'FAIL_CLOSED_ON_UNCERTAINTY',
  'TRUST_OVER_SPEED',
  'PROACTIVE_ISSUE_OWNERSHIP',
  'LEAD_TO_VERIFIED_CLOSURE_AND_IMPROVEMENT',
  'GLOBAL_SCALE_STEWARDSHIP'
];
const principleNames = contract.principles?.map((x) => x.name) ?? [];
assert(principleNames.length === requiredPrinciples.length, 'PRINCIPLE_COUNT');
assert(new Set(principleNames).size === principleNames.length, 'DUPLICATE_PRINCIPLE');
for (const name of requiredPrinciples) assert(principleNames.includes(name), `MISSING_PRINCIPLE:${name}`);
const principleById = new Map(contract.principles.map((rule) => [rule.rule_id, rule]));
assert(principleById.get('AI-016')?.name === 'PROACTIVE_ISSUE_OWNERSHIP', 'AI_016_IDENTITY_BINDING');
assert(principleById.get('AI-017')?.name === 'LEAD_TO_VERIFIED_CLOSURE_AND_IMPROVEMENT', 'AI_017_IDENTITY_BINDING');
assert(principleById.get('AI-016')?.requirement?.includes('repeated human prompting'), 'AI_016_PROMPTING_BOUNDARY');
assert(principleById.get('AI-017')?.requirement?.includes('prioritized'), 'AI_017_FORWARD_IMPROVEMENT_BOUNDARY');
assert(principleById.get('AI-018')?.name === 'GLOBAL_SCALE_STEWARDSHIP', 'AI_018_IDENTITY_BINDING');
for (const marker of ['entire value chain', 'global leading platform', 'capacity', 'failure isolation', 'rights', 'cost', 'observability', 'recovery']) {
  assert(principleById.get('AI-018')?.requirement?.includes(marker), `AI_018_REQUIREMENT:${marker}`);
}
for (const rule of contract.principles) {
  assert(/^AI-\d{3}$/.test(rule.rule_id), `INVALID_RULE_ID:${rule.rule_id}`);
  assert(['P0_GOVERNANCE_DEFECT', 'P1_OPERATING_DEFECT'].includes(rule.severity_on_violation), `INVALID_SEVERITY:${rule.rule_id}`);
  assert(typeof rule.requirement === 'string' && rule.requirement.length > 20, `WEAK_REQUIREMENT:${rule.rule_id}`);
}

const requiredStates = [
  'PLANNED','IMPLEMENTED_NOT_VERIFIED','RUNNING_VERIFIED','VERIFIED_PASS','VERIFIED_FAIL',
  'MERGED_VERIFIED','DEPLOYED_VERIFIED','BLOCKED','UNKNOWN','HOLD','COMPLETE_VERIFIED'
];
const requiredReportFields = [
  'agent_id', 'as_of', 'scope', 'state', 'facts', 'evidence_refs', 'inferences',
  'uncertainties', 'blockers', 'actions_executed', 'next_action', 'authority_boundary',
  'defect_disposition', 'remediation_sequence', 'verification_evidence_refs',
  'truth_sync_refs', 'improvement_proposal'
];
assert(JSON.stringify(contract.required_report_fields) === JSON.stringify(requiredReportFields), 'REQUIRED_REPORT_FIELDS_EXACT');
const contractStates = Object.keys(contract.governed_states ?? {});
assert(contractStates.length === requiredStates.length, 'STATE_COUNT');
for (const state of requiredStates) {
  assert(contractStates.includes(state), `MISSING_STATE:${state}`);
  assert(Array.isArray(contract.governed_states[state].minimum_evidence), `STATE_EVIDENCE_NOT_ARRAY:${state}`);
  assert(contract.governed_states[state].minimum_evidence.length > 0, `STATE_EVIDENCE_EMPTY:${state}`);
}

assert(schema.$schema === 'https://json-schema.org/draft/2020-12/schema', 'SCHEMA_DRAFT');
assert(schema.type === 'object' && schema.additionalProperties === false, 'SCHEMA_OBJECT_BOUNDARY');
const schemaStates = schema.properties?.state?.enum ?? [];
assert(JSON.stringify([...schemaStates].sort()) === JSON.stringify([...requiredStates].sort()), 'SCHEMA_STATE_MISMATCH');
for (const field of contract.required_report_fields) {
  assert(schema.required?.includes(field), `SCHEMA_MISSING_REQUIRED_FIELD:${field}`);
}
assert(schema.properties?.production?.const === 'HOLD', 'SCHEMA_PRODUCTION_BOUNDARY');
assert(schema.properties?.public_release?.const === 'HOLD', 'SCHEMA_PUBLIC_BOUNDARY');

assert(registry.id === 'kidults-ai-agent-governance-registry-v1', 'REGISTRY_ID');
assert(registry.version === contract.version, 'REGISTRY_VERSION_MISMATCH');
assert(registry.owner === 'KPMO', 'REGISTRY_OWNER');
assert(registry.registered_policy?.policy_version === '1.7.0', 'REGISTRY_POLICY_VERSION');
assert(typeof registry.change_rationale === 'string' && registry.change_rationale.length > 20, 'REGISTRY_CHANGE_RATIONALE');
assert(registry.registered_policy?.platform_constitution_path === files.platform, 'REGISTRY_PLATFORM_PATH');
assert(registry.platform_operating_principles?.precedence === platform.precedence, 'REGISTRY_PLATFORM_PRECEDENCE');
assert(JSON.stringify(registry.platform_operating_principles?.ordered_principles) === JSON.stringify(requiredPlatformPrinciples), 'REGISTRY_PLATFORM_ORDER');
assert(registry.platform_operating_principles?.child_rule_can_weaken_or_reorder === false, 'REGISTRY_PLATFORM_WEAKENING');
assert(registry.platform_operating_principles?.manual_only_normal_activation_for_ready_governed_runner_forbidden === true, 'REGISTRY_MANUAL_ONLY_FORBIDDEN');
assert(registry.automatic_execution_paths?.sharded_reserve_workflow === files.reserveWorkflow, 'REGISTRY_RESERVE_WORKFLOW');
assert(registry.automatic_execution_paths?.source_fabric_scale_workflow === files.scaleWorkflow, 'REGISTRY_SCALE_WORKFLOW');
assert(registry.automatic_execution_paths?.normal_activation_requires_automatic_trigger === true, 'REGISTRY_AUTOMATIC_TRIGGER');
assert(registry.mandatory_inheritance?.child_rule_can_weaken_policy === false, 'CHILD_WEAKENING_ALLOWED');
assert(registry.mandatory_inheritance?.agent_self_exemption_allowed === false, 'REGISTRY_SELF_EXEMPTION_ALLOWED');
assert(registry.mandatory_inheritance?.github_canonical_bootstrap_required === true, 'REGISTRY_GITHUB_BOOTSTRAP_REQUIRED');
assert(registry.mandatory_inheritance?.per_agent_bootstrap_receipt_required === true, 'REGISTRY_PER_AGENT_BOOTSTRAP_RECEIPT_REQUIRED');
assert(registry.mandatory_inheritance?.agent_task_session_nonce_binding_required === true, 'REGISTRY_BOOTSTRAP_BINDINGS_REQUIRED');
assert(registry.mandatory_inheritance?.independent_receipt_verification_required === true, 'REGISTRY_BOOTSTRAP_INDEPENDENT_VERIFICATION_REQUIRED');
assert(registry.mandatory_inheritance?.one_time_receipt_consumption_required === true, 'REGISTRY_BOOTSTRAP_ONE_TIME_CONSUMPTION_REQUIRED');
assert(registry.mandatory_inheritance?.exact_committed_git_blob_loading_required === true, 'REGISTRY_COMMITTED_BLOB_LOADING_REQUIRED');
assert(registry.mandatory_inheritance?.local_expected_sha_establishes_github_provenance === false, 'REGISTRY_LOCAL_SHA_PROVENANCE_FORBIDDEN');
assert(registry.mandatory_inheritance?.github_event_context_establishes_current_github_state === false, 'REGISTRY_GITHUB_CONTEXT_CURRENT_STATE_ESCALATION');
assert(registry.mandatory_inheritance?.current_github_state_requires_authenticated_remote_working_ref_verification === true, 'REGISTRY_CURRENT_STATE_REMOTE_VERIFICATION_REQUIRED');
assert(registry.mandatory_inheritance?.task_dispatch_without_bootstrap_receipt_allowed === false, 'REGISTRY_UNVERIFIED_TASK_DISPATCH_ALLOWED');
assert(registry.leadership_execution?.responsible_agent_owns_authorized_remediation_to_closure === true, 'REGISTRY_RESPONSIBLE_AGENT_OWNS_REMEDIATION');
assert(registry.leadership_execution?.kpmo_is_unique_remediation_owner === false, 'REGISTRY_KPMO_EXCLUSIVE_REMEDIATION_OWNER');
assert(registry.violation_classification?.report_only_while_authorized_reversible_remediation_executable === 'P1_OPERATING_DEFECT', 'REGISTRY_REPORT_ONLY_VIOLATION');
for (const key of [
  'material_false_or_unsupported_claim',
  'concealed_known_blocker',
  'fabricated_metric_or_execution',
  'stale_state_presented_as_current',
  'platform_principle_weakened_reordered_or_bypassed',
  'manual_only_normal_activation_for_ready_governed_runner',
  'leadership_rule_identity_renumbered_deleted_weakened_or_name_swapped',
  'false_remediation_or_verification_claim'
]) assert(registry.violation_classification?.[key] === 'P0_GOVERNANCE_DEFECT', `REGISTRY_P0_CLASSIFICATION:${key}`);
assert(registry.change_control?.requires_policy_and_contract_sync === true, 'REGISTRY_POLICY_SYNC');
assert(registry.change_control?.requires_validator_pass === true, 'REGISTRY_VALIDATOR_GATE');
assert(registry.leadership_execution?.detected_internal_defect_requires_immediate_authorized_remediation === true, 'REGISTRY_PROACTIVE_REMEDIATION');
assert(registry.leadership_execution?.repeated_human_prompting_as_normal_activation_forbidden === true, 'REGISTRY_REPEATED_PROMPTING_FORBIDDEN');
assert(registry.leadership_execution?.ownership_through_evidence_bound_validation_required === true, 'REGISTRY_VERIFIED_CLOSURE');
assert(registry.leadership_execution?.prioritized_forward_improvement_proposal_required === true, 'REGISTRY_FORWARD_PROPOSAL');
assert(registry.leadership_execution?.protected_authority_gates_preserved === true, 'REGISTRY_PROTECTED_GATES');
assert(registry.global_scale_stewardship?.rule_id === 'AI-018' && registry.global_scale_stewardship?.rule_name === 'GLOBAL_SCALE_STEWARDSHIP', 'REGISTRY_GLOBAL_SCALE_IDENTITY');
assert(registry.global_scale_stewardship?.scope === 'ENTIRE_VALUE_CHAIN', 'REGISTRY_GLOBAL_SCALE_SCOPE');
assert(registry.global_scale_stewardship?.platform_position === 'GLOBAL_LEADING_PLATFORM', 'REGISTRY_GLOBAL_SCALE_POSITION');
assert(registry.global_scale_stewardship?.boutique_or_local_only_assumptions_allowed === false, 'REGISTRY_GLOBAL_SCALE_BOUTIQUE_FORBIDDEN');
assert(registry.global_scale_stewardship?.required_dimensions?.length === 7, 'REGISTRY_GLOBAL_SCALE_DIMENSIONS');
assert(registry.global_scale_stewardship?.scale_claim_requires_measured_evidence === true, 'REGISTRY_GLOBAL_SCALE_MEASURED_EVIDENCE');
assert(registry.global_scale_stewardship?.protected_external_empirical_gates_preserved === true, 'REGISTRY_GLOBAL_SCALE_PROTECTED_GATES');
assert(registry.production === 'HOLD' && registry.public_release === 'HOLD', 'REGISTRY_RELEASE_BOUNDARY');
for (const name of requiredPrinciples) {
  assert(registry.constitutional_principles?.includes(name), `REGISTRY_MISSING_PRINCIPLE:${name}`);
}
for (const [key, expected] of Object.entries({
  human_policy_path: files.policy,
  root_instruction_path: files.agents,
  machine_contract_path: files.contract,
  github_bootstrap_contract_path: files.githubBootstrapContract,
  github_bootstrap_entrypoint_path: files.githubBootstrapEntrypoint,
  github_bootstrap_validator_path: files.githubBootstrapValidator,
  github_bootstrap_receipt_verifier_path: files.githubBootstrapVerifier,
  github_bootstrap_workflow_path: '.github/workflows/ci-validation.yml',
  status_receipt_schema_path: files.schema,
  validator_path: 'scripts/governance/validate-ai-agent-operating-rules-v1.mjs',
  workflow_path: '.github/workflows/ai-agent-governance-enforcement-v1.yml'
})) {
  assert(registry.registered_policy?.[key] === expected, `REGISTRY_PATH_MISMATCH:${key}`);
}

for (const trigger of ['workflow_dispatch', 'schedule', 'push', 'workflow_run']) {
  assert(hasTopLevelTrigger(reserveWorkflow, trigger), `RESERVE_MISSING_AUTONOMOUS_TRIGGER:${trigger}`);
}
assert(reserveWorkflow.includes('KIDULTS ASI Global Any-Site Hourly Pooling v2'), 'RESERVE_MISSING_UPSTREAM_WORKFLOW');
for (const trigger of ['workflow_dispatch', 'schedule', 'push']) {
  assert(hasTopLevelTrigger(scaleWorkflow, trigger), `SCALE_MISSING_AUTONOMOUS_TRIGGER:${trigger}`);
}

const requiredAgentMarkers = [
  'Platform constitutional operating principles',
  '**AUTONOMOUS**',
  '**GLOBAL**',
  '**IRREPLACEABLE VALUE**',
  '**TRANSPARENT**',
  'Absolute honesty',
  'Complete transparency',
  'Evidence before status',
  'Immediate blocker disclosure',
  'No unsupported continuity claims',
  'No capability inflation',
  'Fail closed on uncertainty',
  '.github/AI_AGENT_OPERATING_RULES.md',
  'coordination/kidults/governance/ai-agent-operating-rules-v1.json',
  'coordination/kidults/governance/ai-agent-github-bootstrap-contract-v1.json',
  'Mandatory GitHub-source bootstrap',
  'npm run agent:bootstrap',
  'BOOTSTRAP_VERIFIED',
  'Global leading platform scale standard',
  'AI-018 / GLOBAL_SCALE_STEWARDSHIP'
];
for (const marker of requiredAgentMarkers) assert(agents.includes(marker), `AGENTS_MISSING_MARKER:${marker}`);

const requiredPolicyMarkers = [
  '**Version:** 1.7.0',
  'Platform constitutional operating principles',
  '**AUTONOMOUS**',
  '**GLOBAL**',
  '**IRREPLACEABLE VALUE**',
  '**TRANSPARENT**',
  'Absolute honesty — 절대 정직',
  'Complete transparency — 완전 투명성',
  'Evidence before statement',
  'Fail closed on uncertainty',
  'Immediate blocker disclosure',
  'Correction protocol',
  'P0 governance defects',
  'No AI agent may self-exempt',
  'Proactive ownership and leadership closure',
  'AI-016 / PROACTIVE_ISSUE_OWNERSHIP',
  'AI-017 / LEAD_TO_VERIFIED_CLOSURE_AND_IMPROVEMENT',
  'without waiting for repeated human prompting',
  'prioritized risks and forward improvements',
  'Global leading platform scale stewardship',
  'AI-018 / GLOBAL_SCALE_STEWARDSHIP',
  'Architecture coverage, provider counts, synthetic capacity, or a successful local test does not constitute empirical global proof',
  'GitHub canonical source bootstrap',
  'BOOTSTRAP_VERIFIED'
];
for (const marker of requiredPolicyMarkers) assert(policy.includes(marker), `POLICY_MISSING_MARKER:${marker}`);
assert(copilot.includes('AGENTS.md'), 'COPILOT_AGENTS_REFERENCE');
assert(copilot.includes('.github/AI_AGENT_OPERATING_RULES.md'), 'COPILOT_POLICY_REFERENCE');
assert(copilot.includes('never fabricate metrics'), 'COPILOT_METRIC_BOUNDARY');
assert(copilot.includes('AI-018 / GLOBAL_SCALE_STEWARDSHIP'), 'COPILOT_GLOBAL_SCALE_STEWARDSHIP');
assert(copilot.includes(files.githubBootstrapContract), 'COPILOT_GITHUB_BOOTSTRAP_CONTRACT');
assert(copilot.includes('npm run agent:bootstrap'), 'COPILOT_GITHUB_BOOTSTRAP_COMMAND');
assert(copilot.includes('BOOTSTRAP_VERIFIED'), 'COPILOT_GITHUB_BOOTSTRAP_STATE');

const validateReceipt = (receiptPath) => {
  const receipt = readJson(receiptPath);
  for (const field of schema.required) assert(Object.hasOwn(receipt, field), `RECEIPT_MISSING_FIELD:${receiptPath}:${field}`);
  assert(requiredStates.includes(receipt.state), `RECEIPT_INVALID_STATE:${receiptPath}:${receipt.state}`);
  assert(Array.isArray(receipt.facts), `RECEIPT_FACTS_NOT_ARRAY:${receiptPath}`);
  assert(Array.isArray(receipt.evidence_refs), `RECEIPT_EVIDENCE_NOT_ARRAY:${receiptPath}`);
  assert(Array.isArray(receipt.inferences), `RECEIPT_INFERENCES_NOT_ARRAY:${receiptPath}`);
  assert(Array.isArray(receipt.uncertainties), `RECEIPT_UNCERTAINTIES_NOT_ARRAY:${receiptPath}`);
  assert(Array.isArray(receipt.blockers), `RECEIPT_BLOCKERS_NOT_ARRAY:${receiptPath}`);
  assert(Array.isArray(receipt.actions_executed), `RECEIPT_ACTIONS_NOT_ARRAY:${receiptPath}`);
  if (receipt.state === 'RUNNING_VERIFIED') {
    assert(receipt.evidence_refs.some((x) => ['WORKFLOW_RUN', 'JOB_RUN', 'RUNTIME_RUN'].includes(x.kind)), `RECEIPT_RUNNING_WITHOUT_RUN_ID:${receiptPath}`);
  }
  if (receipt.state === 'MERGED_VERIFIED') {
    assert(receipt.evidence_refs.some((x) => x.kind === 'MERGE_COMMIT'), `RECEIPT_MERGED_WITHOUT_MERGE_COMMIT:${receiptPath}`);
  }
  if (receipt.state === 'BLOCKED') assert(receipt.blockers.length > 0, `RECEIPT_BLOCKED_WITHOUT_BLOCKER:${receiptPath}`);
  for (const action of receipt.actions_executed) {
    assert(['EXECUTED', 'FAILED', 'NOT_EXECUTED'].includes(action.result), `RECEIPT_INVALID_ACTION_RESULT:${receiptPath}`);
    if (action.result === 'EXECUTED') assert(action.evidence_ref_ids?.length > 0, `RECEIPT_EXECUTED_WITHOUT_EVIDENCE:${receiptPath}`);
  }
};

const explicitReceiptIndex = process.argv.indexOf('--receipt');
if (explicitReceiptIndex >= 0) {
  const receiptPath = process.argv[explicitReceiptIndex + 1];
  assert(receiptPath, 'RECEIPT_PATH_REQUIRED');
  validateReceipt(receiptPath);
}

const report = {
  id: 'kidults-ai-agent-governance-validation-v1',
  version: '1.7.0',
  status: 'VERIFIED_PASS',
  policy_id: 'KPMO-AI-GOV-001',
  platform_principles_validated: requiredPlatformPrinciples,
  principles_validated: requiredPrinciples.length,
  leadership_rule_identities_validated: ['AI-016', 'AI-017'],
  global_scale_rule_identities_validated: ['AI-018'],
  global_scale_dimensions_validated: globalScale.required_dimensions.length,
  governed_states_validated: requiredStates.length,
  required_report_fields_validated: contract.required_report_fields.length,
  inheritance_fail_closed: true,
  autonomous_scale_triggers_validated: true,
  manual_only_normal_activation_forbidden: true,
  github_canonical_bootstrap_required: true,
  per_agent_bootstrap_receipt_required: true,
  self_exemption_allowed: false,
  production: 'HOLD',
  public_release: 'HOLD'
};
console.log(JSON.stringify(report, null, 2));
