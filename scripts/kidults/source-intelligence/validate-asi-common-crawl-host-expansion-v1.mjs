#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';

const filePath = process.argv[2] || '/tmp/asi-common-crawl-host-expansion-v1.json';
const expansion = JSON.parse(fs.readFileSync(filePath, 'utf8'));
const fail = message => { throw new Error(message); };
const sha = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const allowedStatuses = new Set(['SHADOW_COMMON_CRAWL_HOST_EXPANSION_COMPLETE', 'SHADOW_COMMON_CRAWL_HOST_EXPANSION_ZERO_RESULTS']);
const allowedSeedModes = new Set(['ROLLING_FAIR_FRONTIER', 'LEGACY_FIRST_SEEN_FAIL_SAFE']);
const allowedSeedResults = new Set(['SUCCESS_WITH_RESULTS', 'SUCCESS_ZERO_RESULTS', 'FAILED_FAIL_SOFT', 'SKIPPED_INDEX_UNAVAILABLE_FAIL_SOFT']);
const allowedBootstrapStates = new Set(['EXPLICIT_FRONTIER', 'RUNTIME_FRONTIER_FRESH', 'RUNTIME_FRONTIER_RESTORED_FROM_PREVIOUS_EXPANSION', 'FRONTIER_BUILD_FAILED_LEGACY_FAIL_SAFE']);
const allowedIndexStates = new Set(['DISCOVERED', 'UNAVAILABLE_FAIL_SOFT']);
const allowedPreviousSources = new Set(['NONE', 'ENV_PREVIOUS_EXPANSION', 'SELF_DRIVING_PREVIOUS_EXPANSION', 'HOURLY_PREVIOUS_EXPANSION']);

if (expansion.id !== 'kidults-asi-common-crawl-host-expansion-v1' || expansion.version !== '1.3.0' || !allowedStatuses.has(expansion.status)) fail('IDENTITY');
if (expansion.universe_target !== 'GLOBAL_ANY_SITE_SOURCE_UNIVERSE' || expansion.metadata_index_only !== true) fail('UNIVERSE_INDEX_BOUNDARY');
if (expansion.target_site_body_crawled !== false || expansion.content_acquired !== false || expansion.rights_promoted !== false || expansion.admission_promoted !== false || expansion.acquisition_authorized !== false) fail('PERMISSION_BOUNDARY');
if (expansion.public_release !== 'HOLD' || expansion.production !== 'HOLD') fail('RELEASE_BOUNDARY');
if (typeof expansion.frontier_runtime_managed !== 'boolean' || !allowedBootstrapStates.has(expansion.seed_frontier_bootstrap_state)) fail('FRONTIER_RUNTIME_STATE');
if (typeof expansion.seed_frontier_previous_snapshot_found !== 'boolean' || !allowedPreviousSources.has(expansion.seed_frontier_previous_snapshot_source)) fail('PREVIOUS_SNAPSHOT_STATE');
if (!allowedSeedModes.has(expansion.seed_selection_mode)) fail('SEED_SELECTION_MODE');
if (!Array.isArray(expansion.seed_hosts) || expansion.seed_hosts.length !== Number(expansion.seed_host_count) || expansion.seed_hosts.length < 1 || expansion.seed_hosts.length > 8) fail('SEED_BUDGET');
if (new Set(expansion.seed_hosts).size !== expansion.seed_hosts.length) fail('DUPLICATE_SEED_HOST');
if (!Array.isArray(expansion.seed_host_results) || expansion.seed_host_results.length !== expansion.seed_hosts.length) fail('SEED_RESULTS_COUNT');
if (!Array.isArray(expansion.candidates) || expansion.candidates.length !== Number(expansion.expanded_candidate_count)) fail('CANDIDATE_COUNT');
if (!Array.isArray(expansion.errors)) fail('ERRORS_ARRAY');
if (!allowedIndexStates.has(expansion.common_crawl_index_state)) fail('INDEX_STATE');
if (expansion.common_crawl_index_state === 'DISCOVERED') {
  if (!expansion.common_crawl_index_id || !expansion.common_crawl_index_api) fail('DISCOVERED_INDEX_METADATA');
} else {
  if (expansion.common_crawl_index_id !== null || expansion.common_crawl_index_api !== null) fail('UNAVAILABLE_INDEX_METADATA');
  if (Number(expansion.expanded_candidate_count) !== 0 || expansion.status !== 'SHADOW_COMMON_CRAWL_HOST_EXPANSION_ZERO_RESULTS') fail('UNAVAILABLE_INDEX_NONEMPTY');
  if (!expansion.seed_host_results.every(result => result.status === 'SKIPPED_INDEX_UNAVAILABLE_FAIL_SOFT')) fail('UNAVAILABLE_INDEX_HOST_STATE');
  if (!expansion.errors.some(error => String(error).startsWith('INDEX_DISCOVERY:'))) fail('UNAVAILABLE_INDEX_ERROR');
}

if (expansion.seed_frontier_bootstrap_state === 'EXPLICIT_FRONTIER') {
  if (expansion.frontier_runtime_managed !== false || expansion.seed_frontier_previous_snapshot_found !== false || expansion.seed_frontier_previous_snapshot_source !== 'NONE') fail('EXPLICIT_FRONTIER_RUNTIME_BOUNDARY');
}
if (expansion.seed_frontier_bootstrap_state === 'RUNTIME_FRONTIER_FRESH') {
  if (expansion.frontier_runtime_managed !== true || expansion.seed_frontier_previous_snapshot_found !== false || expansion.seed_frontier_previous_snapshot_source !== 'NONE') fail('FRESH_RUNTIME_FRONTIER_STATE');
}
if (expansion.seed_frontier_bootstrap_state === 'RUNTIME_FRONTIER_RESTORED_FROM_PREVIOUS_EXPANSION') {
  if (expansion.frontier_runtime_managed !== true || expansion.seed_frontier_previous_snapshot_found !== true || expansion.seed_frontier_previous_snapshot_source === 'NONE') fail('RESTORED_RUNTIME_FRONTIER_STATE');
}
if (expansion.seed_frontier_bootstrap_state === 'FRONTIER_BUILD_FAILED_LEGACY_FAIL_SAFE') {
  if (expansion.frontier_runtime_managed !== true || expansion.seed_selection_mode !== 'LEGACY_FIRST_SEEN_FAIL_SAFE') fail('LEGACY_FAIL_SAFE_STATE');
}

if (expansion.seed_selection_mode === 'ROLLING_FAIR_FRONTIER') {
  const frontier = expansion.seed_frontier_snapshot;
  if (!frontier || frontier.id !== 'kidults-asi-common-crawl-seed-frontier-v1' || frontier.version !== '1.0.0' || frontier.status !== 'SHADOW_COMMON_CRAWL_SEED_FRONTIER_READY') fail('FRONTIER_IDENTITY');
  if (frontier.universe_target !== 'GLOBAL_ANY_SITE_SOURCE_UNIVERSE' || frontier.purpose !== 'COMMON_CRAWL_PUBLIC_INDEX_HOST_SELECTION_ONLY') fail('FRONTIER_UNIVERSE');
  if (frontier.metadata_index_only !== true || frontier.target_site_body_crawled !== false || frontier.content_acquired !== false || frontier.rights_promoted !== false || frontier.admission_promoted !== false || frontier.acquisition_authorized !== false || frontier.production !== 'HOLD' || frontier.public_release !== 'HOLD') fail('FRONTIER_PERMISSION_BOUNDARY');
  if (!Array.isArray(frontier.selected_hosts) || !Array.isArray(frontier.host_frontier) || frontier.selected_hosts.length < 1 || frontier.selected_hosts.length > 8 || frontier.host_frontier.length !== Number(frontier.host_universe_count)) fail('FRONTIER_SHAPE');
  if (new Set(frontier.selected_hosts).size !== frontier.selected_hosts.length) fail('FRONTIER_DUPLICATE_HOST');
  if (expansion.seed_frontier_id !== frontier.id || expansion.seed_frontier_version !== frontier.version || Number(expansion.seed_frontier_cycle) !== Number(frontier.cycle_count) || expansion.seed_frontier_digest !== frontier.frontier_digest) fail('FRONTIER_TOP_LEVEL_BINDING');
  if (Number(expansion.seed_frontier_completed_sweep_count) !== Number(frontier.completed_sweep_count) || Number(expansion.seed_frontier_sweep_number) !== Number(frontier.sweep_number) || Number(expansion.seed_frontier_never_selected_host_count_after) !== Number(frontier.never_selected_host_count_after) || expansion.seed_frontier_full_sweep_complete !== frontier.full_sweep_complete) fail('FRONTIER_PROGRESS_BINDING');
  if (JSON.stringify(expansion.seed_hosts) !== JSON.stringify(frontier.selected_hosts)) fail('FRONTIER_SELECTED_HOST_BINDING');
  const expectedDigest = `sha256:${sha(JSON.stringify({ cycle_count: frontier.cycle_count, selected_hosts: frontier.selected_hosts, host_frontier: frontier.host_frontier }))}`;
  if (frontier.frontier_digest !== expectedDigest) fail('FRONTIER_DIGEST');
  const counts = frontier.host_frontier.map(row => Number(row.selected_count));
  if (counts.some(count => !Number.isInteger(count) || count < 0) || Math.max(...counts) - Math.min(...counts) > 1) fail('FRONTIER_FAIRNESS');
  for (const row of frontier.host_frontier) {
    if (row.rights_state !== 'UNASSESSED' || row.admission_state !== 'NOT_ADMITTED' || row.acquisition_authorized !== false || row.target_site_body_crawled !== false || row.production !== 'HOLD') fail(`FRONTIER_HOST_PROMOTION:${row.host}`);
  }
  if (expansion.seed_frontier_bootstrap_state === 'FRONTIER_BUILD_FAILED_LEGACY_FAIL_SAFE') fail('ROLLING_WITH_FAILED_FRONTIER_STATE');
} else {
  if (expansion.seed_frontier_snapshot !== null || expansion.seed_frontier_id !== null || expansion.seed_frontier_version !== null || expansion.seed_frontier_cycle !== null || expansion.seed_frontier_completed_sweep_count !== null || expansion.seed_frontier_sweep_number !== null || expansion.seed_frontier_never_selected_host_count_after !== null || expansion.seed_frontier_full_sweep_complete !== null || expansion.seed_frontier_digest !== null) fail('LEGACY_MODE_FRONTIER_CONTAMINATION');
  if (expansion.seed_frontier_bootstrap_state !== 'FRONTIER_BUILD_FAILED_LEGACY_FAIL_SAFE') fail('LEGACY_WITHOUT_BUILD_FAILURE');
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
  if ((result.status.includes('FAILED') || result.status.includes('SKIPPED')) && !result.error) fail(`SEED_RESULT_ERROR_MISSING:${result.seed_host}`);
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
  index_state: expansion.common_crawl_index_state,
  index_id: expansion.common_crawl_index_id,
  frontier_runtime_managed: expansion.frontier_runtime_managed,
  frontier_bootstrap_state: expansion.seed_frontier_bootstrap_state,
  previous_snapshot_found: expansion.seed_frontier_previous_snapshot_found,
  seed_selection_mode: expansion.seed_selection_mode,
  seed_frontier_cycle: expansion.seed_frontier_cycle,
  completed_sweeps: expansion.seed_frontier_completed_sweep_count,
  seed_hosts: expansion.seed_host_count,
  expanded_candidates: expansion.expanded_candidate_count,
  fail_soft_seed_results: expansion.seed_host_results.filter(result => result.status.includes('FAILED') || result.status.includes('SKIPPED')).length,
  production: 'HOLD'
}));
