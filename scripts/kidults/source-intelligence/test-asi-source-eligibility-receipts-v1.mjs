#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const builder = path.join(root, 'scripts/kidults/source-intelligence/build-asi-source-eligibility-receipts-v1.mjs');
const validator = path.join(root, 'scripts/kidults/source-intelligence/validate-asi-source-eligibility-receipts-v1.mjs');
const contract = path.join(root, 'coordination/kidults/source-intelligence/asi-source-eligibility-receipt-contract-v1.json');
const samplePolicyPath = path.join(root, 'coordination/kidults/source-intelligence/current-sold-sample-governance-v1.json');
const samplePolicy = JSON.parse(fs.readFileSync(samplePolicyPath, 'utf8'));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-source-eligibility-'));
const canonical = (value) => Array.isArray(value)
  ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
    : value;
const digest = (value) => `sha256:${crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')}`;
const write = (name, value) => {
  const file = path.join(temp, name);
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
  return file;
};
const producerEnv = {
  ...process.env,
  GITHUB_ACTIONS: 'false',
  KIDULTS_ALLOW_TEST_INPUTS: '1',
  KIDULTS_ALLOW_TEST_CLOCK: '1',
  KIDULTS_REPOSITORY: 'johnkim9524-collab/kaios_enterprise_repo',
  KIDULTS_PRODUCER_WORKFLOW_PATH: '.github/workflows/kidults-asi-global-any-site-hourly-pooling-v2.yml',
  KIDULTS_SOURCE_SHA: 'a'.repeat(40),
  KIDULTS_WORKFLOW_RUN_ID: '123456',
  KIDULTS_WORKFLOW_RUN_ATTEMPT: '1',
  KIDULTS_PRODUCER_EVENT_NAME: 'schedule',
  KIDULTS_PRODUCER_ARTIFACT_NAME: 'kidults-asi-global-any-site-source-pool-v2',
  KIDULTS_EXPECTED_REPOSITORY: 'johnkim9524-collab/kaios_enterprise_repo',
  KIDULTS_EXPECTED_PRODUCER_WORKFLOW_PATH: '.github/workflows/kidults-asi-global-any-site-hourly-pooling-v2.yml',
  KIDULTS_EXPECTED_SOURCE_SHA: 'a'.repeat(40),
  KIDULTS_EXPECTED_WORKFLOW_RUN_ID: '123456',
  KIDULTS_EXPECTED_WORKFLOW_RUN_ATTEMPT: '1',
  KIDULTS_EXPECTED_PRODUCER_EVENT_NAME: 'schedule',
  KIDULTS_EXPECTED_PRODUCER_ARTIFACT_NAME: 'kidults-asi-global-any-site-source-pool-v2',
  KIDULTS_EXPECTED_P3_REPOSITORY: 'johnkim9524-collab/kaios_enterprise_repo',
  KIDULTS_EXPECTED_P3_WORKFLOW_PATH: '.github/workflows/kidults-asi-snapshot-readiness-factory-v2.yml',
  KIDULTS_EXPECTED_P3_PROTECTED_REF: 'refs/heads/main',
  KIDULTS_EXPECTED_P3_SOURCE_SHA: 'b'.repeat(40),
  KIDULTS_EXPECTED_P3_WORKFLOW_RUN_ID: '456789',
  KIDULTS_EXPECTED_P3_WORKFLOW_RUN_ATTEMPT: '2',
  KIDULTS_EXPECTED_P3_EVENT_NAME: 'schedule',
  KIDULTS_EXPECTED_P3_ARTIFACT_NAME: `kidults-asi-snapshot-readiness-factory-v2-main-${'b'.repeat(40)}-456789`,
  KIDULTS_EXPECTED_P3_ARTIFACT_ID: '987654',
  KIDULTS_EXPECTED_P3_ARTIFACT_DIGEST: `sha256:${'c'.repeat(64)}`,
  KIDULTS_EXPECTED_P3_ARTIFACT_URL: 'https://github.com/johnkim9524-collab/kaios_enterprise_repo/actions/runs/456789/artifacts/987654'
};
const run = (script, args, expectedSuccess = true) => {
  const result = spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: 'utf8', env: producerEnv });
  if (expectedSuccess && result.status !== 0) throw new Error(`COMMAND_FAILED:${script}\n${result.stdout}\n${result.stderr}`);
  if (!expectedSuccess && result.status === 0) throw new Error(`COMMAND_UNEXPECTEDLY_PASSED:${script}`);
  return result;
};
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const sourceId = 'source-canary-a';
const evaluatedAt = '2026-08-30T00:00:00.000Z';

try {
  const values = write('values.json', { records: [{
    source_id: sourceId,
    value_admission_status: 'VALUE_ELIGIBLE_CONTINUE_RIGHTS_REVIEW',
    hard_minimum_complete: true,
    value_score: 95,
  }] });
  const rights = write('rights.json', { records: [{
    source_id: sourceId,
    decision: 'PASS',
    rights: { collect: 'ALLOW', store: 'ALLOW', derive: 'ALLOW', commercial_use: 'ALLOW' },
    evidence_binding: { recheck_due_at: '2026-12-01T00:00:00.000Z' },
  }] });
  const snapshots = write('snapshots.json', { records: [{
    source_id: sourceId,
    capture_state: 'SOURCE_CONTENT_SNAPSHOT_BOUND',
    decision_promotion_eligible: true,
    source_content_sha256: `sha256:${'1'.repeat(64)}`,
    governed_object_ref: 'artifact:sha256:' + '2'.repeat(64),
  }] });
  const schemas = write('schemas.json', { records: [{
    source_id: sourceId,
    state: 'SOURCE_SPECIFIC_SCHEMA_BOUND',
    terminal_sold_compatible: true,
    schema_sha256: `sha256:${'3'.repeat(64)}`,
    sample_digest: `sha256:${'4'.repeat(64)}`,
    expires_at: '2026-12-15T00:00:00.000Z',
  }] });
  const inputs = [values, rights, snapshots, schemas, contract];

  const noP3Output = path.join(temp, 'eligibility-no-p3.json');
  run(builder, [...inputs, noP3Output, evaluatedAt]);
  run(validator, [noP3Output, contract]);
  const noP3 = read(noP3Output);
  if (noP3.records[0].state !== 'CANARY_EVALUATION_ELIGIBLE'
      || noP3.records[0].canary_evaluation_eligible !== true
      || noP3.records[0].p3_exact_canary_receipt_bound !== false
      || noP3.records[0].product_content_admission_authorized !== false
      || noP3.records[0].adapter_activation_authorized !== false) {
    throw new Error('ELIGIBILITY_WITHOUT_P3_EXCEEDED_CANARY_EVALUATION_CEILING');
  }
  const forgedAuthority = structuredClone(noP3);
  forgedAuthority.records[0].p3_exact_canary_receipt_bound = true;
  forgedAuthority.records[0].product_content_admission_authorized = true;
  forgedAuthority.records[0].adapter_activation_authorized = true;
  forgedAuthority.summary.p3_exact_canary_bound = 1;
  forgedAuthority.summary.product_content_admitted = 1;
  forgedAuthority.summary.adapter_activation_authorized = 1;
  const forgedAuthorityPath = write('forged-authority-without-p3.json', forgedAuthority);
  run(validator, [forgedAuthorityPath, contract], false);

  const tier = samplePolicy.tiers.find((value) => value.id === 'CANARY');
  const promotion = samplePolicy.promotion_matrix.CANARY;
  const samplePlanSha256 = `sha256:${'5'.repeat(64)}`;
  const launchCohortDigest = `sha256:${'6'.repeat(64)}`;
  const exactPairDigest = `sha256:${'7'.repeat(64)}`;
  const p3AsOf = new Date().toISOString();
  const p3EvidenceRecords = Array.from({ length: 5 }, (_, index) => ({
    evidence_id: `p3-evidence-${index}`,
    temporality: 'CURRENT_MARKET', market_observation_type: 'SOLD_TRANSACTION', rights_state: 'ALLOW',
    source_id: sourceId, source_owner_id: 'p3-owner', factual_origin_id: 'p3-origin', source_record_id: `p3-record-${index}`,
    asset_identity_id: `p3-asset-${index}`, market_venue_id: 'p3-venue', transaction_occurred_at: p3AsOf,
    sold_price: { amount: 100 + index, currency: 'USD' }, rights_assertion: { source_content_snapshot_sha256: `sha256:${'1'.repeat(64)}` },
  }));
  const p3Transactions = p3EvidenceRecords.map((record) => ({
    evidence_id: record.evidence_id,
    transaction_identity_digest: digest({ source_id: record.source_id, source_owner_id: record.source_owner_id, factual_origin_id: record.factual_origin_id, source_record_id: record.source_record_id, asset_identity_id: record.asset_identity_id, market_venue_id: record.market_venue_id, transaction_occurred_at: record.transaction_occurred_at, sold_price: record.sold_price }),
    evidence_record_digest: digest(record), source_id: record.source_id,
    source_content_snapshot_sha256: record.rights_assertion.source_content_snapshot_sha256,
  })).sort((left, right) => left.evidence_id.localeCompare(right.evidence_id));
  const launchCohort = {
    cohort_digest: `sha256:${'6'.repeat(64)}`, sample_plan_sha256: `sha256:${'5'.repeat(64)}`,
    event_ids: p3Transactions.map(value => value.evidence_id), event_digests: p3Transactions.map(value => value.evidence_record_digest).sort(),
    canary_transactions: p3Transactions,
  };
  launchCohort.transaction_binding_digest = digest({ cohort_digest: launchCohort.cohort_digest, transactions: p3Transactions });
  launchCohort.source_binding_digest = digest({ cohort_digest: launchCohort.cohort_digest, sample_plan_sha256: launchCohort.sample_plan_sha256, source_ids: [sourceId], source_content_snapshots: p3Transactions.map(value => ({ source_id: value.source_id, source_content_snapshot_sha256: value.source_content_snapshot_sha256 })) });
  const p3Evidence = { package_id: 'p3-evidence-package', bound_snapshot_id: 'p3-snapshot', upstream_binding_receipt_sha256: `sha256:${'d'.repeat(64)}`, launch_cohort: launchCohort, evidence_records: p3EvidenceRecords };
  const p3Snapshot = { snapshot_id: 'p3-snapshot', bound_evidence_package_id: 'p3-evidence-package', upstream_binding_receipt_sha256: `sha256:${'d'.repeat(64)}` };
  const p3EvidencePath = write('p3-evidence.json', p3Evidence);
  const p3SnapshotPath = write('p3-snapshot.json', p3Snapshot);
  const fileDigest = (file) => `sha256:${crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`;
  const p3 = {
    id: 'kidults-asi-snapshot-pair-generation-receipt-v2',
    version: '2.2.0',
    state: 'CONTENT_ADDRESSED_PAIR_ATOMICALLY_GENERATED_ATTESTATION_PENDING',
    snapshot_id: p3Snapshot.snapshot_id,
    evidence_package_id: p3Evidence.package_id,
    snapshot_file_sha256: fileDigest(p3SnapshotPath),
    evidence_file_sha256: fileDigest(p3EvidencePath),
    exact_pair_digest: digest({ snapshot: p3Snapshot, evidence: p3Evidence }),
    upstream_binding_receipt_sha256: p3Evidence.upstream_binding_receipt_sha256,
    as_of: p3AsOf,
    launch_cohort_digest: launchCohort.cohort_digest,
    admitted_current_sold_count: 5,
    sample_plan_sha256: samplePlanSha256,
    canary_source_ids: [sourceId],
    sample_policy_binding: {
      canonical_policy: 'coordination/kidults/source-intelligence/current-sold-sample-governance-v1.json',
      policy_id: samplePolicy.id,
      policy_version: samplePolicy.version,
      policy_digest: digest(samplePolicy),
      pair_purpose: tier.purpose,
      claim_target: tier.claim_target,
      sample_tier: tier.id,
      min_n: tier.min_n,
      max_n: tier.max_n,
      statistical_claim: tier.statistical_claim,
      cohort_class: 'LAWFUL_CURRENT_SOLD_SAMPLE',
      cohort_mode: 'EMPIRICAL_CANARY',
      maximum_claim: promotion.maximum_claim,
      release_allowed: false,
    },
    canary_transactions: p3Transactions,
    canary_transaction_binding_digest: launchCohort.transaction_binding_digest,
    atomic_directory_commit: true,
    immutable_storage_receipt: null,
    artifact_attestation: null,
    track_b_submission_eligible: false,
    track_b_assessment_started: false,
    public_release: 'HOLD',
    production: 'HOLD',
  };
  p3.canary_source_binding_digest = launchCohort.source_binding_digest;
  const p3Path = write('p3-exact-canary.json', p3);
  const providerPath = write('p3-provider.json', { id: 'kidults-asi-snapshot-readiness-provider-artifact-receipt-v2', version: '3.0.0', state: 'PROVIDER_ARTIFACT_RECEIPT_CAPTURED_ATTESTATION_PENDING', repository: producerEnv.KIDULTS_EXPECTED_P3_REPOSITORY, workflow_path: producerEnv.KIDULTS_EXPECTED_P3_WORKFLOW_PATH, protected_ref: producerEnv.KIDULTS_EXPECTED_P3_PROTECTED_REF, source_ref: producerEnv.KIDULTS_EXPECTED_P3_PROTECTED_REF, source_sha: producerEnv.KIDULTS_EXPECTED_P3_SOURCE_SHA, workflow_run_id: producerEnv.KIDULTS_EXPECTED_P3_WORKFLOW_RUN_ID, workflow_run_attempt: Number(producerEnv.KIDULTS_EXPECTED_P3_WORKFLOW_RUN_ATTEMPT), event_name: producerEnv.KIDULTS_EXPECTED_P3_EVENT_NAME, artifact_name: producerEnv.KIDULTS_EXPECTED_P3_ARTIFACT_NAME, artifact_id: producerEnv.KIDULTS_EXPECTED_P3_ARTIFACT_ID, artifact_digest: producerEnv.KIDULTS_EXPECTED_P3_ARTIFACT_DIGEST, artifact_url: producerEnv.KIDULTS_EXPECTED_P3_ARTIFACT_URL, exact_pair_digest: p3.exact_pair_digest, pair_receipt_sha256: fileDigest(p3Path), upstream_binding_receipt_sha256: p3.upstream_binding_receipt_sha256, authority_scope: 'BOUNDED_CANARY_ADAPTER_ADMISSION_ONLY', track_b_submission_eligible: false, public_release: 'HOLD', production: 'HOLD' });
  const withP3Output = path.join(temp, 'eligibility-with-p3.json');
  run(builder, [...inputs, withP3Output, evaluatedAt, p3Path, p3SnapshotPath, p3EvidencePath, providerPath]);
  run(validator, [withP3Output, contract]);
  const withP3 = read(withP3Output);
  if (withP3.records[0].p3_exact_canary_receipt_bound !== true
      || withP3.records[0].product_content_admission_authorized !== false
      || withP3.records[0].adapter_activation_authorized !== false) {
    throw new Error('LOCAL_P3_REPLAY_ESCAPED_ZERO_AUTHORITY_BOUNDARY');
  }

  const wrongSource = structuredClone(p3);
  wrongSource.canary_source_ids = ['source-other'];
  wrongSource.canary_source_binding_digest = digest({
    cohort_digest: wrongSource.launch_cohort_digest,
    sample_plan_sha256: wrongSource.sample_plan_sha256,
    source_ids: wrongSource.canary_source_ids,
  });
  const wrongSourcePath = write('p3-wrong-source.json', wrongSource);
  run(builder, [...inputs, path.join(temp, 'forbidden-wrong-source-output.json'), evaluatedAt, wrongSourcePath, p3SnapshotPath, p3EvidencePath, providerPath], false);

  const badPolicy = structuredClone(p3);
  badPolicy.sample_policy_binding.policy_digest = `sha256:${'8'.repeat(64)}`;
  const badPolicyPath = write('p3-bad-policy.json', badPolicy);
  run(builder, [...inputs, path.join(temp, 'forbidden-bad-policy-output.json'), evaluatedAt, badPolicyPath, p3SnapshotPath, p3EvidencePath, providerPath], false);
  const badSourceDigest = structuredClone(p3);
  badSourceDigest.canary_source_binding_digest = `sha256:${'9'.repeat(64)}`;
  const badSourceDigestPath = write('p3-bad-source-digest.json', badSourceDigest);
  run(builder, [...inputs, path.join(temp, 'forbidden-bad-source-output.json'), evaluatedAt, badSourceDigestPath, p3SnapshotPath, p3EvidencePath, providerPath], false);

  const rejectP3 = (name, receiptPath = p3Path, snapshotPath = p3SnapshotPath, evidencePath = p3EvidencePath, provenancePath = providerPath) =>
    run(builder, [...inputs, path.join(temp, `forbidden-${name}.json`), evaluatedAt, receiptPath, snapshotPath, evidencePath, provenancePath], false);
  const crossPair = structuredClone(p3);
  crossPair.exact_pair_digest = `sha256:${'a'.repeat(64)}`;
  rejectP3('cross-pair-swap', write('p3-cross-pair.json', crossPair));
  const stale = structuredClone(p3);
  stale.as_of = '2020-01-01T00:00:00.000Z';
  rejectP3('stale-replay', write('p3-stale.json', stale));
  const oldP3Path = write('p3-old-receipt.json', stale);
  const oldProvider = JSON.parse(fs.readFileSync(providerPath, 'utf8'));
  oldProvider.pair_receipt_sha256 = fileDigest(oldP3Path);
  const oldProviderPath = write('p3-old-provider.json', oldProvider);
  const staleAsOfOnlyReplay = structuredClone(stale);
  staleAsOfOnlyReplay.as_of = p3AsOf;
  rejectP3('stale-as-of-only-replay', write('p3-stale-asof-only-replay.json', staleAsOfOnlyReplay), p3SnapshotPath, p3EvidencePath, oldProviderPath);
  const contentDrift = structuredClone(p3Evidence);
  contentDrift.evidence_records[0].rights_assertion.source_content_snapshot_sha256 = `sha256:${'f'.repeat(64)}`;
  rejectP3('source-content-drift', p3Path, p3SnapshotPath, write('p3-evidence-content-drift.json', contentDrift));
  const missingTransaction = structuredClone(p3Evidence);
  missingTransaction.evidence_records.pop();
  rejectP3('missing-transaction', p3Path, p3SnapshotPath, write('p3-evidence-missing-transaction.json', missingTransaction));
  const duplicateTransaction = structuredClone(p3Evidence);
  duplicateTransaction.evidence_records[4] = structuredClone(duplicateTransaction.evidence_records[0]);
  rejectP3('duplicate-transaction', p3Path, p3SnapshotPath, write('p3-evidence-duplicate-transaction.json', duplicateTransaction));
  for (const [name, mutate] of [
    ['wrong-artifact', value => { value.artifact_id = '123456'; }],
    ['wrong-artifact-name', value => { value.artifact_name = 'kidults-asi-snapshot-readiness-factory-v2-main-forged'; }],
    ['wrong-artifact-url', value => { value.artifact_url = 'https://github.com/johnkim9524-collab/kaios_enterprise_repo/actions/runs/456789/artifacts/123456'; }],
    ['wrong-run', value => { value.workflow_run_id = '123457'; }],
    ['wrong-run-attempt', value => { value.workflow_run_attempt = 3; }],
    ['wrong-workflow', value => { value.workflow_path = '.github/workflows/untrusted.yml'; }],
    ['wrong-event', value => { value.event_name = 'workflow_dispatch'; }],
  ]) {
    const forgedProvider = JSON.parse(fs.readFileSync(providerPath, 'utf8'));
    mutate(forgedProvider);
    rejectP3(name, p3Path, p3SnapshotPath, p3EvidencePath, write(`p3-provider-${name}.json`, forgedProvider));
  }
  const wrongExpectedUrl = spawnSync(process.execPath, [builder, ...inputs, path.join(temp, 'forbidden-wrong-expected-url.json'), evaluatedAt, p3Path, p3SnapshotPath, p3EvidencePath, providerPath], {
    cwd: root, encoding: 'utf8', env: { ...producerEnv, KIDULTS_EXPECTED_P3_ARTIFACT_URL: 'https://attacker.invalid/artifact' },
  });
  if (wrongExpectedUrl.status === 0) throw new Error('NONCANONICAL_EXPECTED_ARTIFACT_URL_ACCEPTED');

  console.log(JSON.stringify({
    suite: 'ASI_SOURCE_ELIGIBILITY_RECEIPTS_V1',
    result: 'VERIFIED_PASS',
    canary_evaluation_without_p3_verified: true,
    authority_without_p3_rejected: true,
    exact_p3_source_binding_verified: true,
    wrong_source_remains_unauthorized: true,
    negative_mutation_cases: 17,
    production: 'HOLD',
    public_release: 'HOLD',
  }, null, 2));
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
