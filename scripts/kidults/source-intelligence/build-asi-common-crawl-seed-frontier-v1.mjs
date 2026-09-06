#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const discoveryPath = process.argv[2] || 'discovery-out/global-low-risk-discovery.json';
const previousPath = process.argv[3] || '';
const outPath = process.argv[4] || '/tmp/asi-common-crawl-seed-frontier-v1.json';
const maxHostsPerCycle = 8;

const discovery = JSON.parse(fs.readFileSync(discoveryPath, 'utf8'));
let previous = null;
if (previousPath && fs.existsSync(previousPath)) {
  try { previous = JSON.parse(fs.readFileSync(previousPath, 'utf8')); } catch { throw new Error('PREVIOUS_FRONTIER_MALFORMED_JSON'); }
}
const fail = message => { throw new Error(message); };
const sha = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const unique = values => [...new Set(values.filter(Boolean))].sort();
const compareText = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const forbiddenHost = host =>
  host === 'localhost' ||
  host.endsWith('.localhost') ||
  host.endsWith('.test') ||
  host.endsWith('.invalid') ||
  /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) ||
  host.includes(':') ||
  !host.includes('.');
const normalizeHost = value => {
  const endpoint = new URL(String(value || ''));
  const host = endpoint.hostname.toLowerCase().replace(/^www\./, '');
  if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || !host || host.includes('..')) fail('INVALID_HOST');
  if (forbiddenHost(host)) fail(`FORBIDDEN_HOST:${host || 'EMPTY'}`);
  return host;
};

const validatePrevious = value => {
  if (value === null) return false;
  if (
    value?.id !== 'kidults-asi-common-crawl-seed-frontier-v1' ||
    value?.version !== '1.0.0' ||
    value?.status !== 'SHADOW_COMMON_CRAWL_SEED_FRONTIER_READY' ||
    value?.universe_target !== 'GLOBAL_ANY_SITE_SOURCE_UNIVERSE' ||
    value?.purpose !== 'COMMON_CRAWL_PUBLIC_INDEX_HOST_SELECTION_ONLY' ||
    value?.metadata_index_only !== true ||
    value?.target_site_body_crawled !== false ||
    value?.content_acquired !== false ||
    value?.rights_promoted !== false ||
    value?.admission_promoted !== false ||
    value?.acquisition_authorized !== false ||
    value?.production !== 'HOLD' ||
    value?.public_release !== 'HOLD' ||
    !Number.isInteger(Number(value?.cycle_count)) || Number(value.cycle_count) < 1 ||
    !Array.isArray(value?.host_frontier) || value.host_frontier.length < 1 ||
    value.host_frontier.length !== Number(value?.host_universe_count) ||
    !Array.isArray(value?.selected_hosts) || value.selected_hosts.length < 1 || value.selected_hosts.length > maxHostsPerCycle ||
    value.selected_hosts.length !== Number(value?.selected_host_count) ||
    new Set(value.selected_hosts).size !== value.selected_hosts.length
  ) fail('PREVIOUS_FRONTIER_MALFORMED_STATE');
  const seen = new Set();
  for (const row of value.host_frontier) {
    const host = String(row?.host || '');
    if (seen.has(host)) fail(`PREVIOUS_FRONTIER_DUPLICATE_HOST:${host}`);
    seen.add(host);
    if (normalizeHost(`https://${host}/`) !== host) fail(`PREVIOUS_FRONTIER_HOST:${host}`);
    const selectedCount = Number(row?.selected_count);
    const historicalCount = row?.historical_selected_count === undefined ? selectedCount : Number(row.historical_selected_count);
    const hasRebasedHistory = row?.historical_selected_count_before_cycle !== undefined || row?.historical_selected_count !== undefined || row?.selection_count_rebase_delta !== undefined;
    const historicalBefore = Number(row?.historical_selected_count_before_cycle);
    const operationalBefore = selectedCount - (row?.selected_this_cycle ? 1 : 0);
    if (
      row?.host_key !== `host:${sha(host).slice(0, 24)}` ||
      !Number.isInteger(selectedCount) || selectedCount < 0 ||
      !Number.isInteger(historicalCount) || historicalCount < selectedCount ||
      !Number.isInteger(Number(row?.first_seen_cycle)) || Number(row.first_seen_cycle) < 1 || Number(row.first_seen_cycle) > Number(value.cycle_count) ||
      !Number.isInteger(Number(row?.last_seen_cycle)) || Number(row.last_seen_cycle) < Number(row.first_seen_cycle) || Number(row.last_seen_cycle) > Number(value.cycle_count) ||
      (row?.last_selected_cycle !== null && (!Number.isInteger(Number(row.last_selected_cycle)) || Number(row.last_selected_cycle) < 1 || Number(row.last_selected_cycle) > Number(value.cycle_count))) ||
      !Array.isArray(row?.discovery_providers) || new Set(row.discovery_providers).size !== row.discovery_providers.length ||
      !Array.isArray(row?.provider_record_ids) ||
      row?.rights_state !== 'UNASSESSED' || row?.admission_state !== 'NOT_ADMITTED' ||
      row?.acquisition_authorized !== false || row?.target_site_body_crawled !== false || row?.production !== 'HOLD'
    ) fail(`PREVIOUS_FRONTIER_MALFORMED_HOST:${host || 'EMPTY'}`);
    if (hasRebasedHistory && (
      !Number.isInteger(historicalBefore) || historicalBefore < 0 ||
      historicalCount !== historicalBefore + (row?.selected_this_cycle ? 1 : 0) ||
      !Number.isInteger(Number(row?.selection_count_rebase_delta)) || Number(row.selection_count_rebase_delta) < 0 ||
      Number(row.selection_count_rebase_delta) !== historicalBefore - operationalBefore
    )) fail(`PREVIOUS_FRONTIER_MALFORMED_HISTORY:${host}`);
  }
  const selected = new Set(value.selected_hosts);
  if ([...selected].some(host => !seen.has(host))) fail('PREVIOUS_FRONTIER_SELECTED_HOST_ORPHAN');
  for (const row of value.host_frontier) {
    if (row.selected_this_cycle !== selected.has(row.host)) fail(`PREVIOUS_FRONTIER_SELECTION_FLAG:${row.host}`);
  }
  const expectedDigest = `sha256:${sha(JSON.stringify({ cycle_count: value.cycle_count, selected_hosts: value.selected_hosts, host_frontier: value.host_frontier }))}`;
  if (value.frontier_digest !== expectedDigest) fail('PREVIOUS_FRONTIER_DIGEST');
  return true;
};

if (discovery.id !== 'kidults-asi-global-low-risk-discovery-v1' || discovery.primary_target !== 'GLOBAL_ANY_SITE_SOURCE_UNIVERSE') fail('DISCOVERY_INPUT');
if (discovery.production !== 'HOLD' || discovery.public_release !== 'HOLD' || discovery.acquisition_authorized !== false || discovery.content_acquired !== false) fail('DISCOVERY_BOUNDARY');
if (!Array.isArray(discovery.candidates) || discovery.candidates.length !== Number(discovery.candidate_count)) fail('DISCOVERY_COUNT');

const validPrevious = validatePrevious(previous);
const previousByHost = new Map((validPrevious ? previous.host_frontier : []).map(row => [row.host, row]));
const observed = new Map();
for (const candidate of discovery.candidates) {
  const host = normalizeHost(candidate.endpoint_url);
  const row = observed.get(host) || {
    host,
    discovery_observation_count: 0,
    discovery_providers: new Set(),
    provider_record_ids: new Set(),
    live_external_observation: false
  };
  row.discovery_observation_count++;
  for (const provider of [...(candidate.discovery_providers || []), candidate.discovery_provider]) if (provider) row.discovery_providers.add(provider);
  for (const record of [...(candidate.provider_record_ids || []), candidate.provider_record_id]) if (record) row.provider_record_ids.add(record);
  row.live_external_observation = Boolean(row.live_external_observation || candidate.live_external_observation === true);
  observed.set(host, row);
}
if (!observed.size) fail('NO_HOSTS');

const retainedHostCount = [...observed.keys()].filter(host => previousByHost.has(host)).length;
const newHostCount = observed.size - retainedHostCount;
const removedPreviousRows = validPrevious ? previous.host_frontier.filter(row => !observed.has(row.host)) : [];
const removedHostHistoryDigest = `sha256:${sha(JSON.stringify(removedPreviousRows.map(row => ({
  host: row.host,
  historical_selected_count: Number(row.historical_selected_count ?? row.selected_count),
  first_seen_cycle: Number(row.first_seen_cycle),
  last_seen_cycle: Number(row.last_seen_cycle),
  last_selected_cycle: row.last_selected_cycle ?? null
})).sort((left, right) => compareText(left.host, right.host))))}`;

const cycleCount = Number(validPrevious ? previous.cycle_count : 0) + 1;
const frontier = [...observed.values()].map(row => {
  const prior = previousByHost.get(row.host);
  const historicalSelectedCountBefore = Number(prior?.historical_selected_count ?? prior?.selected_count ?? 0);
  return {
    host: row.host,
    host_key: `host:${sha(row.host).slice(0, 24)}`,
    first_seen_cycle: Number(prior?.first_seen_cycle || cycleCount),
    last_seen_cycle: cycleCount,
    selected_count: historicalSelectedCountBefore,
    historical_selected_count_before_cycle: historicalSelectedCountBefore,
    historical_selected_count: historicalSelectedCountBefore,
    selection_count_rebase_delta: 0,
    last_selected_cycle: prior?.last_selected_cycle ?? null,
    discovery_observation_count: row.discovery_observation_count,
    discovery_providers: unique([...row.discovery_providers]),
    provider_record_ids: unique([...row.provider_record_ids]),
    live_external_observation: row.live_external_observation,
    last_expansion_status: prior?.last_expansion_status || 'NOT_YET_ATTEMPTED',
    last_expanded_candidate_count: Number(prior?.last_expanded_candidate_count || 0),
    rights_state: 'UNASSESSED',
    admission_state: 'NOT_ADMITTED',
    acquisition_authorized: false,
    target_site_body_crawled: false,
    production: 'HOLD'
  };
});

// Absolute history remains append-only in historical_selected_count. Selection uses a
// bounded current-universe projection so host additions/removals cannot carry an
// unbounded historical skew into the next cycle.
const historicalMinimumBefore = Math.min(...frontier.map(row => row.historical_selected_count_before_cycle));
const historicalMaximumBefore = Math.max(...frontier.map(row => row.historical_selected_count_before_cycle));
for (const row of frontier) {
  const rebased = historicalMinimumBefore + (row.historical_selected_count_before_cycle > historicalMinimumBefore ? 1 : 0);
  row.selected_count = rebased;
  row.selection_count_rebase_delta = row.historical_selected_count_before_cycle - rebased;
}
const historicalSelectionRebased = frontier.some(row => row.selection_count_rebase_delta !== 0);

frontier.sort((a, b) =>
  a.selected_count - b.selected_count ||
  Number(a.last_selected_cycle ?? -1) - Number(b.last_selected_cycle ?? -1) ||
  Number(b.live_external_observation) - Number(a.live_external_observation) ||
  b.discovery_providers.length - a.discovery_providers.length ||
  compareText(a.host, b.host)
);
const minimumSelectionCountBefore = Math.min(...frontier.map(row => row.selected_count));
const eligibleAtMinimum = frontier.filter(row => row.selected_count === minimumSelectionCountBefore);
const selected = frontier.slice(0, Math.min(maxHostsPerCycle, frontier.length));
const selectedSet = new Set(selected.map(row => row.host));
const selectedHosts = selected.map(row => row.host);
for (const row of frontier) {
  row.selected_this_cycle = selectedSet.has(row.host);
  if (row.selected_this_cycle) {
    row.selected_count += 1;
    row.historical_selected_count += 1;
    row.last_selected_cycle = cycleCount;
  }
}
frontier.sort((a, b) => compareText(a.host, b.host));
const minimumSelectionCountAfter = Math.min(...frontier.map(row => row.selected_count));
const maximumSelectionCountAfter = Math.max(...frontier.map(row => row.selected_count));
const neverSelectedAfter = frontier.filter(row => row.selected_count === 0).length;
const fairnessDelta = maximumSelectionCountAfter - minimumSelectionCountAfter;
const fullSweepComplete = neverSelectedAfter === 0;
const completedSweepCount = minimumSelectionCountAfter;
const sweepNumber = completedSweepCount + 1;
const inputDigest = `sha256:${sha(JSON.stringify({ discovery_id: discovery.id, candidate_count: discovery.candidate_count, hosts: [...observed.keys()].sort() }))}`;
const frontierDigest = `sha256:${sha(JSON.stringify({ cycle_count: cycleCount, selected_hosts: selectedHosts, host_frontier: frontier }))}`;

const output = {
  id: 'kidults-asi-common-crawl-seed-frontier-v1',
  version: '1.0.0',
  status: 'SHADOW_COMMON_CRAWL_SEED_FRONTIER_READY',
  generated_at: new Date().toISOString(),
  universe_target: 'GLOBAL_ANY_SITE_SOURCE_UNIVERSE',
  purpose: 'COMMON_CRAWL_PUBLIC_INDEX_HOST_SELECTION_ONLY',
  cycle_count: cycleCount,
  completed_sweep_count: completedSweepCount,
  sweep_number: sweepNumber,
  previous_frontier_valid: validPrevious,
  previous_cycle_count: Number(validPrevious ? previous.cycle_count : 0),
  previous_frontier_digest: validPrevious ? previous.frontier_digest : null,
  previous_host_universe_count: validPrevious ? previous.host_frontier.length : 0,
  retained_host_count: retainedHostCount,
  new_host_count: newHostCount,
  removed_host_count: removedPreviousRows.length,
  removed_host_history_digest: removedHostHistoryDigest,
  input_discovery_digest: inputDigest,
  host_universe_count: frontier.length,
  max_hosts_per_cycle: maxHostsPerCycle,
  selected_host_count: selectedHosts.length,
  selected_hosts: selectedHosts,
  minimum_selection_count_before: minimumSelectionCountBefore,
  eligible_minimum_selection_host_count_before: eligibleAtMinimum.length,
  minimum_selection_count_after: minimumSelectionCountAfter,
  maximum_selection_count_after: maximumSelectionCountAfter,
  selection_count_delta_after: fairnessDelta,
  historical_selection_rebased: historicalSelectionRebased,
  historical_selection_minimum_before: historicalMinimumBefore,
  historical_selection_maximum_before: historicalMaximumBefore,
  historical_selection_count_total_before: frontier.reduce((sum, row) => sum + row.historical_selected_count_before_cycle, 0),
  historical_selection_count_total_after: frontier.reduce((sum, row) => sum + row.historical_selected_count, 0),
  historical_selection_rebase_max_delta: Math.max(...frontier.map(row => row.selection_count_rebase_delta)),
  historical_selection_rebase_policy: 'PRESERVE_ABSOLUTE_HISTORY_REBASE_CURRENT_UNIVERSE_TO_UNIT_SPREAD',
  never_selected_host_count_after: neverSelectedAfter,
  full_sweep_complete: fullSweepComplete,
  fairness_policy: 'LOWEST_SELECTION_COUNT_THEN_OLDEST_SELECTION_THEN_PROVIDER_DIVERSITY',
  repeat_before_unselected_exhaustion_forbidden: true,
  host_frontier: frontier,
  frontier_digest: frontierDigest,
  metadata_index_only: true,
  target_site_body_crawled: false,
  content_acquired: false,
  rights_promoted: false,
  admission_promoted: false,
  acquisition_authorized: false,
  public_release: 'HOLD',
  production: 'HOLD'
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
const tempPath = `${outPath}.tmp-${process.pid}`;
fs.writeFileSync(tempPath, `${JSON.stringify(output, null, 2)}\n`);
fs.renameSync(tempPath, outPath);
console.log(JSON.stringify({
  status: output.status,
  cycle_count: cycleCount,
  completed_sweep_count: completedSweepCount,
  sweep_number: sweepNumber,
  host_universe: frontier.length,
  selected_hosts: selectedHosts.length,
  never_selected_after: neverSelectedAfter,
  full_sweep_complete: fullSweepComplete,
  fairness_delta: fairnessDelta,
  previous_frontier_valid: validPrevious,
  production: 'HOLD'
}));
