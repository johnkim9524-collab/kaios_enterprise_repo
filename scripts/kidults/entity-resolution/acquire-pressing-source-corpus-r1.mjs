import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const CONFIG_PATH = 'coordination/kidults/entity-resolution/pressing-source-corpus-r1.json';
const API_ROOT = 'https://musicbrainz.org/ws/2/release/';
const USER_AGENT = 'KIDULTS-ER-EMPIRICAL-ACQUISITION/1.0 (https://github.com/johnkim9524-collab/kaios_enterprise_repo)';
const out = process.argv[2] || '/tmp/pressing-source-corpus-r1.json';
const config = JSON.parse(await fs.readFile(CONFIG_PATH, 'utf8'));

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

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

let lastRequestStartedAt = 0;
async function fetchJson(url) {
  const retryable = new Set([429, 500, 502, 503, 504]);
  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const elapsed = Date.now() - lastRequestStartedAt;
    const waitForRateLimit = Number(config.minimum_request_interval_ms) - elapsed;
    if (waitForRateLimit > 0) await sleep(waitForRateLimit);
    lastRequestStartedAt = Date.now();

    try {
      const response = await fetch(url, {
        headers: {
          accept: 'application/json',
          'user-agent': USER_AGENT
        },
        signal: AbortSignal.timeout(30_000)
      });
      if (response.ok) return await response.json();
      if (!retryable.has(response.status)) throw new Error(`MUSICBRAINZ_HTTP_${response.status}`);
      const retryAfterSeconds = Number(response.headers.get('retry-after'));
      const retryDelay = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
        ? retryAfterSeconds * 1000
        : 2 ** attempt * 2_000;
      lastError = new Error(`MUSICBRAINZ_HTTP_${response.status}`);
      await sleep(retryDelay);
    } catch (error) {
      lastError = error;
      if (String(error?.message || '').startsWith('MUSICBRAINZ_HTTP_4') &&
          !String(error?.message || '').includes('429')) throw error;
      if (attempt < 4) await sleep(2 ** attempt * 2_000);
    }
  }
  throw lastError || new Error('MUSICBRAINZ_REQUEST_FAILED');
}

function searchUrl(offset) {
  const url = new URL(API_ROOT);
  url.searchParams.set('query', config.search_query);
  url.searchParams.set('fmt', 'json');
  url.searchParams.set('limit', String(config.page_limit));
  url.searchParams.set('offset', String(offset));
  return url.toString();
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function normalizeArtistCredit(credit) {
  return (Array.isArray(credit) ? credit : []).map((entry) => ({
    artist_mbid: String(entry?.artist?.id || ''),
    artist_name: String(entry?.artist?.name || ''),
    credited_name: String(entry?.name || entry?.artist?.name || ''),
    joinphrase: String(entry?.joinphrase || '')
  })).filter((entry) => isUuid(entry.artist_mbid) && entry.artist_name);
}

function normalizeLabels(labelInfo) {
  return (Array.isArray(labelInfo) ? labelInfo : []).map((entry) => ({
    label_mbid: String(entry?.label?.id || ''),
    label_name: String(entry?.label?.name || ''),
    catalog_number: String(entry?.['catalog-number'] || '').trim()
  })).filter((entry) =>
    isUuid(entry.label_mbid) && entry.label_name && entry.catalog_number &&
    entry.catalog_number.toLowerCase() !== '[none]'
  ).sort((a, b) => `${a.label_mbid}:${a.catalog_number}`.localeCompare(`${b.label_mbid}:${b.catalog_number}`));
}

function normalizeMedia(media) {
  return (Array.isArray(media) ? media : []).map((entry) => ({
    position: Number(entry?.position || 0),
    title: String(entry?.title || ''),
    format: String(entry?.format || ''),
    track_count: Number(entry?.['track-count'] || 0),
    disc_count: Number(entry?.['disc-count'] || 0)
  })).filter((entry) => /vinyl/i.test(entry.format))
    .sort((a, b) => a.position - b.position || a.format.localeCompare(b.format));
}

function normalizeRelease(release) {
  const labels = normalizeLabels(release?.['label-info']);
  const media = normalizeMedia(release?.media);
  const releaseGroup = release?.['release-group'] || {};
  const barcode = String(release?.barcode || '').trim();
  if (!isUuid(release?.id) || !isUuid(releaseGroup?.id)) return null;
  if (String(release?.status || '').toLowerCase() !== 'official') return null;
  if (!/^\d{8,14}$/.test(barcode) || labels.length === 0 || media.length === 0) return null;

  const payload = {
    release_mbid: String(release.id),
    release_title: String(release.title || ''),
    release_status: String(release.status),
    release_date: String(release.date || ''),
    country: String(release.country || ''),
    barcode,
    release_group: {
      release_group_mbid: String(releaseGroup.id),
      title: String(releaseGroup.title || ''),
      primary_type: String(releaseGroup['primary-type'] || ''),
      first_release_date: String(releaseGroup['first-release-date'] || '')
    },
    artist_credit: normalizeArtistCredit(release['artist-credit']),
    label_catalog_numbers: labels,
    media
  };
  if (!payload.release_title || payload.artist_credit.length === 0) return null;
  return payload;
}

const byReleaseMbid = new Map();
let observedSearchResultCount = null;
let pagesFetched = 0;
for (let page = 0; page < Number(config.maximum_search_pages); page += 1) {
  const offset = page * Number(config.page_limit);
  const pageUrl = searchUrl(offset);
  const response = await fetchJson(pageUrl);
  pagesFetched += 1;
  if (observedSearchResultCount === null) observedSearchResultCount = Number(response.count || 0);
  for (const release of response.releases || []) {
    const payload = normalizeRelease(release);
    if (!payload || byReleaseMbid.has(payload.release_mbid)) continue;
    byReleaseMbid.set(payload.release_mbid, { payload, query_reference: pageUrl });
  }
  if (byReleaseMbid.size >= Number(config.target_source_record_count)) break;
  if (!Array.isArray(response.releases) || response.releases.length < Number(config.page_limit)) break;
}

const eligible = [...byReleaseMbid.values()].sort((a, b) =>
  a.payload.release_mbid.localeCompare(b.payload.release_mbid)
);
if (eligible.length < Number(config.target_source_record_count)) {
  throw new Error(`MUSICBRAINZ_ELIGIBLE_VINYL_RECORDS_LT_${config.target_source_record_count}:${eligible.length}`);
}

const selected = eligible.slice(0, Number(config.target_source_record_count));
const records = selected.map(({ payload, query_reference: queryReference }) => {
  const sourceReference = `https://musicbrainz.org/release/${payload.release_mbid}`;
  return {
    source_id: 'musicbrainz-core-catalog',
    source_record_id: payload.release_mbid,
    source_reference: sourceReference,
    source_payload_sha256: digest(payload),
    license_evidence_refs: [...config.license_evidence_refs],
    rights_state: config.data_rights_state_required,
    acquisition_transport_state: config.acquisition_transport_state_required,
    provenance_refs: [queryReference, sourceReference],
    payload
  };
});

const sourceCorpusSha256 = digest(records.map((record) => ({
  source_record_id: record.source_record_id,
  source_payload_sha256: record.source_payload_sha256
})));
const artifact = {
  id: config.id,
  version: config.version,
  status: 'REAL_SOURCE_RECORD_CORPUS_UNLABELED',
  stratum_id: config.stratum_id,
  source_id: config.source,
  acquisition_transport: 'musicbrainz-ws2-bounded-noncommercial-core-fields-only',
  data_rights_state: config.data_rights_state_required,
  acquisition_transport_state: config.acquisition_transport_state_required,
  source_query: config.search_query,
  source_corpus_sha256: sourceCorpusSha256,
  acquired_at: new Date().toISOString(),
  search_pages_fetched: pagesFetched,
  observed_search_result_count: observedSearchResultCount,
  eligible_records_observed: eligible.length,
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

await fs.writeFile(out, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify({
  id: artifact.id,
  record_count: artifact.record_count,
  eligible_records_observed: artifact.eligible_records_observed,
  search_pages_fetched: artifact.search_pages_fetched,
  source_corpus_sha256: artifact.source_corpus_sha256,
  labels_present: false,
  model_predictions_present: false,
  production: 'HOLD'
}));
