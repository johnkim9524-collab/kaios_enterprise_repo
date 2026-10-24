import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const defaultContractPath = 'coordination/kidults/kpmo/recovery-role-partition-v1.json';
const assert = (condition, code) => {
  if (!condition) throw new Error(code);
};

const exactSet = (actual, expected, code) => {
  assert(Array.isArray(actual), `${code}_ARRAY_REQUIRED`);
  const a = [...actual].sort();
  const e = [...expected].sort();
  assert(JSON.stringify(a) === JSON.stringify(e), code);
};

const laneById = (contract, id) => contract.lanes?.find((lane) => lane.lane_id === id);

export function validateRecoveryRolePartition(contract) {
  assert(contract?.id === 'KIDULTS_RECOVERY_ROLE_PARTITION_V1', 'ROLE_PARTITION_ID_INVALID');
  assert(contract?.version === '1.0.0', 'ROLE_PARTITION_VERSION_INVALID');
  assert(contract?.state === 'ACTIVE_ROLE_PARTITION', 'ROLE_PARTITION_STATE_INVALID');
  assert(/^[0-9a-f]{40}$/.test(contract?.source_main_sha ?? ''), 'ROLE_PARTITION_SOURCE_MAIN_SHA_INVALID');
  assert(contract?.authority?.issuer_role === 'PROGRAM_OWNER', 'ROLE_PARTITION_ISSUER_INVALID');
  assert(contract?.authority?.issuer_holder === 'Yun Goo Kim (John)', 'ROLE_PARTITION_HOLDER_INVALID');
  assert(contract?.authority?.duration === 'UNTIL_PROGRAM_OWNER_REVOKES_OR_SUPERSEDES', 'ROLE_PARTITION_DURATION_INVALID');
  assert(contract?.base_role_registry === 'coordination/kidults/registry/roles-and-responsibilities.json', 'ROLE_PARTITION_BASE_REGISTRY_INVALID');

  exactSet(
    contract.lanes?.map((lane) => lane.lane_id),
    ['TRACK_Z_PSA', 'PROGRAM_OWNER_PLATFORM_RECOVERY', 'INDEPENDENT_RED_TEAM'],
    'ROLE_PARTITION_LANE_SET_INVALID',
  );

  const psa = laneById(contract, 'TRACK_Z_PSA');
  assert(psa?.lead_role === 'TRACK_Z' && psa?.accountable === true, 'PSA_LANE_OWNER_INVALID');
  for (const marker of [
    'PSA_PROVIDER_STRATEGY',
    'PSA_RIGHTS_AND_TERMS',
    'PSA_COST_AND_ENTITLEMENT',
    'PSA_CREDENTIAL_AND_ENVIRONMENT_READBACK',
    'PSA_LAWFUL_INPUT_AND_PROVENANCE',
    'PSA_ISOLATED_SCHEMA_AND_Z1_PROBE',
    'PSA_PRIVATE_STORAGE_RETENTION_AND_DELETION',
    'PSA_QUOTA_AND_PROVIDER_RECEIPTS',
  ]) {
    assert(psa.primary_scope?.includes(marker), `PSA_LANE_SCOPE_MISSING:${marker}`);
  }
  assert(psa.active_handoff?.pull_request === 2230, 'PSA_HANDOFF_PR_INVALID');
  assert(psa.active_handoff?.state === 'DRAFT_HANDOFF_TO_TRACK_Z', 'PSA_HANDOFF_STATE_INVALID');
  for (const key of ['merge_authority', 'provider_call_authority', 'credential_authority', 'empirical_admission_authority']) {
    assert(psa.active_handoff?.[key] === false, `PSA_HANDOFF_AUTHORITY_INVALID:${key}`);
  }
  for (const marker of [
    'MODIFY_SENTINEL_CANONICAL_OR_KIR_BEHAVIOR',
    'CLAIM_PLATFORM_RECOVERY',
    'ADMIT_PSA_DATA_TO_KIR_CURRENT_SOLD_EVIDENCE_TRACK_B_PROJECTION_OR_PORTAL_WITHOUT_SEPARATE_GATES',
    'MERGE_A_MIXED_SCOPE_CHANGE',
  ]) {
    assert(psa.must_not?.includes(marker), `PSA_LANE_PROHIBITION_MISSING:${marker}`);
  }

  const platform = laneById(contract, 'PROGRAM_OWNER_PLATFORM_RECOVERY');
  assert(platform?.lead_role === 'PROGRAM_OWNER', 'PLATFORM_LANE_OWNER_INVALID');
  assert(platform?.lead_holder === 'Yun Goo Kim (John)', 'PLATFORM_LANE_HOLDER_INVALID');
  assert(platform?.accountable === true, 'PLATFORM_LANE_ACCOUNTABILITY_INVALID');
  for (const marker of ['SENTINEL', 'CANONICAL', 'KIR', 'COVERAGE_AND_ASSURANCE_CONTRACTS', 'PLATFORM_RECOVERY_SEQUENCE', 'NORMAL_OPERATION_RESTORATION', 'INTEGRATION_DECISIONS']) {
    assert(platform.primary_scope?.includes(marker), `PLATFORM_LANE_SCOPE_MISSING:${marker}`);
  }
  for (const marker of [
    'CALL_PSA_OR_ANOTHER_PROVIDER',
    'RESOLVE_OR_USE_PROVIDER_CREDENTIALS',
    'CHANGE_PROVIDER_RIGHTS_TERMS_OR_SPEND',
    'ABSORB_TRACK_Z_PSA_IMPLEMENTATION_INTO_A_PLATFORM_RECOVERY_PR',
    'PROMOTE_CONTROL_PROOF_TO_EMPIRICAL_PRODUCTION_PUBLIC_OR_G5',
  ]) {
    assert(platform.must_not?.includes(marker), `PLATFORM_LANE_PROHIBITION_MISSING:${marker}`);
  }

  const redTeam = laneById(contract, 'INDEPENDENT_RED_TEAM');
  assert(redTeam?.lead_role === 'RED_TEAM', 'RED_TEAM_OWNER_INVALID');
  assert(redTeam?.independent === true, 'RED_TEAM_INDEPENDENCE_INVALID');
  assert(redTeam?.may_author_primary_lane_change === false, 'RED_TEAM_PRIMARY_AUTHORSHIP_INVALID');
  for (const marker of [
    'PSA_LANE_REGRESSION',
    'PLATFORM_RECOVERY_REGRESSION',
    'CROSS_LANE_INTEGRATION_BOUNDARY',
    'NEGATIVE_CANARIES',
    'FAIL_CLOSED_STATE_AND_RECEIPT_TRUTH',
    'NO_AUTHORITY_LEAKAGE',
  ]) {
    assert(redTeam.primary_scope?.includes(marker), `RED_TEAM_SCOPE_MISSING:${marker}`);
  }
  for (const marker of [
    'SELF_APPROVE_ITS_OWN_PRIMARY_FIX',
    'MODIFY_PRIMARY_LANE_IMPLEMENTATION_DURING_THE_SAME_REVIEW_GENERATION',
    'CONVERT_HOLD_TO_PASS',
    'SUBSTITUTE_BRANCH_PROOF_FOR_NATURAL_PROTECTED_MAIN_PROOF',
    'COMBINE_THE_TWO_PRIMARY_LANES_FOR_CONVENIENCE',
  ]) {
    assert(redTeam.must_not?.includes(marker), `RED_TEAM_PROHIBITION_MISSING:${marker}`);
  }
  exactSet(
    redTeam.required_outputs,
    ['PSA_REGRESSION_RECEIPT', 'PLATFORM_RECOVERY_REGRESSION_RECEIPT', 'CROSS_LANE_BOUNDARY_RECEIPT', 'EXACT_HEAD_FAILURE_AND_RESIDUAL_RISK_REPORT'],
    'RED_TEAM_OUTPUT_SET_INVALID',
  );

  const boundary = contract.cross_lane_rules;
  assert(boundary?.separate_branches_and_pull_requests === true, 'CROSS_LANE_SEPARATION_INVALID');
  assert(boundary?.mixed_scope_pr_state === 'BLOCKED_SCOPE_COLLISION', 'CROSS_LANE_COLLISION_STATE_INVALID');
  assert(boundary?.shared_file_edit_requires_program_owner_direction === true, 'CROSS_LANE_SHARED_FILE_AUTHORITY_INVALID');
  assert(boundary?.primary_lane_may_not_self_validate === true, 'CROSS_LANE_SELF_VALIDATION_INVALID');
  assert(boundary?.red_team_receipt_required_before_integration === true, 'CROSS_LANE_RED_TEAM_GATE_INVALID');
  for (const marker of [
    'TRACK_Z_TERMINAL_RECEIPT',
    'PROGRAM_OWNER_PLATFORM_RECOVERY_RECEIPT',
    'INDEPENDENT_RED_TEAM_BOTH_LANES_PASS_OR_EXPLICIT_HOLD',
    'INDEPENDENT_CROSS_LANE_BOUNDARY_RECEIPT',
    'EXACT_MAIN_AND_EXACT_HEAD_BINDING',
    'NO_PROTECTED_GATE_ELEVATION',
  ]) {
    assert(boundary.integration_requires?.includes(marker), `CROSS_LANE_INTEGRATION_REQUIREMENT_MISSING:${marker}`);
  }

  assert(contract.truth_and_reporting?.single_integrated_report_owner === 'KPMO', 'INTEGRATED_REPORT_OWNER_INVALID');
  assert(contract.truth_and_reporting?.final_decision_owner === 'PROGRAM_OWNER', 'FINAL_DECISION_OWNER_INVALID');
  assert(contract.truth_and_reporting?.kpmo_statement === 'KPMO_COORDINATES_AND_REPORTS_BUT_DOES_NOT_TAKE_PRIMARY_PSA_OWNERSHIP_OR_REPLACE_PROGRAM_OWNER_PLATFORM_LEAD', 'KPMO_SCOPE_STATEMENT_INVALID');

  assert(contract.gates?.provider_call === 'SEPARATELY_GATED_BY_TRACK_Z_AND_PROGRAM_OWNER', 'PROVIDER_CALL_GATE_INVALID');
  assert(contract.gates?.credential_use === 'SEPARATELY_GATED', 'CREDENTIAL_GATE_INVALID');
  assert(contract.gates?.contract_and_spend === 'PROGRAM_OWNER_APPROVAL_REQUIRED', 'CONTRACT_SPEND_GATE_INVALID');
  assert(contract.gates?.database_mutation === 'HOLD_UNLESS_SEPARATELY_AUTHORIZED', 'DATABASE_GATE_INVALID');
  assert(contract.gates?.production === 'HOLD', 'PRODUCTION_GATE_INVALID');
  assert(contract.gates?.public === 'HOLD', 'PUBLIC_GATE_INVALID');
  assert(contract.gates?.g5 === 'HOLD', 'G5_GATE_INVALID');

  return {
    receipt_id: 'KIDULTS_RECOVERY_ROLE_PARTITION_VALIDATION_V1',
    state: 'VERIFIED_PASS',
    source_main_sha: contract.source_main_sha,
    psa_lane_lead: psa.lead_role,
    platform_lane_lead: platform.lead_role,
    platform_lane_holder: platform.lead_holder,
    red_team_independent: redTeam.independent,
    separate_branches_and_pull_requests: boundary.separate_branches_and_pull_requests,
    mixed_scope_pr_state: boundary.mixed_scope_pr_state,
    provider_call_authority: 'NONE_FROM_THIS_CONTRACT',
    credential_authority: 'NONE_FROM_THIS_CONTRACT',
    empirical_admission_authority: 'NONE_FROM_THIS_CONTRACT',
    production: contract.gates.production,
    public: contract.gates.public,
    g5: contract.gates.g5,
  };
}

async function loadContract(path = defaultContractPath) {
  return JSON.parse(await readFile(resolve(process.cwd(), path), 'utf8'));
}

async function runSelfTest() {
  const baseline = await loadContract();
  validateRecoveryRolePartition(baseline);
  const mutations = [
    ['PSA_LEAD_DRIFT', (x) => { laneById(x, 'TRACK_Z_PSA').lead_role = 'KPMO'; }],
    ['PLATFORM_LEAD_DRIFT', (x) => { laneById(x, 'PROGRAM_OWNER_PLATFORM_RECOVERY').lead_role = 'KPMO'; }],
    ['PROGRAM_OWNER_HOLDER_REMOVED', (x) => { delete laneById(x, 'PROGRAM_OWNER_PLATFORM_RECOVERY').lead_holder; }],
    ['RED_TEAM_AUTHORSHIP_ENABLED', (x) => { laneById(x, 'INDEPENDENT_RED_TEAM').may_author_primary_lane_change = true; }],
    ['RED_TEAM_INDEPENDENCE_REMOVED', (x) => { laneById(x, 'INDEPENDENT_RED_TEAM').independent = false; }],
    ['MIXED_SCOPE_ALLOWED', (x) => { x.cross_lane_rules.mixed_scope_pr_state = 'ALLOW'; }],
    ['SEPARATE_PR_RULE_REMOVED', (x) => { x.cross_lane_rules.separate_branches_and_pull_requests = false; }],
    ['PROVIDER_AUTHORITY_ELEVATED', (x) => { laneById(x, 'TRACK_Z_PSA').active_handoff.provider_call_authority = true; }],
    ['PLATFORM_PROVIDER_CALL_ALLOWED', (x) => { laneById(x, 'PROGRAM_OWNER_PLATFORM_RECOVERY').must_not = []; }],
    ['PRODUCTION_ELEVATED', (x) => { x.gates.production = 'GO'; }],
  ];

  let rejected = 0;
  for (const [name, mutate] of mutations) {
    const candidate = structuredClone(baseline);
    mutate(candidate);
    try {
      validateRecoveryRolePartition(candidate);
    } catch {
      rejected += 1;
      continue;
    }
    throw new Error(`SELF_TEST_MUTATION_NOT_REJECTED:${name}`);
  }
  return {
    receipt_id: 'KIDULTS_RECOVERY_ROLE_PARTITION_SELF_TEST_V1',
    state: 'VERIFIED_PASS',
    negative_mutations_rejected: rejected,
    expected_negative_mutations: mutations.length,
  };
}

const args = process.argv.slice(2);
if (args.includes('--self-test')) {
  process.stdout.write(`${JSON.stringify(await runSelfTest())}\n`);
} else {
  const path = args.find((arg) => !arg.startsWith('--')) ?? defaultContractPath;
  process.stdout.write(`${JSON.stringify(validateRecoveryRolePartition(await loadContract(path)), null, 2)}\n`);
}
