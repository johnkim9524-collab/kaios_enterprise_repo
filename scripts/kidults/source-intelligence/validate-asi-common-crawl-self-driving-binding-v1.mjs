#!/usr/bin/env node
import fs from 'node:fs';

const discoveryPath = process.argv[2] || 'discovery-out/global-low-risk-discovery.json';
const poolPath = process.argv[3] || '/tmp/asi-proactive-source-pool-v1.json';
const discovery = JSON.parse(fs.readFileSync(discoveryPath, 'utf8'));
const pool = JSON.parse(fs.readFileSync(poolPath, 'utf8'));
const fail = message => { throw new Error(message); };
const normalizeUrl = value => {
  const url = new URL(String(value || ''));
  url.hash = '';
  url.searchParams.sort();
  return url.toString().replace(/\/$/, '');
};

if (discovery.id !== 'kidults-asi-global-low-risk-discovery-v1' || discovery.common_crawl_host_expansion_applied !== true) fail('COMMON_CRAWL_NOT_APPLIED');
if (discovery.gate1_required_for_common_crawl_candidates !== true) fail('GATE1_BOUNDARY_MISSING');
if (discovery.production !== 'HOLD' || discovery.public_release !== 'HOLD' || discovery.acquisition_authorized !== false || discovery.content_acquired !== false) fail('DISCOVERY_BOUNDARY');
if (pool.id !== 'kidults-asi-proactive-source-pool-v1' || pool.version !== '1.1.0' || pool.status !== 'ROLLING_DISCOVERY_CANDIDATE_POOL') fail('POOL_ID');
if (pool.lineage_policy !== 'CANONICAL_LOCATOR_STABLE_PROVIDER_SWITCHABLE' || pool.provider_switching_preserves_source_candidate_identity !== true) fail('POOL_LINEAGE');
if (pool.production !== 'HOLD' || pool.public_release !== 'HOLD' || pool.acquisition_authorized !== false || pool.content_acquired !== false) fail('POOL_BOUNDARY');
if (Number(pool.discovery_batch_candidate_count) !== Number(discovery.candidate_count)) fail('POOL_BATCH_COUNT');

const newIds = discovery.common_crawl_host_expansion_new_candidate_ids || [];
const discoveryById = new Map((discovery.candidates || []).map(candidate => [candidate.candidate_id, candidate]));
let poolBound = 0;
for (const id of newIds) {
  const candidate = discoveryById.get(id);
  if (!candidate) fail(`DISCOVERY_CANDIDATE_MISSING:${id}`);
  const locator = normalizeUrl(candidate.endpoint_url);
  const pooled = (pool.candidates || []).find(item => normalizeUrl(item.canonical_locator) === locator);
  if (!pooled) fail(`POOL_CANDIDATE_MISSING:${id}`);
  if (!(pooled.discovery_providers || []).includes('COMMON_CRAWL_URL_INDEX_HOST_EXPANSION')) fail(`POOL_PROVIDER_MISSING:${id}`);
  if (pooled.provider_switchable_identity !== true) fail(`POOL_PROVIDER_SWITCHING_DISABLED:${id}`);
  if (pooled.rights_state !== 'UNASSESSED' || pooled.admission_state !== 'NOT_ADMITTED' || pooled.source_pool_state !== 'CANDIDATE_ONLY') fail(`POOL_PROMOTED:${id}`);
  if (pooled.evidence_state !== 'DISCOVERY_METADATA_ONLY' || pooled.acquisition_authorized !== false || pooled.target_site_traversal_authorized !== false || pooled.market_claim_authorized !== false) fail(`POOL_PERMISSION_PROMOTED:${id}`);
  poolBound++;
}

const providerCount = (pool.candidates || []).filter(candidate => (candidate.discovery_providers || []).includes('COMMON_CRAWL_URL_INDEX_HOST_EXPANSION')).length;
if (Number(pool.provider_counts?.COMMON_CRAWL_URL_INDEX_HOST_EXPANSION || 0) !== providerCount) fail('POOL_PROVIDER_COUNT');
if (newIds.length > 0 && poolBound !== newIds.length) fail('PARTIAL_POOL_BINDING');
if (!Number.isInteger(Number(pool.migrated_duplicate_locator_count)) || Number(pool.migrated_duplicate_locator_count) < 0) fail('MIGRATION_COUNT');

console.log(JSON.stringify({
  status: 'PASS',
  common_crawl_observed_candidates: discovery.common_crawl_host_expansion_observed_candidate_count,
  common_crawl_new_candidates: newIds.length,
  self_driving_pool_bound_candidates: poolBound,
  pool_common_crawl_provider_candidates: providerCount,
  migrated_duplicate_locators: pool.migrated_duplicate_locator_count,
  production: 'HOLD'
}));
