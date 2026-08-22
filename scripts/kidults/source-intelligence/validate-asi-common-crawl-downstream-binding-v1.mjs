#!/usr/bin/env node
import fs from 'node:fs';

const discoveryPath = process.argv[2] || 'discovery-out/global-low-risk-discovery.json';
const gate1Path = process.argv[3] || '/tmp/asi-gate1-safe-candidate-pool-v1.json';
const poolPath = process.argv[4] || '/tmp/asi-proactive-source-pool-v1.json';
const discovery = JSON.parse(fs.readFileSync(discoveryPath, 'utf8'));
const gate1 = JSON.parse(fs.readFileSync(gate1Path, 'utf8'));
const pool = JSON.parse(fs.readFileSync(poolPath, 'utf8'));
const fail = message => { throw new Error(message); };
const normalizeUrl = value => {
  const url = new URL(String(value || ''));
  url.hash = '';
  url.searchParams.sort();
  return url.toString().replace(/\/$/, '');
};

if (discovery.common_crawl_host_expansion_applied !== true) fail('COMMON_CRAWL_NOT_APPLIED');
if (gate1.id !== 'kidults-asi-gate1-safe-candidate-pool-v1' || gate1.source_family_classification_applied !== true) fail('GATE1_ID');
if (pool.id !== 'kidults-asi-proactive-source-pool-v1' || pool.status !== 'ROLLING_DISCOVERY_CANDIDATE_POOL') fail('POOL_ID');
if (gate1.production !== 'HOLD' || gate1.public_release !== 'HOLD' || pool.production !== 'HOLD' || pool.public_release !== 'HOLD') fail('RELEASE_BOUNDARY');
if (gate1.acquisition_authorized !== false || pool.acquisition_authorized !== false || pool.content_acquired !== false) fail('ACQUISITION_BOUNDARY');

const newIds = discovery.common_crawl_host_expansion_new_candidate_ids || [];
const discoveryById = new Map((discovery.candidates || []).map(candidate => [candidate.candidate_id, candidate]));
const receiptIds = new Set((gate1.receipts || []).map(receipt => receipt.source_candidate_id));
let gate1Bound = 0;
let poolBound = 0;
for (const id of newIds) {
  const candidate = discoveryById.get(id);
  if (!candidate) fail(`DISCOVERY_CANDIDATE_MISSING:${id}`);
  if (!receiptIds.has(id)) fail(`GATE1_RECEIPT_MISSING:${id}`);
  gate1Bound++;
  const locator = normalizeUrl(candidate.endpoint_url);
  const pooled = (pool.candidates || []).find(item => normalizeUrl(item.canonical_locator) === locator && (item.discovery_providers || []).includes('COMMON_CRAWL_URL_INDEX_HOST_EXPANSION'));
  if (!pooled) fail(`ROLLING_POOL_BINDING_MISSING:${id}`);
  if (pooled.rights_state !== 'UNASSESSED' || pooled.admission_state !== 'NOT_ADMITTED' || pooled.source_pool_state !== 'CANDIDATE_ONLY') fail(`POOL_PROMOTED:${id}`);
  if (pooled.acquisition_authorized !== false || pooled.target_site_traversal_authorized !== false || pooled.market_claim_authorized !== false) fail(`POOL_PERMISSION_PROMOTED:${id}`);
  poolBound++;
}

if (Number(gate1.input_candidate_count) !== Number(discovery.candidate_count)) fail('GATE1_INPUT_COUNT_MISMATCH');
if (Number(pool.discovery_batch_candidate_count) !== Number(discovery.candidate_count)) fail('POOL_BATCH_COUNT_MISMATCH');
const providerPoolCount = (pool.candidates || []).filter(item => (item.discovery_providers || []).includes('COMMON_CRAWL_URL_INDEX_HOST_EXPANSION')).length;
if (Number(pool.provider_counts?.COMMON_CRAWL_URL_INDEX_HOST_EXPANSION || 0) !== providerPoolCount) fail('POOL_PROVIDER_COUNT');
if (newIds.length > 0 && (gate1Bound !== newIds.length || poolBound !== newIds.length)) fail('DOWNSTREAM_PARTIAL_BINDING');

console.log(JSON.stringify({
  status: 'PASS',
  common_crawl_new_candidates: newIds.length,
  gate1_bound_candidates: gate1Bound,
  rolling_pool_bound_candidates: poolBound,
  pool_common_crawl_provider_candidates: providerPoolCount,
  production: 'HOLD'
}));
