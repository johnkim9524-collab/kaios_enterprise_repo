#!/usr/bin/env node
import fs from 'node:fs';

const files = {
  contract: 'coordination/kidults/source-intelligence/asi-snapshot-readiness-factory-contract-v2.json',
  registry: 'coordination/kidults/source-intelligence/asi-snapshot-readiness-factory-registry-v2.json',
  builder: 'scripts/kidults/source-intelligence/build-asi-snapshot-readiness-factory-v2.mjs',
  validator: 'scripts/kidults/source-intelligence/validate-asi-snapshot-readiness-factory-v2.mjs',
  readiness_library: 'scripts/kidults/source-intelligence/lib/asi-snapshot-readiness-factory-v2.mjs',
  liveness_test: 'scripts/kidults/source-intelligence/test-asi-snapshot-readiness-factory-v2.mjs',
  upstream_binding_validator: 'scripts/kidults/source-intelligence/validate-asi-snapshot-readiness-upstream-binding-v2.mjs',
  canonical_handoff_validator: 'scripts/kidults/poc/validate-candidate-evidence-handoff-r2.mjs',
  registry_validator: 'scripts/kidults/source-intelligence/validate-asi-snapshot-readiness-factory-registry-v2.mjs',
  workflow: '.github/workflows/kidults-asi-snapshot-readiness-factory-v2.yml',
  documentation: 'docs/kidults/asi/asi-snapshot-readiness-factory-v2.md',
};
const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const read = (file) => fs.readFileSync(file, 'utf8');
const json = (file) => JSON.parse(read(file));
for (const [key, file] of Object.entries(files)) assert(fs.existsSync(file), `MISSING_${key.toUpperCase()}:${file}`);

const contract = json(files.contract);
const registry = json(files.registry);
const workflow = read(files.workflow);
const doc = read(files.documentation);
const builder = read(files.builder);
const validator = read(files.validator);
const library = read(files.readiness_library);
const livenessTest = read(files.liveness_test);
const upstreamValidator = read(files.upstream_binding_validator);
const canonicalHandoffValidator = read(files.canonical_handoff_validator);
const principles = ['AUTONOMOUS', 'GLOBAL', 'IRREPLACEABLE_VALUE', 'TRANSPARENT'];
const prerequisites = [
  'MISSION_SOURCE_CANDIDATE_COVERAGE',
  'PRIMARY_FALLBACK_REPLACEMENT_COVERAGE',
  'GATE1_SOURCE_SAFETY',
  'PURPOSE_SPECIFIC_RIGHTS',
  'MARKET_SEMANTIC_SUFFICIENCY',
  'FACTUAL_ORIGIN_INDEPENDENCE',
  'EVIDENCE_ADMISSION',
  'CURRENT_SOLD_TRANSACTION_EVIDENCE',
  'LIQUIDITY_TIME_TO_SALE_EVIDENCE',
  'MARKET_EVENT_GRAPH',
];
const outputAssertions = ['IMMUTABLE_EVIDENCE_PACKAGE', 'TRACK_B_INPUT_PAIR'];
const alwaysOutputs = [
  'snapshot-readiness-ledger-v2.json',
  'immutable-blocker-package-v2.json',
  'admission-demand-package-v2.json',
  'track-b-handoff-readiness-v2.json',
  'snapshot-readiness-manifest-v2.json',
];
const gateFailOutputs = ['snapshot-non-generation-receipt-v2.json'];
const gatePassOutputs = ['snapshot-candidate.json', 'evidence-package.json', 'snapshot-pair-generation-receipt-v2.json'];

assert(contract.id === 'kidults-asi-snapshot-readiness-factory-contract-v2' && contract.version === '2.1.0', 'CONTRACT_ID_VERSION');
assert(registry.id === 'kidults-asi-snapshot-readiness-factory-registry-v2' && registry.version === '2.1.0', 'REGISTRY_ID_VERSION');
assert(registry.owner === 'KPMO' && registry.priority === 'P3', 'REGISTRY_OWNER_PRIORITY');
assert(JSON.stringify(contract.platform_principles) === JSON.stringify(principles), 'CONTRACT_PRINCIPLES');
assert(JSON.stringify(registry.platform_principles) === JSON.stringify(principles), 'REGISTRY_PRINCIPLES');
for (const [key, expected] of Object.entries(files)) {
  if (key === 'registry') continue;
  assert(registry.registered_assets?.[key] === expected, `REGISTRY_PATH:${key}`);
}
assert(JSON.stringify(registry.input_artifacts) === JSON.stringify([
  'kidults-asi-p0b-bounded-discovery-candidates-v1',
  'kidults-asi-p1-source-preflight-v1',
  'kidults-asi-owned-source-intelligence-graph-v2',
]), 'REGISTRY_INPUT_ARTIFACTS');
assert(registry.automatic_activation?.main_push === true, 'REGISTRY_MAIN_PUSH');
assert(registry.automatic_activation?.schedule === '7 * * * *', 'REGISTRY_SCHEDULE');
assert(registry.automatic_activation?.schedule_authoritative_fallback === 'SELECT_EXACT_SUCCESSFUL_P2_RUN_AT_CURRENT_MAIN_HEAD', 'REGISTRY_SCHEDULE_AUTHORITATIVE_FALLBACK');
assert(registry.automatic_activation?.upstream_workflow === 'KIDULTS ASI Owned Source Intelligence Graph v2', 'REGISTRY_UPSTREAM');
assert(registry.automatic_activation?.manual_dispatch_role === 'RECOVERY_EXACT_LIVE_MAIN_AND_EXACT_P2_RUN_ONLY', 'REGISTRY_MANUAL_ROLE');
assert(registry.release_semantics?.output_existence_is_prerequisite === false, 'REGISTRY_LIVENESS_BOUNDARY');
assert(registry.release_semantics?.track_b_submission_preauthorized === false, 'REGISTRY_TRACK_B_PREAUTHORIZATION');
assert(registry.release_semantics?.blocker_package_is_evidence_package === false, 'REGISTRY_BLOCKER_BOUNDARY');
assert(registry.artifact_restore_semantics?.p2_artifact === 'EXACT_WORKFLOW_RUN_ID_HEAD_SHA_PROVIDER_DIGEST_AND_DOWNLOADED_ARCHIVE_SHA256', 'REGISTRY_P2_RESTORE');
assert(registry.artifact_restore_semantics?.p0b_p1_artifact_ids === 'ONLY_FROM_EXACT_P2_KPMO_RECEIPT', 'REGISTRY_P0B_P1_RESTORE');
assert(registry.artifact_restore_semantics?.global_artifact_scan === 'FORBIDDEN' && registry.artifact_restore_semantics?.any_branch_fallback === 'FORBIDDEN', 'REGISTRY_RESTORE_FALLBACK_BOUNDARY');

assert(JSON.stringify(contract.prerequisite_dimensions) === JSON.stringify(prerequisites), 'CONTRACT_PREREQUISITE_DIMENSIONS');
assert(JSON.stringify(contract.output_assertion_dimensions) === JSON.stringify(outputAssertions), 'CONTRACT_OUTPUT_ASSERTION_DIMENSIONS');
assert(JSON.stringify(contract.readiness_dimensions) === JSON.stringify([...prerequisites, ...outputAssertions]), 'CONTRACT_READINESS_DIMENSIONS');
assert(contract.snapshot_creation_gate?.all_prerequisite_dimensions_must_pass_before_generation === true, 'CONTRACT_GATE_PREREQUISITES');
assert(contract.snapshot_creation_gate?.output_existence_is_prerequisite === false, 'CONTRACT_OUTPUT_EXISTENCE_CYCLE');
assert(contract.pair_generation?.atomic_directory_commit_required === true && contract.pair_generation?.canonical_handoff_preflight_required_after_generation === true, 'CONTRACT_ATOMIC_HANDOFF');
assert(contract.pair_generation?.canonical_handoff_validator === files.canonical_handoff_validator, 'CONTRACT_CANONICAL_HANDOFF_VALIDATOR');
assert(contract.pair_generation?.track_b_submission_preauthorization_forbidden === true, 'CONTRACT_TRACK_B_PREAUTHORIZATION');
assert(contract.pair_generation?.content_addressed_pair_is_not_immutable_storage === true, 'CONTRACT_CONTENT_ADDRESSING_NOT_IMMUTABILITY');
assert(contract.pair_generation?.immutable_storage_receipt_required_for_track_b === true && contract.pair_generation?.artifact_attestation_required_for_track_b === true, 'CONTRACT_TRACK_B_ATTESTATION');
assert(contract.pair_generation?.upstream_binding_receipt_digest_must_be_inside_exact_pair === true, 'CONTRACT_PAIR_UPSTREAM_BINDING');
assert(contract.upstream_freshness?.require_current_main_head === true && contract.upstream_freshness?.maximum_age_hours === 24, 'CONTRACT_UPSTREAM_FRESHNESS');
assert(contract.automatic_activation?.manual_dispatch_role === 'RECOVERY_EXACT_LIVE_MAIN_AND_EXACT_P2_RUN_ONLY', 'CONTRACT_MANUAL_DISPATCH_BOUNDARY');
assert(contract.automatic_activation?.schedule_authoritative_fallback === 'SELECT_EXACT_SUCCESSFUL_P2_RUN_AT_CURRENT_MAIN_HEAD', 'CONTRACT_SCHEDULE_AUTHORITATIVE_FALLBACK');
assert(contract.artifact_restore?.p2_exact_workflow_run_required === true && contract.artifact_restore?.p2_main_head_sha_binding_required === true && contract.artifact_restore?.artifact_digest_required === true, 'CONTRACT_EXACT_RESTORE');
assert(contract.artifact_restore?.downloaded_archive_sha256_must_equal_provider_artifact_digest === true, 'CONTRACT_ARCHIVE_DIGEST_RESTORE');
assert(contract.artifact_restore?.p0b_and_p1_artifact_ids_must_come_from_p2_receipt === true && contract.artifact_restore?.content_digests_must_match_p2_lineage === true, 'CONTRACT_RECEIPT_LINEAGE_RESTORE');
assert(contract.artifact_restore?.any_branch_fallback_forbidden === true && contract.artifact_restore?.first_hundred_global_artifact_scan_forbidden === true, 'CONTRACT_RESTORE_FALLBACKS');
assert(JSON.stringify(contract.always_required_outputs) === JSON.stringify(alwaysOutputs), 'CONTRACT_ALWAYS_OUTPUTS');
assert(JSON.stringify(contract.outputs_when_gate_fails) === JSON.stringify(gateFailOutputs), 'CONTRACT_GATE_FAIL_OUTPUTS');
assert(JSON.stringify(contract.outputs_when_gate_passes) === JSON.stringify(gatePassOutputs), 'CONTRACT_GATE_PASS_OUTPUTS');
assert(JSON.stringify(contract.forbidden_outputs_when_gate_fails) === JSON.stringify(gatePassOutputs), 'CONTRACT_GATE_FAIL_FORBIDDEN_OUTPUTS');
assert(JSON.stringify(contract.forbidden_outputs_when_gate_passes) === JSON.stringify(gateFailOutputs), 'CONTRACT_GATE_PASS_FORBIDDEN_OUTPUTS');

function workflowFindings(source) {
  const findings = [];
  const requiredMarkers = [
    'schedule:',
    'workflow_dispatch:',
    "cron: '7 * * * *'",
    'push:',
    'workflow_run:',
    'validate-p3-control-on-pr:',
    "if: github.event_name == 'pull_request'",
    'Run secretless P3 static and liveness validation only',
    'Require exact main for authoritative P3 artifact publication',
    "test \"$GITHUB_EVENT_NAME\" = \"workflow_run\" || test \"$GITHUB_EVENT_NAME\" = \"schedule\" || test \"$GITHUB_EVENT_NAME\" = \"workflow_dispatch\"",
    'test "$GITHUB_REF" = "refs/heads/main"',
    "'KIDULTS ASI Owned Source Intelligence Graph v2'",
    'Prove P3 liveness and upstream-binding mutation resistance',
    'validate-asi-snapshot-readiness-upstream-binding-v2.mjs --self-test',
    'test-asi-snapshot-readiness-factory-v2.mjs',
    'Restore exact P2 run and its receipt-bound P0B and P1 artifacts',
    'actions/workflows/kidults-asi-owned-source-intelligence-graph-v2.yml/runs?branch=main&status=success&per_page=100',
    "run.head_sha===process.env.GITHUB_SHA",
    'actions/runs/${P2_RUN_ID}/artifacts?per_page=100',
    '[[ "$P2_RUN_ID" =~ ^[1-9][0-9]*$ ]]',
    '[[ "$P2_ID" =~ ^[1-9][0-9]*$ ]]',
    '[[ "$P0B_ID" =~ ^[1-9][0-9]*$ ]] && [[ "$P1_ID" =~ ^[1-9][0-9]*$ ]]',
    "run.path!=='.github/workflows/kidults-asi-owned-source-intelligence-graph-v2.yml'",
    "run.head_branch!=='main'",
    "run.conclusion!=='success'",
    "main.commit?.sha!==run.head_sha",
    'main.commit.sha!==process.env.GITHUB_SHA',
    'age>24*60*60*1000',
    'a.workflow_run?.head_sha!==run.head_sha',
    "!(/^sha256:[0-9a-f]{64}$/.test(a.digest||''))",
    "P2_ARCHIVE_SHA256=\"sha256:$(sha256sum /tmp/p2.zip | awk '{print $1}')\"",
    'if(a.digest!==process.env.P2_ARCHIVE_SHA256)process.exit(2)',
    'a.downloaded_archive_sha256=process.env.P2_ARCHIVE_SHA256',
    "P0B_ARCHIVE_SHA256=\"sha256:$(sha256sum /tmp/p0b.zip | awk '{print $1}')\"",
    "P1_ARCHIVE_SHA256=\"sha256:$(sha256sum /tmp/p1.zip | awk '{print $1}')\"",
    "kidults-asi-owned-source-intelligence-graph-kpmo-receipt-v2.json').p0b_artifact_id",
    "kidults-asi-owned-source-intelligence-graph-kpmo-receipt-v2.json').p1_artifact_id",
    '/actions/artifacts/${P0B_ID}',
    '/actions/artifacts/${P1_ID}',
    'validate-asi-snapshot-readiness-upstream-binding-v2.mjs',
    '/tmp/kidults-asi-snapshot-readiness-upstream-binding-v2.json',
    'Build current P3 readiness twice',
    'Reject false snapshot candidate mutation',
    'Reject false evidence admission mutation',
    'Reject Track B start mutation',
    'Reject missing blocker mutation',
    'Reject blocker package as Evidence Package mutation',
    'Reject manual-only activation mutation',
    'Emit KPMO P3 receipt',
    'bindingReceiptSha256!==m.upstream_binding_receipt_sha256',
    'Capture provider artifact receipt without promoting attestation',
    "state:'PROVIDER_ARTIFACT_RECEIPT_CAPTURED_ATTESTATION_PENDING'",
    'process.env.ARTIFACT_URL!==expectedUrl',
    'artifact_attestation_verified:false',
  ];
  for (const marker of requiredMarkers) if (!source.includes(marker)) findings.push(`MISSING:${marker}`);
  if (!source.includes('github.event_name == \'workflow_dispatch\'') || !source.includes('test "$GITHUB_REF" = "refs/heads/main"')) findings.push('MANUAL_DISPATCH_EXACT_MAIN_GUARD_MISSING');
  if (/\/repos\/\$\{GITHUB_REPOSITORY\}\/actions\/artifacts\?per_page=/.test(source)) findings.push('GLOBAL_ARTIFACT_SCAN_PRESENT');
  if (/artifacts\?per_page=100[^\n]*\|[^\n]*(head_branch|main)/.test(source)) findings.push('ANY_BRANCH_FALLBACK_PRESENT');
  if (!source.includes('P2_RUN_ID="$EVENT_P2_RUN_ID"') || !source.includes('P2_HEAD_SHA="$P2_HEAD_SHA"')) findings.push('UPSTREAM_RUN_HEAD_BINDING_MISSING');
  if (!source.includes('contents: read') || source.includes('contents: write')) findings.push('WORKFLOW_CONTENT_PERMISSION');
  if (!source.includes('persist-credentials: false') || source.includes('git push')) findings.push('WORKFLOW_REPOSITORY_MUTATION');
  return findings;
}

const cleanFindings = workflowFindings(workflow);
assert(cleanFindings.length === 0, `WORKFLOW_CONTRACT:${cleanFindings.join(',')}`);
const workflowMutations = [
  ['global-artifact-scan', (value) => value.replace('actions/runs/${P2_RUN_ID}/artifacts?per_page=100', 'actions/artifacts?per_page=100')],
  ['p0-id-not-from-p2-receipt', (value) => value.replace("require('/tmp/p2/kidults-asi-owned-source-intelligence-graph-kpmo-receipt-v2.json').p0b_artifact_id", "require('/tmp/arbitrary.json').p0b_artifact_id")],
  ['p2-artifact-head-unbound', (value) => value.replace("||a.workflow_run?.head_sha!==run.head_sha", '')],
  ['artifact-digest-unchecked', (value) => value.replaceAll("||!(/^sha256:[0-9a-f]{64}$/.test(a.digest||''))", '')],
  ['downloaded-archive-digest-unchecked', (value) => value.replace('if(a.digest!==process.env.P2_ARCHIVE_SHA256)process.exit(2)', 'if(false)process.exit(2)')],
  ['artifact-id-shape-unchecked', (value) => value.replace('[[ "$P0B_ID" =~ ^[1-9][0-9]*$ ]] && [[ "$P1_ID" =~ ^[1-9][0-9]*$ ]]', 'test -n "$P0B_ID" && test -n "$P1_ID"')],
  ['authoritative-main-guard-removed', (value) => value.replaceAll('test "$GITHUB_REF" = "refs/heads/main"', 'test -n "$GITHUB_REF"')],
  ['current-main-head-check-removed', (value) => value.replace('||main.commit?.sha!==run.head_sha', '')],
  ['upstream-age-check-removed', (value) => value.replace('||age>24*60*60*1000', '')],
  ['manual-dispatch-main-guard-removed', (value) => value.replaceAll('test "$GITHUB_REF" = "refs/heads/main"', 'test -n "$GITHUB_REF"')],
];
for (const [name, mutate] of workflowMutations) {
  const candidate = mutate(workflow);
  assert(candidate !== workflow, `WORKFLOW_MUTATION_NOT_APPLIED:${name}`);
  assert(workflowFindings(candidate).length > 0, `WORKFLOW_MUTATION_ESCAPED:${name}`);
}

for (const marker of [
  'P3_OUTPUT_DIRECTORY_MUST_NOT_EXIST',
  'fs.mkdtemp',
  'fs.rename(staging, destination)',
  "await write('snapshot-candidate.json', snapshot)",
  "await write('evidence-package.json', evidence)",
  'canonical_handoff_preflight',
  'track_b_submission_eligible: false',
]) assert(builder.includes(marker), `BUILDER_MARKER:${marker}`);
for (const marker of [
  'P3_PREREQUISITE_DIMENSION_ORDER_INVALID',
  'P2_INPUT_LINEAGE_MISMATCH',
  'P0_P1_IDENTITY_ORPHAN',
  'P0_MISSION_GATE_MARKET_CELL_MISMATCH',
  'GATE_ADMISSION_IDENTITY_MISMATCH',
  'P1_ACTION_GRAIN_SET_MISMATCH',
  'ADMISSION_PREFLIGHT_ACTION_BINDING_INCOMPLETE',
  'RIGHTS_ATOMS_INCOMPLETE',
  'CURRENT_SOLD_TRANSACTION_TIME_INVALID',
  'LIQUIDITY_CENSORING_STATE_INVALID',
  'P3_UPSTREAM_RUN_STALE',
  'ADMITTED_EVIDENCE_SOURCE_DIGEST_INVALID',
  'P2_MARKET_EVENT_EVIDENCE_BINDING_INVALID',
  'EVIDENCE_ADMISSION_ZERO_OR_UNBOUND',
  'ADMISSION_PREFLIGHT_ACTION_BINDING_INCOMPLETE',
  'P3_UPSTREAM_PROVIDER_DOWNLOAD_DIGEST_MISMATCH',
]) assert(library.includes(marker), `READINESS_LIBRARY_MARKER:${marker}`);
for (const marker of [
  'READINESS_PREREQUISITE_DIMENSIONS',
  'OUTPUT_EXISTENCE_CYCLE_REINTRODUCED',
  'PAIR_CROSS_BINDING',
  'PAIR_PAYLOAD_DIGESTS',
  'PAIR_FILE_DIGESTS',
  'MANIFEST_ATOMIC_TRACK_B_BOUNDARY',
]) assert(validator.includes(marker), `VALIDATOR_MARKER:${marker}`);
for (const marker of [
  'lawful_ready_pair_generation_verified',
  'deterministic_pair_generation_verified',
  'cross_timezone_locale_replay_verified',
  'atomic_directory_commit_verified',
  'canonical_handoff_pair_digest_verified',
  'canonical_handoff_remains_blocked',
  'negative_mutation_cases: 15',
  "generated_pair_state: 'CONTENT_ADDRESSED_STORAGE_AND_ATTESTATION_PENDING'",
  'artifact_attestation_verified: false',
]) assert(livenessTest.includes(marker), `LIVENESS_TEST_MARKER:${marker}`);
for (const marker of [
  "handoff_semantics: 'TRACK_B_SUBMISSION_ELIGIBILITY_ONLY'",
  "track_b_assessment: 'NOT_PERFORMED_BY_THIS_PREFLIGHT'",
  "publication: 'HOLD'",
  "production: 'HOLD'",
]) assert(canonicalHandoffValidator.includes(marker), `CANONICAL_HANDOFF_MARKER:${marker}`);
for (const marker of [
  'P2_ARTIFACT_RUN_HEAD_MISMATCH',
  'P2_RUN_NOT_CURRENT_OBSERVED_MAIN_HEAD',
  'P2_RUN_STALE',
  'artifact.downloaded_archive_sha256 === artifact.digest',
  'POSITIVE_INTEGER.test(String(artifact.id))',
  'P0B_ARTIFACT_NOT_BOUND_BY_P2_RECEIPT',
  'P1_ARTIFACT_NOT_BOUND_BY_P2_RECEIPT',
  'P2_LINEAGE_INPUT_DIGEST_MISMATCH',
  'global_artifact_scan_used: false',
  'mutation_cases: mutations.length',
  'const noArgumentSelfTest = args.length === 0',
  "const explicitSelfTest = args.length === 1 && args[0] === '--self-test'",
  "invocation_mode: noArgumentSelfTest ? 'NO_ARGUMENT_SAFE_SELF_TEST' : 'EXPLICIT_SELF_TEST'",
]) assert(upstreamValidator.includes(marker), `UPSTREAM_VALIDATOR_MARKER:${marker}`);
for (const marker of [
  '# KIDULTS ASI Snapshot Readiness Factory v2.1',
  'Current P0B → P1 → P2 v2 chain',
  '672',
  '576',
  '482',
  '2,774',
  '6,278',
  'Ten prerequisites and two output assertions',
  'Blocker Package ≠ Evidence Package',
  'Pair Generated ≠ Track B Ready',
]) assert(doc.includes(marker), `DOC_MARKER:${marker}`);

console.log(JSON.stringify({
  id: 'kidults-asi-snapshot-readiness-factory-registry-validation-v2',
  state: 'VERIFIED_PASS',
  input_artifacts: 3,
  prerequisite_dimensions: contract.prerequisite_dimensions.length,
  output_assertion_dimensions: contract.output_assertion_dimensions.length,
  always_required_outputs: contract.always_required_outputs.length,
  gate_fail_outputs: contract.outputs_when_gate_fails.length,
  gate_pass_outputs: contract.outputs_when_gate_passes.length,
  automatic_main_push: true,
  automatic_schedule: registry.automatic_activation.schedule,
  automatic_upstream_workflow: registry.automatic_activation.upstream_workflow,
  exact_upstream_binding: true,
  workflow_mutation_cases: workflowMutations.length,
  output_existence_is_prerequisite: false,
  track_b_submission_preauthorized: false,
  direct_repository_mutation: false,
  public_release: 'HOLD',
  production: 'HOLD',
}, null, 2));
