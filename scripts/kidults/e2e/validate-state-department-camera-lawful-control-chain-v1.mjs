#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { readPortalProjection } from '../../../apps/kidults-enterprise-staging/public/portal-r001/projection-store.js';
import {
  assessmentPayloadSha256,
  candidatePayloadSha256,
  CONTROL_CONTRACT_PATH,
  controlPayloadSha256,
  ensure,
  evidencePayloadSha256,
  exactKeys,
  hashText,
  pairDigestFor,
  readJson,
  same,
  stableJson,
  validateControlContract,
  validateControlPair,
  validateControlProjection,
  validateMockAssessment,
  validateUpstreamLineage,
} from './lawful-control-chain-common-v1.mjs';

const REPOSITORY_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
ensure(process.cwd() === REPOSITORY_ROOT, 'CONTROL_CHAIN_VALIDATOR_MUST_RUN_FROM_REPOSITORY_ROOT');

const OBSERVATION_PATH = 'coordination/kidults/source-intelligence/state-department-camera-auction-observation-v1.json';
const SOURCE_CONTRACT_PATH = 'coordination/kidults/source-intelligence/asi-state-department-camera-evidence-contract-v1.json';
const PAIR_BUILDER = 'scripts/kidults/e2e/build-state-department-camera-lawful-control-pair-v1.mjs';
const MOCK_ASSESSOR = 'scripts/kidults/e2e/assess-state-department-camera-control-interface-v1.mjs';
const PROJECTION_BUILDER = 'scripts/kidults/e2e/build-state-department-camera-control-projection-v1.mjs';
const HANDOFF_VALIDATOR = 'scripts/kidults/poc/validate-candidate-evidence-handoff-r2.mjs';
const STAGING_VALIDATOR = 'scripts/kidults/runtime/validate-staging-real-workload-admission-v1.mjs';
const DRY_RUN_VALIDATOR = 'scripts/kidults/projection/validate-projection-dry-run-v1.mjs';
const LEGACY_QUARANTINE_VALIDATOR = 'scripts/kidults/e2e/validate-black-lotus-legacy-quarantine-v1.mjs';
const UPSTREAM_LINEAGE_EMITTER = 'scripts/kidults/e2e/emit-state-department-camera-upstream-lineage-v1.mjs';
const WORKFLOW_PATH = '.github/workflows/kidults-e2e-state-department-camera-lawful-control-v1.yml';

const child = (script, args = [], env = {}) => spawnSync(process.execPath, [script, ...args], {
  cwd: REPOSITORY_ROOT,
  encoding: 'utf8',
  env: { ...process.env, ...env },
});
const childOutput = (result) => `${result.stdout || ''}\n${result.stderr || ''}`;
const requireChildPass = (name, script, args = [], env = {}) => {
  const result = child(script, args, env);
  ensure(result.status === 0, `${name}_FAILED:${childOutput(result).trim()}`);
  return result;
};
const requireChildReject = (name, script, args, expectedCode, env = {}) => {
  const result = child(script, args, env);
  ensure(result.status !== 0, `${name}_FALSE_ACCEPTANCE`);
  ensure(childOutput(result).includes(expectedCode), `${name}_WRONG_REJECTION:${childOutput(result).trim()}`);
  return result;
};
const requireReject = (name, fn, expectedCode) => {
  let error = null;
  try { fn(); } catch (caught) { error = caught; }
  ensure(error, `${name}_FALSE_ACCEPTANCE`);
  ensure(String(error.message).includes(expectedCode), `${name}_WRONG_REJECTION:${error.message}`);
};
const clone = (value) => structuredClone(value);

const controlContract = readJson(CONTROL_CONTRACT_PATH);
const observation = readJson(OBSERVATION_PATH);
const sourceContract = readJson(SOURCE_CONTRACT_PATH);
validateControlContract(controlContract);

const schemaSpecifications = [
  [controlContract.track_a_control_pair.candidate_schema, 'kidults_lawful_control_snapshot_candidate', 'record_type'],
  [controlContract.track_a_control_pair.evidence_schema, 'kidults_lawful_control_evidence_package', 'record_type'],
  [controlContract.track_b_contract_mock.schema, 'kidults_track_b_contract_mock_assessment', 'record_type'],
  [controlContract.projection_control.schema, 'kidults_non_promotable_control_projection', 'record_type'],
  [controlContract.validation.upstream_lineage_schema, 'kidults-state-department-camera-upstream-lineage-v1', 'id'],
];
for (const [schemaPath, discriminator, field] of schemaSpecifications) {
  const schema = readJson(schemaPath);
  ensure(schema.$schema === 'https://json-schema.org/draft/2020-12/schema', `CONTROL_SCHEMA_DRAFT_INVALID:${schemaPath}`);
  ensure(schema.type === 'object' && schema.additionalProperties === false, `CONTROL_SCHEMA_TOP_LEVEL_NOT_STRICT:${schemaPath}`);
  ensure(Array.isArray(schema.required) && new Set(schema.required).size === schema.required.length, `CONTROL_SCHEMA_REQUIRED_FIELDS_INVALID:${schemaPath}`);
  ensure(schema.properties?.[field]?.const === discriminator, `CONTROL_SCHEMA_DISCRIMINATOR_INVALID:${schemaPath}`);
}

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-state-department-control-validation-'));
let pairDirectory;
let assessmentPath;
let projectionPath;
let upstreamLineagePath;
const supplied = process.argv.slice(2);
ensure([0, 3, 4].includes(supplied.length), 'USAGE: validate-state-department-camera-lawful-control-chain-v1.mjs [<pair-directory> <mock-assessment.json> <control-projection.json> [<upstream-lineage.json>]]');

const headResult = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: REPOSITORY_ROOT, encoding: 'utf8' });
ensure(headResult.status === 0 && /^[a-f0-9]{40}\n?$/.test(headResult.stdout), 'CONTROL_VALIDATOR_HEAD_SHA_UNAVAILABLE');
const repositoryHeadSha = headResult.stdout.trim();

try {
  if (supplied.length === 0) {
    const pairOne = path.join(temporaryRoot, 'pair-run-1');
    const pairTwo = path.join(temporaryRoot, 'pair-run-2');
    requireChildPass('CONTROL_PAIR_BUILD_RUN_1', PAIR_BUILDER, [OBSERVATION_PATH, SOURCE_CONTRACT_PATH, CONTROL_CONTRACT_PATH, pairOne]);
    requireChildPass('CONTROL_PAIR_BUILD_RUN_2', PAIR_BUILDER, [OBSERVATION_PATH, SOURCE_CONTRACT_PATH, CONTROL_CONTRACT_PATH, pairTwo]);
    for (const file of controlContract.track_a_control_pair.output_files) {
      ensure(fs.readFileSync(path.join(pairOne, file), 'utf8') === fs.readFileSync(path.join(pairTwo, file), 'utf8'), `CONTROL_PAIR_NONDETERMINISTIC:${file}`);
    }
    pairDirectory = pairOne;
    assessmentPath = path.join(temporaryRoot, controlContract.track_b_contract_mock.output_file);
    projectionPath = path.join(temporaryRoot, controlContract.projection_control.output_file);
    upstreamLineagePath = path.join(temporaryRoot, 'upstream-evidence-lineage.json');
    requireChildPass('CONTROL_UPSTREAM_VALIDATION_ONLY_LINEAGE', UPSTREAM_LINEAGE_EMITTER, ['validation-only', repositoryHeadSha, upstreamLineagePath]);
    requireChildPass('CONTROL_MOCK_ASSESSMENT_BUILD', MOCK_ASSESSOR, [
      path.join(pairDirectory, 'snapshot-candidate.json'),
      path.join(pairDirectory, 'evidence-package.json'),
      assessmentPath,
    ]);
    requireChildPass('CONTROL_PROJECTION_BUILD', PROJECTION_BUILDER, [
      path.join(pairDirectory, 'snapshot-candidate.json'),
      path.join(pairDirectory, 'evidence-package.json'),
      assessmentPath,
      projectionPath,
    ]);
  } else {
    [pairDirectory, assessmentPath, projectionPath] = supplied.slice(0, 3).map((value) => path.resolve(value));
    upstreamLineagePath = supplied[3] ? path.resolve(supplied[3]) : path.join(temporaryRoot, 'upstream-evidence-lineage.json');
    if (!supplied[3]) requireChildPass('CONTROL_UPSTREAM_VALIDATION_ONLY_LINEAGE', UPSTREAM_LINEAGE_EMITTER, ['validation-only', repositoryHeadSha, upstreamLineagePath]);
  }

  ensure(path.basename(assessmentPath) === controlContract.track_b_contract_mock.output_file, 'CONTROL_VALIDATOR_MOCK_ASSESSMENT_FILENAME_INVALID');
  ensure(path.basename(projectionPath) === controlContract.projection_control.output_file, 'CONTROL_VALIDATOR_PROJECTION_FILENAME_INVALID');
  ensure(!fs.existsSync(path.join(path.dirname(assessmentPath), 'rankability-assessment.json')), 'CONTROL_VALIDATOR_OFFICIAL_TRACK_B_FILENAME_PRESENT');

  const candidatePath = path.join(pairDirectory, 'snapshot-candidate.json');
  const evidencePath = path.join(pairDirectory, 'evidence-package.json');
  const manifestPath = path.join(pairDirectory, 'track-a-control-manifest.json');
  const candidateText = fs.readFileSync(candidatePath, 'utf8');
  const evidenceText = fs.readFileSync(evidencePath, 'utf8');
  const candidate = JSON.parse(candidateText);
  const evidence = JSON.parse(evidenceText);
  const assessment = readJson(assessmentPath);
  const projection = readJson(projectionPath);
  const upstreamLineage = readJson(upstreamLineagePath);
  const upstreamBinding = validateUpstreamLineage(upstreamLineage, controlContract, {
    expectedSourceSha: repositoryHeadSha,
    requireCanonical: process.env.KIDULTS_REQUIRE_CANONICAL_UPSTREAM_LINEAGE === '1',
  });
  const pair = validateControlPair(candidate, evidence, controlContract);
  validateMockAssessment(assessment, candidate, evidence, controlContract);
  validateControlProjection(projection, candidate, evidence, assessment, controlContract);

  const manifest = readJson(manifestPath);
  exactKeys(manifest, [
    'id', 'version', 'state', 'as_of', 'fixture_type', 'source_projection_sha256', 'snapshot_id',
    'evidence_package_id', 'candidate_payload_sha256', 'evidence_package_payload_sha256', 'pair_digest',
    'output_files', 'files_written', 'canonical_handoff_eligible', 'official_track_b_started',
    'real_product_value_proof', 'approved_projection', 'canonical_truth_counters_mutated', 'public_release',
    'production', 'g5',
  ], 'CONTROL_PAIR_MANIFEST');
  ensure(manifest.version === '1.0.0' && manifest.state === 'VERIFIED_NON_PROMOTABLE_CONTROL_PAIR', 'CONTROL_PAIR_MANIFEST_STATE_INVALID');
  ensure(manifest.as_of === candidate.as_of && manifest.fixture_type === candidate.fixture_type, 'CONTROL_PAIR_MANIFEST_TIME_OR_FIXTURE_INVALID');
  ensure(manifest.source_projection_sha256 === controlContract.authoritative_source.source_projection_sha256, 'CONTROL_PAIR_MANIFEST_SOURCE_DIGEST_INVALID');
  ensure(manifest.snapshot_id === candidate.snapshot_id && manifest.evidence_package_id === evidence.evidence_package_id, 'CONTROL_PAIR_MANIFEST_ID_REBINDING');
  ensure(manifest.candidate_payload_sha256 === pair.candidateDigest && manifest.evidence_package_payload_sha256 === pair.evidenceDigest && manifest.pair_digest === pair.pairDigest, 'CONTROL_PAIR_MANIFEST_PAYLOAD_BINDING_INVALID');
  ensure(same(manifest.files_written, controlContract.track_a_control_pair.output_files), 'CONTROL_PAIR_MANIFEST_OUTPUT_SET_INVALID');
  ensure(same(manifest.output_files.map(({ name }) => name), ['snapshot-candidate.json', 'evidence-package.json']), 'CONTROL_PAIR_MANIFEST_CONTENT_ADDRESSED_FILE_SET_INVALID');
  for (const [name, text] of [['snapshot-candidate.json', candidateText], ['evidence-package.json', evidenceText]]) {
    const file = manifest.output_files.find((entry) => entry.name === name);
    ensure(file.sha256 === hashText(text) && file.bytes === Buffer.byteLength(text), `CONTROL_PAIR_MANIFEST_FILE_RECEIPT_INVALID:${name}`);
  }
  ensure(manifest.canonical_handoff_eligible === false && manifest.official_track_b_started === false && manifest.real_product_value_proof === false && manifest.approved_projection === false && manifest.canonical_truth_counters_mutated === false, 'CONTROL_PAIR_MANIFEST_FALSE_PROMOTION');
  ensure(manifest.public_release === 'HOLD' && manifest.production === 'HOLD' && manifest.g5 === 'HOLD', 'CONTROL_PAIR_MANIFEST_PROTECTED_GATES_INVALID');

  const portalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => clone(projection) });
    const portal = await readPortalProjection({ url: 'control://lawful-camera', controlUrl: 'control://lawful-camera' });
    ensure(portal.fixture_type === 'NON_PROMOTABLE_CONTROL' && portal.projection.state === 'NO_PROJECTION' && portal.release.state === 'HOLD', 'CONTROL_PORTAL_NO_PROJECTION_BOUNDARY_INVALID');
    ensure(same(portal.objects, []) && same(portal.evidence, []) && same(portal.signals, []) && same(portal.overview, []), 'CONTROL_PORTAL_SOURCE_CONTENT_EXPOSED');
    const portalText = JSON.stringify(portal);
    for (const forbidden of ['NIKON CAMERA', 'Nikon D5600', 'Nikon D90', 'QAR', '2110', '101', observation.source.source_url]) {
      ensure(!portalText.includes(forbidden), `CONTROL_PORTAL_SOURCE_FACT_LEAKAGE:${forbidden}`);
    }
  } finally {
    globalThis.fetch = portalFetch;
  }

  const passedMutationFamilies = new Set();
  const negativeReceipts = [];
  const recordNegative = (family, detail) => {
    passedMutationFamilies.add(family);
    negativeReceipts.push({ family, detail, result: 'REJECTED_AS_REQUIRED' });
  };
  const runObservationMutation = (detail, mutate, expectedCode) => {
    const mutationDirectory = fs.mkdtempSync(path.join(temporaryRoot, 'observation-mutation-'));
    const mutatedObservationPath = path.join(mutationDirectory, 'observation.json');
    const mutatedSourceContractPath = path.join(mutationDirectory, 'source-contract.json');
    const mutatedControlContractPath = path.join(mutationDirectory, 'control-contract.json');
    const mutatedObservation = clone(observation);
    mutate(mutatedObservation);
    const mutatedSourceContract = clone(sourceContract);
    const mutatedControlContract = clone(controlContract);
    const observationRepositoryPath = path.relative(REPOSITORY_ROOT, mutatedObservationPath);
    const sourceContractRepositoryPath = path.relative(REPOSITORY_ROOT, mutatedSourceContractPath);
    mutatedSourceContract.authoritative_inputs.observation = observationRepositoryPath;
    mutatedControlContract.authoritative_source.observation_path = observationRepositoryPath;
    mutatedControlContract.authoritative_source.source_contract_path = sourceContractRepositoryPath;
    fs.writeFileSync(mutatedObservationPath, stableJson(mutatedObservation));
    fs.writeFileSync(mutatedSourceContractPath, stableJson(mutatedSourceContract));
    fs.writeFileSync(mutatedControlContractPath, stableJson(mutatedControlContract));
    requireChildReject(detail, PAIR_BUILDER, [
      mutatedObservationPath,
      mutatedSourceContractPath,
      mutatedControlContractPath,
      path.join(mutationDirectory, 'forbidden-output'),
    ], expectedCode);
  };

  runObservationMutation('SOURCE_PROJECTION_DIGEST_MISMATCH', (mutated) => { mutated.source_projection.title = 'CLAIM DRIFT'; }, 'CONTROL_BUILDER_SOURCE_PROJECTION_DIGEST_MISMATCH');
  recordNegative('SOURCE_PROJECTION_DIGEST_MISMATCH', 'normalized source fact changed without rebinding its authoritative digest');

  runObservationMutation('RIGHTS_ALLOW_REMOVAL', (mutated) => { mutated.rights.transform = 'UNKNOWN'; }, 'CONTROL_BUILDER_RIGHTS_BOUNDARY_INVALID');
  runObservationMutation('RIGHTS_REVIEW_EXPIRY', (mutated) => { mutated.rights.review_due_at = '2026-08-01T00:00:00Z'; }, 'CONTROL_BUILDER_RIGHTS_REVIEW_EXPIRED');
  recordNegative('RIGHTS_REMOVAL_OR_EXPIRY', 'transform ALLOW removal and expired review were independently rejected');

  runObservationMutation('REFERENCE_CLAIM_INFLATION', (mutated) => { mutated.semantic_boundary.verified_sold_event = true; }, 'CONTROL_BUILDER_REFERENCE_CLAIM_INFLATION_VERIFIED_SOLD_EVENT');
  const inflatedClaimCandidate = clone(candidate);
  const inflatedClaimEvidence = clone(evidence);
  inflatedClaimEvidence.evidence_records[0].claim_ceiling.allowed.push('REPRESENTATIVE_MARKET_VALUE');
  inflatedClaimEvidence.evidence_package_payload_sha256 = evidencePayloadSha256(inflatedClaimEvidence);
  const inflatedClaimPairDigest = pairDigestFor(inflatedClaimCandidate, inflatedClaimEvidence);
  inflatedClaimCandidate.pair_digest = inflatedClaimPairDigest;
  inflatedClaimEvidence.pair_digest = inflatedClaimPairDigest;
  requireReject('REFERENCE_PAIR_CLAIM_CEILING_INFLATION', () => validateControlPair(inflatedClaimCandidate, inflatedClaimEvidence, controlContract), 'CONTROL_EVIDENCE_CLAIM_CEILING_DIGEST_MISMATCH');
  recordNegative('REFERENCE_CLAIM_INFLATION', 'verified-sold source inflation and a coherently rehashed pair claim-ceiling expansion were rejected');

  runObservationMutation('PUBLIC_PRODUCTION_OR_G5_PROMOTION', (mutated) => { mutated.public_release = 'ALLOW'; }, 'CONTROL_BUILDER_OBSERVATION_PROTECTED_GATES_INVALID');
  recordNegative('PUBLIC_PRODUCTION_OR_G5_PROMOTION', 'Public promotion was rejected while Production and G5 remain HOLD');

  const pairDigestMutation = clone(candidate);
  pairDigestMutation.pair_digest = 'sha256:0000000000000000000000000000000000000000000000000000000000000000';
  requireReject('PAIR_DIGEST_MISMATCH', () => validateControlPair(pairDigestMutation, evidence, controlContract), 'CONTROL_PAIR_DIGEST_MISMATCH');
  recordNegative('PAIR_DIGEST_MISMATCH', 'candidate pair digest tamper');

  const reboundCandidate = clone(candidate);
  const reboundEvidence = clone(evidence);
  reboundCandidate.snapshot_id = `${candidate.snapshot_id}-rebound`;
  reboundEvidence.bound_snapshot_id = reboundCandidate.snapshot_id;
  reboundCandidate.candidate_payload_sha256 = candidatePayloadSha256(reboundCandidate);
  reboundEvidence.evidence_package_payload_sha256 = evidencePayloadSha256(reboundEvidence);
  const reboundPairDigest = pairDigestFor(reboundCandidate, reboundEvidence);
  reboundCandidate.pair_digest = reboundPairDigest;
  reboundEvidence.pair_digest = reboundPairDigest;
  requireReject('PAIR_IDENTITY_REBINDING', () => validateControlPair(reboundCandidate, reboundEvidence, controlContract), 'CONTROL_PAIR_SNAPSHOT_ID_REBINDING');
  recordNegative('PAIR_IDENTITY_REBINDING', 'coherently rehashed snapshot identity substitution');

  const officialAssessment = clone(assessment);
  officialAssessment.record_type = 'kidults_rankability_assessment';
  officialAssessment.assessment_payload_sha256 = assessmentPayloadSha256(officialAssessment);
  requireReject('MOCK_TO_OFFICIAL_TRACK_B_PROMOTION', () => validateControlProjection(projection, candidate, evidence, officialAssessment, controlContract), 'CONTROL_MOCK_ASSESSMENT_TYPE_INVALID');
  recordNegative('MOCK_TO_OFFICIAL_TRACK_B_PROMOTION', 'mock discriminator rewritten and payload digest recomputed');

  const rankableAssessment = clone(assessment);
  rankableAssessment.rankable = true;
  rankableAssessment.promotable = true;
  rankableAssessment.assessment_payload_sha256 = assessmentPayloadSha256(rankableAssessment);
  requireReject('MOCK_RANKABLE_OR_PROMOTABLE_PROMOTION', () => validateControlProjection(projection, candidate, evidence, rankableAssessment, controlContract), 'CONTROL_MOCK_ASSESSMENT_FALSE_PROMOTION');
  recordNegative('MOCK_RANKABLE_OR_PROMOTABLE_PROMOTION', 'mock rankable and promotable flags rewritten and payload digest recomputed');

  const approvedProjection = clone(projection);
  approvedProjection.projection.state = 'LIVE_APPROVED';
  approvedProjection.projection.projection_id = 'forbidden-control-promotion';
  approvedProjection.projection.as_of = candidate.as_of;
  approvedProjection.approved_projection = true;
  approvedProjection.control_payload_sha256 = controlPayloadSha256(approvedProjection);
  requireReject('PROJECTION_LIVE_APPROVED_PROMOTION', () => validateControlProjection(approvedProjection, candidate, evidence, assessment, controlContract), 'CONTROL_PROJECTION_FALSE_LIVE_STATE');
  const promotedFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => clone(approvedProjection) });
    const portal = await readPortalProjection({ url: 'control://promoted-camera', controlUrl: 'control://promoted-camera' });
    ensure(portal.projection.state === 'INVALID' && portal.release.state === 'HOLD', 'CONTROL_PORTAL_PROMOTED_RECORD_FALSE_ACCEPTANCE');
  } finally {
    globalThis.fetch = promotedFetch;
  }
  recordNegative('PROJECTION_LIVE_APPROVED_PROMOTION', 'control state rewritten to LIVE_APPROVED and digest recomputed');

  const leakingProjection = clone(projection);
  leakingProjection.payload = { title: observation.source_projection.title, price: observation.source_projection.terminal_display_amount };
  leakingProjection.control_payload_sha256 = controlPayloadSha256(leakingProjection);
  requireReject('PROJECTION_PAYLOAD_LEAKAGE', () => validateControlProjection(leakingProjection, candidate, evidence, assessment, controlContract), 'CONTROL_PROJECTION_FIELD_SET_INVALID');
  const leakingFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => clone(leakingProjection) });
    const portal = await readPortalProjection({ url: 'control://leaking-camera', controlUrl: 'control://leaking-camera' });
    ensure(same(portal.objects, []) && same(portal.evidence, []) && !JSON.stringify(portal).includes(observation.source_projection.title), 'CONTROL_PORTAL_LEAKING_RECORD_CONTENT_EXPOSED');
  } finally {
    globalThis.fetch = leakingFetch;
  }
  recordNegative('PROJECTION_PAYLOAD_LEAKAGE', 'extra source payload was rejected by the producer contract and discarded by the Portal');

  const handoffReceiptPath = path.join(temporaryRoot, 'canonical-handoff-rejection.json');
  const handoffResult = child(HANDOFF_VALIDATOR, [candidatePath, evidencePath, handoffReceiptPath], { KAIOS_REQUIRE_HANDOFF_READY: '1' });
  ensure(handoffResult.status === 2, `CANONICAL_HANDOFF_FALSE_ACCEPTANCE_OR_WRONG_EXIT:${childOutput(handoffResult).trim()}`);
  const handoffReceipt = readJson(handoffReceiptPath);
  ensure(handoffReceipt.handoff_state === 'BLOCKED' && handoffReceipt.track_b_assessment === 'NOT_PERFORMED_BY_THIS_PREFLIGHT' && handoffReceipt.track_b_pass === 'NOT_ASSERTED_BY_THIS_PREFLIGHT', 'CANONICAL_HANDOFF_REJECTION_RECEIPT_INVALID');
  ensure(handoffReceipt.publication === 'HOLD' && handoffReceipt.production === 'HOLD', 'CANONICAL_HANDOFF_REJECTION_GATES_INVALID');
  recordNegative('CANONICAL_HANDOFF_FALSE_ACCEPTANCE', 'canonical Track A preflight blocked the control-shaped pair');

  requireChildPass('STAGING_REAL_WORKLOAD_STATIC_CONTRACT', STAGING_VALIDATOR);
  const stagingContract = readJson(controlContract.validation.staging_admission_contract);
  ensure(stagingContract.admission_law.synthetic_or_control_pair_rejected === true && stagingContract.admission_law.non_promotable_pair_rejected === true, 'STAGING_CONTROL_REJECTION_LAW_MISSING');
  ensure(stagingContract.official_inputs.track_b_assessment === 'rankability-assessment.json' && path.basename(assessmentPath) !== stagingContract.official_inputs.track_b_assessment, 'STAGING_OFFICIAL_ASSESSMENT_BOUNDARY_INVALID');
  ensure(candidate.fixture_type.includes('CONTROL') && candidate.canonical_handoff_eligible === false && assessment.official_track_b_started === false, 'STAGING_CONTROL_PAIR_CLASSIFICATION_INVALID');
  recordNegative('STAGING_CONTROL_PAIR_FALSE_ADMISSION', 'static staging law rejects control/non-promotable pairs and requires a distinct official Track B assessment');

  for (const requiredFamily of controlContract.required_negative_mutations) {
    ensure(passedMutationFamilies.has(requiredFamily), `CONTROL_REQUIRED_NEGATIVE_MUTATION_NOT_EXECUTED:${requiredFamily}`);
  }

  const canonicalLineageForMutation = upstreamBinding.canonical ? clone(upstreamLineage) : {
    id: 'kidults-state-department-camera-upstream-lineage-v1',
    version: '1.0.0',
    state: 'VERIFIED_CANONICAL_UPSTREAM_ARTIFACT',
    mode: 'CANONICAL_WORKFLOW_RUN',
    source_sha: repositoryHeadSha,
    upstream_workflow: {
      name: controlContract.validation.canonical_upstream_workflow_name,
      path: controlContract.validation.canonical_upstream_workflow_path,
      run_id: 1,
      head_sha: repositoryHeadSha,
      status: 'completed',
      conclusion: 'success',
      head_branch: 'main',
    },
    upstream_artifact: {
      name: controlContract.validation.canonical_upstream_artifact_name,
      artifact_id: 1,
      artifact_count: 1,
      archive_digest: `sha256:${'1'.repeat(64)}`,
      expired: false,
      archive_digest_reverified: true,
      digest_reverification: controlContract.validation.canonical_upstream_artifact_digest_reverification,
      download_action_pin: 'actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093',
      extracted_content_tree_sha256: `sha256:${'2'.repeat(64)}`,
    },
    predecessor_receipts: {
      evidence_manifest_path: 'kidults-state-department-camera-evidence-run-1/state-department-camera-evidence-manifest-v1.json',
      evidence_manifest_sha256: `sha256:${'3'.repeat(64)}`,
      evidence_validation_path: 'state-department-camera-evidence-final-validation-v1.json',
      evidence_validation_sha256: `sha256:${'4'.repeat(64)}`,
      source_projection_sha256: controlContract.authoritative_source.source_projection_sha256,
    },
    source_facts_included: false,
    raw_source_payload_included: false,
    canonical_candidate_created: false,
    official_track_b_started: false,
    real_product_value_proof: false,
    approved_projection: false,
    public_release: 'HOLD',
    production: 'HOLD',
    g5: 'HOLD',
  };
  validateUpstreamLineage(canonicalLineageForMutation, controlContract, { expectedSourceSha: repositoryHeadSha, requireCanonical: true });
  const upstreamMutationFamilies = new Set();
  const rejectUpstreamMutation = (family, mutate, expectedCode) => {
    const mutated = clone(canonicalLineageForMutation);
    mutate(mutated);
    requireReject(family, () => validateUpstreamLineage(mutated, controlContract, { expectedSourceSha: repositoryHeadSha, requireCanonical: true }), expectedCode);
    upstreamMutationFamilies.add(family);
  };
  rejectUpstreamMutation('UPSTREAM_RUN_PATH_OR_HEAD_SHA_REBINDING', (mutated) => { mutated.upstream_workflow.path = '.github/workflows/forged.yml'; }, 'CONTROL_UPSTREAM_RUN_PATH_OR_NAME_REBINDING');
  rejectUpstreamMutation('UPSTREAM_RUN_NOT_SUCCESSFULLY_COMPLETED', (mutated) => { mutated.upstream_workflow.conclusion = 'failure'; }, 'CONTROL_UPSTREAM_RUN_NOT_SUCCESSFULLY_COMPLETED');
  rejectUpstreamMutation('UPSTREAM_ARTIFACT_COUNT_EXPIRY_OR_NAME_DRIFT', (mutated) => { mutated.upstream_artifact.expired = true; }, 'CONTROL_UPSTREAM_ARTIFACT_ID_OR_EXPIRY_INVALID');
  rejectUpstreamMutation('UPSTREAM_ARTIFACT_OR_PREDECESSOR_DIGEST_TAMPER', (mutated) => { mutated.upstream_artifact.archive_digest = 'sha256:tampered'; }, 'CONTROL_UPSTREAM_ARTIFACT_DIGEST_INVALID');
  for (const requiredFamily of controlContract.required_upstream_lineage_negative_mutations) {
    ensure(upstreamMutationFamilies.has(requiredFamily), `CONTROL_REQUIRED_UPSTREAM_NEGATIVE_MUTATION_NOT_EXECUTED:${requiredFamily}`);
  }

  requireChildPass('EXISTING_PROJECTION_DRY_RUN', DRY_RUN_VALIDATOR);
  requireChildPass('BLACK_LOTUS_LEGACY_QUARANTINE', LEGACY_QUARANTINE_VALIDATOR);

  const workflow = fs.readFileSync(WORKFLOW_PATH, 'utf8');
  for (const required of [
    'track-a-control-pair:',
    'track-b-contract-mock:',
    'non-promotable-projection:',
    'validate-lawful-control-chain:',
    'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02',
    'actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093',
    'KIDULTS_STATE_DEPARTMENT_CAMERA_LAWFUL_CONTROL',
    'kidults-asi-state-department-camera-evidence-v1',
    'upstream-evidence-lineage.json',
    'track-b-contract-mock-assessment.json',
    'control-projection.json',
  ]) ensure(workflow.includes(required), `CONTROL_WORKFLOW_BINDING_MISSING:${required}`);
  ensure(!/^  push:/m.test(workflow), 'CONTROL_WORKFLOW_DUPLICATE_MAIN_PUSH_FANOUT');

  const receipt = {
    id: 'kidults-state-department-camera-lawful-control-chain-validation-v1',
    version: '1.0.0',
    state: upstreamBinding.canonical ? 'VERIFIED_PASS' : 'VERIFIED_PASS_VALIDATION_ONLY',
    as_of: observation.as_of,
    underlying_input_data_class: controlContract.truth_boundary.underlying_input_data_class,
    lawful_source_projection_sha256: controlContract.authoritative_source.source_projection_sha256,
    track_a_control_pair: 'CONTENT_ADDRESSED_NON_PROMOTABLE_CONTROL_ONLY',
    track_b_contract_mock: 'VERIFIED_NOT_OFFICIAL_TRACK_B',
    projection_control: 'PAYLOADLESS_NO_PROJECTION',
    portal_render: 'PAYLOADLESS_STRUCTURAL_CATALOG_ONLY',
    schemas_validated: schemaSpecifications.length,
    negative_mutation_families_required: controlContract.required_negative_mutations.length,
    negative_mutation_families_passed: passedMutationFamilies.size,
    negative_mutation_receipts: negativeReceipts,
    upstream_lineage_negative_mutation_families_required: controlContract.required_upstream_lineage_negative_mutations.length,
    upstream_lineage_negative_mutation_families_passed: upstreamMutationFamilies.size,
    canonical_upstream_predecessor_bound: upstreamBinding.canonical,
    upstream_predecessor_lineage: {
      mode: upstreamLineage.mode,
      source_sha: upstreamLineage.source_sha,
      workflow_path: upstreamLineage.upstream_workflow.path,
      run_id: upstreamLineage.upstream_workflow.run_id,
      artifact_id: upstreamLineage.upstream_artifact.artifact_id,
      artifact_digest: upstreamLineage.upstream_artifact.archive_digest,
      artifact_digest_reverified: upstreamLineage.upstream_artifact.archive_digest_reverified,
      extracted_content_tree_sha256: upstreamLineage.upstream_artifact.extracted_content_tree_sha256,
      evidence_manifest_sha256: upstreamLineage.predecessor_receipts.evidence_manifest_sha256,
      evidence_validation_sha256: upstreamLineage.predecessor_receipts.evidence_validation_sha256,
      source_projection_sha256: upstreamLineage.predecessor_receipts.source_projection_sha256,
    },
    canonical_candidate_created: false,
    canonical_evidence_package_created: false,
    canonical_handoff_eligible: false,
    official_track_b_started: false,
    rankability_assessment_created: false,
    canonical_truth_counters_mutated: false,
    real_product_value_proof: false,
    approved_projection: false,
    live_approved_projection: 'NONE',
    public_release: 'HOLD',
    production: 'HOLD',
    g5: 'HOLD',
    external_data_provider_or_source_network_contact: false,
    github_actions_artifact_api_required_for_canonical_binding: upstreamBinding.canonical,
    truth_label: 'LAWFUL_DERIVED_CONTROL_PLUMBING_PROOF_ONLY_NOT_LAUNCH_READY',
    effects: controlContract.effects,
  };
  process.stdout.write(stableJson(receipt));
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
