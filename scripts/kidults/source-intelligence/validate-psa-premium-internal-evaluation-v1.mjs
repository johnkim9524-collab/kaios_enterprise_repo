import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { ALLOWED_IDENTITY_KEYS, buildPsaEvaluationReceipt, buildPsaHumanReviewTask, evaluatePsaRetention, normalizePsaCertResponse, validatePsaEvaluationContract } from './lib/psa-premium-internal-evaluation-v1.mjs';

const contractPath = process.argv[2] || 'coordination/kidults/source-intelligence/psa-bounded-rights-schema-evaluation-v1.json';
const outputPath = process.argv[3];
const contract = JSON.parse(await fs.readFile(contractPath, 'utf8'));
assert.deepEqual(validatePsaEvaluationContract(contract), { valid: true, errors: [] });
const fixture = {
  CertNumber: '08178895', GradeDescription: 'GEM MT 10', Year: '1999', Brand: 'Synthetic Brand',
  Subject: 'Synthetic Subject', CardNumber: 'S-001', Category: 'Trading Cards', Population: 42,
  Price: 9999, LastSold: 'DO_NOT_ADMIT', RawImage: { bytes: 'DO_NOT_RETAIN' }
};
const record = normalizePsaCertResponse(fixture, { collectedAt: '2026-08-25T00:00:00.000Z', pseudonymKey: 'synthetic-test-key-with-at-least-32-characters', sourceRequestId: 'synthetic-psa-001' });
assert.match(record.identity.certification_id, /^hmac256:[a-f0-9]{64}$/);
assert.equal(record.identity.grade, 'GEM MT 10');
assert.equal(record.retention_days, 30);
assert.equal(record.market_transaction_claim_eligible, false);
assert.equal(record.current_sold_claim_eligible, false);
assert.equal(record.raw_provider_payload_retained, false);
assert.deepEqual(Object.keys(record.identity), ALLOWED_IDENTITY_KEYS);
for (const forbidden of ['9999', 'DO_NOT_ADMIT', 'DO_NOT_RETAIN']) assert.equal(JSON.stringify(record).includes(forbidden), false);
const changedIdentityRecord = normalizePsaCertResponse({ ...fixture, Subject: 'Different Synthetic Subject' }, { collectedAt: '2026-08-25T00:00:00.000Z', pseudonymKey: 'synthetic-test-key-with-at-least-32-characters', sourceRequestId: 'synthetic-psa-001' });
assert.notEqual(changedIdentityRecord.record_digest, record.record_digest);
const reviewTask = buildPsaHumanReviewTask(record);
assert.equal(reviewTask.permitted_view, 'PRIVATE_INTERNAL_ONLY');
assert.ok(reviewTask.prohibited_actions.includes('MARKET_TRANSACTION_INFERENCE'));
assert.deepEqual(evaluatePsaRetention(record, '2026-09-23T23:59:59.000Z'), { state: 'RETAIN_PRIVATE', deleteRequired: false });
const expired = evaluatePsaRetention(record, '2026-09-24T00:00:00.000Z');
assert.equal(expired.state, 'DELETE_AND_TOMBSTONE_REQUIRED');
assert.equal(expired.tombstone.provider_payload_retained, false);
const mutations = [
  x => { x.field_purpose_rights.display_public = 'ALLOW'; }, x => { x.retention.maximum_days = 31; },
  x => { x.not_a_market_transaction_source = false; }, x => { x.field_purpose_rights.human_review = 'PENDING'; }
];
for (const mutate of mutations) { const changed = structuredClone(contract); mutate(changed); assert.equal(validatePsaEvaluationContract(changed).valid, false); }
const receipt = buildPsaEvaluationReceipt({ record, reviewTask, retentionState: expired });
const result = {
  id: 'kidults-psa-premium-downstream-readiness-v1', state: 'VERIFIED_PASS_SYNTHETIC_INTERNAL_CHAIN',
  contract_validated: true, normalized_allowed_fields: ALLOWED_IDENTITY_KEYS.length,
  raw_payload_suppression_verified: true, market_semantics_suppression_verified: true,
  pseudonymization_verified: true, human_review_queue_verified: true,
  retention_delete_tombstone_verified: true, mutation_cases_detected: mutations.length,
  receipt, external_api_called: false, empirical_gate_effect: 'NONE', production: 'HOLD', publication: 'HOLD'
};
if (outputPath) await fs.writeFile(outputPath, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
