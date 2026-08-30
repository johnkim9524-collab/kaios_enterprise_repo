#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {
  assessmentPayloadSha256,
  CONTROL_CONTRACT_PATH,
  ensure,
  expectedIds,
  readJson,
  stableJson,
  validateControlPair,
  validateMockAssessment,
} from './lawful-control-chain-common-v1.mjs';

const [candidateArg, evidenceArg, outputArg] = process.argv.slice(2);
ensure(Boolean(candidateArg && evidenceArg && outputArg), 'USAGE: assess-state-department-camera-control-interface-v1.mjs <snapshot-candidate.json> <evidence-package.json> <new-track-b-contract-mock-assessment.json>');
ensure(path.basename(candidateArg) === 'snapshot-candidate.json', 'CONTROL_MOCK_ASSESSOR_CANDIDATE_FILENAME_INVALID');
ensure(path.basename(evidenceArg) === 'evidence-package.json', 'CONTROL_MOCK_ASSESSOR_EVIDENCE_FILENAME_INVALID');
ensure(path.basename(outputArg) === 'track-b-contract-mock-assessment.json', 'CONTROL_MOCK_ASSESSOR_OUTPUT_FILENAME_INVALID');

const controlContract = readJson(CONTROL_CONTRACT_PATH);
const candidate = readJson(candidateArg);
const evidence = readJson(evidenceArg);
const pair = validateControlPair(candidate, evidence, controlContract);
const ids = expectedIds(controlContract, pair.pairDigest);
const assessment = {
  record_type: controlContract.track_b_contract_mock.record_type,
  schema_version: '1.0.0',
  fixture_type: controlContract.track_a_control_pair.fixture_type,
  assessment_class: controlContract.track_b_contract_mock.assessment_class,
  assessment_id: ids.assessmentId,
  as_of: candidate.as_of,
  input_snapshot_id: candidate.snapshot_id,
  input_evidence_package_id: evidence.evidence_package_id,
  pair_digest: pair.pairDigest,
  assessor_input_boundary: {
    allowed_input_files: controlContract.track_b_contract_mock.allowed_input_files,
    observation_input: false,
    portal_input: false,
    business_input: false,
    provider_input: false,
  },
  decision: 'CONTROL_CONTRACT_PASS',
  canonical_handoff_state: 'BLOCKED_CONTROL_PAIR',
  official_track_b_started: false,
  rankability_assessment_created: false,
  rankable: false,
  promotable: false,
  real_product_value_proof: false,
  approved_projection: false,
  publication_eligible: false,
  production_authorized: false,
  blocking_dimensions: [
    'CANONICAL_HANDOFF_INELIGIBLE_CONTROL_PAIR',
    'CURRENT_MARKET_EVIDENCE_NOT_VERIFIED',
    'DISPLAY_REDISTRIBUTION_AND_SALE_RIGHTS_UNKNOWN',
    'IMMUTABLE_RAW_SOURCE_SNAPSHOT_NOT_VERIFIED',
    'LIQUIDITY_NOT_VERIFIED',
    'MARKET_REPRESENTATIVENESS_NOT_VERIFIED',
    'OFFICIAL_TRACK_B_NOT_STARTED',
  ],
  public_release: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
  assessment_payload_sha256: '',
};
assessment.assessment_payload_sha256 = assessmentPayloadSha256(assessment);
validateMockAssessment(assessment, candidate, evidence, controlContract);

const outputPath = path.resolve(outputArg);
ensure(!fs.existsSync(outputPath), 'CONTROL_MOCK_ASSESSOR_OUTPUT_ALREADY_EXISTS');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
const temporaryPath = `${outputPath}.tmp-${process.pid}`;
try {
  fs.writeFileSync(temporaryPath, stableJson(assessment), { flag: 'wx' });
  fs.renameSync(temporaryPath, outputPath);
} catch (error) {
  fs.rmSync(temporaryPath, { force: true });
  throw error;
}

process.stdout.write(stableJson({
  state: 'VERIFIED_TRACK_B_CONTRACT_COMPATIBLE_MOCK_ONLY',
  output_file: outputPath,
  assessment_id: assessment.assessment_id,
  pair_digest: assessment.pair_digest,
  official_track_b_started: false,
  rankability_assessment_created: false,
  promotable: false,
  real_product_value_proof: false,
  approved_projection: false,
}));
