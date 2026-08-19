import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { before, test } from 'node:test';
import {
  createAdjudicationRecord,
  createReviewRecord,
  digest,
  generateHumanReviewPreflight,
  recordDigest,
  validateHumanReviewCompletion,
  verifyGitFreezeOrder,
  verifyHoldoutCommitment,
  verifyHumanReviewPreflight
} from '../../../scripts/kidults/entity-resolution/er-human-review-gate-r1-lib.mjs';

const ROOT = process.cwd();
const JSON_PATHS = {
  samplingPlan: 'coordination/kidults/entity-resolution/empirical-validation-sampling-plan-r1.json',
  packetContract: 'coordination/kidults/entity-resolution/independent-label-review-packet-contract-r1.json',
  operationalContract: 'coordination/kidults/entity-resolution/human-review-gate-operational-contract-r1.json'
};

let samplingPlan;
let packetContract;
let operationalContract;
let dataset;
let bundle;

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(ROOT, relativePath), 'utf8'));
}

function expandedCounts(targets) {
  return Object.entries(targets).flatMap(([value, count]) => Array.from({ length: count }, () => value));
}

function makeContractTestDataset(plan) {
  const cases = [];
  for (const stratum of plan.strata) {
    const caseClasses = expandedCounts(stratum.case_class_targets);
    const boundaries = expandedCounts(stratum.identity_boundary_targets);
    for (let index = 0; index < stratum.cases; index += 1) {
      const caseId = `${stratum.stratum_id}-contract-${String(index + 1).padStart(3, '0')}`;
      cases.push({
        case_id: caseId,
        stratum_id: stratum.stratum_id,
        case_class: caseClasses[index],
        identity_boundary: boundaries[index],
        source_a_reference: `urn:contract-test:evidence:${caseId}:a`,
        source_b_reference: `urn:contract-test:evidence:${caseId}:b`,
        source_a_payload_sha256: digest({ fixture: true, caseId, side: 'a' }),
        source_b_payload_sha256: digest({ fixture: true, caseId, side: 'b' }),
        license_evidence_refs: [`urn:contract-test:license:${stratum.stratum_id}`],
        rights_state: 'ALLOW',
        provenance_refs: [`urn:contract-test:provenance:${caseId}:a`, `urn:contract-test:provenance:${caseId}:b`]
      });
    }
  }
  return {
    id: 'kidults-er-human-review-gate-contract-test-fixture-r1',
    fixture_classification: 'CONTRACT_TEST_FIXTURE_ONLY',
    production: 'HOLD',
    cases
  };
}

function makeReviewerRegistry() {
  return {
    fixture_classification: 'CONTRACT_TEST_FIXTURE_ONLY',
    registry_state: 'CONTRACT_TEST_IDENTITY_SIMULATION_NOT_REVIEWER_EVIDENCE',
    reviewers: [
      {
        slot: 'A',
        reviewer_id: 'directory:kidults:person-1042',
        identity_source_type: 'ORG_DIRECTORY',
        identity_verification_ref: 'urn:kidults:directory-verification:person-1042',
        identity_attestation_sha256: digest('contract-test-identity-a'),
        independence_attestation_sha256: digest('contract-test-independence-a'),
        attested_at: '2026-08-19T18:00:00Z',
        resolver_author: false,
        model_operator: false,
        other_reviewer_labels_seen: false
      },
      {
        slot: 'B',
        reviewer_id: 'registry:external:person-7741',
        identity_source_type: 'INDEPENDENT_REVIEW_REGISTRY',
        identity_verification_ref: 'urn:kidults:external-review-verification:person-7741',
        identity_attestation_sha256: digest('contract-test-identity-b'),
        independence_attestation_sha256: digest('contract-test-independence-b'),
        attested_at: '2026-08-19T18:01:00Z',
        resolver_author: false,
        model_operator: false,
        other_reviewer_labels_seen: false
      }
    ]
  };
}

function makeCompletionInput() {
  const reviewerRegistry = makeReviewerRegistry();
  const firstCaseId = bundle.packetA.cases[0].case_id;
  const records = [];
  for (const [slot, packet, reviewer] of [
    ['A', bundle.packetA, reviewerRegistry.reviewers[0]],
    ['B', bundle.packetB, reviewerRegistry.reviewers[1]]
  ]) {
    for (const item of packet.cases) {
      const label = item.case_id === firstCaseId ? 'REVIEW_REQUIRED' : 'MATCH';
      records.push(createReviewRecord({
        case_id: item.case_id,
        reviewer_id: reviewer.reviewer_id,
        packet_sha256: packet.packet_sha256,
        case_evidence_binding_sha256: item.case_evidence_binding_sha256,
        reviewer_independence_attestation: true,
        label,
        label_reason_code: label === 'REVIEW_REQUIRED' ? 'IDENTITY_EVIDENCE_INSUFFICIENT' : `EVIDENCE_MATCH_CONFIRMED_${slot}`,
        evidence_refs_reviewed: [item.source_a_reference, item.source_b_reference],
        reviewed_at: slot === 'A' ? '2026-08-19T19:00:00Z' : '2026-08-19T20:00:00Z'
      }));
    }
  }
  const first = bundle.packetA.cases[0];
  const adjudication = createAdjudicationRecord({
    case_id: first.case_id,
    reviewer_a_label: 'REVIEW_REQUIRED',
    reviewer_b_label: 'REVIEW_REQUIRED',
    adjudicator_id: 'registry:adjudication:person-3308',
    adjudicator_identity_verification_ref: 'urn:kidults:adjudicator-verification:person-3308',
    final_label: 'REVIEW_REQUIRED',
    reason: 'EVIDENCE_DOES_NOT_SUPPORT_SAFE_AUTOMATIC_IDENTITY_DECISION',
    evidence_refs: [first.source_a_reference, first.source_b_reference],
    adjudicated_at: '2026-08-19T21:00:00Z'
  });
  return {
    reviewerRegistry,
    reviewFile: { fixture_classification: 'CONTRACT_TEST_FIXTURE_ONLY', review_state: 'HUMAN_REVIEWS_COLLECTED_NOT_EMPIRICALLY_ATTESTED', records },
    adjudicationFile: { fixture_classification: 'CONTRACT_TEST_FIXTURE_ONLY', adjudication_state: 'HUMAN_ADJUDICATIONS_COLLECTED_NOT_EMPIRICALLY_ATTESTED', records: [adjudication] }
  };
}

before(async () => {
  [samplingPlan, packetContract, operationalContract] = await Promise.all([
    readJson(JSON_PATHS.samplingPlan),
    readJson(JSON_PATHS.packetContract),
    readJson(JSON_PATHS.operationalContract)
  ]);
  dataset = makeContractTestDataset(samplingPlan);
  bundle = generateHumanReviewPreflight(dataset, samplingPlan, packetContract, operationalContract, { allowContractTestFixture: true });
});

test('generates deterministic A/B packets and exact 420-case pre-model commitment without reviewer or label claims', () => {
  const replay = generateHumanReviewPreflight(dataset, samplingPlan, packetContract, operationalContract, { allowContractTestFixture: true });
  assert.deepEqual(replay, bundle);
  assert.equal(bundle.packetA.case_count, 840);
  assert.equal(bundle.packetB.case_count, 840);
  assert.deepEqual(bundle.packetA.cases, bundle.packetB.cases);
  assert.equal(bundle.packetA.reviewer_assignment_state, 'NOT_ASSIGNED');
  assert.equal(bundle.packetB.reviewer_assignment_state, 'NOT_ASSIGNED');
  assert.equal(bundle.holdoutCommitment.blind_case_count, 420);
  assert.equal(bundle.holdoutCommitment.blind_cases.length, 420);
  assert.ok(bundle.holdoutCommitment.per_stratum.every((entry) => entry.blind_case_count === 60));
  assert.equal(bundle.holdoutCommitment.partition_commit_sha, null);
  assert.equal(bundle.holdoutCommitment.model_freeze_sha, null);
  assert.equal(bundle.holdoutCommitment.proof_partition_commit_precedes_model_freeze, false);
  assert.match(JSON.stringify(bundle.packetA), /case_evidence_binding_sha256/);
  assert.doesNotMatch(JSON.stringify(bundle.packetA), /model_prediction|model_score|model_output|expected_label|gold_label|blind_holdout|"label"/i);
  assert.deepEqual(
    verifyHumanReviewPreflight(dataset, samplingPlan, packetContract, operationalContract, bundle, { allowContractTestFixture: true }),
    { status: 'PASS_PREFLIGHT_ONLY', total_cases: 840, blind_cases: 420, reviewers: 'NOT_ASSIGNED', labels: 'NOT_COLLECTED', production: 'HOLD' }
  );
});

test('rejects pre-freeze model/label leakage and deterministic evidence-binding tampering', () => {
  const leaked = structuredClone(dataset);
  leaked.cases[0].model_prediction = 'MATCH';
  assert.throws(
    () => generateHumanReviewPreflight(leaked, samplingPlan, packetContract, operationalContract, { allowContractTestFixture: true }),
    /PREFREEZE_LABEL_OR_MODEL_FIELD_PROHIBITED/
  );
  const tampered = structuredClone(bundle);
  tampered.packetA.cases[0].source_a_payload_sha256 = digest('tampered');
  tampered.packetA.packet_sha256 = recordDigest(tampered.packetA, 'packet_sha256');
  assert.throws(
    () => verifyHumanReviewPreflight(dataset, samplingPlan, packetContract, operationalContract, tampered, { allowContractTestFixture: true }),
    /PACKET_CASE_BINDING_MISMATCH/
  );
  const holdoutTampered = structuredClone(bundle.holdoutCommitment);
  holdoutTampered.blind_cases[0].case_id = 'tampered-case-id';
  assert.throws(
    () => verifyHoldoutCommitment(dataset, samplingPlan, packetContract, operationalContract, holdoutTampered, { allowContractTestFixture: true }),
    /HOLDOUT_COMMITMENT_RECOMPUTE_MISMATCH/
  );

  const reversedPadding = structuredClone(dataset);
  reversedPadding.cases[1].source_a_reference = dataset.cases[0].source_b_reference;
  reversedPadding.cases[1].source_a_payload_sha256 = dataset.cases[0].source_b_payload_sha256;
  reversedPadding.cases[1].source_b_reference = dataset.cases[0].source_a_reference;
  reversedPadding.cases[1].source_b_payload_sha256 = dataset.cases[0].source_a_payload_sha256;
  assert.throws(
    () => generateHumanReviewPreflight(reversedPadding, samplingPlan, packetContract, operationalContract, { allowContractTestFixture: true }),
    /DUPLICATE_EVIDENCE_PAIR_PADDING/
  );

  const selfPair = structuredClone(dataset);
  selfPair.cases[0].source_b_reference = selfPair.cases[0].source_a_reference;
  selfPair.cases[0].source_b_payload_sha256 = selfPair.cases[0].source_a_payload_sha256;
  assert.throws(
    () => generateHumanReviewPreflight(selfPair, samplingPlan, packetContract, operationalContract, { allowContractTestFixture: true }),
    /SELF_EVIDENCE_PAIR_PROHIBITED/
  );
});

test('validates exactly 1,680 independent reviews and audits REVIEW_REQUIRED to REVIEW', () => {
  const completion = makeCompletionInput();
  const audit = validateHumanReviewCompletion({
    packetA: bundle.packetA,
    packetB: bundle.packetB,
    holdoutCommitment: bundle.holdoutCommitment,
    ...completion,
    operationalContract,
    allowContractTestFixture: true
  });
  assert.equal(audit.review_record_count, 1680);
  assert.equal(audit.benchmark_label_count, 840);
  assert.equal(audit.review_required_mapping_count, 1);
  assert.equal(audit.review_required_mappings[0].source_label, 'REVIEW_REQUIRED');
  assert.equal(audit.review_required_mappings[0].benchmark_label, 'REVIEW');
  assert.equal(audit.benchmark_labels.find((entry) => entry.human_final_label === 'REVIEW_REQUIRED').benchmark_label, 'REVIEW');
  assert.equal(audit.empirical_attestation, 'NOT_CREATED');
  assert.equal(audit.track_b, 'NOT_STARTED');
  assert.equal(audit.production, 'HOLD');
});

test('rejects placeholder and duplicate reviewer identities before accepting review evidence', () => {
  const placeholder = makeCompletionInput();
  delete placeholder.reviewerRegistry.fixture_classification;
  placeholder.reviewerRegistry.registry_state = 'HUMAN_IDENTITIES_VERIFIED_AND_INDEPENDENCE_ATTESTED';
  delete placeholder.reviewFile.fixture_classification;
  delete placeholder.adjudicationFile.fixture_classification;
  placeholder.reviewerRegistry.reviewers[0].reviewer_id = 'REVIEWER_A';
  assert.throws(
    () => validateHumanReviewCompletion({ packetA: bundle.packetA, packetB: bundle.packetB, holdoutCommitment: bundle.holdoutCommitment, ...placeholder, operationalContract }),
    /PLACEHOLDER_REVIEWER_REJECTED/
  );

  const duplicate = makeCompletionInput();
  delete duplicate.reviewerRegistry.fixture_classification;
  duplicate.reviewerRegistry.registry_state = 'HUMAN_IDENTITIES_VERIFIED_AND_INDEPENDENCE_ATTESTED';
  delete duplicate.reviewFile.fixture_classification;
  delete duplicate.adjudicationFile.fixture_classification;
  duplicate.reviewerRegistry.reviewers[1].reviewer_id = duplicate.reviewerRegistry.reviewers[0].reviewer_id;
  assert.throws(
    () => validateHumanReviewCompletion({ packetA: bundle.packetA, packetB: bundle.packetB, holdoutCommitment: bundle.holdoutCommitment, ...duplicate, operationalContract }),
    /DUPLICATE_REVIEWER_REJECTED/
  );
});

test('rejects any missing record from the required 840 cases x 2 reviewers', () => {
  const completion = makeCompletionInput();
  completion.reviewFile.records.pop();
  assert.equal(completion.reviewFile.records.length, 1679);
  assert.throws(
    () => validateHumanReviewCompletion({ packetA: bundle.packetA, packetB: bundle.packetB, holdoutCommitment: bundle.holdoutCommitment, ...completion, operationalContract, allowContractTestFixture: true }),
    /EXACT_1680_REVIEW_RECORDS_REQUIRED/
  );
});

test('rejects hidden top-level model material and impossible review chronology', () => {
  const topLevelLeak = makeCompletionInput();
  topLevelLeak.reviewFile.model_prediction = 'MATCH';
  assert.throws(
    () => validateHumanReviewCompletion({ packetA: bundle.packetA, packetB: bundle.packetB, holdoutCommitment: bundle.holdoutCommitment, ...topLevelLeak, operationalContract, allowContractTestFixture: true }),
    /REVIEW_RECORD_FILE_FIELD_INVALID/
  );

  const reviewBeforeAttestation = makeCompletionInput();
  reviewBeforeAttestation.reviewFile.records[0].reviewed_at = '2026-08-19T17:00:00Z';
  reviewBeforeAttestation.reviewFile.records[0].review_record_sha256 = recordDigest(reviewBeforeAttestation.reviewFile.records[0], 'review_record_sha256');
  assert.throws(
    () => validateHumanReviewCompletion({ packetA: bundle.packetA, packetB: bundle.packetB, holdoutCommitment: bundle.holdoutCommitment, ...reviewBeforeAttestation, operationalContract, allowContractTestFixture: true }),
    /REVIEW_PRECEDES_REVIEWER_ATTESTATION/
  );

  const earlyAdjudication = makeCompletionInput();
  earlyAdjudication.adjudicationFile.records[0].adjudicated_at = '2026-08-19T18:30:00Z';
  earlyAdjudication.adjudicationFile.records[0].record_sha256 = recordDigest(earlyAdjudication.adjudicationFile.records[0], 'record_sha256');
  assert.throws(
    () => validateHumanReviewCompletion({ packetA: bundle.packetA, packetB: bundle.packetB, holdoutCommitment: bundle.holdoutCommitment, ...earlyAdjudication, operationalContract, allowContractTestFixture: true }),
    /ADJUDICATION_PRECEDES_REQUIRED_REVIEWS/
  );
});

test('verifies the committed holdout artifact precedes a distinct model-freeze commit', async () => {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'kidults-er-holdout-order-'));
  execFileSync('git', ['init', '-q', repo]);
  execFileSync('git', ['-C', repo, 'config', 'user.name', 'KIDULTS Contract Test']);
  execFileSync('git', ['-C', repo, 'config', 'user.email', 'contract-test@invalid.example']);
  const relativeCommitmentPath = 'evidence/holdout-commitment.json';
  await fs.mkdir(path.join(repo, 'evidence'), { recursive: true });
  await fs.writeFile(path.join(repo, relativeCommitmentPath), `${JSON.stringify(bundle.holdoutCommitment, null, 2)}\n`);
  execFileSync('git', ['-C', repo, 'add', relativeCommitmentPath]);
  execFileSync('git', ['-C', repo, 'commit', '-q', '-m', 'commit holdout partition']);
  const partitionCommitSha = execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  await fs.writeFile(path.join(repo, 'model-freeze.txt'), 'model freeze follows holdout commitment\n');
  execFileSync('git', ['-C', repo, 'add', 'model-freeze.txt']);
  execFileSync('git', ['-C', repo, 'commit', '-q', '-m', 'freeze model']);
  const modelFreezeSha = execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

  const proof = verifyGitFreezeOrder({ repoPath: repo, commitmentPath: relativeCommitmentPath, commitment: bundle.holdoutCommitment, partitionCommitSha, modelFreezeSha });
  assert.equal(proof.proof_partition_commit_precedes_model_freeze, true);
  assert.throws(
    () => verifyGitFreezeOrder({ repoPath: repo, commitmentPath: relativeCommitmentPath, commitment: bundle.holdoutCommitment, partitionCommitSha: modelFreezeSha, modelFreezeSha: partitionCommitSha }),
    /COMMITMENT_NOT_PRESENT_AT_PARTITION_COMMIT|PARTITION_COMMIT_DOES_NOT_PRECEDE_MODEL_FREEZE/
  );
});
