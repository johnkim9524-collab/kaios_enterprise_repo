#!/usr/bin/env node
import fs from 'node:fs';

const filePath = process.argv[2] || 'discovery-out/global-low-risk-discovery.json';
const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
const fail = message => { throw new Error(message); };
const unique = values => [...new Set(values)];

if (value.id !== 'kidults-asi-global-low-risk-discovery-v1') fail('DISCOVERY_ID');
if (value.version !== '3.3.0') fail('DISCOVERY_VERSION');
if (value.primary_target !== 'GLOBAL_ANY_SITE_SOURCE_UNIVERSE' || value.source_family_restriction !== null) fail('UNIVERSE_NARROWED');
if (value.common_crawl_host_expansion_applied !== true || value.common_crawl_host_expansion_fail_soft !== true) fail('COMMON_CRAWL_NOT_BOUND');
if (value.common_crawl_host_expansion_metadata_index_only !== true) fail('COMMON_CRAWL_NOT_METADATA_ONLY');
if (value.gate1_required_for_common_crawl_candidates !== true) fail('GATE1_NOT_REQUIRED');
if (value.target_site_body_crawled !== false || value.content_acquired !== false || value.acquisition_authorized !== false) fail('ACQUISITION_BOUNDARY');
if (value.production !== 'HOLD' || value.public_release !== 'HOLD') fail('RELEASE_BOUNDARY');
if (!Array.isArray(value.candidates) || value.candidates.length !== Number(value.candidate_count)) fail('CANDIDATE_COUNT');
if (Number(value.candidate_count_before_common_crawl) + Number(value.common_crawl_host_expansion_new_candidate_count) !== Number(value.candidate_count_after_common_crawl)) fail('COUNT_DELTA');
if (Number(value.candidate_count_after_common_crawl) !== Number(value.candidate_count)) fail('AFTER_COUNT');

const observedIds = value.common_crawl_host_expansion_observed_candidate_ids || [];
const newIds = value.common_crawl_host_expansion_new_candidate_ids || [];
const deduplicatedIds = value.common_crawl_host_expansion_deduplicated_candidate_ids || [];
if (observedIds.length !== Number(value.common_crawl_host_expansion_observed_candidate_count)) fail('OBSERVED_COUNT');
if (newIds.length !== Number(value.common_crawl_host_expansion_new_candidate_count)) fail('NEW_COUNT');
if (deduplicatedIds.length !== Number(value.common_crawl_host_expansion_deduplicated_candidate_count)) fail('DEDUP_COUNT');
if (newIds.length + deduplicatedIds.length !== observedIds.length) fail('OBSERVED_PARTITION');
if (unique(observedIds).length !== observedIds.length || unique(newIds).length !== newIds.length || unique(deduplicatedIds).length !== deduplicatedIds.length) fail('DUPLICATE_RECEIPT_ID');
if (newIds.some(id => deduplicatedIds.includes(id))) fail('RECEIPT_PARTITION_OVERLAP');
if (!value.common_crawl_merge_receipt_digest?.startsWith('sha256:')) fail('MERGE_DIGEST');

const lane = (value.lane_health || []).find(item => item.lane_id === 'COMMON_CRAWL_URL_INDEX_HOST_EXPANSION');
if (!lane) fail('COMMON_CRAWL_LANE_MISSING');
if (!['SUCCESS_WITH_RESULTS', 'SUCCESS_ZERO_RESULTS', 'FAILED_FAIL_SOFT'].includes(lane.status)) fail('COMMON_CRAWL_LANE_STATUS');
if (Number(lane.observed_candidates) !== observedIds.length) fail('LANE_OBSERVED_COUNT');
if (Number(lane.new_candidates_added) !== newIds.length) fail('LANE_NEW_COUNT');
if (Number(lane.deduplicated_candidates) !== deduplicatedIds.length) fail('LANE_DEDUP_COUNT');
if (lane.fail_soft !== true) fail('LANE_NOT_FAIL_SOFT');

const byId = new Map(value.candidates.map(candidate => [candidate.candidate_id, candidate]));
for (const id of newIds) {
  const candidate = byId.get(id);
  if (!candidate) fail(`NEW_CANDIDATE_MISSING:${id}`);
  if (candidate.discovery_provider !== 'COMMON_CRAWL_URL_INDEX_HOST_EXPANSION') fail(`NEW_PROVIDER:${id}`);
  if (candidate.discovery_channel !== 'COMMON_CRAWL_AND_WEB_DATA_COMMONS_STRUCTURED_WEB_INDEX') fail(`NEW_CHANNEL:${id}`);
  if (candidate.source_family_hint !== 'UNCLASSIFIED_ANY_SITE_CANDIDATE') fail(`NEW_FAMILY_PROMOTED:${id}`);
  if (candidate.rights_state !== 'UNASSESSED' || candidate.admission_state !== 'NOT_ADMITTED' || candidate.gate_1_state !== 'PENDING') fail(`NEW_STATE_PROMOTED:${id}`);
  if (candidate.evidence_state !== 'DISCOVERY_METADATA_ONLY' || candidate.acquisition_authorized !== false) fail(`NEW_ACQUISITION_PROMOTED:${id}`);
  if (candidate.target_site_body_crawled !== false || candidate.content_acquired !== false) fail(`NEW_BODY_CRAWLED:${id}`);
  if (candidate.provider_contacted !== false || candidate.account_created !== false || candidate.eula_accepted !== false || candidate.spend_authorized !== false) fail(`NEW_EXTERNAL_COMMITMENT:${id}`);
  let host;
  try { host = new URL(candidate.endpoint_url).hostname; } catch { fail(`NEW_URL:${id}`); }
  const seeds = candidate.common_crawl_seed_hosts || [candidate.seed_host].filter(Boolean);
  if (!seeds.length || !seeds.some(seed => host === seed || host.endsWith(`.${seed}`))) fail(`NEW_HOST_ESCAPE:${id}`);
}

for (const candidate of value.candidates) {
  if (candidate.source_family_hint !== 'UNCLASSIFIED_ANY_SITE_CANDIDATE') fail('PRE_GATE1_CLASSIFICATION');
  if (candidate.rights_state !== 'UNASSESSED' || candidate.admission_state !== 'NOT_ADMITTED' || candidate.gate_1_state !== 'PENDING') fail('CANDIDATE_PROMOTED');
  if (candidate.acquisition_authorized !== false || candidate.target_site_body_crawled !== false) fail('CANDIDATE_ACQUISITION');
}

const actualLive = value.candidates.filter(candidate => candidate.live_external_observation === true).length;
if (actualLive !== Number(value.live_external_candidate_count)) fail('LIVE_COUNT');
const providerCount = value.candidates.filter(candidate => (candidate.discovery_providers || [candidate.discovery_provider]).includes('COMMON_CRAWL_URL_INDEX_HOST_EXPANSION')).length;
if (Number(value.provider_counts?.COMMON_CRAWL_URL_INDEX_HOST_EXPANSION || 0) !== providerCount) fail('PROVIDER_COUNT');
if (observedIds.length > 0 && providerCount < 1) fail('COMMON_CRAWL_PROVIDER_LOST');

console.log(JSON.stringify({
  status: 'PASS',
  before_candidates: value.candidate_count_before_common_crawl,
  observed_candidates: observedIds.length,
  new_candidates: newIds.length,
  deduplicated_candidates: deduplicatedIds.length,
  after_candidates: value.candidate_count,
  common_crawl_lane_status: lane.status,
  production: 'HOLD'
}));
