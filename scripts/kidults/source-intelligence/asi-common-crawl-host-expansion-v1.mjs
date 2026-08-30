#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const input = process.argv[2] || 'discovery-out/global-low-risk-discovery.json';
const out = process.argv[3] || '/tmp/asi-common-crawl-host-expansion-v1.json';
const explicitFrontierPath = process.argv[4] || '';
const runtimeFrontierPath = process.env.ASI_COMMON_CRAWL_FRONTIER_OUT || '/tmp/asi-common-crawl-seed-frontier-v1.json';
const discovery = JSON.parse(fs.readFileSync(input, 'utf8'));
const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 24);
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const normalizeHost = value => new URL(String(value || '')).hostname.toLowerCase().replace(/^www\./, '');
const builderPath = 'scripts/kidults/source-intelligence/build-asi-common-crawl-seed-frontier-v1.mjs';

async function get(url, attempt = 0) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json,text/plain',
        'User-Agent': 'KIDULTS-ASI-Common-Crawl-Host-Expansion-v1'
      }
    });
    if ((response.status === 429 || response.status >= 500) && attempt < 2) {
      await sleep(700 * (2 ** attempt));
      return get(url, attempt + 1);
    }
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

const isValidFrontier = value => Boolean(
  value &&
  value.id === 'kidults-asi-common-crawl-seed-frontier-v1' &&
  value.version === '1.0.0' &&
  value.status === 'SHADOW_COMMON_CRAWL_SEED_FRONTIER_READY' &&
  value.universe_target === 'GLOBAL_ANY_SITE_SOURCE_UNIVERSE' &&
  value.purpose === 'COMMON_CRAWL_PUBLIC_INDEX_HOST_SELECTION_ONLY' &&
  value.metadata_index_only === true &&
  value.target_site_body_crawled === false &&
  value.content_acquired === false &&
  value.rights_promoted === false &&
  value.admission_promoted === false &&
  value.acquisition_authorized === false &&
  value.production === 'HOLD' &&
  value.public_release === 'HOLD' &&
  Array.isArray(value.selected_hosts) &&
  value.selected_hosts.length > 0 &&
  value.selected_hosts.length <= 8 &&
  new Set(value.selected_hosts).size === value.selected_hosts.length &&
  Array.isArray(value.host_frontier) &&
  value.host_frontier.length === Number(value.host_universe_count) &&
  String(value.frontier_digest || '').startsWith('sha256:')
);

if (discovery.id !== 'kidults-asi-global-low-risk-discovery-v1' || discovery.primary_target !== 'GLOBAL_ANY_SITE_SOURCE_UNIVERSE') throw new Error('DISCOVERY_INPUT');
if (discovery.production !== 'HOLD' || discovery.public_release !== 'HOLD' || discovery.acquisition_authorized !== false || discovery.content_acquired !== false) throw new Error('DISCOVERY_BOUNDARY');
if (!Array.isArray(discovery.candidates) || discovery.candidates.length !== Number(discovery.candidate_count)) throw new Error('DISCOVERY_COUNT');

let frontier = null;
let frontierBootstrapState = 'NOT_ATTEMPTED';
let previousSnapshotFound = false;
let previousSnapshotSource = 'NONE';
let frontierRuntimeManaged = explicitFrontierPath.length === 0;
const frontierErrors = [];

if (explicitFrontierPath) {
  if (!fs.existsSync(explicitFrontierPath)) throw new Error('EXPLICIT_FRONTIER_NOT_FOUND');
  const value = JSON.parse(fs.readFileSync(explicitFrontierPath, 'utf8'));
  if (!isValidFrontier(value)) throw new Error('EXPLICIT_FRONTIER_INVALID');
  frontier = value;
  frontierBootstrapState = 'EXPLICIT_FRONTIER';
} else {
  const previousCandidates = [
    [process.env.ASI_COMMON_CRAWL_PREVIOUS_EXPANSION || '', 'ENV_PREVIOUS_EXPANSION'],
    ['/tmp/previous-source-pool/asi-common-crawl-host-expansion-v1.json', 'SELF_DRIVING_PREVIOUS_EXPANSION'],
    ['/tmp/previous-any-site-pool/asi-common-crawl-host-expansion-v1.json', 'HOURLY_PREVIOUS_EXPANSION']
  ];
  let previousFrontierPath = '/tmp/no-previous-common-crawl-frontier.json';
  for (const [candidatePath, source] of previousCandidates) {
    if (!candidatePath || !fs.existsSync(candidatePath)) continue;
    try {
      const priorExpansion = JSON.parse(fs.readFileSync(candidatePath, 'utf8'));
      const snapshot = priorExpansion.seed_frontier_snapshot;
      if (!isValidFrontier(snapshot)) continue;
      previousFrontierPath = '/tmp/asi-common-crawl-seed-frontier-previous-v1.json';
      fs.writeFileSync(previousFrontierPath, `${JSON.stringify(snapshot, null, 2)}\n`);
      previousSnapshotFound = true;
      previousSnapshotSource = source;
      break;
    } catch (error) {
      frontierErrors.push(`PREVIOUS_SNAPSHOT_PARSE:${source}:${String(error.message || error).slice(0, 120)}`);
    }
  }
  try {
    execFileSync(process.execPath, [builderPath, input, previousFrontierPath, runtimeFrontierPath], { stdio: ['ignore', 'pipe', 'pipe'] });
    const built = JSON.parse(fs.readFileSync(runtimeFrontierPath, 'utf8'));
    if (!isValidFrontier(built)) throw new Error('BUILT_FRONTIER_INVALID');
    frontier = built;
    frontierBootstrapState = previousSnapshotFound
      ? 'RUNTIME_FRONTIER_RESTORED_FROM_PREVIOUS_EXPANSION'
      : 'RUNTIME_FRONTIER_FRESH';
  } catch (error) {
    frontierErrors.push(`FRONTIER_BUILD:${String(error.message || error).slice(0, 180)}`);
    frontierBootstrapState = 'FRONTIER_BUILD_FAILED_LEGACY_FAIL_SAFE';
  }
}

let seedSelectionMode = 'ROLLING_FAIR_FRONTIER';
let seedHosts = frontier?.selected_hosts || [];
if (!frontier) {
  seedSelectionMode = 'LEGACY_FIRST_SEEN_FAIL_SAFE';
  seedHosts = [];
  for (const candidate of discovery.candidates || []) {
    try {
      const host = normalizeHost(candidate.endpoint_url);
      if (host && !seedHosts.includes(host)) seedHosts.push(host);
    } catch {}
    if (seedHosts.length >= 8) break;
  }
}
seedHosts = [...new Set(seedHosts)].slice(0, 8);
if (!seedHosts.length) throw new Error('NO_SEED_HOSTS');

let indexId = null;
let indexApi = null;
let indexState = 'UNAVAILABLE_FAIL_SOFT';
const observations = [];
const errors = [...frontierErrors];
const seedHostResults = [];
try {
  const response = await get('https://index.commoncrawl.org/collinfo.json');
  const indexes = await response.json();
  const latest = indexes?.[0];
  indexId = latest?.id || null;
  indexApi = latest?.['cdx-api'] || null;
  if (!indexId || !indexApi) throw new Error('NO_LATEST_INDEX_METADATA');
  indexState = 'DISCOVERED';
  if (!indexApi) throw new Error('NO_LATEST_INDEX_API');
} catch (error) {
  errors.push(`INDEX_DISCOVERY:${error.message}`);
}

if (indexApi) {
  for (const host of seedHosts) {
    let observedForHost = 0;
    let hostStatus = 'SUCCESS_ZERO_RESULTS';
    let hostError = null;
    try {
      const url = new URL(indexApi);
      url.searchParams.set('url', host);
      url.searchParams.set('matchType', 'domain');
      url.searchParams.set('output', 'json');
      url.searchParams.set('filter', 'status:200');
      url.searchParams.set('collapse', 'urlkey');
      url.searchParams.set('pageSize', '8');
      const response = await get(url);
      const text = await response.text();
      let acceptedRows = 0;
      for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue;
        let row;
        try { row = JSON.parse(line); } catch { continue; }
        let observedHost;
        try { observedHost = normalizeHost(row.url); } catch { continue; }
        if (!observedHost || !(observedHost === host || observedHost.endsWith(`.${host}`))) continue;
        observations.push({
          candidate_id: `cand-cc-host-${hash(`${frontier?.cycle_count || 0}|${host}|${observedHost}`)}`,
          seed_host: host,
          observed_host: observedHost,
          endpoint_url: `https://${observedHost}`,
          discovery_provider: 'COMMON_CRAWL_URL_INDEX_HOST_EXPANSION',
          discovery_channel: 'COMMON_CRAWL_AND_WEB_DATA_COMMONS_STRUCTURED_WEB_INDEX',
          provider_record_id: row.urlkey || row.digest || null,
          observed_at: new Date().toISOString(),
          common_crawl_index_id: indexId,
          seed_frontier_id: frontier?.id || null,
          seed_frontier_cycle: frontier?.cycle_count || null,
          seed_selection_mode: seedSelectionMode,
          http_status_metadata: row.status || null,
          mime_metadata: row.mime || null,
          live_external_observation: true,
          source_family_hint: 'UNCLASSIFIED_ANY_SITE_CANDIDATE',
          candidate_source_roles: ['UNCLASSIFIED_PENDING_RELEVANCE'],
          candidate_purpose_intents: [],
          rights_state: 'UNASSESSED',
          admission_state: 'NOT_ADMITTED',
          gate_1_state: 'PENDING',
          evidence_state: 'DISCOVERY_METADATA_ONLY',
          acquisition_authorized: false,
          target_site_body_crawled: false,
          content_acquired: false,
          provider_contacted: false,
          account_created: false,
          eula_accepted: false,
          spend_authorized: false,
          production: 'HOLD'
        });
        observedForHost++;
        if (++acceptedRows >= 8) break;
      }
      hostStatus = observedForHost > 0 ? 'SUCCESS_WITH_RESULTS' : 'SUCCESS_ZERO_RESULTS';
      await sleep(120);
    } catch (error) {
      hostStatus = 'FAILED_FAIL_SOFT';
      hostError = error.message;
      errors.push(`${host}:${error.message}`);
    }
    seedHostResults.push({
      seed_host: host,
      status: hostStatus,
      observed_candidate_count: observedForHost,
      error: hostError,
      fail_soft: true
    });
  }
} else {
  for (const host of seedHosts) {
    seedHostResults.push({
      seed_host: host,
      status: 'SKIPPED_INDEX_UNAVAILABLE_FAIL_SOFT',
      observed_candidate_count: 0,
      error: 'COMMON_CRAWL_INDEX_UNAVAILABLE',
      fail_soft: true
    });
  }
}

const deduplicated = [...new Map(observations.map(candidate => [candidate.endpoint_url, candidate])).values()]
  .sort((a, b) => a.endpoint_url.localeCompare(b.endpoint_url));
const output = {
  id: 'kidults-asi-common-crawl-host-expansion-v1',
  version: '1.3.0',
  status: deduplicated.length ? 'SHADOW_COMMON_CRAWL_HOST_EXPANSION_COMPLETE' : 'SHADOW_COMMON_CRAWL_HOST_EXPANSION_ZERO_RESULTS',
  universe_target: 'GLOBAL_ANY_SITE_SOURCE_UNIVERSE',
  input_candidate_count: Number(discovery.candidate_count || 0),
  frontier_runtime_managed: frontierRuntimeManaged,
  seed_frontier_bootstrap_state: frontierBootstrapState,
  seed_frontier_previous_snapshot_found: previousSnapshotFound,
  seed_frontier_previous_snapshot_source: previousSnapshotSource,
  seed_selection_mode: seedSelectionMode,
  seed_frontier_id: frontier?.id || null,
  seed_frontier_version: frontier?.version || null,
  seed_frontier_cycle: frontier?.cycle_count || null,
  seed_frontier_completed_sweep_count: frontier?.completed_sweep_count ?? null,
  seed_frontier_sweep_number: frontier?.sweep_number ?? null,
  seed_frontier_never_selected_host_count_after: frontier?.never_selected_host_count_after ?? null,
  seed_frontier_full_sweep_complete: frontier?.full_sweep_complete ?? null,
  seed_frontier_digest: frontier?.frontier_digest || null,
  seed_frontier_snapshot: frontier,
  seed_host_count: seedHosts.length,
  seed_hosts: seedHosts,
  seed_host_results: seedHostResults,
  common_crawl_index_state: indexState,
  common_crawl_index_id: indexId,
  common_crawl_index_api: indexApi,
  expanded_candidate_count: deduplicated.length,
  candidates: deduplicated,
  errors,
  metadata_index_only: true,
  target_site_body_crawled: false,
  content_acquired: false,
  rights_promoted: false,
  admission_promoted: false,
  acquisition_authorized: false,
  public_release: 'HOLD',
  production: 'HOLD'
};
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({
  status: output.status,
  index_state: indexState,
  index_id: indexId,
  frontier_runtime_managed: frontierRuntimeManaged,
  frontier_bootstrap_state: frontierBootstrapState,
  previous_snapshot_found: previousSnapshotFound,
  seed_selection_mode: seedSelectionMode,
  seed_frontier_cycle: output.seed_frontier_cycle,
  completed_sweeps: output.seed_frontier_completed_sweep_count,
  seed_hosts: seedHosts.length,
  expanded_candidates: deduplicated.length,
  errors: errors.length,
  production: 'HOLD'
}));
