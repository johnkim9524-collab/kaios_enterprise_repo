#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const discoveryPath = process.argv[2] || 'discovery-out/global-low-risk-discovery.json';
const expansionPath = process.argv[3] || '/tmp/asi-common-crawl-host-expansion-v1.json';
const outPath = process.argv[4] || discoveryPath;

const discovery = JSON.parse(fs.readFileSync(discoveryPath, 'utf8'));
const expansion = JSON.parse(fs.readFileSync(expansionPath, 'utf8'));
const fail = message => { throw new Error(message); };
const unique = values => [...new Set(values.filter(Boolean))].sort();
const digest = value => `sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
const normalizeUrl = value => {
  const url = new URL(String(value || ''));
  if (!['http:', 'https:'].includes(url.protocol)) fail('UNSUPPORTED_URL_PROTOCOL');
  url.hostname = url.hostname.toLowerCase();
  url.hash = '';
  url.searchParams.sort();
  return url.toString().replace(/\/$/, '');
};

if (discovery.id !== 'kidults-asi-global-low-risk-discovery-v1') fail('DISCOVERY_ID');
if (discovery.primary_target !== 'GLOBAL_ANY_SITE_SOURCE_UNIVERSE') fail('DISCOVERY_UNIVERSE');
if (discovery.production !== 'HOLD' || discovery.public_release !== 'HOLD') fail('DISCOVERY_RELEASE_BOUNDARY');
if (!Array.isArray(discovery.candidates) || discovery.candidates.length !== Number(discovery.candidate_count)) fail('DISCOVERY_COUNT');

const allowedExpansionStatuses = new Set([
  'SHADOW_COMMON_CRAWL_HOST_EXPANSION_COMPLETE',
  'SHADOW_COMMON_CRAWL_HOST_EXPANSION_ZERO_RESULTS'
]);
if (expansion.id !== 'kidults-asi-common-crawl-host-expansion-v1' || !allowedExpansionStatuses.has(expansion.status)) fail('EXPANSION_ID');
if (expansion.universe_target !== 'GLOBAL_ANY_SITE_SOURCE_UNIVERSE' || expansion.metadata_index_only !== true) fail('EXPANSION_UNIVERSE');
if (expansion.target_site_body_crawled !== false || expansion.content_acquired !== false) fail('EXPANSION_CONTENT_BOUNDARY');
if (expansion.rights_promoted !== false || expansion.admission_promoted !== false || expansion.acquisition_authorized !== false) fail('EXPANSION_PERMISSION_BOUNDARY');
if (expansion.production !== 'HOLD' || expansion.public_release !== 'HOLD') fail('EXPANSION_RELEASE_BOUNDARY');
if (!Array.isArray(expansion.candidates) || expansion.candidates.length !== Number(expansion.expanded_candidate_count)) fail('EXPANSION_COUNT');
if (Number(expansion.input_candidate_count) !== Number(discovery.candidate_count)) fail('EXPANSION_INPUT_MISMATCH');

const beforeCount = discovery.candidates.length;
const byLocator = new Map();
for (const candidate of discovery.candidates) {
  const locator = normalizeUrl(candidate.endpoint_url);
  if (!byLocator.has(locator)) byLocator.set(locator, { ...candidate, endpoint_url: locator });
}

const observedIds = [];
const newIds = [];
const deduplicatedIds = [];
for (const candidate of expansion.candidates) {
  if (candidate.discovery_provider !== 'COMMON_CRAWL_URL_INDEX_HOST_EXPANSION') fail('EXPANSION_PROVIDER');
  if (candidate.discovery_channel !== 'COMMON_CRAWL_AND_WEB_DATA_COMMONS_STRUCTURED_WEB_INDEX') fail('EXPANSION_CHANNEL');
  if (candidate.source_family_hint !== 'UNCLASSIFIED_ANY_SITE_CANDIDATE') fail('EXPANSION_FAMILY_PROMOTION');
  if (candidate.rights_state !== 'UNASSESSED' || candidate.admission_state !== 'NOT_ADMITTED' || candidate.gate_1_state !== 'PENDING') fail('EXPANSION_STATE_PROMOTION');
  if (candidate.evidence_state !== 'DISCOVERY_METADATA_ONLY' || candidate.acquisition_authorized !== false) fail('EXPANSION_ACQUISITION_PROMOTION');
  if (candidate.target_site_body_crawled !== false || candidate.content_acquired !== false) fail('EXPANSION_BODY_CRAWL');
  if (candidate.provider_contacted !== false || candidate.account_created !== false || candidate.eula_accepted !== false || candidate.spend_authorized !== false) fail('EXPANSION_EXTERNAL_COMMITMENT');
  const locator = normalizeUrl(candidate.endpoint_url);
  const observedHost = new URL(locator).hostname;
  if (!(observedHost === candidate.seed_host || observedHost.endsWith(`.${candidate.seed_host}`))) fail('EXPANSION_HOST_ESCAPE');
  observedIds.push(candidate.candidate_id);

  const existing = byLocator.get(locator);
  if (existing) {
    byLocator.set(locator, {
      ...existing,
      discovery_providers: unique([...(existing.discovery_providers || [existing.discovery_provider]), candidate.discovery_provider]),
      provider_record_ids: unique([...(existing.provider_record_ids || [existing.provider_record_id]), candidate.provider_record_id]),
      common_crawl_index_ids: unique([...(existing.common_crawl_index_ids || []), candidate.common_crawl_index_id]),
      common_crawl_seed_hosts: unique([...(existing.common_crawl_seed_hosts || []), candidate.seed_host]),
      common_crawl_observed: true
    });
    deduplicatedIds.push(candidate.candidate_id);
  } else {
    byLocator.set(locator, {
      ...candidate,
      endpoint_url: locator,
      discovery_providers: [candidate.discovery_provider],
      provider_record_ids: unique([candidate.provider_record_id]),
      common_crawl_index_ids: unique([candidate.common_crawl_index_id]),
      common_crawl_seed_hosts: unique([candidate.seed_host]),
      common_crawl_observed: true
    });
    newIds.push(candidate.candidate_id);
  }
}

const candidates = [...byLocator.values()].sort((a, b) => a.endpoint_url.localeCompare(b.endpoint_url));
const laneStatus = expansion.expanded_candidate_count > 0
  ? 'SUCCESS_WITH_RESULTS'
  : (Array.isArray(expansion.errors) && expansion.errors.length > 0 ? 'FAILED_FAIL_SOFT' : 'SUCCESS_ZERO_RESULTS');
const laneId = 'COMMON_CRAWL_URL_INDEX_HOST_EXPANSION';
const laneHealth = (discovery.lane_health || []).filter(lane => lane.lane_id !== laneId);
laneHealth.push({
  lane_id: laneId,
  status: laneStatus,
  observed_candidates: Number(expansion.expanded_candidate_count || 0),
  new_candidates_added: newIds.length,
  deduplicated_candidates: deduplicatedIds.length,
  common_crawl_index_id: expansion.common_crawl_index_id || null,
  error_count: Array.isArray(expansion.errors) ? expansion.errors.length : 0,
  fail_soft: true,
  error: laneStatus === 'FAILED_FAIL_SOFT' ? (expansion.errors || []).join(';').slice(0, 500) : null
});

const providerCounts = {};
for (const candidate of candidates) {
  const providers = candidate.discovery_providers?.length ? candidate.discovery_providers : [candidate.discovery_provider];
  for (const provider of providers.filter(Boolean)) providerCounts[provider] = (providerCounts[provider] || 0) + 1;
}
const liveExternalCount = candidates.filter(candidate => candidate.live_external_observation === true).length;
const healthyLiveLanes = laneHealth.filter(lane => lane.status === 'SUCCESS_WITH_RESULTS' && lane.lane_id !== 'CANONICAL_REGISTERED_FRONTIER_SEED').length;

const output = {
  ...discovery,
  version: '3.3.0',
  candidates,
  candidate_count: candidates.length,
  live_external_candidate_count: liveExternalCount,
  provider_counts: providerCounts,
  lane_health: laneHealth,
  healthy_live_lanes: healthyLiveLanes,
  common_crawl_host_expansion_applied: true,
  common_crawl_host_expansion_fail_soft: true,
  common_crawl_host_expansion_metadata_index_only: true,
  common_crawl_host_expansion_status: expansion.status,
  common_crawl_host_expansion_index_id: expansion.common_crawl_index_id || null,
  common_crawl_host_expansion_seed_host_count: Number(expansion.seed_host_count || 0),
  common_crawl_host_expansion_observed_candidate_count: observedIds.length,
  common_crawl_host_expansion_new_candidate_count: newIds.length,
  common_crawl_host_expansion_deduplicated_candidate_count: deduplicatedIds.length,
  common_crawl_host_expansion_observed_candidate_ids: observedIds.sort(),
  common_crawl_host_expansion_new_candidate_ids: newIds.sort(),
  common_crawl_host_expansion_deduplicated_candidate_ids: deduplicatedIds.sort(),
  common_crawl_host_expansion_errors: expansion.errors || [],
  candidate_count_before_common_crawl: beforeCount,
  candidate_count_after_common_crawl: candidates.length,
  gate1_required_for_common_crawl_candidates: true,
  target_site_body_crawled: false,
  content_acquired: false,
  acquisition_authorized: false,
  public_release: 'HOLD',
  production: 'HOLD'
};
output.common_crawl_merge_receipt_digest = digest({
  discovery_id: discovery.id,
  before_count: beforeCount,
  expansion_id: expansion.id,
  expansion_index_id: expansion.common_crawl_index_id || null,
  observed_ids: output.common_crawl_host_expansion_observed_candidate_ids,
  new_ids: output.common_crawl_host_expansion_new_candidate_ids,
  deduplicated_ids: output.common_crawl_host_expansion_deduplicated_candidate_ids,
  after_count: output.candidate_count
});

const tempPath = `${outPath}.tmp-${process.pid}`;
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(tempPath, `${JSON.stringify(output, null, 2)}\n`);
fs.renameSync(tempPath, outPath);
console.log(JSON.stringify({
  status: 'SHADOW_COMMON_CRAWL_BOUND_INTO_CANONICAL_DISCOVERY',
  before_candidates: beforeCount,
  observed_expansion_candidates: observedIds.length,
  new_candidates: newIds.length,
  deduplicated_candidates: deduplicatedIds.length,
  after_candidates: candidates.length,
  healthy_live_lanes: healthyLiveLanes,
  production: 'HOLD'
}));
