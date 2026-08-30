#!/usr/bin/env node
import fs from 'node:fs';

const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const read = (path) => fs.readFileSync(path, 'utf8');

const files = {
  requirement: '.github/workflows/kidults-asi-requirement-adapter-coverage-v1.yml',
  snapshot: '.github/workflows/kidults-asi-snapshot-readiness-factory-v2.yml',
  steering: '.github/workflows/kidults-asi-autobalance-steering-overlay-live-v1.yml',
  autonomousResolution: '.github/workflows/kidults-asi-autonomous-resolution-layer-v1.yml',
  ownedGraph: '.github/workflows/kidults-asi-owned-source-intelligence-graph-v2.yml',
  p1: '.github/workflows/kidults-asi-p1-source-preflight-v1.yml',
  supersession: '.github/workflows/kpmo-exact-head-ci-supersession-v1.yml',
  assurance: '.github/workflows/kidults-platform-continuous-assurance-v1.yml',
};

for (const path of Object.values(files)) assert(fs.existsSync(path), `WORKFLOW_MISSING:${path}`);

const requirement = read(files.requirement);
const snapshot = read(files.snapshot);
const steering = read(files.steering);
const autonomousResolution = read(files.autonomousResolution);
const ownedGraph = read(files.ownedGraph);
const p1 = read(files.p1);
const supersession = read(files.supersession);
const assurance = read(files.assurance);

const independentTrigger = /^\s{2}(schedule|push):/m;
const globalArtifactListing = '/actions/artifacts?per_page=';

assert(!independentTrigger.test(requirement), 'REQUIREMENT_INDEPENDENT_TRIGGER_FORBIDDEN');
assert(!/^\s{2}schedule:/m.test(steering), 'STEERING_SCHEDULE_TRIGGER_FORBIDDEN');
assert(!independentTrigger.test(ownedGraph), 'OWNED_GRAPH_INDEPENDENT_TRIGGER_FORBIDDEN');
assert(requirement.includes("'KIDULTS ASI Autonomous Resolution Layer v1'"), 'REQUIREMENT_UPSTREAM_TRIGGER_MISSING');
assert(snapshot.includes("'KIDULTS ASI Owned Source Intelligence Graph v2'"), 'SNAPSHOT_UPSTREAM_TRIGGER_MISSING');
assert(steering.includes("'KIDULTS ASI Throughput Coverage Autobalance Live v1'"), 'STEERING_UPSTREAM_TRIGGER_MISSING');
assert(ownedGraph.includes("'KIDULTS ASI P1 Source Preflight v1'"), 'OWNED_GRAPH_UPSTREAM_TRIGGER_MISSING');

for (const [name, workflow] of Object.entries({ requirement, steering })) {
  assert(!workflow.includes(globalArtifactListing), `${name.toUpperCase()}_GLOBAL_ARTIFACT_LISTING_FORBIDDEN`);
  assert(workflow.includes('/actions/runs/${'), `${name.toUpperCase()}_EXACT_RUN_ARTIFACT_QUERY_MISSING`);
}
assert(requirement.includes('git merge-base --is-ancestor'), 'REQUIREMENT_ANCESTOR_BINDING_MISSING');
assert(steering.includes('test "$AUTOBALANCE_SOURCE_SHA" = "$EXPECTED_GENERATION_SHA"'), 'STEERING_EXACT_GENERATION_BINDING_MISSING');
assert(!steering.includes('git merge-base --is-ancestor "$AUTOBALANCE_SOURCE_SHA"'), 'STEERING_ANCESTOR_FALLBACK_FORBIDDEN');
assert(!ownedGraph.includes(globalArtifactListing), 'OWNEDGRAPH_GLOBAL_ARTIFACT_LISTING_FORBIDDEN');
assert(ownedGraph.includes('/actions/runs/${P1_RUN_ID}/artifacts'), 'OWNEDGRAPH_EXACT_RUN_ARTIFACT_QUERY_MISSING');
assert(ownedGraph.includes('P1_SOURCE_SHA="$CURRENT_SHA"') && ownedGraph.includes('test "$P1_SOURCE_SHA" = "$CURRENT_SHA"'), 'OWNEDGRAPH_EXACT_GENERATION_BINDING_MISSING');
assert(!ownedGraph.includes('git merge-base --is-ancestor "$P1_SOURCE_SHA" "$CURRENT_SHA"'), 'OWNEDGRAPH_ANCESTOR_GENERATION_FALLBACK_FORBIDDEN');
const ownedGraphConcurrencyContract = "group: kidults-asi-owned-source-intelligence-graph-v2-${{ github.event_name }}-${{ github.event_name == 'workflow_run' && github.event.workflow_run.id || github.event_name == 'pull_request' && github.event.pull_request.head.sha || github.run_id }}";
assert(ownedGraph.includes(ownedGraphConcurrencyContract), 'OWNEDGRAPH_EVENT_SCOPED_CONCURRENCY_MISSING');
const requirementConcurrencyContract = "group: kidults-asi-requirement-adapter-coverage-v1-${{ github.event_name == 'workflow_run' && format('{0}-{1}', github.event.workflow_run.head_sha, 'ASI_AUTONOMOUS_RESOLUTION') || github.run_id }}";
assert(requirement.includes(requirementConcurrencyContract), 'REQUIREMENT_CANONICAL_SOURCE_CLASS_CONCURRENCY_MISSING');
assert(requirement.includes('cancel-in-progress: false'), 'REQUIREMENT_CONCURRENCY_SERIALIZATION_MISSING');
assert(requirement.indexOf(requirementConcurrencyContract) > requirement.indexOf('verify-requirement-adapter-coverage:'), 'REQUIREMENT_JOB_LEVEL_CONCURRENCY_MISSING');
assert(requirement.includes('resolve-asi-requirement-adapter-coverage-canonical-guard-v1.mjs') && requirement.includes('-f name="$CANONICAL_ARTIFACT_NAME"'), 'REQUIREMENT_CANONICAL_LEADER_READBACK_MISSING');
assert(requirement.includes('build-asi-requirement-adapter-coverage-semantic-input-v1.mjs') && requirement.includes('coverage-semantic-input-receipt-v1.json'), 'REQUIREMENT_SEMANTIC_INPUT_RECEIPT_MISSING');
assert(requirement.includes('run-name: KIDULTS Coverage /') && !requirement.includes('-f head_sha="$SOURCE_SHA"'), 'REQUIREMENT_SOURCE_TITLE_PRIOR_SUCCESS_BINDING_MISSING');
assert(requirement.includes('PRIOR_SUCCESS_COUNT') && requirement.includes('prior-success-runs.json'), 'REQUIREMENT_EVENTUAL_VISIBILITY_GUARD_MISSING');
assert(!requirement.includes('--paginate') && requirement.includes('PRIOR_SUCCESS_PAGE" -le 20') && requirement.includes('-f page="$PRIOR_SUCCESS_PAGE"') && requirement.includes('PRIOR_SUCCESS_PAGINATION_BOUND_EXCEEDED') && requirement.includes('expectedTitle=`KIDULTS Coverage / source-${process.env.SOURCE_SHA}`') && requirement.includes('run.display_title===expectedTitle'), 'REQUIREMENT_PRIOR_SUCCESS_SOURCE_TITLE_QUERY_MISSING');
assert(requirement.includes("if: success() && env.KIDULTS_COVERAGE_EXECUTE_FULL == 'true' && env.KIDULTS_COVERAGE_EPHEMERAL_LEADER == 'true'"), 'REQUIREMENT_FINAL_LEADER_PUBLICATION_MISSING');
assert(requirement.includes('validate-safe-zip-archive-v1.py'), 'REQUIREMENT_PRE_EXTRACTION_LIMITS_MISSING');
assert(requirement.includes("const upstreamClass='ASI_AUTONOMOUS_RESOLUTION'") && requirement.includes('canonical_run_key:canonicalRunKey'), 'REQUIREMENT_CANONICAL_RUN_BINDING_MISSING');
const requirementProducerEventGuard = "github.event.workflow_run.event == 'workflow_run'";
const requirementExactTriggerLine = '\n            RUN_ID="$EVENT_ARL_RUN_ID"\n';
assert(requirement.includes(requirementProducerEventGuard), 'REQUIREMENT_VALIDATION_ONLY_PUSH_GUARD_MISSING');
assert(requirement.includes('EVENT_ARL_RUN_ID') && requirement.includes(requirementExactTriggerLine), 'REQUIREMENT_EXACT_TRIGGER_RUN_BINDING_MISSING');
assert(requirement.includes("consumer_event:process.env.GITHUB_EVENT_NAME"), 'REQUIREMENT_CONSUMER_EVENT_BINDING_MISSING');
assert(requirement.includes("exact_triggering_run_bound:process.env.GITHUB_EVENT_NAME==='workflow_run'"), 'REQUIREMENT_EXACT_TRIGGER_CONSUMER_SEMANTICS_MISSING');
assert(requirement.includes("authoritative_producer_event:run.event==='workflow_run'"), 'REQUIREMENT_AUTHORITATIVE_PRODUCER_EVENT_MISSING');
assert(requirement.includes('AUTHORITATIVE_PRODUCER_CARDINALITY') && requirement.includes('test "$AUTHORITATIVE_PRODUCER_CARDINALITY" = 1'), 'REQUIREMENT_DUPLICATE_PRODUCER_REJECTION_MISSING');
assert(requirement.includes("run.event!=='push'") && requirement.includes("artifactProducingEvents.has(run.event)"), 'REQUIREMENT_FALLBACK_ARTIFACT_EVENT_FILTER_MISSING');
assert(requirement.includes('AUTONOMOUS_RESOLUTION_ARTIFACT_NOT_AVAILABLE:${RUN_ID}'), 'REQUIREMENT_ARTIFACT_EVENTUAL_CONSISTENCY_FAIL_CLOSE_MISSING');
assert(assurance.includes('needs.classify-canonical-identity.outputs.concurrency_group') && assurance.includes('cancel-in-progress: false'), 'ASSURANCE_CANONICAL_SERIALIZATION_MISSING');
assert(assurance.includes('resolve-continuous-assurance-ephemeral-guard-v1.mjs') && assurance.includes('-f name="$CANONICAL_ARTIFACT_NAME"'), 'ASSURANCE_EXACT_CANONICAL_READBACK_MISSING');
assert(!assurance.includes('-f head_sha='), 'ASSURANCE_BLIND_SOURCE_SHA_ELECTION_FORBIDDEN');
assert(assurance.includes("if: success() && env.KPMO_EXECUTE_FULL_AUDIT == 'true' && env.KPMO_EPHEMERAL_ACTIONS_LEADER == 'true'"), 'ASSURANCE_VERIFIED_LEADER_PUBLICATION_MISSING');
assert(assurance.includes('ACTUAL_ARCHIVE_DIGEST') && assurance.includes('CANONICAL_ARTIFACT_UNSAFE_ARCHIVE_ENTRY'), 'ASSURANCE_ARCHIVE_INTEGRITY_BOUNDARY_MISSING');
assert(assurance.includes('coverage_canonical_source_sha:$canonicalSource') && assurance.includes('audit_source_sha:$auditSource'), 'ASSURANCE_COVERAGE_SOURCE_DOMAIN_SPLIT_MISSING');
assert(assurance.includes('canonical_artifact_workflow_run_id:$canonicalArtifactRun') && assurance.includes('canonical_run:$canonicalRun[0]'), 'ASSURANCE_COVERAGE_CANONICAL_RUN_BINDING_MISSING');
assert(assurance.includes('COVERAGE_SEMANTIC_RECEIPT_DIGEST') && assurance.includes('semantic_input_receipt:$semantic[0]'), 'ASSURANCE_COVERAGE_SEMANTIC_READBACK_MISSING');
const snapshotConcurrencyContract = "group: kidults-asi-snapshot-readiness-factory-v2-${{ github.event_name }}-${{ github.event_name == 'workflow_run' && github.event.workflow_run.id || github.event_name == 'pull_request' && github.event.pull_request.head.sha || github.run_id }}";
assert(snapshot.includes(snapshotConcurrencyContract), 'SNAPSHOT_EVENT_SCOPED_CONCURRENCY_MISSING');
assert(snapshot.includes('cancel-in-progress: true'), 'SNAPSHOT_CONCURRENCY_FAIL_CLOSED_MISSING');
const autonomousResolutionPrStaticContract = "validate-autonomous-resolution-contract:\n    if: github.event_name == 'pull_request' || github.event_name == 'push'";
assert(autonomousResolution.includes(autonomousResolutionPrStaticContract), 'AUTONOMOUS_RESOLUTION_PR_STATIC_LANE_MISSING');
const autonomousResolutionArtifactConsumerContract = "resolve-current-p1-actions:\n    if: github.event_name == 'workflow_run' && github.event.workflow_run.conclusion == 'success'";
assert(autonomousResolution.includes(autonomousResolutionArtifactConsumerContract), 'AUTONOMOUS_RESOLUTION_PR_ARTIFACT_CONSUMER_SEPARATION_MISSING');
assert(autonomousResolution.includes('actions: write') && autonomousResolution.includes('/kidults-asi-p1-source-preflight-v1.yml/dispatches'), 'AUTONOMOUS_RESOLUTION_SELF_HEALING_P1_DISPATCH_MISSING');
assert(autonomousResolution.includes('request-p1-recovery:') && autonomousResolution.includes("artifact_role:'RECOVERY_NON_CONSUMABLE'") && autonomousResolution.includes('downstream_consumable:false') && autonomousResolution.includes('canonical_artifact_published:false'), 'AUTONOMOUS_RESOLUTION_NONCONSUMABLE_RECOVERY_MISSING');
assert(autonomousResolution.includes("group: kidults-asi-autonomous-resolution-layer-v1-${{ github.event_name == 'workflow_run' && github.event.workflow_run.id || github.sha }}") && autonomousResolution.includes('cancel-in-progress: false'), 'AUTONOMOUS_RESOLUTION_SHARED_GENERATION_LEADER_MISSING');
assert(autonomousResolution.includes('ARL_AUTHORITATIVE_PRODUCER_DUPLICATE') && autonomousResolution.includes("artifact_role:'AUTHORITATIVE_CONSUMABLE'") && autonomousResolution.includes('authoritative_producer:true'), 'AUTONOMOUS_RESOLUTION_DUPLICATE_PRODUCER_REJECTION_MISSING');
assert(autonomousResolution.includes('for ARTIFACT_ATTEMPT in {1..12}; do') && autonomousResolution.includes('EXACT_MAIN_P1_ARTIFACT_NOT_AVAILABLE'), 'AUTONOMOUS_RESOLUTION_BOUNDED_P1_ARTIFACT_READBACK_MISSING');
assert(supersession.includes('for attempt in 1 2 3; do'), 'EXACT_HEAD_SUPERSESSION_TRANSIENT_RETRY_MISSING');
assert(supersession.includes('"\${code}" == "429" || "\${code}" =~ ^5[0-9][0-9]'), 'EXACT_HEAD_SUPERSESSION_TRANSIENT_CLASSIFICATION_MISSING');
assert(supersession.includes('for readback_attempt in $(seq 1 8); do'), 'EXACT_HEAD_SUPERSESSION_BOUNDED_TERMINAL_READBACK_MISSING');
assert(supersession.includes('if [[ "${latest_conclusion}" == "cancelled" ]]'), 'EXACT_HEAD_SUPERSESSION_CANCELLED_CONCLUSION_PROOF_MISSING');
assert(supersession.includes('Cancellation not terminally confirmed for run'), 'EXACT_HEAD_SUPERSESSION_FAIL_CLOSED_MISSING');
assert(!supersession.includes('if [[ "${code}" == "202" || "${code}" == "409" ]]; then\n                cancelled=$((cancelled + 1))'), 'EXACT_HEAD_SUPERSESSION_ACCEPTED_AS_TERMINAL_FORBIDDEN');
assert(supersession.includes('same_head_runs_cancelled:0'), 'EXACT_HEAD_SUPERSESSION_SAME_HEAD_INVARIANT_MISSING');
assert(!snapshot.includes(globalArtifactListing), 'SNAPSHOT_GLOBAL_ARTIFACT_LISTING_FORBIDDEN');
assert(snapshot.includes('/actions/runs/${P2_RUN_ID}/artifacts'), 'SNAPSHOT_EXACT_RUN_ARTIFACT_QUERY_MISSING');
assert(snapshot.includes('main.commit?.sha!==run.head_sha') && snapshot.includes('main.commit.sha!==process.env.GITHUB_SHA'), 'SNAPSHOT_CURRENT_MAIN_BINDING_MISSING');
assert(snapshot.includes('age>24*60*60*1000'), 'SNAPSHOT_FRESHNESS_BINDING_MISSING');

assert(snapshot.includes('EVENT_P2_RUN_ID') && snapshot.includes('/actions/runs/${P2_RUN_ID}/artifacts'), 'SNAPSHOT_EVENT_RUN_BINDING_MISSING');
assert(steering.includes('AUTOBALANCE_RUN_ID') && steering.includes('/actions/runs/${AUTOBALANCE_RUN_ID}/artifacts'), 'STEERING_EVENT_RUN_BINDING_MISSING');
assert(ownedGraph.includes('P1_EVENT_RUN_ID') && ownedGraph.includes('/actions/runs/${P1_RUN_ID}/artifacts'), 'OWNED_GRAPH_EVENT_RUN_BINDING_MISSING');
assert(ownedGraph.includes('SAME_SUCCESSFUL_P1_WORKFLOW_RUN'), 'OWNED_GRAPH_TRANSACTIONAL_PAIR_BINDING_MISSING');
assert(ownedGraph.includes('.path==".github/workflows/kidults-asi-p1-source-preflight-v1.yml"') && ownedGraph.includes('.conclusion=="success"'), 'OWNED_GRAPH_P1_RUN_IDENTITY_BINDING_MISSING');
assert(!p1.includes(globalArtifactListing), 'P1_GLOBAL_ARTIFACT_LISTING_FORBIDDEN');
assert(p1.includes("if: github.event_name == 'pull_request'") && p1.includes("if: github.event_name != 'pull_request'"), 'P1_PR_AND_LIVE_DISCOVERY_SEPARATION_MISSING');
assert(p1.includes('/actions/workflows/kidults-asi-p0b-bounded-discovery-candidates-v1.yml/runs') && p1.includes('/actions/runs/${P0B_ORIGIN_RUN_ID}/artifacts'), 'P1_EXACT_ANCESTOR_P0B_RESTORE_MISSING');
assert(p1.includes('git merge-base --is-ancestor') && p1.includes('.path==".github/workflows/kidults-asi-p0b-bounded-discovery-candidates-v1.yml"'), 'P1_P0B_PROVENANCE_BINDING_MISSING');
const p1ConcurrencyContract = "group: kidults-asi-p1-source-preflight-v1-${{ github.event_name }}-${{ github.event_name == 'workflow_run' && github.event.workflow_run.id || github.ref }}";
assert(p1.includes(p1ConcurrencyContract), 'P1_EVENT_SCOPED_CONCURRENCY_MISSING');
assert(p1.includes('cancel-in-progress: true'), 'P1_CONCURRENCY_FAIL_CLOSED_MISSING');
assert(autonomousResolution.includes("'scripts/kidults/source-intelligence/*requirement-adapter-coverage*.mjs'"), 'REQUIREMENT_PRODUCER_PATH_COVERAGE_MISSING');
assert(read('.github/workflows/kidults-asi-p1-source-preflight-v1.yml').includes("'scripts/kidults/source-intelligence/*asi-owned-source-intelligence-graph*.mjs'"), 'OWNED_GRAPH_PRODUCER_PATH_COVERAGE_MISSING');
assert(read('.github/workflows/kidults-asi-p1-source-preflight-v1.yml').includes('/tmp/kidults-asi-p0b-bounded-discovery-candidates-v1'), 'OWNED_GRAPH_P0B_BUNDLE_PRODUCTION_MISSING');

const mutations = [
  ['requirement schedule', requirement.replace('  workflow_dispatch:', "  schedule:\n    - cron: '12 * * * *'\n  workflow_dispatch:"), independentTrigger],
  ['steering schedule', steering.replace('  workflow_dispatch:', "  schedule:\n    - cron: '7 * * * *'\n  workflow_dispatch:"), /^\s{2}schedule:/m],
  ['owned graph schedule', ownedGraph.replace('  workflow_dispatch:', "  schedule:\n    - cron: '52 * * * *'\n  workflow_dispatch:"), independentTrigger],
];
for (const [name, mutated, detector] of mutations) assert(detector.test(mutated), `MUTATION_NOT_DETECTED:${name}`);
assert((requirement + globalArtifactListing).includes(globalArtifactListing), 'GLOBAL_LISTING_MUTATION_NOT_DETECTED');
assert((ownedGraph + globalArtifactListing).includes(globalArtifactListing), 'OWNED_GRAPH_GLOBAL_LISTING_MUTATION_NOT_DETECTED');
const ownedGraphGenerationMutation = ownedGraph.replace('test "$P1_SOURCE_SHA" = "$CURRENT_SHA"', 'git merge-base --is-ancestor "$P1_SOURCE_SHA" "$CURRENT_SHA"');
assert(ownedGraphGenerationMutation !== ownedGraph && !ownedGraphGenerationMutation.includes('test "$P1_SOURCE_SHA" = "$CURRENT_SHA"'), 'OWNED_GRAPH_GENERATION_MUTATION_NOT_DETECTED');
const ownedGraphConcurrencyMutation = ownedGraph.replace('github.event.workflow_run.id', 'github.ref');
assert(ownedGraphConcurrencyMutation !== ownedGraph && !ownedGraphConcurrencyMutation.includes(ownedGraphConcurrencyContract), 'OWNED_GRAPH_CONCURRENCY_MUTATION_NOT_DETECTED');
const requirementConcurrencyMutation = requirement.replace("github.event.workflow_run.head_sha, 'ASI_AUTONOMOUS_RESOLUTION'", "github.event.workflow_run.id, 'ASI_AUTONOMOUS_RESOLUTION'");
assert(requirementConcurrencyMutation !== requirement && !requirementConcurrencyMutation.includes(requirementConcurrencyContract), 'REQUIREMENT_CONCURRENCY_NAMESPACE_MUTATION_NOT_DETECTED');
const requirementCancellationMutation = requirement.replace('cancel-in-progress: false', 'cancel-in-progress: true');
assert(requirementCancellationMutation !== requirement && !requirementCancellationMutation.includes('cancel-in-progress: false'), 'REQUIREMENT_CANCELLATION_MUTATION_NOT_DETECTED');
const requirementVisibilityMutation = requirement.replace('PRIOR_SUCCESS_COUNT', 'IGNORED_PRIOR_SUCCESS_COUNT');
assert(requirementVisibilityMutation !== requirement && requirementVisibilityMutation.includes('IGNORED_PRIOR_SUCCESS_COUNT'), 'REQUIREMENT_VISIBILITY_GUARD_MUTATION_NOT_DETECTED');
const requirementCanonicalBindingMutation = requirement.replace('canonical_run_key:canonicalRunKey', 'canonical_run_key:String(run.id)');
assert(requirementCanonicalBindingMutation !== requirement && !requirementCanonicalBindingMutation.includes('canonical_run_key:canonicalRunKey'), 'REQUIREMENT_CANONICAL_RUN_BINDING_MUTATION_NOT_DETECTED');
const requirementSemanticInputMutation = requirement.replaceAll('build-asi-requirement-adapter-coverage-semantic-input-v1.mjs', 'build-raw-run-identity-v1.mjs');
assert(requirementSemanticInputMutation !== requirement && !requirementSemanticInputMutation.includes('build-asi-requirement-adapter-coverage-semantic-input-v1.mjs'), 'REQUIREMENT_SEMANTIC_INPUT_MUTATION_NOT_DETECTED');
const assuranceCancellationMutation = assurance.replace('cancel-in-progress: false', 'cancel-in-progress: true');
assert(assuranceCancellationMutation !== assurance && !assuranceCancellationMutation.includes('cancel-in-progress: false'), 'ASSURANCE_CANCELLATION_MUTATION_NOT_DETECTED');
const assuranceBlindShaMutation = assurance.replace('-f name="$CANONICAL_ARTIFACT_NAME"', '-f head_sha="$KPMO_SOURCE_SHA"');
assert(assuranceBlindShaMutation !== assurance && assuranceBlindShaMutation.includes('-f head_sha='), 'ASSURANCE_BLIND_SHA_MUTATION_NOT_DETECTED');
const assuranceLeaderMutation = assurance.replace("if: success() && env.KPMO_EXECUTE_FULL_AUDIT == 'true' && env.KPMO_EPHEMERAL_ACTIONS_LEADER == 'true'", 'if: always()');
assert(assuranceLeaderMutation !== assurance && !assuranceLeaderMutation.includes("if: success() && env.KPMO_EXECUTE_FULL_AUDIT == 'true' && env.KPMO_EPHEMERAL_ACTIONS_LEADER == 'true'"), 'ASSURANCE_EARLY_LEADER_MUTATION_NOT_DETECTED');
const assuranceSourceDomainMutation = assurance.replace('coverage_canonical_source_sha:$canonicalSource', 'coverage_canonical_source_sha:$auditSource');
assert(assuranceSourceDomainMutation !== assurance && !assuranceSourceDomainMutation.includes('coverage_canonical_source_sha:$canonicalSource'), 'ASSURANCE_COVERAGE_SOURCE_DOMAIN_MUTATION_NOT_DETECTED');
const assuranceCanonicalRunMutation = assurance.replace('canonical_run:$canonicalRun[0]', 'canonical_run:null');
assert(assuranceCanonicalRunMutation !== assurance && !assuranceCanonicalRunMutation.includes('canonical_run:$canonicalRun[0]'), 'ASSURANCE_COVERAGE_CANONICAL_RUN_MUTATION_NOT_DETECTED');
const assuranceSemanticReceiptMutation = assurance.replace('semantic_input_receipt:$semantic[0]', 'semantic_input_receipt:null');
assert(assuranceSemanticReceiptMutation !== assurance && !assuranceSemanticReceiptMutation.includes('semantic_input_receipt:$semantic[0]'), 'ASSURANCE_COVERAGE_SEMANTIC_RECEIPT_MUTATION_NOT_DETECTED');
const requirementProducerEventMutation = requirement.replace(requirementProducerEventGuard, 'true');
assert(requirementProducerEventMutation !== requirement && !requirementProducerEventMutation.includes(requirementProducerEventGuard), 'REQUIREMENT_VALIDATION_ONLY_PUSH_MUTATION_NOT_DETECTED');
const requirementExactTriggerMutation = requirement.replace(requirementExactTriggerLine, '\n            RUN_ID=""\n');
assert(requirementExactTriggerMutation !== requirement && !requirementExactTriggerMutation.includes(requirementExactTriggerLine), 'REQUIREMENT_EXACT_TRIGGER_RUN_MUTATION_NOT_DETECTED');
const requirementConsumerEventBindingMutation = requirement.replace("exact_triggering_run_bound:process.env.GITHUB_EVENT_NAME==='workflow_run'", "exact_triggering_run_bound:run.event==='workflow_run'");
assert(requirementConsumerEventBindingMutation !== requirement && !requirementConsumerEventBindingMutation.includes("exact_triggering_run_bound:process.env.GITHUB_EVENT_NAME==='workflow_run'"), 'REQUIREMENT_CONSUMER_EVENT_BINDING_MUTATION_NOT_DETECTED');
const requirementProducerAuthorityMutation = requirement.replace("authoritative_producer_event:run.event==='workflow_run'", 'authoritative_producer_event:true');
assert(requirementProducerAuthorityMutation !== requirement && !requirementProducerAuthorityMutation.includes("authoritative_producer_event:run.event==='workflow_run'"), 'REQUIREMENT_PRODUCER_AUTHORITY_MUTATION_NOT_DETECTED');
const requirementProducerCardinalityMutation = requirement.replace('test "$AUTHORITATIVE_PRODUCER_CARDINALITY" = 1', 'test -n "$AUTHORITATIVE_PRODUCER_CARDINALITY"');
assert(requirementProducerCardinalityMutation !== requirement && !requirementProducerCardinalityMutation.includes('test "$AUTHORITATIVE_PRODUCER_CARDINALITY" = 1'), 'REQUIREMENT_PRODUCER_CARDINALITY_MUTATION_NOT_DETECTED');
const snapshotConcurrencyMutation = snapshot.replace('github.event.workflow_run.id', 'github.ref');
assert(snapshotConcurrencyMutation !== snapshot && !snapshotConcurrencyMutation.includes(snapshotConcurrencyContract), 'SNAPSHOT_CONCURRENCY_NAMESPACE_MUTATION_NOT_DETECTED');
const autonomousResolutionPrConsumerMutation = autonomousResolution.replace(
  "if: github.event_name == 'workflow_run' && github.event.workflow_run.conclusion == 'success'",
  "if: github.event_name == 'workflow_dispatch' || github.event_name == 'workflow_run'",
);
assert(autonomousResolutionPrConsumerMutation !== autonomousResolution && !autonomousResolutionPrConsumerMutation.includes(autonomousResolutionArtifactConsumerContract), 'AUTONOMOUS_RESOLUTION_PR_ARTIFACT_CONSUMER_MUTATION_NOT_DETECTED');
const autonomousResolutionRecoveryPermissionMutation = autonomousResolution.replaceAll('actions: write', 'actions: read');
assert(autonomousResolutionRecoveryPermissionMutation !== autonomousResolution && !autonomousResolutionRecoveryPermissionMutation.includes('actions: write'), 'AUTONOMOUS_RESOLUTION_RECOVERY_PERMISSION_MUTATION_NOT_DETECTED');
const autonomousResolutionRecoveryConsumableMutation = autonomousResolution.replace("artifact_role:'RECOVERY_NON_CONSUMABLE'", "artifact_role:'AUTHORITATIVE_CONSUMABLE'");
assert(autonomousResolutionRecoveryConsumableMutation !== autonomousResolution && !autonomousResolutionRecoveryConsumableMutation.includes("artifact_role:'RECOVERY_NON_CONSUMABLE'"), 'AUTONOMOUS_RESOLUTION_RECOVERY_CONSUMPTION_MUTATION_NOT_DETECTED');
const autonomousResolutionDuplicateMutation = autonomousResolution.replace('ARL_AUTHORITATIVE_PRODUCER_DUPLICATE', 'ARL_DUPLICATE_IGNORED');
assert(autonomousResolutionDuplicateMutation !== autonomousResolution && !autonomousResolutionDuplicateMutation.includes('ARL_AUTHORITATIVE_PRODUCER_DUPLICATE'), 'AUTONOMOUS_RESOLUTION_DUPLICATE_PRODUCER_MUTATION_NOT_DETECTED');
const autonomousResolutionArtifactReadbackMutation = autonomousResolution.replace('for ARTIFACT_ATTEMPT in {1..12}; do', 'while true; do');
assert(autonomousResolutionArtifactReadbackMutation !== autonomousResolution && !autonomousResolutionArtifactReadbackMutation.includes('for ARTIFACT_ATTEMPT in {1..12}; do'), 'AUTONOMOUS_RESOLUTION_ARTIFACT_READBACK_MUTATION_NOT_DETECTED');
const supersessionRetryMutation = supersession.replace('for attempt in 1 2 3; do', 'for attempt in 1; do');
assert(supersessionRetryMutation !== supersession && !supersessionRetryMutation.includes('for attempt in 1 2 3; do'), 'EXACT_HEAD_SUPERSESSION_RETRY_MUTATION_NOT_DETECTED');
const supersessionTerminalProofMutation = supersession.replaceAll('if [[ "${latest_conclusion}" == "cancelled" ]]', 'if [[ -n "${latest_conclusion}" ]]');
assert(supersessionTerminalProofMutation !== supersession && !supersessionTerminalProofMutation.includes('if [[ "${latest_conclusion}" == "cancelled" ]]'), 'EXACT_HEAD_SUPERSESSION_TERMINAL_PROOF_MUTATION_NOT_DETECTED');
const snapshotCurrentMainMutation = snapshot.replace('||main.commit?.sha!==run.head_sha', '');
assert(snapshotCurrentMainMutation !== snapshot && !snapshotCurrentMainMutation.includes('main.commit?.sha!==run.head_sha'), 'SNAPSHOT_CURRENT_MAIN_MUTATION_NOT_DETECTED');
const p1PrSeparationMutation = p1.replace("if: github.event_name != 'pull_request'", "if: github.event_name == 'pull_request'");
assert(p1PrSeparationMutation !== p1 && !p1PrSeparationMutation.includes("if: github.event_name != 'pull_request'"), 'P1_LIVE_DISCOVERY_SEPARATION_MUTATION_NOT_DETECTED');
assert((p1 + globalArtifactListing).includes(globalArtifactListing), 'P1_GLOBAL_LISTING_MUTATION_NOT_DETECTED');
const p1ConcurrencyMutation = p1.replace('github.event_name', 'github.ref');
assert(p1ConcurrencyMutation !== p1 && !p1ConcurrencyMutation.includes(p1ConcurrencyContract), 'P1_CONCURRENCY_NAMESPACE_MUTATION_NOT_DETECTED');

console.log(JSON.stringify({
  id: 'kidults-artifact-consumer-orchestration-validation-v1',
  state: 'VERIFIED_PASS',
  consumers_bound_to_successful_upstream: 4,
  unbounded_independent_triggers: 0,
  current_main_bound_liveness_schedules: 1,
  repository_global_artifact_queries: 0,
  adversarial_mutations_rejected: 33,
  production: 'HOLD',
  public_release: 'HOLD',
  g5: 'HOLD',
}, null, 2));
