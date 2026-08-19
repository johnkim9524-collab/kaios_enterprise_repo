import fs from 'node:fs';
import { createHash } from 'node:crypto';

const CONFIG_PATH = 'coordination/kidults/entity-resolution/pressing-source-corpus-r1.json';
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

function fail(code) {
  throw new Error(code);
}

function sha(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function digest(value) {
  return sha(JSON.stringify(canonical(value)));
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function findProhibitedPayloadKey(value, path = 'payload') {
  const prohibited = new Set([
    'model_prediction', 'model_score', 'expected', 'reviewer_id', 'reviewed_at',
    'adjudicated_label', 'benchmark_result', 'market_price', 'current_price',
    'sale_price', 'cover_art', 'cover-art', 'tags', 'genres', 'ratings',
    'annotation', 'score'
  ]);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findProhibitedPayloadKey(value[index], `${path}[${index}]`);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  for (const [key, nested] of Object.entries(value)) {
    if (prohibited.has(key)) return `${path}.${key}`;
    const found = findProhibitedPayloadKey(nested, `${path}.${key}`);
    if (found) return found;
  }
  return null;
}

export function validateArtifact(artifact) {
  if (artifact.id !== config.id || artifact.version !== config.version) fail('ARTIFACT_ID_OR_VERSION_MISMATCH');
  if (artifact.status !== 'REAL_SOURCE_RECORD_CORPUS_UNLABELED') fail('ARTIFACT_STATUS_INVALID');
  if (artifact.stratum_id !== 'er-stratum-pressing-edition-media') fail('STRATUM_INVALID');
  if (artifact.source_id !== 'musicbrainz-core-catalog') fail('SOURCE_INVALID');
  if (artifact.acquisition_transport !== 'musicbrainz-ws2-bounded-noncommercial-core-fields-only') fail('TRANSPORT_BOUNDARY_INVALID');
  if (artifact.data_rights_state !== 'ALLOW' || artifact.data_rights_state !== config.data_rights_state_required) fail('DATA_RIGHTS_STATE_INVALID');
  if (artifact.acquisition_transport_state !== 'ALLOW_NONCOMMERCIAL_RESEARCH_ONLY' || artifact.acquisition_transport_state !== config.acquisition_transport_state_required) fail('TRANSPORT_RIGHTS_STATE_INVALID');
  if (artifact.source_query !== config.search_query) fail('SOURCE_QUERY_MISMATCH');
  if (!Number.isInteger(artifact.search_pages_fetched) || artifact.search_pages_fetched < 1 || artifact.search_pages_fetched > config.maximum_search_pages) fail('SEARCH_PAGE_COUNT_INVALID');
  if (!Number.isInteger(artifact.eligible_records_observed) || artifact.eligible_records_observed < config.target_source_record_count) fail('ELIGIBLE_RECORD_FLOOR_NOT_MET');
  if (artifact.record_count !== config.target_source_record_count || !Array.isArray(artifact.records) || artifact.records.length !== config.target_source_record_count) fail('RECORD_COUNT_INVALID');
  if (!/^sha256:[a-f0-9]{64}$/.test(String(artifact.source_corpus_sha256 || ''))) fail('CORPUS_DIGEST_INVALID');
  if (!Number.isFinite(Date.parse(artifact.acquired_at))) fail('ACQUIRED_AT_INVALID');
  if (artifact.labels_present !== false || artifact.model_predictions_present !== false) fail('LABEL_OR_MODEL_LEAKAGE');
  if (artifact.reviewer_assignment_required !== true || artifact.empirical_pass !== false || artifact.track_b !== 'NOT_STARTED') fail('FALSE_EMPIRICAL_COMPLETION');
  if (artifact.production !== 'HOLD' || artifact.public_release !== 'HOLD') fail('PRODUCTION_OR_PUBLIC_RELEASE_MUST_HOLD');
  if (artifact.api_use_boundary !== config.api_use_boundary || artifact.truth_boundary !== config.truth_boundary) fail('TRUTH_BOUNDARY_MISMATCH');
  for (const excluded of config.excluded_data_families) {
    if (!artifact.excluded_data_families?.includes(excluded)) fail(`EXCLUDED_DATA_BOUNDARY_MISSING:${excluded}`);
  }

  const seen = new Set();
  for (const record of artifact.records) {
    if (record.source_id !== 'musicbrainz-core-catalog') fail('RECORD_SOURCE_INVALID');
    if (!isUuid(record.source_record_id) || seen.has(record.source_record_id)) fail('RECORD_ID_INVALID_OR_DUPLICATE');
    seen.add(record.source_record_id);
    if (record.source_reference !== `https://musicbrainz.org/release/${record.source_record_id}`) fail('RECORD_SOURCE_REFERENCE_INVALID');
    if (record.rights_state !== 'ALLOW' || record.rights_state !== config.data_rights_state_required) fail('RIGHTS_STATE_INVALID');
    if (record.acquisition_transport_state !== 'ALLOW_NONCOMMERCIAL_RESEARCH_ONLY' || record.acquisition_transport_state !== config.acquisition_transport_state_required) fail('RECORD_TRANSPORT_RIGHTS_STATE_INVALID');
    if (!Array.isArray(record.license_evidence_refs) || config.license_evidence_refs.some((reference) => !record.license_evidence_refs.includes(reference))) fail('LICENSE_EVIDENCE_INCOMPLETE');
    if (!Array.isArray(record.provenance_refs) || record.provenance_refs.length < 2 ||
        !record.provenance_refs.some((reference) => String(reference).startsWith('https://musicbrainz.org/ws/2/release/')) ||
        !record.provenance_refs.includes(record.source_reference)) fail('PROVENANCE_EVIDENCE_INCOMPLETE');
    if (!/^sha256:[a-f0-9]{64}$/.test(String(record.source_payload_sha256 || '')) || record.source_payload_sha256 !== digest(record.payload)) fail('PAYLOAD_DIGEST_INVALID');
    if (findProhibitedPayloadKey(record.payload)) fail(`PROHIBITED_PAYLOAD_FIELD:${findProhibitedPayloadKey(record.payload)}`);

    const payload = record.payload || {};
    if (payload.release_mbid !== record.source_record_id || !payload.release_title) fail('RELEASE_ID_OR_TITLE_INVALID');
    if (payload.release_status !== 'Official') fail('RELEASE_STATUS_NOT_OFFICIAL');
    if (!/^\d{8,14}$/.test(String(payload.barcode || ''))) fail('REAL_BARCODE_REQUIRED');
    if (!isUuid(payload.release_group?.release_group_mbid) || !payload.release_group?.title) fail('RELEASE_GROUP_REQUIRED');
    if (!Array.isArray(payload.artist_credit) || payload.artist_credit.length < 1 || payload.artist_credit.some((credit) => !isUuid(credit.artist_mbid) || !credit.artist_name || !credit.credited_name)) fail('ARTIST_CREDIT_REQUIRED');
    if (!Array.isArray(payload.label_catalog_numbers) || payload.label_catalog_numbers.length < 1 || payload.label_catalog_numbers.some((entry) => !isUuid(entry.label_mbid) || !entry.label_name || !entry.catalog_number || String(entry.catalog_number).toLowerCase() === '[none]')) fail('LABEL_CATALOG_NUMBER_REQUIRED');
    if (!Array.isArray(payload.media) || payload.media.length < 1 || payload.media.some((medium) => !/vinyl/i.test(String(medium.format || '')))) fail('VINYL_MEDIUM_REQUIRED');
  }

  const expectedCorpusDigest = digest(artifact.records.map((record) => ({
    source_record_id: record.source_record_id,
    source_payload_sha256: record.source_payload_sha256
  })));
  if (artifact.source_corpus_sha256 !== expectedCorpusDigest) fail('CORPUS_DIGEST_MISMATCH');
  return {
    status: 'PASS_REAL_UNLABELED_SOURCE_RECORDS_ONLY',
    record_count: artifact.record_count,
    production: 'HOLD',
    public_release: 'HOLD'
  };
}

function fakeUuid(index, namespace = 0) {
  const suffix = (BigInt(namespace) * 1000n + BigInt(index)).toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${suffix}`;
}

function makeSelfTestArtifact() {
  const records = Array.from({ length: config.target_source_record_count }, (_, index) => {
    const sourceRecordId = fakeUuid(index + 1, 1);
    const payload = {
      release_mbid: sourceRecordId,
      release_title: `Fixture release ${index + 1}`,
      release_status: 'Official',
      release_date: '2000-01-01',
      country: 'US',
      barcode: String(10000000 + index),
      release_group: {
        release_group_mbid: fakeUuid(index + 1, 2),
        title: `Fixture group ${index + 1}`,
        primary_type: 'Album',
        first_release_date: '2000-01-01'
      },
      artist_credit: [{ artist_mbid: fakeUuid(index + 1, 3), artist_name: `Artist ${index + 1}`, credited_name: `Artist ${index + 1}`, joinphrase: '' }],
      label_catalog_numbers: [{ label_mbid: fakeUuid(1, 4), label_name: 'Fixture Label', catalog_number: `CAT-${index + 1}` }],
      media: [{ position: 1, title: '', format: '12\" Vinyl', track_count: 2, disc_count: 1 }]
    };
    const sourceReference = `https://musicbrainz.org/release/${sourceRecordId}`;
    return {
      source_id: 'musicbrainz-core-catalog',
      source_record_id: sourceRecordId,
      source_reference: sourceReference,
      source_payload_sha256: digest(payload),
      license_evidence_refs: [...config.license_evidence_refs],
      rights_state: 'ALLOW',
      acquisition_transport_state: 'ALLOW_NONCOMMERCIAL_RESEARCH_ONLY',
      provenance_refs: ['https://musicbrainz.org/ws/2/release/?query=fixture', sourceReference],
      payload
    };
  });
  return {
    id: config.id,
    version: config.version,
    status: 'REAL_SOURCE_RECORD_CORPUS_UNLABELED',
    stratum_id: config.stratum_id,
    source_id: config.source,
    acquisition_transport: 'musicbrainz-ws2-bounded-noncommercial-core-fields-only',
    data_rights_state: 'ALLOW',
    acquisition_transport_state: 'ALLOW_NONCOMMERCIAL_RESEARCH_ONLY',
    source_query: config.search_query,
    source_corpus_sha256: digest(records.map((record) => ({ source_record_id: record.source_record_id, source_payload_sha256: record.source_payload_sha256 }))),
    acquired_at: '2026-08-19T00:00:00.000Z',
    search_pages_fetched: 3,
    observed_search_result_count: 1000,
    eligible_records_observed: records.length,
    record_count: records.length,
    excluded_data_families: [...config.excluded_data_families],
    api_use_boundary: config.api_use_boundary,
    labels_present: false,
    model_predictions_present: false,
    reviewer_assignment_required: true,
    empirical_pass: false,
    track_b: 'NOT_STARTED',
    public_release: 'HOLD',
    production: 'HOLD',
    truth_boundary: config.truth_boundary,
    records
  };
}

function expectFailure(base, mutate, expectedCode) {
  const candidate = structuredClone(base);
  mutate(candidate);
  try {
    validateArtifact(candidate);
  } catch (error) {
    if (String(error.message).startsWith(expectedCode)) return;
    throw error;
  }
  fail(`SELFTEST_EXPECTED_FAILURE_NOT_OBSERVED:${expectedCode}`);
}

function runSelfTest() {
  const base = makeSelfTestArtifact();
  validateArtifact(base);
  expectFailure(base, (candidate) => {
    candidate.records[0].payload.barcode = '';
    candidate.records[0].source_payload_sha256 = digest(candidate.records[0].payload);
    candidate.source_corpus_sha256 = digest(candidate.records.map((record) => ({ source_record_id: record.source_record_id, source_payload_sha256: record.source_payload_sha256 })));
  }, 'REAL_BARCODE_REQUIRED');
  expectFailure(base, (candidate) => {
    candidate.records[0].payload.media[0].format = 'CD';
    candidate.records[0].source_payload_sha256 = digest(candidate.records[0].payload);
    candidate.source_corpus_sha256 = digest(candidate.records.map((record) => ({ source_record_id: record.source_record_id, source_payload_sha256: record.source_payload_sha256 })));
  }, 'VINYL_MEDIUM_REQUIRED');
  expectFailure(base, (candidate) => {
    candidate.records[0].payload.market_price = 99;
    candidate.records[0].source_payload_sha256 = digest(candidate.records[0].payload);
    candidate.source_corpus_sha256 = digest(candidate.records.map((record) => ({ source_record_id: record.source_record_id, source_payload_sha256: record.source_payload_sha256 })));
  }, 'PROHIBITED_PAYLOAD_FIELD');
  expectFailure(base, (candidate) => {
    candidate.records[1].source_record_id = candidate.records[0].source_record_id;
  }, 'RECORD_ID_INVALID_OR_DUPLICATE');
  expectFailure(base, (candidate) => { candidate.production = 'GO'; }, 'PRODUCTION_OR_PUBLIC_RELEASE_MUST_HOLD');
  console.log('KIDULTS_ER_PRESSING_SOURCE_CORPUS_R1_SELFTEST_PASS');
}

const input = process.argv[2];
if (input === '--self-test') {
  runSelfTest();
} else {
  if (!input) fail('Usage: node validate-pressing-source-corpus-r1.mjs <artifact.json>|--self-test');
  const result = validateArtifact(JSON.parse(fs.readFileSync(input, 'utf8')));
  console.log(JSON.stringify(result));
}
