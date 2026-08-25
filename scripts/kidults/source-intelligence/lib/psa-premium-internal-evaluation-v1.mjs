import { createHash, createHmac } from 'node:crypto';

const DAY_MS = 86_400_000;
const ALLOWED_IDENTITY_KEYS = Object.freeze([
  'certification_id', 'grade', 'year', 'brand_title', 'subject',
  'item_number', 'category', 'variety_pedigree', 'population_context'
]);
const aliases = Object.freeze({
  certification_id: ['CertNumber', 'CertNo', 'CertificationNumber'],
  grade: ['GradeDescription', 'Grade', 'ItemGrade'],
  year: ['Year'], brand_title: ['Brand', 'BrandTitle', 'BrandOrTitle', 'SpecDescription'],
  subject: ['Subject', 'Player', 'Name'], item_number: ['CardNumber', 'CardNo', 'ItemNumber'],
  category: ['Category'], variety_pedigree: ['Variety', 'VarietyPedigree', 'Pedigree'],
  population_context: ['Population', 'PopulationTotal', 'TotalPopulation']
});
const canonical = value => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};
const digest = value => `sha256:${createHash('sha256').update(String(value)).digest('hex')}`;

function cleanScalar(value) {
  if (value === undefined || value === null) return null;
  if (!['string', 'number', 'boolean'].includes(typeof value)) return null;
  const text = String(value).trim();
  return text.length > 512 ? text.slice(0, 512) : text;
}
function pick(payload, names) {
  const entries = Object.entries(payload || {});
  for (const name of names) {
    const found = entries.find(([key]) => key.toLowerCase() === name.toLowerCase());
    if (found) return cleanScalar(found[1]);
  }
  return null;
}

export function validatePsaEvaluationContract(contract) {
  const errors = [];
  if (contract.provider_id !== 'psa-public-api') errors.push('PROVIDER_ID');
  if (contract.provider_role !== 'AUTHORITATIVE_CERTIFICATION_AND_GRADE_VERIFICATION') errors.push('PROVIDER_ROLE');
  if (contract.not_a_market_transaction_source !== true) errors.push('MARKET_SOURCE_BOUNDARY');
  if (contract.field_purpose_rights?.collect !== 'ALLOW_BOUNDED_INTERNAL_EVALUATION') errors.push('COLLECT_RIGHT');
  if (contract.field_purpose_rights?.store !== 'ALLOW_PRIVATE_INTERNAL_EVALUATION') errors.push('STORE_RIGHT');
  if (contract.field_purpose_rights?.derive_internal_er_calibration !== 'ALLOW') errors.push('DERIVE_RIGHT');
  if (contract.field_purpose_rights?.human_review !== 'ALLOW') errors.push('HUMAN_REVIEW_RIGHT');
  if (contract.field_purpose_rights?.display_public !== 'BLOCK') errors.push('PUBLIC_BLOCK');
  if (contract.field_purpose_rights?.redistribute !== 'BLOCK') errors.push('REDISTRIBUTION_BLOCK');
  if (contract.retention?.maximum_days !== 30) errors.push('RETENTION_30_DAYS');
  if (contract.retention?.expiry_action !== 'DELETE_AND_TOMBSTONE') errors.push('EXPIRY_ACTION');
  if (contract.production !== 'HOLD' || contract.publication !== 'HOLD') errors.push('RELEASE_BOUNDARY');
  return { valid: errors.length === 0, errors };
}

export function normalizePsaCertResponse(payload, options = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('PSA_OBJECT_REQUIRED');
  if (!options.pseudonymKey || String(options.pseudonymKey).length < 32) throw new Error('PSEUDONYM_KEY_MIN_32_REQUIRED');
  const timestamp = new Date(options.collectedAt);
  if (!Number.isFinite(timestamp.getTime())) throw new Error('COLLECTED_AT_INVALID');
  const identity = Object.fromEntries(ALLOWED_IDENTITY_KEYS.map(key => [key, pick(payload, aliases[key])]));
  if (!identity.certification_id || !identity.grade) throw new Error('CERT_AND_GRADE_REQUIRED');
  identity.certification_id = `hmac256:${createHmac('sha256', options.pseudonymKey).update(identity.certification_id).digest('hex')}`;
  const normalized = {
    schema: 'kidults.psa.internal-evaluation.v1', provider_id: 'psa-public-api',
    provider_role: 'AUTHORITATIVE_CERTIFICATION_AND_GRADE_VERIFICATION',
    purpose: 'INTERNAL_ENTITY_RESOLUTION_AND_MODEL_CALIBRATION',
    source_request_id: options.sourceRequestId || null, collected_at: timestamp.toISOString(),
    expires_at: new Date(timestamp.getTime() + 30 * DAY_MS).toISOString(), retention_days: 30,
    identity, market_transaction_claim_eligible: false, current_sold_claim_eligible: false,
    public_display: 'BLOCK', redistribution: 'BLOCK', raw_provider_payload_retained: false,
    human_review_state: 'PENDING', admission_state: 'PRIVATE_EVALUATION_ONLY'
  };
  return { ...normalized, record_digest: digest(canonical(normalized)) };
}

export function buildPsaHumanReviewTask(record) {
  if (record?.schema !== 'kidults.psa.internal-evaluation.v1') throw new Error('NORMALIZED_RECORD_REQUIRED');
  return {
    schema: 'kidults.psa.human-review-task.v1', task_id: digest(`${record.record_digest}:human-review`),
    record_digest: record.record_digest, purpose: 'ENTITY_RESOLUTION_MATCH_VALIDATION',
    permitted_view: 'PRIVATE_INTERNAL_ONLY',
    reviewer_fields: ALLOWED_IDENTITY_KEYS.filter(key => record.identity[key] !== null),
    prohibited_actions: ['PUBLIC_DISPLAY', 'REDISTRIBUTION', 'RAW_PAYLOAD_EXPORT', 'MARKET_TRANSACTION_INFERENCE'],
    state: 'PENDING_HUMAN_REVIEW', expires_at: record.expires_at
  };
}

export function evaluatePsaRetention(record, now = new Date()) {
  const current = new Date(now); const expiry = new Date(record?.expires_at);
  if (!Number.isFinite(current.getTime()) || !Number.isFinite(expiry.getTime())) throw new Error('RETENTION_TIME_INVALID');
  if (current.getTime() < expiry.getTime()) return { state: 'RETAIN_PRIVATE', deleteRequired: false };
  return { state: 'DELETE_AND_TOMBSTONE_REQUIRED', deleteRequired: true, tombstone: {
    schema: 'kidults.psa.retention-tombstone.v1', record_digest: record.record_digest,
    expired_at: record.expires_at, deletion_reason: 'PSA_BOUNDED_EVALUATION_RETENTION_EXPIRED',
    provider_payload_retained: false
  }};
}

export function buildPsaEvaluationReceipt({ record, reviewTask, retentionState, sourceSha = 'SYNTHETIC' }) {
  const body = {
    schema: 'kidults.psa.internal-evaluation-receipt.v1', source_sha: sourceSha,
    record_digest: record.record_digest, review_task_id: reviewTask.task_id,
    retention_state: retentionState.state, rights_scope: 'BOUNDED_PRIVATE_INTERNAL_EVALUATION',
    raw_provider_payload_retained: false, market_transaction_claim_increment: 0,
    reviewer_material_increment: 0, production: 'HOLD', publication: 'HOLD'
  };
  return { ...body, receipt_digest: digest(canonical(body)) };
}

export { ALLOWED_IDENTITY_KEYS };
