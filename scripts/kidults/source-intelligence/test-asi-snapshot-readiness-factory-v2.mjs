#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { deriveReadiness, digestObject, hashText, stableJson } from './lib/asi-snapshot-readiness-factory-v2.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const builder = path.join(root, 'scripts/kidults/source-intelligence/build-asi-snapshot-readiness-factory-v2.mjs');
const validator = path.join(root, 'scripts/kidults/source-intelligence/validate-asi-snapshot-readiness-factory-v2.mjs');
const handoffValidator = path.join(root, 'scripts/kidults/poc/validate-candidate-evidence-handoff-r2.mjs');
const contract = path.join(root, 'coordination/kidults/source-intelligence/asi-snapshot-readiness-factory-contract-v2.json');
const samplePolicy = JSON.parse(fs.readFileSync(path.join(root, 'coordination/kidults/source-intelligence/current-sold-sample-governance-v1.json'), 'utf8'));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-p3-liveness-'));
const requireCondition = (condition, code) => { if (!condition) throw new Error(code); };
const clone = (value) => JSON.parse(JSON.stringify(value));
const write = (file, value) => fs.writeFileSync(file, stableJson(value));

function samplePlanRegistration() {
  const tier = samplePolicy.tiers.find((value) => value.purpose === 'SCHEMA_AND_BOUNDARY_SMOKE'
    && value.claim_target === 'DATED_OBSERVED_SOLD_TRANSACTION');
  const promotion = samplePolicy.promotion_matrix[tier.id];
  const planPayload = {
    sample_plan_id: 'kidults-current-sold-canary-plan-2026-08-v1',
    registered_at: '2026-07-31T00:00:00.000Z',
    sample_policy_id: samplePolicy.id,
    sample_policy_version: samplePolicy.version,
    sample_policy_digest: digestObject(samplePolicy),
    sample_purpose: tier.purpose,
    claim_target: tier.claim_target,
    sample_tier: tier.id,
    min_n: tier.min_n,
    max_n: tier.max_n,
    statistical_claim: tier.statistical_claim,
    cohort_class: 'LAWFUL_CURRENT_SOLD_SAMPLE',
    cohort_mode: 'EMPIRICAL_CANARY',
    maximum_claim: promotion.maximum_claim,
    release_allowed: false,
    sampling_frame_id: 'kidults-current-sold-canary-frame-2026-08-v1',
  };
  const samplePlanSha256 = digestObject(planPayload);
  const receiptPayload = {
    receipt_id: 'kidults-current-sold-canary-plan-registration-2026-08-v1',
    issuer: 'KPMO_PRE_REGISTERED_SAMPLE_PLAN_REGISTRY',
    sample_plan_id: planPayload.sample_plan_id,
    sample_plan_sha256: samplePlanSha256,
    registered_at: planPayload.registered_at,
    immutable_artifact_ref: `artifact:${samplePlanSha256}`,
  };
  return {
    sample_plan_id: planPayload.sample_plan_id,
    plan_payload: planPayload,
    sample_plan_sha256: samplePlanSha256,
    registration_receipt: {
      ...receiptPayload,
      registration_receipt_sha256: digestObject(receiptPayload),
    },
  };
}

function evidenceRecord(id, evidenceClass, observationType, sourceByte) {
  const purposeBindingId = 'KIDULTS_INTERNAL_PRODUCT_ANALYSIS_AND_STAGING_DISPLAY';
  const rightsEvidenceUri = `https://rights-archive.kidults.com/${id}`;
  const sourcePayloadSha256 = `sha256:${sourceByte.repeat(64)}`;
  const record = {
    evidence_id: id,
    evidence_class: evidenceClass,
    source_id: `source-${id}`,
    purpose_binding_id: purposeBindingId,
    source_owner_id: `owner-${id}`,
    factual_origin_id: `origin-${id}`,
    rights_state: 'ALLOW',
    source_url: `https://market-evidence.kidults.com/${id}`,
    source_object_uri: `https://evidence-archive.kidults.com/objects/${sourceByte.repeat(64)}`,
    source_payload_sha256: sourcePayloadSha256,
    license_evidence_refs: [rightsEvidenceUri],
    rights_assertion: {
      assertion_id: `rights-${id}`,
      source_owner_id: `owner-${id}`,
      purpose_binding_id: purposeBindingId,
      jurisdiction: 'US',
      rights_atoms: ['COLLECT', 'STORE', 'DERIVE', 'DISPLAY'],
      effective_at: '2026-08-01T00:00:00.000Z',
      expires_at: '2026-12-31T00:00:00.000Z',
      document_sha256: `sha256:${sourceByte.repeat(64)}`,
      source_content_snapshot_sha256: sourcePayloadSha256,
      evidence_uri: rightsEvidenceUri,
    },
    observed_at: '2026-08-23T00:00:00.000Z',
    valid_until: '2026-09-01T00:00:00.000Z',
    temporality: 'CURRENT_MARKET',
    market_observation_type: observationType,
    evidence_strength: 1,
    unresolved_critical_contradiction_count: 0,
  };
  if (evidenceClass === 'CURRENT_SOLD_TRANSACTION') {
    const plan = samplePlanRegistration();
    const soldFields = {
      source_record_id: `source-record-${id}`,
      sample_purpose: plan.plan_payload.sample_purpose,
      claim_target: plan.plan_payload.claim_target,
      sample_plan_id: plan.sample_plan_id,
      sample_plan_sha256: plan.sample_plan_sha256,
      sample_plan_registration_receipt_id: plan.registration_receipt.receipt_id,
      sample_plan_registration_receipt_sha256: plan.registration_receipt.registration_receipt_sha256,
      sample_plan_artifact_ref: plan.registration_receipt.immutable_artifact_ref,
      sample_plan_registered_at: plan.plan_payload.registered_at,
      sampling_frame_id: plan.plan_payload.sampling_frame_id,
      transaction_occurred_at: '2026-08-22T00:00:00.000Z',
      asset_identity_id: `asset-${id}`,
      market_venue_id: 'venue-authorized-1',
      grade_or_condition: 'GRADED_9',
      sold_price: { amount: 125.5, currency: 'USD' },
    };
    const canonicalTransactionIdentity = {
      source_id: record.source_id,
      source_owner_id: record.source_owner_id,
      factual_origin_id: record.factual_origin_id,
      source_record_id: soldFields.source_record_id,
      asset_identity_id: soldFields.asset_identity_id,
      market_venue_id: soldFields.market_venue_id,
      transaction_occurred_at: soldFields.transaction_occurred_at,
      sold_price: soldFields.sold_price,
    };
    Object.assign(record, soldFields, { sample_unit_id: digestObject(canonicalTransactionIdentity) });
  }
  else Object.assign(record, {
    claim_target: 'LIQUIDITY_OR_TIME_TO_SALE',
    exposure_started_at: '2026-08-01T00:00:00.000Z',
    exposure_ended_at: '2026-08-20T00:00:00.000Z',
    censoring_state: 'SOLD_EVENT_OBSERVED',
    exposure_days: 19,
  });
  return record;
}

function readyInputs() {
  const sourceCandidates = Array.from({ length: 96 }, (_, index) => ({
    candidate_id: `candidate-${index}`,
    canonical_host: `source-${index}.market.kidults.com`,
  }));
  const uniqueActionCandidateCount = 95;
  const p0Registry = { id: 'kidults-asi-p0b-source-candidate-registry-v1', version: '1.0.0', canonical_candidate_count: 96, unique_host_count: 96, candidates: sourceCandidates };
  const bindings = Array.from({ length: 192 }, (_, index) => ({
    binding_id: `binding-${index}`,
    mission_id: `mission-${index}`,
    market_cell_id: `market-${index}`,
    evidence_class: index % 2 ? 'LIQUIDITY_TIME_TO_SALE_EXPOSURE' : 'CURRENT_SOLD_TRANSACTION',
    slot_bindings: Array.from({ length: 3 }, (_, slot) => ({ candidate_id: `candidate-${(index * 3 + slot) % uniqueActionCandidateCount}` })),
    factual_origin_independence_proven: true,
    regional_coverage_proven: true,
  }));
  const p0Bindings = {
    id: 'kidults-asi-p0b-mission-candidate-binding-ledger-v1', version: '1.0.0', mission_count: 192,
    bindings, missions_with_at_least_one_candidate: 192, missions_with_primary_and_fallback_candidates: 192,
    missions_with_three_candidate_hosts: 192,
  };
  const p0Manifest = { id: 'kidults-asi-p0b-bounded-discovery-manifest-v1', version: '1.0.0' };
  const decisions = Array.from({ length: 576 }, (_, index) => ({
    gate1_decision_id: `gate-${index}`, decision: 'PASS', rights_state: 'ALLOW',
    collection_authorized: true,
    grain_id: `grain-${index}`, candidate_id: `candidate-${index % uniqueActionCandidateCount}`, mission_id: `mission-${Math.floor(index / 3)}`,
    market_cell_id: `market-${Math.floor(index / 3)}`,
    market_semantics_verified: true, reason_codes: [],
  }));
  const p1Gate = {
    id: 'kidults-asi-p1-gate1-source-safety-decisions-v1', version: '1.0.0', decision_count: 576,
    pass_count: 576, hold_count: 0, reject_count: 0, decisions,
  };
  const admittedRecords = new Map([
    [0, evidenceRecord('evidence-sold-1', 'CURRENT_SOLD_TRANSACTION', 'SOLD_TRANSACTION', 'a')],
    [1, evidenceRecord('evidence-sold-2', 'CURRENT_SOLD_TRANSACTION', 'SOLD_TRANSACTION', 'b')],
    [2, evidenceRecord('evidence-sold-3', 'CURRENT_SOLD_TRANSACTION', 'SOLD_TRANSACTION', 'c')],
    [6, evidenceRecord('evidence-sold-4', 'CURRENT_SOLD_TRANSACTION', 'SOLD_TRANSACTION', 'd')],
    [7, evidenceRecord('evidence-sold-5', 'CURRENT_SOLD_TRANSACTION', 'SOLD_TRANSACTION', 'e')],
    [3, evidenceRecord('evidence-liquidity-1', 'LIQUIDITY_TIME_TO_SALE_EXPOSURE', 'LIQUIDITY_EXPOSURE', 'f')],
  ]);
  const candidates = Array.from({ length: 576 }, (_, index) => {
    const record = admittedRecords.get(index) || null;
    const missionIndex = Math.floor(index / 3);
    return {
      admission_candidate_id: `admission-${index}`,
      candidate_id: `candidate-${index % uniqueActionCandidateCount}`,
      grain_id: `grain-${index}`,
      mission_id: `mission-${missionIndex}`,
      market_cell_id: `market-${missionIndex}`,
      purpose_binding_id: record?.purpose_binding_id || `purpose-candidate-${index}`,
      source_owner_id: record?.source_owner_id || `owner-candidate-${index}`,
      factual_origin_id: record?.factual_origin_id || `origin-candidate-${index}`,
      source_id: record?.source_id,
      sample_purpose: record?.sample_purpose,
      claim_target: record?.claim_target,
      source_record_id: record?.source_record_id,
      sample_plan_id: record?.sample_plan_id,
      sample_plan_sha256: record?.sample_plan_sha256,
      sample_plan_registration_receipt_id: record?.sample_plan_registration_receipt_id,
      sample_plan_registration_receipt_sha256: record?.sample_plan_registration_receipt_sha256,
      sample_plan_artifact_ref: record?.sample_plan_artifact_ref,
      sample_plan_registered_at: record?.sample_plan_registered_at,
      sampling_frame_id: record?.sampling_frame_id,
      sample_unit_id: record?.sample_unit_id,
      evidence_class: missionIndex % 2 ? 'LIQUIDITY_TIME_TO_SALE_EXPOSURE' : 'CURRENT_SOLD_TRANSACTION',
      state: record ? 'ADMITTED_VERIFIED' : 'READY_RIGHTS_AND_SEMANTICS_VERIFIED',
      gate1_decision: 'PASS', rights_state: 'ALLOW', collection_authorized: true,
      evidence_admitted: Boolean(record), admitted_evidence_id: record?.evidence_id || null,
      admitted_evidence: record || undefined,
      required_next_actions: ['OWNER', 'RIGHTS', 'ACCESS', 'SEMANTICS', 'REGION', 'SCHEMA', 'ORIGIN'],
    };
  });
  const p1Admission = {
    id: 'kidults-asi-p1-evidence-admission-candidate-register-v1', version: '1.0.0', candidate_count: 576,
    admitted_count: admittedRecords.size, candidates, sample_plans: [samplePlanRegistration()],
  };
  const actionTypes = ['OWNER', 'RIGHTS', 'ACCESS', 'SEMANTICS', 'REGION', 'SCHEMA', 'ORIGIN'];
  const actions = Array.from({ length: uniqueActionCandidateCount * actionTypes.length }, (_, index) => {
    const candidateIndex = Math.floor(index / 7);
    const impactedAdmissions = candidates.filter((candidate) => candidate.candidate_id === `candidate-${candidateIndex}`);
    return {
      action_id: `action-${index}`, action_type: actionTypes[index % 7], state: 'VERIFIED_PASS',
      candidate_id: `candidate-${candidateIndex}`, canonical_host: `source-${candidateIndex}.market.kidults.com`,
      expected_output: 'VERIFIED_PREFLIGHT_RECEIPT',
      impacted_grain_ids: impactedAdmissions.map((candidate) => candidate.grain_id),
      impacted_mission_ids: [...new Set(impactedAdmissions.map((candidate) => candidate.mission_id))],
      network_probe_authorized: false, collection_authorized: true,
      evidence_admitted: impactedAdmissions.some((candidate) => candidate.evidence_admitted),
    };
  });
  const p1Actions = {
    id: 'kidults-asi-p1-preflight-action-queue-v1', version: '1.0.0',
    unique_candidate_count: uniqueActionCandidateCount, action_types: actionTypes,
    action_count: actions.length, actions,
  };
  const p1Manifest = { id: 'kidults-asi-p1-source-preflight-manifest-v1', version: '1.0.0' };
  const marketEvents = [...admittedRecords.values()].map((record, index) => ({
    event_id: `event-${index}`, evidence_id: record.evidence_id, rights_state: 'ALLOW',
    observed_at: record.observed_at, source_payload_sha256: record.source_payload_sha256,
    evidence_record_digest: digestObject(record),
  }));
  const p2Graph = {
    id: 'kidults-owned-source-intelligence-graph-v2', version: '2.0.0', as_of: '2026-08-24T00:00:00.000Z',
    node_count: 1, edge_count: 0, nodes: [], edges: [], evidence_admitted: admittedRecords.size,
    market_events_created: admittedRecords.size, market_events: marketEvents,
  };
  const p2Quality = { id: 'kidults-owned-source-intelligence-quality-v2', version: '2.0.0', state: 'VERIFIED_GRAPH_INTEGRITY_READY' };
  const p2Value = { id: 'kidults-owned-source-intelligence-value-receipt-v2', version: '2.0.0', source_intelligence_graph_is_market_evidence_graph: true };
  const p2Manifest = {
    id: 'kidults-owned-source-intelligence-manifest-v2', version: '2.0.0', graph_digest: null,
    results: { assigned_unique_candidates: 576, evidence_admitted: admittedRecords.size, market_events_created: admittedRecords.size },
  };
  const upstreamBinding = {
    id: 'kidults-asi-snapshot-readiness-upstream-binding-v2', version: '2.1.0', state: 'VERIFIED_EXACT_UPSTREAM_CHAIN',
    repository: 'kidults/kidults', p2_workflow_path: '.github/workflows/kidults-asi-owned-source-intelligence-graph-v2.yml',
    p2_run_id: '30', p2_head_sha: '1'.repeat(40), observed_main_head_sha: '1'.repeat(40),
    p2_completed_at: '2026-08-24T00:05:00.000Z', readback_observed_at: '2026-08-24T00:10:00.000Z',
    p0b_artifact_id: '10', p1_artifact_id: '20', p2_artifact_id: '30',
    p0b_artifact_digest: `sha256:${'1'.repeat(64)}`, p1_artifact_digest: `sha256:${'2'.repeat(64)}`, p2_artifact_digest: `sha256:${'3'.repeat(64)}`,
    p0b_downloaded_archive_sha256: `sha256:${'1'.repeat(64)}`, p1_downloaded_archive_sha256: `sha256:${'2'.repeat(64)}`, p2_downloaded_archive_sha256: `sha256:${'3'.repeat(64)}`,
    p0b_and_p1_selected_from_p2_receipt: true, global_artifact_scan_used: false, any_branch_fallback_used: false,
    graph_digest: null,
  };
  return { p0Registry, p0Bindings, p0Manifest, p1Gate, p1Admission, p1Actions, p1Manifest, p2Graph, p2Quality, p2Value, p2Manifest, upstreamBinding };
}

function finalize(values) {
  values.p2Manifest.graph_digest = hashText(stableJson(values.p2Graph));
  values.p2Lineage = {
    id: 'kidults-owned-source-intelligence-lineage-v2', version: '2.0.0',
    inputs: [values.p0Registry, values.p0Bindings, values.p1Gate, values.p1Admission, values.p1Actions]
      .map((value) => ({ id: value.id, digest: hashText(stableJson(value)) })),
    graph: { digest: values.p2Manifest.graph_digest },
  };
  values.upstreamBinding.graph_digest = values.p2Manifest.graph_digest;
  return values;
}

function retainAdmittedEvidence(values, evidenceIds) {
  const retained = new Set(evidenceIds);
  for (const candidate of values.p1Admission.candidates) {
    if (candidate.evidence_admitted !== true || retained.has(candidate.admitted_evidence_id)) continue;
    candidate.state = 'READY_RIGHTS_AND_SEMANTICS_VERIFIED';
    candidate.evidence_admitted = false;
    candidate.admitted_evidence_id = null;
    delete candidate.admitted_evidence;
  }
  values.p1Admission.admitted_count = values.p1Admission.candidates.filter((candidate) => candidate.evidence_admitted === true).length;
  values.p2Graph.market_events = values.p2Graph.market_events.filter((event) => retained.has(event.evidence_id));
  values.p2Graph.market_events_created = values.p2Graph.market_events.length;
  values.p2Graph.evidence_admitted = values.p2Graph.market_events.length;
  values.p2Manifest.results.market_events_created = values.p2Graph.market_events.length;
  values.p2Manifest.results.evidence_admitted = values.p2Graph.market_events.length;
  for (const action of values.p1Actions.actions) {
    action.evidence_admitted = values.p1Admission.candidates.some((candidate) => candidate.candidate_id === action.candidate_id
      && candidate.evidence_admitted === true);
  }
  return finalize(values);
}

function blockedInputs() {
  const values = readyInputs();
  for (const binding of values.p0Bindings.bindings) {
    binding.factual_origin_independence_proven = false;
    binding.regional_coverage_proven = false;
  }
  for (const decision of values.p1Gate.decisions) {
    decision.decision = 'HOLD';
    decision.rights_state = 'UNKNOWN';
    decision.collection_authorized = false;
    decision.market_semantics_verified = false;
  }
  Object.assign(values.p1Gate, { pass_count: 0, hold_count: 576, reject_count: 0 });
  for (const candidate of values.p1Admission.candidates) {
    candidate.state = 'NOT_READY_GATE1_HOLD';
    candidate.gate1_decision = 'HOLD';
    candidate.rights_state = 'UNKNOWN';
    candidate.collection_authorized = false;
    candidate.evidence_admitted = false;
    candidate.admitted_evidence_id = null;
    delete candidate.admitted_evidence;
  }
  values.p1Admission.admitted_count = 0;
  for (const action of values.p1Actions.actions) {
    action.state = 'QUEUED_NOT_EXECUTED';
    action.collection_authorized = false;
    action.evidence_admitted = false;
  }
  Object.assign(values.p2Graph, { evidence_admitted: 0, market_events_created: 0, market_events: [] });
  values.p2Value.source_intelligence_graph_is_market_evidence_graph = false;
  Object.assign(values.p2Manifest.results, { evidence_admitted: 0, market_events_created: 0 });
  return finalize(values);
}

function materialize(name, values) {
  const dir = path.join(temp, name);
  fs.mkdirSync(dir);
  const files = {
    p0Registry: 'p0b-source-candidate-registry-v1.json', p0Bindings: 'p0b-mission-candidate-binding-ledger-v1.json',
    p0Manifest: 'p0b-bounded-discovery-manifest-v1.json', p1Gate: 'p1-gate1-source-safety-decisions-v1.json',
    p1Admission: 'p1-evidence-admission-candidate-register-v1.json', p1Actions: 'p1-preflight-action-queue-v1.json',
    p1Manifest: 'p1-source-preflight-manifest-v1.json', p2Graph: 'owned-source-intelligence-graph-v2.json',
    p2Lineage: 'owned-source-intelligence-lineage-v2.json', p2Quality: 'owned-source-intelligence-quality-v2.json',
    p2Value: 'owned-source-intelligence-value-receipt-v2.json', p2Manifest: 'owned-source-intelligence-manifest-v2.json',
    upstreamBinding: 'asi-snapshot-readiness-upstream-binding-v2.json',
  };
  for (const [key, file] of Object.entries(files)) write(path.join(dir, file), values[key]);
  return { dir, args: Object.values(files).map((file) => path.join(dir, file)) };
}

function execute(script, args, expectedSuccess = true, environment = {}) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...environment },
  });
  if (expectedSuccess && result.status !== 0) throw new Error(`COMMAND_FAILED:${script}\n${result.stdout}\n${result.stderr}`);
  if (!expectedSuccess && result.status === 0) throw new Error(`COMMAND_UNEXPECTEDLY_PASSED:${script}`);
  return result;
}

function validateOutput(input, output) {
  execute(validator, [output, ...input.args, contract]);
}

try {
  const weakenedCanonicalPolicy = clone(samplePolicy);
  weakenedCanonicalPolicy.tiers.find((value) => value.id === 'CANARY').min_n = 1;
  let weakenedPolicyRejected = false;
  try {
    deriveReadiness(finalize(readyInputs()), JSON.parse(fs.readFileSync(contract, 'utf8')), weakenedCanonicalPolicy);
  } catch (error) {
    weakenedPolicyRejected = error instanceof Error && error.message === 'P3_CANARY_POLICY_BOUNDARY_INVALID';
  }
  requireCondition(weakenedPolicyRejected, 'CANONICAL_POLICY_CANARY_TIER_WEAKENING_ACCEPTED');

  const blocked = materialize('blocked-input', blockedInputs());
  const blockedOutput = path.join(temp, 'blocked-output');
  execute(builder, [...blocked.args, contract, blockedOutput]);
  requireCondition(!fs.existsSync(path.join(blockedOutput, 'snapshot-candidate.json')), 'BLOCKED_SNAPSHOT_CREATED');

  const ready = materialize('ready-input', finalize(readyInputs()));
  const readyOutputA = path.join(temp, 'ready-output-a');
  const readyOutputB = path.join(temp, 'ready-output-b');
  execute(builder, [...ready.args, contract, readyOutputA]);
  execute(builder, [...ready.args, contract, readyOutputB], true, { TZ: 'Pacific/Honolulu', LANG: 'C', LC_ALL: 'C' });
  validateOutput(ready, readyOutputA);
  validateOutput(ready, readyOutputB);
  for (const name of fs.readdirSync(readyOutputA).sort()) {
    requireCondition(fs.readFileSync(path.join(readyOutputA, name), 'utf8') === fs.readFileSync(path.join(readyOutputB, name), 'utf8'), `NONDETERMINISTIC_OUTPUT:${name}`);
  }
  const receipt = JSON.parse(fs.readFileSync(path.join(readyOutputA, 'snapshot-pair-generation-receipt-v2.json')));
  requireCondition(receipt.state === 'CONTENT_ADDRESSED_PAIR_ATOMICALLY_GENERATED_ATTESTATION_PENDING' && receipt.atomic_directory_commit === true, 'READY_PAIR_NOT_ATOMIC');
  const readyEvidence = JSON.parse(fs.readFileSync(path.join(readyOutputA, 'evidence-package.json')));
  requireCondition(readyEvidence.launch_cohort?.sample_tier === 'CANARY'
    && readyEvidence.launch_cohort?.sample_size === 5
    && readyEvidence.launch_cohort?.sample_purpose === 'SCHEMA_AND_BOUNDARY_SMOKE'
    && readyEvidence.launch_cohort?.claim_target === 'DATED_OBSERVED_SOLD_TRANSACTION'
    && readyEvidence.launch_cohort?.maximum_claim === 'SCHEMA_BOUNDARY_SMOKE_ONLY'
    && readyEvidence.launch_cohort?.release_allowed === false, 'READY_CANARY_POLICY_BINDING_MISSING');
  requireCondition(receipt.immutable_storage_receipt === null && receipt.artifact_attestation === null && receipt.track_b_submission_eligible === false, 'READY_PAIR_FALSE_ATTESTATION');
  const handoffOutput = path.join(temp, 'canonical-handoff-result.json');
  execute(handoffValidator, [
    path.join(readyOutputA, 'snapshot-candidate.json'),
    path.join(readyOutputA, 'evidence-package.json'),
    handoffOutput,
  ]);
  const handoff = JSON.parse(fs.readFileSync(handoffOutput));
  requireCondition(handoff.pair_digest === receipt.exact_pair_digest, 'CANONICAL_HANDOFF_PAIR_DIGEST_MISMATCH');
  requireCondition(handoff.handoff_state === 'BLOCKED'
    && handoff.handoff_semantics === 'TRACK_B_SUBMISSION_ELIGIBILITY_ONLY'
    && handoff.track_b_assessment === 'NOT_PERFORMED_BY_THIS_PREFLIGHT'
    && handoff.publication === 'HOLD' && handoff.production === 'HOLD', 'CANONICAL_HANDOFF_BOUNDARY_WEAKENED');
  requireCondition(!handoff.blockers.includes('LAUNCH_COHORT_POLICY_OR_DIGEST_BINDING_INVALID')
    && !handoff.blockers.some((code) => code.startsWith('CURRENT_MARKET_EVIDENCE_RECORD_INVALID:evidence-sold-'))
    && !handoff.blockers.some((code) => code.startsWith('RIGHTS_ASSERTION_INVALID_OR_EXPIRED:')),
  `CANONICAL_HANDOFF_SAMPLE_OR_EVIDENCE_FIELDS_INVALID:${handoff.blockers.join(',')}`);

  const underTierValues = retainAdmittedEvidence(readyInputs(), ['evidence-sold-1', 'evidence-liquidity-1']);
  const underTier = materialize('under-tier-input', underTierValues);
  const underTierOutput = path.join(temp, 'under-tier-output');
  execute(builder, [...underTier.args, contract, underTierOutput]);
  validateOutput(underTier, underTierOutput);
  requireCondition(!fs.existsSync(path.join(underTierOutput, 'snapshot-candidate.json')), 'ONE_SOLD_RECORD_WAS_ACCEPTED_AS_CANARY');
  const underTierBlockers = JSON.parse(fs.readFileSync(path.join(underTierOutput, 'immutable-blocker-package-v2.json')));
  requireCondition(underTierBlockers.blockers.some((blocker) => blocker.blocker_class === 'CURRENT_SOLD_SAMPLE_POLICY_TIER_NOT_SATISFIED'
    && blocker.affected_count === 4), 'CANARY_UNDER_TIER_BLOCKER_MISSING');

  const rejectedContractMutations = [
    ['required-evidence-field-removed', (value) => { value.current_sold_sample_governance.required_current_sold_evidence_fields.pop(); }],
    ['required-rights-field-removed', (value) => { value.current_sold_sample_governance.required_rights_assertion_fields = []; }],
    ['sample-plan-pre-registration-disabled', (value) => { value.current_sold_sample_governance.sample_plan_must_precede_observation = false; }],
  ];
  for (const [id, mutate] of rejectedContractMutations) {
    const mutatedContract = JSON.parse(fs.readFileSync(contract));
    mutate(mutatedContract);
    const mutatedContractPath = path.join(temp, `bad-${id}-contract.json`);
    write(mutatedContractPath, mutatedContract);
    execute(builder, [...ready.args, mutatedContractPath, path.join(temp, `bad-${id}-contract-output`)], false);
  }

  const badBlocked = path.join(temp, 'bad-blocked');
  fs.cpSync(blockedOutput, badBlocked, { recursive: true });
  write(path.join(badBlocked, 'snapshot-candidate.json'), { id: 'fabricated' });
  execute(validator, [badBlocked, ...blocked.args, contract], false);

  const badReady = path.join(temp, 'bad-ready');
  fs.cpSync(readyOutputA, badReady, { recursive: true });
  const evidencePath = path.join(badReady, 'evidence-package.json');
  const evidence = JSON.parse(fs.readFileSync(evidencePath));
  evidence.evidence_records.find((record) => record.evidence_id === 'evidence-sold-1').source_payload_sha256 = `sha256:${'8'.repeat(64)}`;
  write(evidencePath, evidence);
  execute(validator, [badReady, ...ready.args, contract], false);

  const badCohort = path.join(temp, 'bad-cohort');
  fs.cpSync(readyOutputA, badCohort, { recursive: true });
  const badCohortEvidencePath = path.join(badCohort, 'evidence-package.json');
  const badCohortEvidence = JSON.parse(fs.readFileSync(badCohortEvidencePath));
  badCohortEvidence.launch_cohort.sample_tier = 'CONTROL_ONLY_FUNCTIONAL';
  const badCohortWithoutDigest = { ...badCohortEvidence };
  delete badCohortWithoutDigest.package_payload_sha256;
  badCohortEvidence.package_payload_sha256 = digestObject(badCohortWithoutDigest);
  write(badCohortEvidencePath, badCohortEvidence);
  execute(validator, [badCohort, ...ready.args, contract], false);

  const badClaim = path.join(temp, 'bad-claim-cohort-binding');
  fs.cpSync(readyOutputA, badClaim, { recursive: true });
  const badClaimEvidencePath = path.join(badClaim, 'evidence-package.json');
  const badClaimEvidence = JSON.parse(fs.readFileSync(badClaimEvidencePath));
  badClaimEvidence.claims[1].evidence_refs = [...badClaimEvidence.claims[0].evidence_refs];
  const badClaimWithoutDigest = { ...badClaimEvidence };
  delete badClaimWithoutDigest.package_payload_sha256;
  badClaimEvidence.package_payload_sha256 = digestObject(badClaimWithoutDigest);
  write(badClaimEvidencePath, badClaimEvidence);
  const badClaimValidation = execute(validator, [badClaim, ...ready.args, contract], false);
  requireCondition(`${badClaimValidation.stdout}${badClaimValidation.stderr}`.includes('CLAIM_EVIDENCE_REF_SET_MUST_EQUAL_COHORT'),
    'CLAIM_COHORT_SET_MUTATION_REJECTED_FOR_WRONG_REASON');
  const badClaimHandoffPath = path.join(temp, 'bad-claim-handoff.json');
  execute(handoffValidator, [path.join(badClaim, 'snapshot-candidate.json'), badClaimEvidencePath, badClaimHandoffPath]);
  requireCondition(JSON.parse(fs.readFileSync(badClaimHandoffPath)).blockers.includes('CURRENT_SOLD_CLAIM_EVIDENCE_REF_SET_MUST_EQUAL_COHORT'),
    'CANONICAL_HANDOFF_ACCEPTED_CLAIM_COHORT_SET_DRIFT');

  const duplicateTransaction = path.join(temp, 'bad-duplicate-transaction');
  fs.cpSync(readyOutputA, duplicateTransaction, { recursive: true });
  const duplicateEvidencePath = path.join(duplicateTransaction, 'evidence-package.json');
  const duplicateEvidence = JSON.parse(fs.readFileSync(duplicateEvidencePath));
  const firstSold = duplicateEvidence.evidence_records.find((record) => record.evidence_id === 'evidence-sold-1');
  const secondSold = duplicateEvidence.evidence_records.find((record) => record.evidence_id === 'evidence-sold-2');
  for (const field of ['source_id', 'source_owner_id', 'factual_origin_id', 'source_record_id', 'asset_identity_id', 'market_venue_id', 'transaction_occurred_at', 'sold_price']) {
    secondSold[field] = clone(firstSold[field]);
  }
  secondSold.sample_unit_id = digestObject({
    source_id: secondSold.source_id,
    source_owner_id: secondSold.source_owner_id,
    factual_origin_id: secondSold.factual_origin_id,
    source_record_id: secondSold.source_record_id,
    asset_identity_id: secondSold.asset_identity_id,
    market_venue_id: secondSold.market_venue_id,
    transaction_occurred_at: secondSold.transaction_occurred_at,
    sold_price: secondSold.sold_price,
  });
  const duplicateCohortPayload = {
    cohort_class: duplicateEvidence.launch_cohort.cohort_class,
    sample_tier: duplicateEvidence.launch_cohort.sample_tier,
    cohort_mode: duplicateEvidence.launch_cohort.cohort_mode,
    sample_size: duplicateEvidence.launch_cohort.sample_size,
    terminal_state: duplicateEvidence.launch_cohort.terminal_state,
    event_ids: [...duplicateEvidence.launch_cohort.event_ids],
    event_digests: duplicateEvidence.evidence_records
      .filter((record) => record.market_observation_type === 'SOLD_TRANSACTION')
      .map(digestObject).sort(),
  };
  duplicateEvidence.launch_cohort.event_digests = duplicateCohortPayload.event_digests;
  duplicateEvidence.launch_cohort.cohort_digest = digestObject(duplicateCohortPayload);
  duplicateEvidence.launch_cohort.source_ids = [...new Set(duplicateEvidence.evidence_records
    .filter((record) => record.market_observation_type === 'SOLD_TRANSACTION').map((record) => record.source_id))].sort();
  duplicateEvidence.launch_cohort.source_binding_digest = digestObject({
    cohort_digest: duplicateEvidence.launch_cohort.cohort_digest,
    sample_plan_sha256: duplicateEvidence.launch_cohort.sample_plan_sha256,
    source_ids: duplicateEvidence.launch_cohort.source_ids,
  });
  const duplicateEvidenceWithoutDigest = { ...duplicateEvidence };
  delete duplicateEvidenceWithoutDigest.package_payload_sha256;
  duplicateEvidence.package_payload_sha256 = digestObject(duplicateEvidenceWithoutDigest);
  write(duplicateEvidencePath, duplicateEvidence);
  const duplicateSnapshotPath = path.join(duplicateTransaction, 'snapshot-candidate.json');
  const duplicateSnapshot = JSON.parse(fs.readFileSync(duplicateSnapshotPath));
  duplicateSnapshot.launch_cohort_digest = duplicateEvidence.launch_cohort.cohort_digest;
  const duplicateSnapshotWithoutDigest = { ...duplicateSnapshot };
  delete duplicateSnapshotWithoutDigest.snapshot_payload_sha256;
  duplicateSnapshot.snapshot_payload_sha256 = digestObject(duplicateSnapshotWithoutDigest);
  write(duplicateSnapshotPath, duplicateSnapshot);
  const duplicateHandoffPath = path.join(temp, 'bad-duplicate-transaction-handoff.json');
  execute(handoffValidator, [duplicateSnapshotPath, duplicateEvidencePath, duplicateHandoffPath]);
  requireCondition(JSON.parse(fs.readFileSync(duplicateHandoffPath)).blockers.includes('CURRENT_SOLD_CANONICAL_TRANSACTION_IDENTITY_DUPLICATE'),
    'CANONICAL_HANDOFF_ACCEPTED_DUPLICATE_TRANSACTION_WITH_REKEYED_EVIDENCE');

  const incompleteTransaction = path.join(temp, 'bad-incomplete-transaction-identity');
  fs.cpSync(readyOutputA, incompleteTransaction, { recursive: true });
  const incompleteEvidencePath = path.join(incompleteTransaction, 'evidence-package.json');
  const incompleteEvidence = JSON.parse(fs.readFileSync(incompleteEvidencePath));
  incompleteEvidence.evidence_records.find((record) => record.evidence_id === 'evidence-sold-1').grade_or_condition = '';
  const incompleteCohortPayload = {
    cohort_class: incompleteEvidence.launch_cohort.cohort_class,
    sample_tier: incompleteEvidence.launch_cohort.sample_tier,
    cohort_mode: incompleteEvidence.launch_cohort.cohort_mode,
    sample_size: incompleteEvidence.launch_cohort.sample_size,
    terminal_state: incompleteEvidence.launch_cohort.terminal_state,
    event_ids: [...incompleteEvidence.launch_cohort.event_ids],
    event_digests: incompleteEvidence.evidence_records
      .filter((record) => record.market_observation_type === 'SOLD_TRANSACTION')
      .map(digestObject).sort(),
  };
  incompleteEvidence.launch_cohort.event_digests = incompleteCohortPayload.event_digests;
  incompleteEvidence.launch_cohort.cohort_digest = digestObject(incompleteCohortPayload);
  incompleteEvidence.launch_cohort.source_binding_digest = digestObject({
    cohort_digest: incompleteEvidence.launch_cohort.cohort_digest,
    sample_plan_sha256: incompleteEvidence.launch_cohort.sample_plan_sha256,
    source_ids: incompleteEvidence.launch_cohort.source_ids,
  });
  const incompleteEvidenceWithoutDigest = { ...incompleteEvidence };
  delete incompleteEvidenceWithoutDigest.package_payload_sha256;
  incompleteEvidence.package_payload_sha256 = digestObject(incompleteEvidenceWithoutDigest);
  write(incompleteEvidencePath, incompleteEvidence);
  const incompleteSnapshotPath = path.join(incompleteTransaction, 'snapshot-candidate.json');
  const incompleteSnapshot = JSON.parse(fs.readFileSync(incompleteSnapshotPath));
  incompleteSnapshot.launch_cohort_digest = incompleteEvidence.launch_cohort.cohort_digest;
  const incompleteSnapshotWithoutDigest = { ...incompleteSnapshot };
  delete incompleteSnapshotWithoutDigest.snapshot_payload_sha256;
  incompleteSnapshot.snapshot_payload_sha256 = digestObject(incompleteSnapshotWithoutDigest);
  write(incompleteSnapshotPath, incompleteSnapshot);
  const incompleteHandoffPath = path.join(temp, 'bad-incomplete-transaction-handoff.json');
  execute(handoffValidator, [incompleteSnapshotPath, incompleteEvidencePath, incompleteHandoffPath]);
  requireCondition(JSON.parse(fs.readFileSync(incompleteHandoffPath)).blockers.includes('CURRENT_SOLD_TRANSACTION_IDENTITY_INVALID:evidence-sold-1'),
    'CANONICAL_HANDOFF_ACCEPTED_INCOMPLETE_TRANSACTION_IDENTITY');

  const invalidValues = finalize(readyInputs());
  invalidValues.p2Graph.market_events[0].evidence_record_digest = `sha256:${'0'.repeat(64)}`;
  finalize(invalidValues);
  const invalid = materialize('invalid-event-input', invalidValues);
  execute(builder, [...invalid.args, contract, path.join(temp, 'invalid-event-output')], false);

  const rejectedInputMutations = [
    ['hardcoded-p1-action-count', (values) => { values.p1Actions.action_count = 672; }, 'P1_ACTIONS_INVALID'],
    ['duplicate-p1-candidate-action-pair', (values) => { values.p1Actions.actions[0].action_type = values.p1Actions.actions[1].action_type; }, 'P1_ACTIONS_INVALID'],
    ['orphan-candidate', (values) => { values.p1Admission.candidates[0].candidate_id = 'candidate-orphan'; }],
    ['mission-swap', (values) => { values.p1Admission.candidates[0].mission_id = 'mission-1'; }],
    ['duplicate-candidate-id', (values) => { values.p0Registry.candidates[1].candidate_id = values.p0Registry.candidates[0].candidate_id; }],
    ['incomplete-action-binding', (values) => { values.p1Admission.candidates[0].required_next_actions.push('MISSING_ACTION'); }],
    ['fake-source-url', (values) => { values.p1Admission.candidates[0].admitted_evidence.source_url = 'https://evidence.example.test/fake'; }],
    ['purpose-rights-swap', (values) => { values.p1Admission.candidates[0].admitted_evidence.rights_assertion.purpose_binding_id = 'purpose-other'; }],
    ['rights-source-snapshot-unbound', (values) => { values.p1Admission.candidates[0].admitted_evidence.rights_assertion.source_content_snapshot_sha256 = `sha256:${'8'.repeat(64)}`; }],
    ['license-evidence-refs-missing', (values) => { delete values.p1Admission.candidates[0].admitted_evidence.license_evidence_refs; }],
    ['sample-purpose-mismatch', (values) => {
      values.p1Admission.candidates[0].sample_purpose = 'BOUNDED_INTERNAL_PRODUCT_PROOF';
      values.p1Admission.candidates[0].admitted_evidence.sample_purpose = 'BOUNDED_INTERNAL_PRODUCT_PROOF';
    }],
    ['claim-target-mismatch', (values) => {
      values.p1Admission.candidates[0].claim_target = 'CURRENT_PRICE';
      values.p1Admission.candidates[0].admitted_evidence.claim_target = 'CURRENT_PRICE';
    }],
    ['sample-plan-digest-missing', (values) => {
      delete values.p1Admission.candidates[0].sample_plan_sha256;
      delete values.p1Admission.candidates[0].admitted_evidence.sample_plan_sha256;
    }],
    ['sample-unit-duplicate', (values) => {
      const duplicate = values.p1Admission.candidates[0].sample_unit_id;
      values.p1Admission.candidates[1].sample_unit_id = duplicate;
      values.p1Admission.candidates[1].admitted_evidence.sample_unit_id = duplicate;
    }],
    ['sample-plan-post-observation', (values) => {
      values.p1Admission.candidates[0].sample_plan_registered_at = '2026-08-24T00:00:00.000Z';
      values.p1Admission.candidates[0].admitted_evidence.sample_plan_registered_at = '2026-08-24T00:00:00.000Z';
    }],
    ['sample-plan-policy-resealed-after-observation', (values) => {
      const plan = values.p1Admission.sample_plans[0];
      plan.plan_payload.sample_policy_digest = `sha256:${'8'.repeat(64)}`;
      plan.sample_plan_sha256 = digestObject(plan.plan_payload);
      plan.registration_receipt.sample_plan_sha256 = plan.sample_plan_sha256;
      plan.registration_receipt.immutable_artifact_ref = `artifact:${plan.sample_plan_sha256}`;
      const receiptPayload = { ...plan.registration_receipt };
      delete receiptPayload.registration_receipt_sha256;
      plan.registration_receipt.registration_receipt_sha256 = digestObject(receiptPayload);
      for (const candidate of values.p1Admission.candidates.filter((value) => value.evidence_class === 'CURRENT_SOLD_TRANSACTION' && value.evidence_admitted)) {
        candidate.sample_plan_sha256 = plan.sample_plan_sha256;
        candidate.sample_plan_registration_receipt_sha256 = plan.registration_receipt.registration_receipt_sha256;
        candidate.sample_plan_artifact_ref = plan.registration_receipt.immutable_artifact_ref;
        candidate.admitted_evidence.sample_plan_sha256 = plan.sample_plan_sha256;
        candidate.admitted_evidence.sample_plan_registration_receipt_sha256 = plan.registration_receipt.registration_receipt_sha256;
        candidate.admitted_evidence.sample_plan_artifact_ref = plan.registration_receipt.immutable_artifact_ref;
        const event = values.p2Graph.market_events.find((value) => value.evidence_id === candidate.admitted_evidence.evidence_id);
        event.evidence_record_digest = digestObject(candidate.admitted_evidence);
      }
    }, 'P1_SAMPLE_PLAN_POLICY_PURPOSE_CLAIM_BINDING_INVALID'],
    ['sample-plan-registered-at-observation', (values) => {
      const plan = values.p1Admission.sample_plans[0];
      plan.plan_payload.registered_at = '2026-08-23T00:00:00.000Z';
      plan.sample_plan_sha256 = digestObject(plan.plan_payload);
      plan.registration_receipt.sample_plan_sha256 = plan.sample_plan_sha256;
      plan.registration_receipt.registered_at = plan.plan_payload.registered_at;
      plan.registration_receipt.immutable_artifact_ref = `artifact:${plan.sample_plan_sha256}`;
      const receiptPayload = { ...plan.registration_receipt };
      delete receiptPayload.registration_receipt_sha256;
      plan.registration_receipt.registration_receipt_sha256 = digestObject(receiptPayload);
      for (const candidate of values.p1Admission.candidates.filter((value) => value.evidence_class === 'CURRENT_SOLD_TRANSACTION' && value.evidence_admitted)) {
        candidate.sample_plan_sha256 = plan.sample_plan_sha256;
        candidate.sample_plan_registration_receipt_sha256 = plan.registration_receipt.registration_receipt_sha256;
        candidate.sample_plan_artifact_ref = plan.registration_receipt.immutable_artifact_ref;
        candidate.sample_plan_registered_at = plan.plan_payload.registered_at;
        candidate.admitted_evidence.sample_plan_sha256 = plan.sample_plan_sha256;
        candidate.admitted_evidence.sample_plan_registration_receipt_sha256 = plan.registration_receipt.registration_receipt_sha256;
        candidate.admitted_evidence.sample_plan_artifact_ref = plan.registration_receipt.immutable_artifact_ref;
        candidate.admitted_evidence.sample_plan_registered_at = plan.plan_payload.registered_at;
        const event = values.p2Graph.market_events.find((value) => value.evidence_id === candidate.admitted_evidence.evidence_id);
        event.evidence_record_digest = digestObject(candidate.admitted_evidence);
      }
    }, 'CURRENT_SOLD_SAMPLE_PLAN_NOT_PRE_REGISTERED'],
    ['duplicate-transaction-rekeyed-sample-unit', (values) => {
      const first = values.p1Admission.candidates[0].admitted_evidence;
      const secondCandidate = values.p1Admission.candidates[1];
      const second = secondCandidate.admitted_evidence;
      for (const field of ['source_id', 'source_owner_id', 'factual_origin_id', 'source_record_id', 'asset_identity_id', 'market_venue_id', 'transaction_occurred_at', 'sold_price']) {
        second[field] = clone(first[field]);
      }
      second.sample_unit_id = `sha256:${'f'.repeat(64)}`;
      second.rights_assertion.source_owner_id = second.source_owner_id;
      for (const field of ['source_id', 'source_owner_id', 'factual_origin_id', 'source_record_id', 'sample_unit_id']) secondCandidate[field] = second[field];
      values.p2Graph.market_events.find((value) => value.evidence_id === second.evidence_id).evidence_record_digest = digestObject(second);
    }, 'CURRENT_SOLD_CANONICAL_TRANSACTION_IDENTITY_MISMATCH'],
    ['sold-time-after-observation', (values) => { values.p1Admission.candidates[0].admitted_evidence.transaction_occurred_at = '2026-08-24T00:00:00.000Z'; }],
    ['stale-sold-time', (values) => { values.p1Admission.candidates[0].admitted_evidence.transaction_occurred_at = '2025-08-22T00:00:00.000Z'; }],
    ['stale-upstream', (values) => { values.upstreamBinding.readback_observed_at = '2026-08-26T00:10:00.000Z'; }],
    ['upstream-provider-download-digest-mismatch', (values) => { values.upstreamBinding.p2_downloaded_archive_sha256 = `sha256:${'4'.repeat(64)}`; }],
  ];
  for (const [id, mutate, expectedCode] of rejectedInputMutations) {
    const values = finalize(readyInputs());
    mutate(values);
    finalize(values);
    const mutated = materialize(`bad-${id}-input`, values);
    const result = execute(builder, [...mutated.args, contract, path.join(temp, `bad-${id}-output`)], false);
    if (expectedCode) requireCondition(`${result.stdout}${result.stderr}`.includes(expectedCode), `INPUT_MUTATION_REJECTED_FOR_WRONG_REASON:${id}`);
  }

  const badAttestation = path.join(temp, 'bad-attestation');
  fs.cpSync(readyOutputA, badAttestation, { recursive: true });
  const trackBPath = path.join(badAttestation, 'track-b-handoff-readiness-v2.json');
  const badTrackB = JSON.parse(fs.readFileSync(trackBPath));
  badTrackB.immutable_storage_verified = true;
  badTrackB.artifact_attestation_verified = true;
  badTrackB.track_b_submission_eligible = true;
  write(trackBPath, badTrackB);
  execute(validator, [badAttestation, ...ready.args, contract], false);

  execute(builder, [...ready.args, contract, readyOutputA], false);
  console.log(JSON.stringify({
    id: 'kidults-asi-snapshot-readiness-factory-liveness-test-v2',
    state: 'VERIFIED_PASS',
    blocked_non_generation_verified: true,
    lawful_ready_pair_generation_verified: true,
    generated_pair_state: 'CONTENT_ADDRESSED_STORAGE_AND_ATTESTATION_PENDING',
    deterministic_pair_generation_verified: true,
    cross_timezone_locale_replay_verified: true,
    atomic_directory_commit_verified: true,
    immutable_storage_verified: false,
    artifact_attestation_verified: false,
    canonical_handoff_pair_digest_verified: true,
    canonical_handoff_remains_blocked: true,
    under_tier_one_sold_record_blocked: true,
    exact_claim_cohort_set_equality_verified: true,
    canonical_transaction_identity_deduplication_verified: true,
    handoff_transaction_identity_completeness_verified: true,
    sample_plan_policy_sealing_verified: true,
    sample_plan_strict_pre_observation_verified: true,
    canonical_policy_tier_weakening_rejected: true,
    canonical_canary_tier: 'CANARY',
    canonical_canary_sample_size: 5,
    negative_mutation_cases: 36,
    track_b_assessment_started: false,
    public_release: 'HOLD',
    production: 'HOLD',
  }, null, 2));
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
