#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { digestObject, hashText, stableJson } from './lib/asi-snapshot-readiness-factory-v2.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const builder = path.join(root, 'scripts/kidults/source-intelligence/build-asi-snapshot-readiness-factory-v2.mjs');
const validator = path.join(root, 'scripts/kidults/source-intelligence/validate-asi-snapshot-readiness-factory-v2.mjs');
const handoffValidator = path.join(root, 'scripts/kidults/poc/validate-candidate-evidence-handoff-r2.mjs');
const contract = path.join(root, 'coordination/kidults/source-intelligence/asi-snapshot-readiness-factory-contract-v2.json');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-p3-liveness-'));
const requireCondition = (condition, code) => { if (!condition) throw new Error(code); };
const clone = (value) => JSON.parse(JSON.stringify(value));
const write = (file, value) => fs.writeFileSync(file, stableJson(value));

function evidenceRecord(id, evidenceClass, observationType, sourceByte) {
  const record = {
    evidence_id: id,
    evidence_class: evidenceClass,
    purpose_binding_id: `purpose-${id}`,
    source_owner_id: `owner-${id}`,
    factual_origin_id: `origin-${id}`,
    rights_state: 'ALLOW',
    source_url: `https://market-evidence.kidults.com/${id}`,
    source_object_uri: `https://evidence-archive.kidults.com/objects/${sourceByte.repeat(64)}`,
    source_payload_sha256: `sha256:${sourceByte.repeat(64)}`,
    rights_assertion: {
      assertion_id: `rights-${id}`,
      source_owner_id: `owner-${id}`,
      purpose_binding_id: `purpose-${id}`,
      jurisdiction: 'US',
      rights_atoms: ['COLLECT', 'STORE', 'DERIVE', 'DISPLAY'],
      effective_at: '2026-08-01T00:00:00.000Z',
      expires_at: '2026-12-31T00:00:00.000Z',
      document_sha256: `sha256:${sourceByte.repeat(64)}`,
      evidence_uri: `https://rights-archive.kidults.com/${id}`,
    },
    observed_at: '2026-08-23T00:00:00.000Z',
    valid_until: '2026-09-01T00:00:00.000Z',
    temporality: 'CURRENT_MARKET',
    market_observation_type: observationType,
    evidence_strength: 1,
    unresolved_critical_contradiction_count: 0,
  };
  if (evidenceClass === 'CURRENT_SOLD_TRANSACTION') Object.assign(record, {
    transaction_occurred_at: '2026-08-22T00:00:00.000Z',
    asset_identity_id: `asset-${id}`,
    market_venue_id: 'venue-authorized-1',
    grade_or_condition: 'GRADED_9',
    sold_price: { amount: 125.5, currency: 'USD' },
  });
  else Object.assign(record, {
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
  const p0Registry = { id: 'kidults-asi-p0b-source-candidate-registry-v1', version: '1.0.0', canonical_candidate_count: 96, unique_host_count: 96, candidates: sourceCandidates };
  const bindings = Array.from({ length: 192 }, (_, index) => ({
    binding_id: `binding-${index}`,
    mission_id: `mission-${index}`,
    market_cell_id: `market-${index}`,
    evidence_class: index % 2 ? 'LIQUIDITY_TIME_TO_SALE_EXPOSURE' : 'CURRENT_SOLD_TRANSACTION',
    slot_bindings: Array.from({ length: 3 }, (_, slot) => ({ candidate_id: `candidate-${(index * 3 + slot) % 96}` })),
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
    grain_id: `grain-${index}`, candidate_id: `candidate-${index % 96}`, mission_id: `mission-${Math.floor(index / 3)}`,
    market_cell_id: `market-${Math.floor(index / 3)}`,
    market_semantics_verified: true, reason_codes: [],
  }));
  const p1Gate = {
    id: 'kidults-asi-p1-gate1-source-safety-decisions-v1', version: '1.0.0', decision_count: 576,
    pass_count: 576, hold_count: 0, reject_count: 0, decisions,
  };
  const sold = evidenceRecord('evidence-sold-1', 'CURRENT_SOLD_TRANSACTION', 'SOLD_TRANSACTION', 'a');
  const liquidity = evidenceRecord('evidence-liquidity-1', 'LIQUIDITY_TIME_TO_SALE_EXPOSURE', 'LIQUIDITY_EXPOSURE', 'b');
  const candidates = Array.from({ length: 576 }, (_, index) => {
    const record = index === 0 ? sold : index === 3 ? liquidity : null;
    const missionIndex = Math.floor(index / 3);
    return {
      admission_candidate_id: `admission-${index}`,
      candidate_id: `candidate-${index % 96}`,
      grain_id: `grain-${index}`,
      mission_id: `mission-${missionIndex}`,
      market_cell_id: `market-${missionIndex}`,
      purpose_binding_id: record?.purpose_binding_id || `purpose-candidate-${index}`,
      source_owner_id: record?.source_owner_id || `owner-candidate-${index}`,
      factual_origin_id: record?.factual_origin_id || `origin-candidate-${index}`,
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
    admitted_count: 2, candidates,
  };
  const actionTypes = ['OWNER', 'RIGHTS', 'ACCESS', 'SEMANTICS', 'REGION', 'SCHEMA', 'ORIGIN'];
  const actions = Array.from({ length: 672 }, (_, index) => {
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
  const p1Actions = { id: 'kidults-asi-p1-preflight-action-queue-v1', version: '1.0.0', action_count: 672, actions };
  const p1Manifest = { id: 'kidults-asi-p1-source-preflight-manifest-v1', version: '1.0.0' };
  const marketEvents = [sold, liquidity].map((record, index) => ({
    event_id: `event-${index}`, evidence_id: record.evidence_id, rights_state: 'ALLOW',
    observed_at: record.observed_at, source_payload_sha256: record.source_payload_sha256,
    evidence_record_digest: digestObject(record),
  }));
  const p2Graph = {
    id: 'kidults-owned-source-intelligence-graph-v2', version: '2.0.0', as_of: '2026-08-24T00:00:00.000Z',
    node_count: 1, edge_count: 0, nodes: [], edges: [], evidence_admitted: 2,
    market_events_created: 2, market_events: marketEvents,
  };
  const p2Quality = { id: 'kidults-owned-source-intelligence-quality-v2', version: '2.0.0', state: 'VERIFIED_GRAPH_INTEGRITY_READY' };
  const p2Value = { id: 'kidults-owned-source-intelligence-value-receipt-v2', version: '2.0.0', source_intelligence_graph_is_market_evidence_graph: true };
  const p2Manifest = {
    id: 'kidults-owned-source-intelligence-manifest-v2', version: '2.0.0', graph_digest: null,
    results: { assigned_unique_candidates: 576, evidence_admitted: 2, market_events_created: 2 },
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

  const badBlocked = path.join(temp, 'bad-blocked');
  fs.cpSync(blockedOutput, badBlocked, { recursive: true });
  write(path.join(badBlocked, 'snapshot-candidate.json'), { id: 'fabricated' });
  execute(validator, [badBlocked, ...blocked.args, contract], false);

  const badReady = path.join(temp, 'bad-ready');
  fs.cpSync(readyOutputA, badReady, { recursive: true });
  const evidencePath = path.join(badReady, 'evidence-package.json');
  const evidence = JSON.parse(fs.readFileSync(evidencePath));
  evidence.evidence_records[0].source_payload_sha256 = `sha256:${'f'.repeat(64)}`;
  write(evidencePath, evidence);
  execute(validator, [badReady, ...ready.args, contract], false);

  const invalidValues = finalize(readyInputs());
  invalidValues.p2Graph.market_events[0].evidence_record_digest = `sha256:${'0'.repeat(64)}`;
  finalize(invalidValues);
  const invalid = materialize('invalid-event-input', invalidValues);
  execute(builder, [...invalid.args, contract, path.join(temp, 'invalid-event-output')], false);

  const rejectedInputMutations = [
    ['orphan-candidate', (values) => { values.p1Admission.candidates[0].candidate_id = 'candidate-orphan'; }],
    ['mission-swap', (values) => { values.p1Admission.candidates[0].mission_id = 'mission-1'; }],
    ['duplicate-candidate-id', (values) => { values.p0Registry.candidates[1].candidate_id = values.p0Registry.candidates[0].candidate_id; }],
    ['incomplete-action-binding', (values) => { values.p1Admission.candidates[0].required_next_actions.push('MISSING_ACTION'); }],
    ['fake-source-url', (values) => { values.p1Admission.candidates[0].admitted_evidence.source_url = 'https://evidence.example.test/fake'; }],
    ['purpose-rights-swap', (values) => { values.p1Admission.candidates[0].admitted_evidence.rights_assertion.purpose_binding_id = 'purpose-other'; }],
    ['sold-time-after-observation', (values) => { values.p1Admission.candidates[0].admitted_evidence.transaction_occurred_at = '2026-08-24T00:00:00.000Z'; }],
    ['stale-sold-time', (values) => { values.p1Admission.candidates[0].admitted_evidence.transaction_occurred_at = '2025-08-22T00:00:00.000Z'; }],
    ['stale-upstream', (values) => { values.upstreamBinding.readback_observed_at = '2026-08-26T00:10:00.000Z'; }],
    ['upstream-provider-download-digest-mismatch', (values) => { values.upstreamBinding.p2_downloaded_archive_sha256 = `sha256:${'4'.repeat(64)}`; }],
  ];
  for (const [id, mutate] of rejectedInputMutations) {
    const values = finalize(readyInputs());
    mutate(values);
    finalize(values);
    const mutated = materialize(`bad-${id}-input`, values);
    execute(builder, [...mutated.args, contract, path.join(temp, `bad-${id}-output`)], false);
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
    negative_mutation_cases: 15,
    track_b_assessment_started: false,
    public_release: 'HOLD',
    production: 'HOLD',
  }, null, 2));
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
