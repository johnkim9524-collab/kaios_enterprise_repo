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
  try { previous = JSON.parse(fs.readFileSync(previousPath, 'utf8')); } catch { previous = null; }
}
const fail = message => { throw new Error(message); };
const sha = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const unique = values => [...new Set(values.filter(Boolean))].sort();
const normalizeHost = value => {
  const host = new URL(String(value || '')).hostname.toLowerCase().replace(/^www\./, '');
  if (!host || host.includes('..')) fail('INVALID_HOST');
  return host;
};

if (discovery.id !== 'kidults-asi-global-low-risk-discovery-v1' || discovery.primary_target !== 'GLOBAL_ANY_SITE_SOURCE_UNIVERSE') fail('DISCOVERY_INPUT');
if (discovery.production !== 'HOLD' || discovery.public_release !== 'HOLD' || discovery.acquisition_authorized !== false || discovery.content_acquired !== false) fail('DISCOVERY_BOUNDARY');
if (!Array.isArray(discovery.candidates) || discovery.candidates.length !== Number(discovery.candidate_count)) fail('DISCOVERY_COUNT');

const validPrevious = Boolean(
  previous &&
  previous.id === 'kidults-asi-common-crawl-seed-frontier-v1' &&
  previous.version === '1.0.0' &&
  previous.status === 'SHADOW_COMMON_CRAWL_SEED_FRONTIER_READY' &&
  previous.production === 'HOLD' &&
  previous.public_release === 'HOLD' &&
  previous.rights_promoted === false &&
  previous.admission_promoted === false &&
  previous.acquisition_authorized === false &&
  Array.isArray(previous.host_frontier)
);
const previousByHost = new Map((validPrevious ? previous.host_frontier : []).map(row => [row.host, row]));
const observed = new Map();
for (const candidate of discovery.candidates) {
  let host;
  try { host = normalizeHost(candidate.endpoint_url); } catch { continue; }
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

const cycleCount = Number(validPrevious ? previous.cycle_count : 0) + 1;
const frontier = [...observed.values()].map(row => {
  const prior = previousByHost.get(row.host);
  return {
    host: row.host,
    host_key: `host:${sha(row.host).slice(0, 24)}`,
    first_seen_cycle: Number(prior?.first_seen_cycle || cycleCount),
    last_seen_cycle: cycleCount,
    selected_count: Number(prior?.selected_count || 0),
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

frontier.sort((a, b) =>
  a.selected_count - b.selected_count ||
  Number(a.last_selected_cycle ?? -1) - Number(b.last_selected_cycle ?? -1) ||
  Number(b.live_external_observation) - Number(a.live_external_observation) ||
  b.discovery_providers.length - a.discovery_providers.length ||
  a.host.localeCompare(b.host)
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
    row.last_selected_cycle = cycleCount;
  }
}
frontier.sort((a, b) => a.host.localeCompare(b.host));
const minimumSelectionCountAfter = Math.min(...frontier.map(row => row.selected_count));
const maximumSelectionCountAfter = Math.max(...frontier.map(row => row.selected_count));
const neverSelectedAfter = frontier.filter(row => row.selected_count === 0).length;
const fairnessDelta = maximumSelectionCountAfter - minimumSelectionCountAfter;
const fullSweepComplete = frontier.every(row => row.selected_count >= minimumSelectionCountAfter + (neverSelectedAfter === 0 ? 0 : 0));
const sweepNumber = minimumSelectionCountAfter + 1;
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
  sweep_number: sweepNumber,
  previous_frontier_valid: validPrevious,
  previous_cycle_count: Number(validPrevious ? previous.cycle_count : 0),
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
  sweep_number: sweepNumber,
  host_universe: frontier.length,
  selected_hosts: selectedHosts.length,
  never_selected_after: neverSelectedAfter,
  fairness_delta: fairnessDelta,
  previous_frontier_valid: validPrevious,
  production: 'HOLD'
}));
