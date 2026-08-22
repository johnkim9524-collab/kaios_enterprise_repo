#!/usr/bin/env node
import fs from 'node:fs';

const filePath = process.argv[2] || '/tmp/asi-common-crawl-host-expansion-v1.json';
const expansion = JSON.parse(fs.readFileSync(filePath, 'utf8'));
const fail = message => { throw new Error(message); };
const allowedStatuses = new Set(['SHADOW_COMMON_CRAWL_HOST_EXPANSION_COMPLETE', 'SHADOW_COMMON_CRAWL_HOST_EXPANSION_ZERO_RESULTS']);
const allowedSeedModes = new Set(['ROLLING_FAIR_FRONTIER', 'LEGACY_FIRST_SEEN_FAIL_SAFE']);
const allowedSeedResults = new Set(['SUCCESS_WITH_RESULTS', 'SUCCESS_ZERO_RESULTS', 'FAILED_FAIL_SOFT', 'SKIPPED_INDEX_UNAVAILABLE_FAIL_SOFT']);

if (expansion.id !== 'kidults-asi-common-crawl-host-expansion-v1' || expansion.version !== '1.1.0' || !allowedStatuses.has(expansion.status)) fail('IDENTITY');
if (expansion.universe_target !== 'GLOBAL_ANY_SITE_SOURCE_UNIVERSE' || expansion.metadata_index_only !== true) fail('UNIVERSE_INDEX_BOUNDARY');
if (expansion.target_site_body_crawled !== false || expansion.content_acquired !== false || expansion.rights_promoted !== false || expansion.admission_promoted !== false || expansion.acquisition_authorized !== false) fail('PERMISSION_BOUNDARY');
if (expansion.public_release !== 'HOLD' || expansion.production !== 'HOLD') fail('RELEASE_BOUNDARY');
if (!allowedSeedModes.has(expansion.seed_selection_mode)) fail('SEED_SELECTION_MODE');
if (!Array.isArray(expansion.seed_hosts) || expansion.seed_hosts.length !== Number(expansion.seed_host_count) || expansion.seed_hosts.length < 1 || expansion.seed_hosts.length > 8) fail('SEED_BUDGET');
if (new Set(expansion.seed_hosts).size !== expansion.seed_hosts.length) fail('DUPLICATE_SEED_HOST');
if (!Array.isArray(expansion.seed_host_results) || expansion.seed_host_results.length !== expansion.seed_hosts.length) fail('SEED_RESULTS_COUNT');
if (!Array.isArray(expansion.candidates) || expansion.candidates.length !== Number(expansion.expanded_candidate_count)) fail('CANDIDATE_COUNT');
if (!Array.isArray(expansion.errors)) fail('ERRORS_ARRAY');

if (expansion.seed_selection_mode === 'ROLLING_FAIR_FRONTIER') {
  if (expansion.seed_frontier_id !== 'kidults-asi-common-crawl-seed-frontier-v1' || expansion.seed_frontier_version !== '1.0.0') fail('FRONTIER_IDENTITY');
  if (!Number.isInteger(Number(expansion.seed_frontier_cycle)) || Number(expansion.seed_frontier_cycle) < 1) fail('FRONTIER_CYCLE');
  if (!String(expansion.seed_frontier_digest || '').startsWith('sha256:')) fail('FRONTIER_DIGEST');
} else {
  if (expansion.seed_frontier_id !== null || expansion.seed_frontier_version !== null || expansion.seed_frontier_cycle !== null || expansion.seed_frontier_digest !== null) fail('LEGACY_MODE_FRONTIER_CONTAMINATION');
}

const resultHosts = new Set();
let resultCandidateTotal = 0;
for (const result of expansion.seed_host_results) {
  if (!result.seed_host || !expansion.seed_hosts.includes(result.seed_host) || resultHosts.has(result.seed_host)) fail(`SEED_RESULT_HOST:${result.seed_host}`);
  resultHosts.add(result.seed_host);
  if (!allowedSeedResults.has(result.status) || result.fail_soft !== true) fail(`SEED_RESULT_STATUS:${result.seed_host}`);
  if (!Number.isInteger(Number(result.observed_candidate_count)) || Number(result.observed_candidate_count) < 0) fail(`SEED_RESULT_COUNT:${result.seed_host}`);
  if (result.status === 'SUCCESS_WITH_RESULTS' && Number(result.observed_candidate_count) < 1) fail(`SEED_RESULT_EMPTY_SUCCESS:${result.seed_host}`);
  if (result.status !== 'SUCCESS_WITH_RESULTS' && Number(result.observed_candidate_count) !== 0) fail(`SEED_RESULT_NONZERO:${result.seed_host}`);
  if (result.status.includes('FAILED') && !result.error) fail(`SEED_RESULT_ERROR_MISSING:${result.seed_host}`);
  resultCandidateTotal += Number(result.observed_candidate_count);
}
if (resultHosts.size !== expansion.seed_hosts.length) fail('SEED_RESULT_PARTITION');
if (resultCandidateTotal < expansion.candidates.length) fail('SEED_RESULT_CANDIDATE_UNDERCOUNT');

const endpointUrls = new Set();
for (const candidate of expansion.candidates) {
  if (!candidate.candidate_id || endpointUrls.has(candidate.endpoint_url)) fail(`CANDIDATE_ID_OR_DUPLICATE:${candidate.candidate_id}`);
  endpointUrls.add(candidate.endpoint_url);
  if (candidate.discovery_provider !== 'COMMON_CRAWL_URL_INDEX_HOST_EXPANSION' || candidate.discovery_channel !== 'COMMON_CRAWL_AND_WEB_DATA_COMMONS_STRUCTURED_WEB_INDEX') fail(`PROVIDER:${candidate.candidate_id}`);
  if (!expansion.seed_hosts.includes(candidate.seed_host)) fail(`CANDIDATE_SEED_NOT_SELECTED:${candidate.candidate_id}`);
  if (candidate.seed_selection_mode !== expansion.seed_selection_mode) fail(`CANDIDATE_MODE:${candidate.candidate_id}`);
  if (expansion.seed_selection_mode === 'ROLLING_FAIR_FRONTIER') {
    if (candidate.seed_frontier_id !== expansion.seed_frontier_id || Number(candidate.seed_frontier_cycle) !== Number(expansion.seed_frontier_cycle)) fail(`CANDIDATE_FRONTIER:${candidate.candidate_id}`);
  }
  if (candidate.source_family_hint !== 'UNCLASSIFIED_ANY_SITE_CANDIDATE' || candidate.rights_state !== 'UNASSESSED' || candidate.admission_state !== 'NOT_ADMITTED' || candidate.gate_1_state !== 'PENDING' || candidate.evidence_state !== 'DISCOVERY_METADATA_ONLY') fail(`CANDIDATE_PROMOTED:${candidate.candidate_id}`);
  if (candidate.acquisition_authorized !== false || candidate.target_site_body_crawled !== false || candidate.content_acquired !== false || candidate.provider_contacted !== false || candidate.account_created !== false || candidate.eula_accepted !== false || candidate.spend_authorized !== false || candidate.production !== 'HOLD') fail(`CANDIDATE_BOUNDARY:${candidate.candidate_id}`);
  let host;
  try { host = new URL(candidate.endpoint_url).hostname.toLowerCase().replace(/^www\./, ''); } catch { fail(`CANDIDATE_URL:${candidate.candidate_id}`); }
  if (host !== candidate.observed_host || !(host === candidate.seed_host || host.endsWith(`.${candidate.seed_host}`))) fail(`HOST_ESCAPE:${candidate.candidate_id}`);
}
if (expansion.status === 'SHADOW_COMMON_CRAWL_HOST_EXPANSION_COMPLETE' && expansion.candidates.length < 1) fail('COMPLETE_WITHOUT_CANDIDATES');
if (expansion.status === 'SHADOW_COMMON_CRAWL_HOST_EXPANSION_ZERO_RESULTS' && expansion.candidates.length !== 0) fail('ZERO_RESULTS_WITH_CANDIDATES');

console.log(JSON.stringify({
  status: 'PASS',
  index_id: expansion.common_crawl_index_id,
  seed_selection_mode: expansion.seed_selection_mode,
  seed_frontier_cycle: expansion.seed_frontier_cycle,
  seed_hosts: expansion.seed_host_count,
  expanded_candidates: expansion.expanded_candidate_count,
  fail_soft_seed_results: expansion.seed_host_results.filter(result => result.status.includes('FAILED') || result.status.includes('SKIPPED')).length,
  production: 'HOLD'
}));
