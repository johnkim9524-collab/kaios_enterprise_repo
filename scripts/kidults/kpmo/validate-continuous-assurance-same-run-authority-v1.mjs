#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {pathToFileURL} from 'node:url';

const SHA = /^[0-9a-f]{40}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const PRODUCERS = ['CANONICAL_TRUTH', 'REQUIREMENT', 'RESERVE', 'SHADOW'];
const fail = (code) => { throw new Error(code); };
const stable = (value) => Array.isArray(value)
  ? `[${value.map(stable).join(',')}]`
  : value && typeof value === 'object'
    ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`
    : JSON.stringify(value);
const digest = (value) => `sha256:${crypto.createHash('sha256').update(stable(value)).digest('hex')}`;
const positiveInteger = (value) => Number.isSafeInteger(value) && value > 0;

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : '';
}

export function validateReceipt(receipt, expected) {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) fail('SAME_RUN_RECEIPT_OBJECT_REQUIRED');
  const {receipt_digest: claimedDigest, ...unsigned} = receipt;
  if (!DIGEST.test(claimedDigest || '') || digest(unsigned) !== claimedDigest) fail('SAME_RUN_RECEIPT_DIGEST_INVALID');
  if (receipt.receipt_id !== 'kpmo-continuous-assurance-sentinel-health-v1' || receipt.version !== '1.0.0') fail('SAME_RUN_RECEIPT_IDENTITY_INVALID');
  if (receipt.state !== 'VERIFIED_PASS' || receipt.semantic_content_verified !== true) fail('SAME_RUN_PRODUCER_HEALTH_NOT_VERIFIED');
  if (receipt.coverage_scope !== 'CORE_FOUR_ONLY_NOT_WHOLE_PLATFORM' || receipt.runtime_health_proven !== false) fail('SAME_RUN_SCOPE_INVALID');
  if (receipt.repository !== expected.repository || receipt.source_sha !== expected.sourceSha || !SHA.test(receipt.source_sha || '')) fail('SAME_RUN_SOURCE_BINDING_INVALID');
  if (receipt.observer_run_id !== expected.runId || receipt.observer_run_attempt !== expected.runAttempt) fail('SAME_RUN_OBSERVER_BINDING_INVALID');
  if (!Number.isFinite(Date.parse(receipt.observed_at || ''))) fail('SAME_RUN_OBSERVED_AT_INVALID');
  if (!Array.isArray(receipt.failed_producers) || receipt.failed_producers.length || !Array.isArray(receipt.waiting_producers) || receipt.waiting_producers.length) fail('SAME_RUN_PRODUCER_BLOCKER_PRESENT');
  if (!Array.isArray(receipt.producers) || receipt.producers.length !== PRODUCERS.length) fail('SAME_RUN_PRODUCER_CARDINALITY_INVALID');
  const ids = receipt.producers.map((producer) => producer?.id).sort();
  if (JSON.stringify(ids) !== JSON.stringify(PRODUCERS)) fail('SAME_RUN_PRODUCER_IDENTITY_INVALID');
  for (const producer of receipt.producers) {
    if (producer.state !== 'VERIFIED_PASS' || producer.artifact_transport_verified !== true || producer.artifact_content_validated !== true) fail(`SAME_RUN_PRODUCER_NOT_VERIFIED:${producer.id}`);
    if (!positiveInteger(producer.selected_run_id) || !positiveInteger(producer.selected_run_attempt)) fail(`SAME_RUN_PRODUCER_RUN_IDENTITY_INVALID:${producer.id}`);
  }
  if (receipt.whole_platform_authority !== false || receipt.promotion_eligible !== false || receipt.empirical_delta !== 0 || receipt.provider_authority !== false || receipt.database_authority !== false) fail('SAME_RUN_AUTHORITY_BOUNDARY_INVALID');
  if (receipt.public !== 'HOLD' || receipt.production !== 'HOLD' || receipt.g5 !== 'HOLD') fail('SAME_RUN_RELEASE_BOUNDARY_INVALID');
  return receipt;
}

function readReceipt(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > 1024 * 1024) fail('SAME_RUN_RECEIPT_FILE_INVALID');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function seal(receipt) {
  const unsigned = structuredClone(receipt);
  delete unsigned.receipt_digest;
  return {...unsigned, receipt_digest: digest(unsigned)};
}

function fixture() {
  return seal({
    receipt_id: 'kpmo-continuous-assurance-sentinel-health-v1', version: '1.0.0', state: 'VERIFIED_PASS',
    coverage_scope: 'CORE_FOUR_ONLY_NOT_WHOLE_PLATFORM', semantic_content_verified: true, runtime_health_proven: false,
    observer_run_id: 900, observer_run_attempt: 1, repository: 'johnkim9524-collab/kaios_enterprise_repo',
    source_sha: 'a'.repeat(40), observed_at: '2026-09-07T00:00:00.000Z',
    producers: PRODUCERS.map((id, index) => ({id, state: 'VERIFIED_PASS', artifact_transport_verified: true, artifact_content_validated: true, selected_run_id: 100 + index, selected_run_attempt: 1})),
    failed_producers: [], waiting_producers: [], whole_platform_authority: false, promotion_eligible: false,
    empirical_delta: 0, provider_authority: false, database_authority: false, public: 'HOLD', production: 'HOLD', g5: 'HOLD'
  });
}

function selfTest() {
  const expected = {repository: 'johnkim9524-collab/kaios_enterprise_repo', sourceSha: 'a'.repeat(40), runId: 900, runAttempt: 1};
  validateReceipt(fixture(), expected);
  const mutations = [
    (r) => { r.state = 'VERIFIED_HOLD'; }, (r) => { r.repository = 'wrong/repo'; },
    (r) => { r.source_sha = 'b'.repeat(40); }, (r) => { r.observer_run_id = 901; },
    (r) => { r.observer_run_attempt = 2; }, (r) => { r.receipt_digest = `sha256:${'0'.repeat(64)}`; },
    (r) => { r.producers.pop(); }, (r) => { r.producers[1].id = r.producers[0].id; },
    (r) => { r.producers[0].state = 'VERIFIED_FAIL'; }, (r) => { r.producers[0].artifact_content_validated = false; },
    (r) => { r.promotion_eligible = true; }, (r) => { r.empirical_delta = 1; },
    (r) => { r.provider_authority = true; }, (r) => { r.database_authority = true; },
    (r) => { r.public = 'PASS'; }, (r) => { r.production = 'PASS'; }, (r) => { r.g5 = 'PASS'; }
  ];
  for (const mutate of mutations) {
    let candidate = structuredClone(fixture());
    mutate(candidate);
    if (!DIGEST.test(candidate.receipt_digest || '') || candidate.receipt_digest === fixture().receipt_digest) candidate = seal(candidate);
    let rejected = false;
    try { validateReceipt(candidate, expected); } catch { rejected = true; }
    if (!rejected) fail('SAME_RUN_SELF_TEST_MUTATION_ESCAPED');
  }
  console.log(JSON.stringify({suite: 'KPMO_CONTINUOUS_ASSURANCE_SAME_RUN_AUTHORITY_V1', state: 'VERIFIED_PASS', positive: 1, negative: mutations.length}));
}

function main() {
  if (process.argv.includes('--self-test')) return selfTest();
  const file = option('--receipt');
  const expected = {repository: option('--expected-repository'), sourceSha: option('--expected-source-sha'), runId: Number(option('--expected-run-id')), runAttempt: Number(option('--expected-run-attempt'))};
  if (!file || !expected.repository || !SHA.test(expected.sourceSha) || !positiveInteger(expected.runId) || !positiveInteger(expected.runAttempt)) fail('SAME_RUN_EXPECTED_BINDINGS_INVALID');
  validateReceipt(readReceipt(path.resolve(file)), expected);
  console.log(JSON.stringify({state: 'VERIFIED_PASS', receipt: file, repository: expected.repository, source_sha: expected.sourceSha, observer_run_id: expected.runId, observer_run_attempt: expected.runAttempt}));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
