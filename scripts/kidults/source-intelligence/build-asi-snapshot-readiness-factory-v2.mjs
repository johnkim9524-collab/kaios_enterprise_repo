#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PRINCIPLES, countBy, deriveReadiness, digestObject, hashText, stable, stableJson,
} from './lib/asi-snapshot-readiness-factory-v2.mjs';

const [
  p0RegistryPath, p0BindingsPath, p0ManifestPath, p1GatePath, p1AdmissionPath,
  p1ActionsPath, p1ManifestPath, p2GraphPath, p2LineagePath, p2QualityPath,
  p2ValuePath, p2ManifestPath, upstreamBindingPath, contractPath, outputDir,
] = process.argv.slice(2);
const required = [
  p0RegistryPath, p0BindingsPath, p0ManifestPath, p1GatePath, p1AdmissionPath,
  p1ActionsPath, p1ManifestPath, p2GraphPath, p2LineagePath, p2QualityPath,
  p2ValuePath, p2ManifestPath, upstreamBindingPath, contractPath, outputDir,
];
if (!required.every(Boolean)) throw new Error('P3_ARGUMENTS_REQUIRED');

const readJson = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const [
  p0Registry, p0Bindings, p0Manifest, p1Gate, p1Admission, p1Actions, p1Manifest,
  p2Graph, p2Lineage, p2Quality, p2Value, p2Manifest, upstreamBinding, contract,
] = await Promise.all(required.slice(0, -1).map(readJson));
const inputs = {
  p0Registry, p0Bindings, p0Manifest, p1Gate, p1Admission, p1Actions, p1Manifest,
  p2Graph, p2Lineage, p2Quality, p2Value, p2Manifest, upstreamBinding,
};
const samplePolicyPath = path.resolve(root, contract.current_sold_sample_governance?.canonical_policy || '');
if (!samplePolicyPath.startsWith(`${root}${path.sep}`)) throw new Error('P3_SAMPLE_POLICY_PATH_ESCAPES_REPOSITORY');
const samplePolicy = await readJson(samplePolicyPath);
const derived = deriveReadiness(inputs, contract, samplePolicy);

const destination = path.resolve(outputDir);
try {
  await fs.access(destination);
  throw new Error('P3_OUTPUT_DIRECTORY_MUST_NOT_EXIST');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
await fs.mkdir(path.dirname(destination), { recursive: true });
const staging = await fs.mkdtemp(path.join(path.dirname(destination), '.p3-atomic-'));
let committed = false;

try {
  const outputAssertions = [
    {
      dimension: 'IMMUTABLE_EVIDENCE_PACKAGE',
      state: 'NOT_EVALUATED',
      current_value: 0,
      required_value: 1,
      evidence_refs: [derived.sourceGraphDigest],
    },
    {
      dimension: 'TRACK_B_INPUT_PAIR',
      state: 'NOT_EVALUATED',
      current_value: 0,
      required_value: 1,
      evidence_refs: [derived.sourceGraphDigest],
    },
  ];
  if (JSON.stringify(outputAssertions.map((value) => value.dimension)) !== JSON.stringify(contract.output_assertion_dimensions)) {
    throw new Error('P3_OUTPUT_ASSERTION_DIMENSION_ORDER_INVALID');
  }
  const dimensions = [...derived.prerequisiteDimensions, ...outputAssertions];
  if (JSON.stringify(dimensions.map((value) => value.dimension)) !== JSON.stringify(contract.readiness_dimensions)) {
    throw new Error('P3_READINESS_DIMENSION_ORDER_INVALID');
  }

  const actionTypeCounts = countBy(p1Actions.actions, (value) => value.action_type);
  const actionDemands = p1Actions.actions.map((action) => ({
    action_id: action.action_id,
    action_type: action.action_type,
    state: action.state,
    candidate_id: action.candidate_id,
    canonical_host: action.canonical_host,
    expected_output: action.expected_output,
    impacted_grain_count: action.impacted_grain_ids?.length || 0,
    impacted_mission_count: action.impacted_mission_ids?.length || 0,
    network_probe_authorized: action.network_probe_authorized,
    collection_authorized: action.collection_authorized,
    evidence_admitted: action.evidence_admitted,
  }));
  const admissionDemand = {
    id: 'kidults-asi-admission-demand-package-v2',
    version: '2.2.0',
    state: derived.queuedActions === 0 ? 'NO_PENDING_PREFLIGHT_ACTIONS' : 'P1_ACTION_EXECUTION_REQUIRED',
    as_of: derived.asOf,
    source_graph_digest: derived.sourceGraphDigest,
    action_count: p1Actions.action_count,
    queued_action_count: derived.queuedActions,
    completed_action_count: derived.completedActions,
    action_type_counts: actionTypeCounts,
    action_demands: actionDemands,
    gate1_hold_count: derived.actualGateHold,
    rights_unknown_count: p1Admission.candidate_count - derived.rightsPass,
    semantic_unknown_count: p1Gate.decision_count - derived.semanticVerified,
    regional_coverage_unproven_missions: derived.missionCount - derived.regionalCoverageVerified,
    factual_origin_independence_unproven_missions: derived.missionCount - derived.factualOriginVerified,
    evidence_admitted: derived.evidenceRecords.length,
    package_is_evidence_package: false,
    public_release: 'HOLD',
    production: 'HOLD',
  };

  let snapshot = null;
  let evidence = null;
  let pairDigest = null;
  let snapshotFileDigest = null;
  let evidenceFileDigest = null;
  let pairGenerationReceipt = null;

  if (derived.prerequisitesPass) {
    const seedDigest = digestObject({
      as_of: derived.asOf,
      source_graph_digest: derived.sourceGraphDigest,
      evidence_records: derived.evidenceRecords.map((record) => ({
        evidence_id: record.evidence_id,
        digest: digestObject(record),
      })),
      market_events: derived.marketEvents.map((event) => ({ event_id: event.event_id, evidence_id: event.evidence_id })),
      sample_policy_binding: derived.sampleGovernance,
      launch_cohort: derived.launchCohort,
    });
    const suffix = seedDigest.slice('sha256:'.length, 'sha256:'.length + 24);
    const snapshotId = `kidults-asi-snapshot-candidate-${suffix}`;
    const packageId = `kidults-asi-evidence-package-${suffix}`;
    const claims = derived.evidenceRecords
      .filter((record) => record.market_observation_type === 'SOLD_TRANSACTION')
      .map((record) => ({
        claim_id: `claim-${record.evidence_id}`,
        claim_type: record.market_observation_type,
        claim_target: record.claim_target,
        sample_purpose: record.sample_purpose,
        sample_tier: derived.sampleGovernance.sample_tier,
        maximum_claim: derived.sampleGovernance.maximum_claim,
        temporality: record.temporality,
        rights_state: 'ALLOW',
        claim_strength: record.evidence_strength,
        evidence_refs: [record.evidence_id],
        current_market_evidence_present: record.temporality === 'CURRENT_MARKET',
        listing_only: false,
      }));
    evidence = {
      package_id: packageId,
      evidence_package_id: packageId,
      package_status: 'CONTENT_ADDRESSED_STORAGE_AND_ATTESTATION_PENDING',
      bound_snapshot_id: snapshotId,
      registry_version: p0Registry.version,
      methodology_version: contract.pair_generation.methodology_version,
      evidence_lineage_version: p2Lineage.version,
      as_of: derived.asOf,
      source_graph_id: p2Graph.id,
      source_graph_digest: derived.sourceGraphDigest,
      upstream_binding_receipt_sha256: derived.upstreamBindingDigest,
      upstream_binding: derived.upstreamBinding,
      sample_policy_binding: derived.sampleGovernance,
      launch_cohort: derived.launchCohort,
      evidence_records: derived.evidenceRecords,
      claims,
      entity_resolution: stable(p2Graph.entity_resolution || {
        state: 'NOT_PROVIDED_BY_SOURCE_INTELLIGENCE_CHAIN',
        current_market_evidence_present: derived.admittedSold > 0,
        current_market_evidence: derived.admittedSold > 0,
      }),
      unresolved_critical_contradiction_count: 0,
      unknown_or_denied_claim_input_count: 0,
      handoff_preflight_required: true,
      track_b_submission_eligible: false,
      immutable_storage_verified: false,
      artifact_attestation_verified: false,
      publication_authorized: false,
      production_authorized: false,
      public_release: 'HOLD',
      production: 'HOLD',
    };
    evidence.package_payload_sha256 = digestObject(evidence);
    snapshot = {
      snapshot_id: snapshotId,
      snapshot_status: 'DRAFT_CANDIDATE_STORAGE_AND_ATTESTATION_PENDING',
      bound_evidence_package_id: packageId,
      registry_version: p0Registry.version,
      methodology_version: contract.pair_generation.methodology_version,
      evidence_lineage_version: p2Lineage.version,
      as_of: derived.asOf,
      source_graph_id: p2Graph.id,
      source_graph_digest: derived.sourceGraphDigest,
      upstream_binding_receipt_sha256: derived.upstreamBindingDigest,
      upstream_binding: derived.upstreamBinding,
      sample_policy_binding: derived.sampleGovernance,
      launch_cohort_digest: derived.launchCohort.cohort_digest,
      sample_tier: derived.sampleGovernance.sample_tier,
      maximum_claim: derived.sampleGovernance.maximum_claim,
      evidence_record_count: derived.evidenceRecords.length,
      current_sold_record_count: derived.admittedSold,
      liquidity_record_count: derived.admittedLiquidity,
      claim_ids: claims.map((claim) => claim.claim_id),
      exact_pair_status: 'GENERATED_PENDING_IMMUTABLE_STORAGE_ATTESTATION_AND_CANONICAL_HANDOFF_PREFLIGHT',
      publication_eligible: false,
      production_authorized: false,
      public_release: 'HOLD',
      production: 'HOLD',
    };
    snapshot.snapshot_payload_sha256 = digestObject(snapshot);
    pairDigest = digestObject({ snapshot, evidence });
    snapshotFileDigest = hashText(stableJson(snapshot));
    evidenceFileDigest = hashText(stableJson(evidence));
    pairGenerationReceipt = {
      id: 'kidults-asi-snapshot-pair-generation-receipt-v2',
      version: '2.2.0',
      state: 'CONTENT_ADDRESSED_PAIR_ATOMICALLY_GENERATED_ATTESTATION_PENDING',
      as_of: derived.asOf,
      snapshot_id: snapshotId,
      evidence_package_id: packageId,
      snapshot_file_sha256: snapshotFileDigest,
      evidence_file_sha256: evidenceFileDigest,
      exact_pair_digest: pairDigest,
      source_graph_digest: derived.sourceGraphDigest,
      upstream_binding_receipt_sha256: derived.upstreamBindingDigest,
      sample_policy_binding: derived.sampleGovernance,
      launch_cohort_digest: derived.launchCohort.cohort_digest,
      admitted_evidence_count: derived.evidenceRecords.length,
      admitted_current_sold_count: derived.admittedSold,
      sample_plan_sha256: derived.launchCohort.sample_plan_sha256,
      canary_source_ids: derived.launchCohort.source_ids,
      canary_source_binding_digest: derived.launchCohort.source_binding_digest,
      canary_transactions: derived.launchCohort.canary_transactions,
      canary_transaction_binding_digest: derived.launchCohort.transaction_binding_digest,
      market_event_count: derived.marketEvents.length,
      atomic_directory_commit: true,
      immutable_storage_receipt: null,
      artifact_attestation: null,
      track_b_submission_eligible: false,
      canonical_handoff_preflight: 'BLOCKED_PENDING_IMMUTABLE_STORAGE_AND_ATTESTATION',
      track_b_assessment_started: false,
      public_release: 'HOLD',
      production: 'HOLD',
    };
  }

  const readiness = {
    id: 'kidults-asi-snapshot-readiness-ledger-v2',
    version: '2.2.0',
    state: derived.prerequisitesPass ? 'PAIR_GENERATED_STORAGE_AND_ATTESTATION_PENDING' : 'NOT_READY_EXACT_PREREQUISITE_BLOCKERS_OPEN',
    as_of: derived.asOf,
    platform_principles: PRINCIPLES,
    source_graph_digest: derived.sourceGraphDigest,
    sample_policy_binding: derived.sampleGovernance,
    launch_cohort_digest: derived.launchCohort?.cohort_digest || null,
    snapshot_creation_prerequisites_pass: derived.prerequisitesPass,
    snapshot_creation_gate_pass: derived.prerequisitesPass,
    all_dimensions_pass: false,
    prerequisite_dimensions: derived.prerequisiteDimensions,
    output_assertion_dimensions: outputAssertions,
    dimensions,
    counts: {
      missions: derived.missionCount,
      source_candidates: derived.candidateCount,
      unique_hosts: derived.uniqueHosts,
      assigned_unique_candidates: p2Manifest.results?.assigned_unique_candidates,
      gate1_pass: derived.actualGatePass,
      gate1_hold: derived.actualGateHold,
      gate1_reject: derived.actualGateReject,
      preflight_actions: p1Actions.action_count,
      preflight_actions_completed: derived.completedActions,
      rights_pass_candidates: derived.rightsPass,
      semantic_verified_grains: derived.semanticVerified,
      regional_coverage_verified_missions: derived.regionalCoverageVerified,
      factual_origin_independence_verified_missions: derived.factualOriginVerified,
      evidence_admitted: derived.evidenceRecords.length,
      admitted_current_sold: derived.admittedSold,
      admitted_liquidity: derived.admittedLiquidity,
      market_events: derived.marketEvents.length,
      immutable_evidence_packages: 0,
      snapshot_candidates: derived.prerequisitesPass ? 1 : 0,
      track_b_input_pairs: 0,
    },
    snapshot_candidate_generated: derived.prerequisitesPass,
    evidence_package_generated: derived.prerequisitesPass,
    exact_pair_digest: pairDigest,
    track_b_assessment_started: false,
    public_release: 'HOLD',
    production: 'HOLD',
  };
  const blockerPackage = {
    id: 'kidults-asi-immutable-blocker-package-v2',
    version: '2.2.0',
    state: derived.blockers.length === 0 ? 'NO_OPEN_PREREQUISITE_BLOCKERS' : 'OPEN_PREREQUISITE_BLOCKERS_BOUND_TO_CURRENT_CHAIN',
    as_of: derived.asOf,
    source_graph_digest: derived.sourceGraphDigest,
    blocker_count: derived.blockers.length,
    p0_blocker_count: derived.blockers.filter((value) => value.severity === 'P0').length,
    p1_blocker_count: derived.blockers.filter((value) => value.severity === 'P1').length,
    blockers: derived.blockers,
    output_absence_is_not_a_prerequisite_blocker: true,
    package_is_evidence_package: false,
    package_is_snapshot_candidate: false,
    public_release: 'HOLD',
    production: 'HOLD',
  };
  const trackB = {
    id: 'kidults-track-b-handoff-readiness-v2',
    version: '2.2.0',
    state: derived.prerequisitesPass ? 'PAIR_GENERATED_STORAGE_AND_ATTESTATION_REQUIRED' : 'WAITING_FOR_SNAPSHOT_PREREQUISITES',
    as_of: derived.asOf,
    snapshot_candidate_present: derived.prerequisitesPass,
    evidence_package_present: derived.prerequisitesPass,
    exact_pair_digest_present: derived.prerequisitesPass,
    snapshot_id: snapshot?.snapshot_id || null,
    evidence_package_id: evidence?.package_id || null,
    exact_pair_digest: pairDigest,
    canonical_handoff_preflight: derived.prerequisitesPass ? 'BLOCKED_PENDING_IMMUTABLE_STORAGE_AND_ATTESTATION' : 'NOT_ELIGIBLE_NO_PAIR',
    immutable_storage_verified: false,
    artifact_attestation_verified: false,
    track_b_submission_eligible: false,
    independent_assessment_started: false,
    blocker_package_is_not_track_b_input: true,
    required_inputs: ['snapshot-candidate.json', 'evidence-package.json'],
    blocking_classes: derived.blockers.map((value) => value.blocker_class),
    public_release: 'HOLD',
    production: 'HOLD',
  };

  const outputs = [];
  const write = async (name, value) => {
    const content = stableJson(value);
    await fs.writeFile(path.join(staging, name), content, { flag: 'wx' });
    const receipt = { name, sha256: hashText(content), bytes: Buffer.byteLength(content) };
    outputs.push(receipt);
    return receipt;
  };
  await write('snapshot-readiness-ledger-v2.json', readiness);
  await write('immutable-blocker-package-v2.json', blockerPackage);
  await write('admission-demand-package-v2.json', admissionDemand);
  if (derived.prerequisitesPass) {
    await write('snapshot-candidate.json', snapshot);
    await write('evidence-package.json', evidence);
    await write('snapshot-pair-generation-receipt-v2.json', pairGenerationReceipt);
  } else {
    const nonGeneration = {
      id: 'kidults-asi-snapshot-non-generation-receipt-v2',
      version: '2.2.0',
      state: 'VERIFIED_NOT_GENERATED_FAIL_CLOSED',
      as_of: derived.asOf,
      source_graph_digest: derived.sourceGraphDigest,
      snapshot_creation_prerequisites_pass: false,
      snapshot_candidate_generated: false,
      evidence_package_generated: false,
      rankability_assessment_generated: false,
      forbidden_output_absence_required: true,
      public_release: 'HOLD',
      production: 'HOLD',
    };
    await write('snapshot-non-generation-receipt-v2.json', nonGeneration);
  }
  await write('track-b-handoff-readiness-v2.json', trackB);

  const manifest = {
    id: 'kidults-asi-snapshot-readiness-manifest-v2',
    version: '2.2.0',
    state: derived.prerequisitesPass ? 'P3_CONTENT_ADDRESSED_PAIR_GENERATED_STORAGE_AND_ATTESTATION_PENDING' : 'P3_READINESS_ASSESSED_SNAPSHOT_NOT_GENERATED',
    as_of: derived.asOf,
    platform_principles: PRINCIPLES,
    input_bindings: {
      p0b: { registry_id: p0Registry.id, binding_id: p0Bindings.id, manifest_id: p0Manifest.id, candidate_count: derived.candidateCount, mission_count: derived.missionCount },
      p1: { gate_id: p1Gate.id, admission_id: p1Admission.id, actions_id: p1Actions.id, manifest_id: p1Manifest.id, gate1_hold: derived.actualGateHold, actions_queued: derived.queuedActions },
      p2: { graph_id: p2Graph.id, graph_digest: derived.sourceGraphDigest, quality_id: p2Quality.id, value_id: p2Value.id, manifest_id: p2Manifest.id, node_count: p2Graph.node_count, edge_count: p2Graph.edge_count },
      sample_policy: derived.sampleGovernance,
    },
    results: {
      readiness_dimensions: dimensions.length,
      prerequisite_dimensions: derived.prerequisiteDimensions.length,
      output_assertion_dimensions: outputAssertions.length,
      dimensions_pass: dimensions.filter((value) => value.state === 'PASS').length,
      dimensions_not_evaluated: dimensions.filter((value) => value.state === 'NOT_EVALUATED').length,
      dimensions_fail: dimensions.filter((value) => value.state === 'FAIL').length,
      open_blockers: derived.blockers.length,
      p0_blockers: derived.blockers.filter((value) => value.severity === 'P0').length,
      p1_blockers: derived.blockers.filter((value) => value.severity === 'P1').length,
      preflight_actions_queued: derived.queuedActions,
      evidence_admitted: derived.evidenceRecords.length,
      admitted_current_sold: derived.admittedSold,
      current_sold_sample_tier: derived.sampleGovernance.sample_tier,
      current_sold_maximum_claim: derived.sampleGovernance.maximum_claim,
      market_events_created: derived.marketEvents.length,
      snapshot_candidates_created: derived.prerequisitesPass ? 1 : 0,
      evidence_packages_created: derived.prerequisitesPass ? 1 : 0,
      track_b_input_pairs_created: 0,
      track_b_assessments_started: 0,
    },
    exact_pair_digest: pairDigest,
    output_files: outputs,
    atomic_directory_commit: true,
    upstream_binding_receipt_sha256: derived.upstreamBindingDigest,
    autonomous_effect: derived.prerequisitesPass ? 'POSITIVE_LAWFUL_ADMITTED_CHAIN_ATOMICALLY_COMPILED_TO_CONTENT_ADDRESSED_PAIR_PENDING_ATTESTATION' : 'POSITIVE_CURRENT_CHAIN_AUTOMATICALLY_ASSESSED_WITHOUT_FALSE_GENERATION',
    global_effect: 'NEUTRAL_NO_NEW_GLOBAL_COVERAGE_OR_PUBLIC_CLAIM',
    irreplaceable_value_effect: derived.prerequisitesPass ? 'POSITIVE_KIDULTS_OWNED_DIGEST_BOUND_CANDIDATE_EVIDENCE_PAIR_PENDING_IMMUTABLE_STORAGE' : 'POSITIVE_CONTENT_ADDRESSED_BLOCKER_AND_ADMISSION_DEMAND_ASSETS',
    transparency_effect: 'POSITIVE_PREREQUISITES_OUTPUT_ASSERTIONS_DIGESTS_AND_HANDOFF_BOUNDARY_SEPARATED',
    public_release: 'HOLD',
    production: 'HOLD',
  };
  const manifestContent = stableJson(manifest);
  await fs.writeFile(path.join(staging, 'snapshot-readiness-manifest-v2.json'), manifestContent, { flag: 'wx' });

  for (const name of contract.forbidden_outputs_always) {
    try {
      await fs.access(path.join(staging, name));
      throw new Error(`P3_ALWAYS_FORBIDDEN_OUTPUT_CREATED:${name}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  const conditionalForbidden = derived.prerequisitesPass
    ? contract.forbidden_outputs_when_gate_passes
    : contract.forbidden_outputs_when_gate_fails;
  for (const name of conditionalForbidden) {
    try {
      await fs.access(path.join(staging, name));
      throw new Error(`P3_CONDITIONAL_FORBIDDEN_OUTPUT_CREATED:${name}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  await fs.rename(staging, destination);
  committed = true;
  console.log(JSON.stringify({
    state: manifest.state,
    prerequisites_pass: derived.prerequisitesPass,
    dimensions: {
      pass: manifest.results.dimensions_pass,
      not_evaluated: manifest.results.dimensions_not_evaluated,
      fail: manifest.results.dimensions_fail,
    },
    open_blockers: derived.blockers.length,
    evidence_admitted: derived.evidenceRecords.length,
    market_events_created: derived.marketEvents.length,
    snapshot_candidates_created: manifest.results.snapshot_candidates_created,
    evidence_packages_created: manifest.results.evidence_packages_created,
    track_b_input_pairs_created: manifest.results.track_b_input_pairs_created,
    exact_pair_digest: pairDigest,
    atomic_directory_commit: true,
    public_release: 'HOLD',
    production: 'HOLD',
  }, null, 2));
} finally {
  if (!committed) await fs.rm(staging, { recursive: true, force: true });
}
