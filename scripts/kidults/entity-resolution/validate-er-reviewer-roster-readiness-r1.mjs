import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const [rosterPath, receiptPath = '/tmp/er-reviewer-roster-readiness-r1.json', mode] = process.argv.slice(2);
if (!rosterPath) {
  throw new Error('usage: validate-er-reviewer-roster-readiness-r1.mjs <private-reviewer-roster.json> [safe-receipt.json] [--contract-test-fixture]');
}

const fixtureMode = mode === '--contract-test-fixture';
const operationalContract = JSON.parse(await fs.readFile('coordination/kidults/entity-resolution/human-review-gate-operational-contract-r1.json', 'utf8'));
const roster = JSON.parse(await fs.readFile(rosterPath, 'utf8'));

const SHA256_RE = /^sha256:[0-9a-f]{64}$/;
const PLACEHOLDER_RE = /^(?:a|b|na|n\/a|none|null|unknown|pending|unassigned|not[-_ ]?assigned|tbd|todo|reviewer(?:[-_ ]?[ab12])?|reviewer[-_ ]?one|reviewer[-_ ]?two)$/i;
const PLACEHOLDER_FRAGMENT_RE = /(?:^|[:/_ .-])(?:placeholder|dummy|fake|test(?:er)?|example|sample|tbd|todo|unassigned|not[-_ ]?assigned)(?:$|[:/_ .-])/i;
const REVIEWER_FIELDS = [
  'slot',
  'reviewer_id',
  'identity_source_type',
  'identity_verification_ref',
  'identity_attestation_sha256',
  'independence_attestation_sha256',
  'availability_attestation_sha256',
  'availability_state',
  'attested_at',
  'resolver_author',
  'model_operator',
  'other_reviewer_labels_seen'
];

function fail(code, detail = '') {
  throw new Error(detail ? `${code}:${detail}` : code);
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}
function digest(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')}`;
}
function assertObject(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
}
function assertExactKeys(value, keys, code) {
  assertObject(value, code);
  const expected = new Set(keys);
  for (const key of Object.keys(value)) if (!expected.has(key)) fail(code, key);
  for (const key of keys) if (!(key in value)) fail(code, `MISSING_${key}`);
}
function requiredString(value, code) {
  if (typeof value !== 'string' || value.trim() === '') fail(code);
  return value.trim();
}
function requireSha(value, code) {
  if (!SHA256_RE.test(value)) fail(code);
}
function requireIso(value, code) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value) || Number.isNaN(Date.parse(value))) fail(code);
}
function isPlaceholder(value) {
  if (typeof value !== 'string') return true;
  const normalized = value.trim();
  return normalized.length < 6 || PLACEHOLDER_RE.test(normalized) || PLACEHOLDER_FRAGMENT_RE.test(normalized);
}

if (operationalContract.production !== 'HOLD' || operationalContract.public_release !== 'HOLD') fail('RELEASE_BOUNDARY_WEAKENED');
if (operationalContract.human_completion?.minimum_independent_reviewers !== 2) fail('TWO_REVIEWER_CONTRACT_REQUIRED');
if (operationalContract.human_completion?.identity_verification_boundary !== 'EXTERNALLY_GOVERNED_REGISTRY_ASSERTION_STRUCTURAL_VALIDATION_ONLY') fail('IDENTITY_VERIFICATION_BOUNDARY_DRIFT');
const allowedIdentitySources = operationalContract.human_completion?.allowed_reviewer_identity_sources;
if (!Array.isArray(allowedIdentitySources) || allowedIdentitySources.length === 0) fail('ALLOWED_IDENTITY_SOURCES_REQUIRED');

const topLevelFields = fixtureMode
  ? ['schema_version', 'fixture_classification', 'roster_state', 'owner_designation_ref_sha256', 'reviewers']
  : ['schema_version', 'roster_state', 'owner_designation_ref_sha256', 'reviewers'];
assertExactKeys(roster, topLevelFields, 'REVIEWER_ROSTER_FIELD_INVALID');
if (roster.schema_version !== '1.0.0') fail('REVIEWER_ROSTER_SCHEMA_INVALID');
if (fixtureMode) {
  if (roster.fixture_classification !== 'CONTRACT_TEST_IDENTITY_SIMULATION_NOT_REVIEWER_EVIDENCE') fail('FIXTURE_CLASSIFICATION_REQUIRED');
  if (roster.roster_state !== 'CONTRACT_TEST_ROSTER_ONLY') fail('FIXTURE_ROSTER_STATE_INVALID');
} else {
  if ('fixture_classification' in roster) fail('REAL_ROSTER_CANNOT_BE_FIXTURE');
  if (roster.roster_state !== 'OWNER_DESIGNATED_PRIVATE_ROSTER_READY_FOR_PACKET_ASSIGNMENT') fail('REAL_ROSTER_STATE_INVALID');
}
requireSha(roster.owner_designation_ref_sha256, 'OWNER_DESIGNATION_REFERENCE_REQUIRED');
if (!Array.isArray(roster.reviewers) || roster.reviewers.length !== 2) fail('EXACT_TWO_REVIEWERS_REQUIRED');

const seenSlots = new Set();
const seenIds = new Set();
for (const reviewer of roster.reviewers) {
  assertExactKeys(reviewer, REVIEWER_FIELDS, 'REVIEWER_FIELD_INVALID');
  if (!['A', 'B'].includes(reviewer.slot)) fail('REVIEWER_SLOT_INVALID', reviewer.slot);
  if (seenSlots.has(reviewer.slot)) fail('DUPLICATE_REVIEWER_SLOT', reviewer.slot);
  seenSlots.add(reviewer.slot);

  const reviewerId = requiredString(reviewer.reviewer_id, 'REVIEWER_ID_REQUIRED');
  const identityRef = requiredString(reviewer.identity_verification_ref, 'REVIEWER_IDENTITY_VERIFICATION_REF_REQUIRED');
  if (!fixtureMode && (isPlaceholder(reviewerId) || isPlaceholder(identityRef))) fail('PLACEHOLDER_REVIEWER_EVIDENCE_REJECTED', reviewer.slot);
  const normalizedId = reviewerId.toLowerCase().replace(/\s+/g, '');
  if (seenIds.has(normalizedId)) fail('DUPLICATE_REVIEWER_REJECTED', reviewer.slot);
  seenIds.add(normalizedId);

  if (!allowedIdentitySources.includes(reviewer.identity_source_type)) fail('REVIEWER_IDENTITY_SOURCE_INVALID', reviewer.slot);
  requireSha(reviewer.identity_attestation_sha256, `REVIEWER_IDENTITY_ATTESTATION_REQUIRED:${reviewer.slot}`);
  requireSha(reviewer.independence_attestation_sha256, `REVIEWER_INDEPENDENCE_ATTESTATION_REQUIRED:${reviewer.slot}`);
  requireSha(reviewer.availability_attestation_sha256, `REVIEWER_AVAILABILITY_ATTESTATION_REQUIRED:${reviewer.slot}`);
  requireIso(reviewer.attested_at, `REVIEWER_ATTESTED_AT_REQUIRED:${reviewer.slot}`);
  if (reviewer.availability_state !== 'AVAILABLE') fail('REVIEWER_NOT_AVAILABLE', reviewer.slot);
  if (reviewer.resolver_author !== false || reviewer.model_operator !== false || reviewer.other_reviewer_labels_seen !== false) {
    fail('REVIEWER_INDEPENDENCE_ATTESTATION_FALSE', reviewer.slot);
  }
}
if (!seenSlots.has('A') || !seenSlots.has('B')) fail('REVIEWER_A_B_REQUIRED');

const receipt = {
  schema_version: '1.0.0',
  receipt_state: fixtureMode ? 'CONTRACT_TEST_PASS_NOT_REVIEWER_EVIDENCE' : 'PRIVATE_ROSTER_STRUCTURALLY_VALID',
  private_roster_commitment_sha256: digest(roster),
  reviewer_count: 2,
  reviewer_slots: ['A', 'B'],
  reviewer_identities_exposed: false,
  identity_verification_boundary: operationalContract.human_completion.identity_verification_boundary,
  availability_required: true,
  independent_from_resolver_decision_path_required: true,
  labels_created: false,
  adjudication_started: false,
  blind_partition_sealed: false,
  empirical_pass: false,
  track_b_started: false,
  public_release: 'HOLD',
  production: 'HOLD',
  truth_boundary: 'Structural validation of an owner-designated PRIVATE reviewer roster only. This receipt does not prove human identity from strings or hashes, does not expose reviewer identity/reference data, does not create labels, and does not advance empirical ER, Track B, Public, Production or G5.'
};
await fs.writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify(receipt));
