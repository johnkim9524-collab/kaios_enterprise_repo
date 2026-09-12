#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {
  CONTROL_CONTRACT_PATH,
  controlPayloadSha256,
  ensure,
  expectedIds,
  hashValue,
  readJson,
  stableJson,
  validateControlProjection,
  validateMockAssessment,
} from './lawful-control-chain-common-v1.mjs';

const [candidateArg, evidenceArg, assessmentArg, outputArg] = process.argv.slice(2);
ensure(Boolean(candidateArg && evidenceArg && assessmentArg && outputArg), 'USAGE: build-state-department-camera-control-projection-v1.mjs <snapshot-candidate.json> <evidence-package.json> <track-b-contract-mock-assessment.json> <new-control-projection.json>');
ensure(path.basename(candidateArg) === 'snapshot-candidate.json' && path.basename(evidenceArg) === 'evidence-package.json', 'CONTROL_PROJECTION_BUILDER_PAIR_FILENAMES_INVALID');
ensure(path.basename(assessmentArg) === 'track-b-contract-mock-assessment.json', 'CONTROL_PROJECTION_BUILDER_ASSESSMENT_FILENAME_INVALID');
ensure(path.basename(outputArg) === 'control-projection.json', 'CONTROL_PROJECTION_BUILDER_OUTPUT_FILENAME_INVALID');

const controlContract = readJson(CONTROL_CONTRACT_PATH);
const candidate = readJson(candidateArg);
const evidence = readJson(evidenceArg);
const assessment = readJson(assessmentArg);
const binding = validateMockAssessment(assessment, candidate, evidence, controlContract);
const ids = expectedIds(controlContract, binding.pairDigest);
const projection = {
  record_type: controlContract.projection_control.record_type,
  schema_version: controlContract.projection_control.schema_version,
  fixture_type: controlContract.projection_control.fixture_type,
  input_data_class: controlContract.truth_boundary.underlying_input_data_class,
  control_record_id: ids.controlRecordId,
  projection: {
    state: 'NO_PROJECTION',
    projection_id: null,
    replay_id: null,
    exact_pair_digest: binding.pairDigest,
    as_of: null,
    assessment_id: assessment.assessment_id,
    rights_state: 'WAITING',
    freshness: 'NOT_AVAILABLE',
    synthetic: true,
    promotable: false,
    production: false,
    public: false,
  },
  release: { state: 'HOLD' },
  audit: {
    snapshot_id: candidate.snapshot_id,
    evidence_package_id: evidence.evidence_package_id,
    assessment_id: assessment.assessment_id,
    exact_pair_digest: binding.pairDigest,
    source_projection_sha256: controlContract.authoritative_source.source_projection_sha256,
    correlation_id: hashValue({
      snapshot_id: candidate.snapshot_id,
      evidence_package_id: evidence.evidence_package_id,
      assessment_id: assessment.assessment_id,
      pair_digest: binding.pairDigest,
    }),
    reason_category: 'LAWFUL_CONTROL_PLUMBING_ONLY_NO_GOVERNED_PROJECTION',
  },
  content_policy: {
    source_facts_discarded: true,
    raw_provider_payload_included: false,
    object_identity_included: false,
    price_or_bid_included: false,
    portal_behavior: controlContract.projection_control.portal_content_policy,
  },
  official_track_b_started: false,
  canonical_handoff_eligible: false,
  real_product_value_proof: false,
  approved_projection: false,
  public_release: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
  control_payload_sha256: '',
};
projection.control_payload_sha256 = controlPayloadSha256(projection);
validateControlProjection(projection, candidate, evidence, assessment, controlContract);

const outputPath = path.resolve(outputArg);
ensure(!fs.existsSync(outputPath), 'CONTROL_PROJECTION_BUILDER_OUTPUT_ALREADY_EXISTS');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
const temporaryPath = `${outputPath}.tmp-${process.pid}`;
try {
  fs.writeFileSync(temporaryPath, stableJson(projection), { flag: 'wx' });
  fs.renameSync(temporaryPath, outputPath);
} catch (error) {
  fs.rmSync(temporaryPath, { force: true });
  throw error;
}

process.stdout.write(stableJson({
  state: 'VERIFIED_NON_PROMOTABLE_NO_PROJECTION_CONTROL',
  output_file: outputPath,
  control_record_id: projection.control_record_id,
  pair_digest: projection.projection.exact_pair_digest,
  official_track_b_started: false,
  canonical_handoff_eligible: false,
  real_product_value_proof: false,
  approved_projection: false,
  public_release: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
}));
