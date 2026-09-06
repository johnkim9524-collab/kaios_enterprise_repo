#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';

const filePath = process.argv[2] || '/tmp/asi-common-crawl-seed-frontier-v1.json';
const frontier = JSON.parse(fs.readFileSync(filePath, 'utf8'));
const fail = message => { throw new Error(message); };
const sha = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const forbiddenHost = host => host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.test') || host.endsWith('.invalid') || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(':') || !host.includes('.');

if (frontier.id !== 'kidults-asi-common-crawl-seed-frontier-v1' || frontier.version !== '1.0.0') fail('IDENTITY');
if (frontier.status !== 'SHADOW_COMMON_CRAWL_SEED_FRONTIER_READY') fail('STATUS');
if (frontier.universe_target !== 'GLOBAL_ANY_SITE_SOURCE_UNIVERSE' || frontier.purpose !== 'COMMON_CRAWL_PUBLIC_INDEX_HOST_SELECTION_ONLY') fail('UNIVERSE');
if (frontier.fairness_policy !== 'LOWEST_SELECTION_COUNT_THEN_OLDEST_SELECTION_THEN_PROVIDER_DIVERSITY' || frontier.repeat_before_unselected_exhaustion_forbidden !== true) fail('FAIRNESS_POLICY');
if (frontier.metadata_index_only !== true || frontier.target_site_body_crawled !== false || frontier.content_acquired !== false || frontier.rights_promoted !== false || frontier.admission_promoted !== false || frontier.acquisition_authorized !== false) fail('PERMISSION_BOUNDARY');
if (frontier.production !== 'HOLD' || frontier.public_release !== 'HOLD') fail('RELEASE_BOUNDARY');
if (!Number.isInteger(Number(frontier.cycle_count)) || Number(frontier.cycle_count) < 1) fail('CYCLE');
if (!Number.isInteger(Number(frontier.previous_cycle_count)) || Number(frontier.previous_cycle_count) < 0 || Number(frontier.previous_cycle_count) >= Number(frontier.cycle_count)) fail('PREVIOUS_CYCLE');
if (!Array.isArray(frontier.host_frontier) || frontier.host_frontier.length !== Number(frontier.host_universe_count) || frontier.host_frontier.length < 1) fail('HOST_UNIVERSE');
if (!Array.isArray(frontier.selected_hosts) || frontier.selected_hosts.length !== Number(frontier.selected_host_count) || frontier.selected_hosts.length < 1 || frontier.selected_hosts.length > Number(frontier.max_hosts_per_cycle) || Number(frontier.max_hosts_per_cycle) !== 8) fail('SELECTION_BUDGET');
if (new Set(frontier.selected_hosts).size !== frontier.selected_hosts.length) fail('DUPLICATE_SELECTED_HOST');

const selected = new Set(frontier.selected_hosts);
const hosts = new Set();
const priorCounts = new Map();
const historicalBefore = new Map();
for (const row of frontier.host_frontier) {
  if (!row.host || !row.host_key || hosts.has(row.host)) fail(`HOST_ID:${row.host}`);
  if (forbiddenHost(String(row.host))) fail(`FORBIDDEN_HOST:${row.host}`);
  hosts.add(row.host);
  if (!Array.isArray(row.discovery_providers) || row.discovery_providers.length < 1 || new Set(row.discovery_providers).size !== row.discovery_providers.length) fail(`HOST_PROVIDERS:${row.host}`);
  if (!Array.isArray(row.provider_record_ids)) fail(`HOST_RECORDS:${row.host}`);
  if (!Number.isInteger(Number(row.selected_count)) || Number(row.selected_count) < 0) fail(`HOST_SELECTION_COUNT:${row.host}`);
  if (!Number.isInteger(Number(row.historical_selected_count_before_cycle)) || Number(row.historical_selected_count_before_cycle) < 0) fail(`HOST_HISTORICAL_COUNT_BEFORE:${row.host}`);
  if (!Number.isInteger(Number(row.historical_selected_count)) || Number(row.historical_selected_count) !== Number(row.historical_selected_count_before_cycle) + (row.selected_this_cycle ? 1 : 0)) fail(`HOST_HISTORICAL_COUNT_AFTER:${row.host}`);
  if (row.selected_this_cycle !== selected.has(row.host)) fail(`HOST_SELECTION_FLAG:${row.host}`);
  if (row.selected_this_cycle && Number(row.last_selected_cycle) !== Number(frontier.cycle_count)) fail(`HOST_LAST_SELECTED:${row.host}`);
  if (!row.selected_this_cycle && row.last_selected_cycle !== null && Number(row.last_selected_cycle) > Number(frontier.previous_cycle_count)) fail(`HOST_FUTURE_SELECTION:${row.host}`);
  if (!Number.isInteger(Number(row.first_seen_cycle)) || Number(row.first_seen_cycle) < 1 || Number(row.first_seen_cycle) > Number(frontier.cycle_count)) fail(`HOST_FIRST_SEEN:${row.host}`);
  if (Number(row.last_seen_cycle) !== Number(frontier.cycle_count)) fail(`HOST_LAST_SEEN:${row.host}`);
  if (row.rights_state !== 'UNASSESSED' || row.admission_state !== 'NOT_ADMITTED' || row.acquisition_authorized !== false || row.target_site_body_crawled !== false || row.production !== 'HOLD') fail(`HOST_PROMOTION:${row.host}`);
  const priorCount = Number(row.selected_count) - (row.selected_this_cycle ? 1 : 0);
  if (!Number.isInteger(Number(row.selection_count_rebase_delta)) || Number(row.selection_count_rebase_delta) < 0 || Number(row.selection_count_rebase_delta) !== Number(row.historical_selected_count_before_cycle) - priorCount) fail(`HOST_REBASE_DELTA:${row.host}`);
  priorCounts.set(row.host, priorCount);
  historicalBefore.set(row.host, Number(row.historical_selected_count_before_cycle));
}
for (const host of frontier.selected_hosts) if (!hosts.has(host)) fail(`SELECTED_HOST_ORPHAN:${host}`);

const minimumPrior = Math.min(...priorCounts.values());
const eligibleAtMinimum = [...priorCounts.values()].filter(count => count === minimumPrior).length;
if (Number(frontier.minimum_selection_count_before) !== minimumPrior) fail('MINIMUM_BEFORE');
if (Number(frontier.eligible_minimum_selection_host_count_before) !== eligibleAtMinimum) fail('ELIGIBLE_MINIMUM_COUNT');
const selectedPriorCounts = frontier.selected_hosts.map(host => priorCounts.get(host));
const nonSelectedPriorCounts = [...priorCounts.entries()].filter(([host]) => !selected.has(host)).map(([, count]) => count);
if (nonSelectedPriorCounts.length && Math.max(...selectedPriorCounts) > Math.min(...nonSelectedPriorCounts)) fail('UNFAIR_REPEAT_BEFORE_LOWER_COUNT_HOST');
const minimumAfter = Math.min(...frontier.host_frontier.map(row => Number(row.selected_count)));
const maximumAfter = Math.max(...frontier.host_frontier.map(row => Number(row.selected_count)));
if (Number(frontier.minimum_selection_count_after) !== minimumAfter || Number(frontier.maximum_selection_count_after) !== maximumAfter) fail('AFTER_COUNTS');
if (Number(frontier.selection_count_delta_after) !== maximumAfter - minimumAfter || maximumAfter - minimumAfter > 1) fail('FAIRNESS_DELTA');
const historicalValues = [...historicalBefore.values()];
const historicalMinimum = Math.min(...historicalValues);
const historicalMaximum = Math.max(...historicalValues);
const expectedRebased = [...historicalBefore.entries()].some(([host, count]) => count - priorCounts.get(host) !== 0);
if (frontier.historical_selection_rebase_policy !== 'PRESERVE_ABSOLUTE_HISTORY_REBASE_CURRENT_UNIVERSE_TO_UNIT_SPREAD') fail('HISTORICAL_REBASE_POLICY');
if (frontier.historical_selection_rebased !== expectedRebased) fail('HISTORICAL_REBASE_STATE');
if (Number(frontier.historical_selection_minimum_before) !== historicalMinimum || Number(frontier.historical_selection_maximum_before) !== historicalMaximum) fail('HISTORICAL_REBASE_RANGE');
if (Number(frontier.historical_selection_count_total_before) !== historicalValues.reduce((sum, count) => sum + count, 0)) fail('HISTORICAL_TOTAL_BEFORE');
if (Number(frontier.historical_selection_count_total_after) !== frontier.host_frontier.reduce((sum, row) => sum + Number(row.historical_selected_count), 0)) fail('HISTORICAL_TOTAL_AFTER');
if (Number(frontier.historical_selection_rebase_max_delta) !== Math.max(...frontier.host_frontier.map(row => Number(row.selection_count_rebase_delta)))) fail('HISTORICAL_REBASE_MAX_DELTA');
if (Math.max(...priorCounts.values()) - Math.min(...priorCounts.values()) > 1) fail('REBASED_PRIOR_FAIRNESS');
if (!Number.isInteger(Number(frontier.previous_host_universe_count)) || !Number.isInteger(Number(frontier.retained_host_count)) || !Number.isInteger(Number(frontier.new_host_count)) || !Number.isInteger(Number(frontier.removed_host_count))) fail('HOST_CHURN_COUNTS');
if (Number(frontier.retained_host_count) + Number(frontier.new_host_count) !== frontier.host_frontier.length || Number(frontier.previous_host_universe_count) - Number(frontier.retained_host_count) !== Number(frontier.removed_host_count)) fail('HOST_CHURN_RECONCILIATION');
if (frontier.previous_frontier_valid === true) {
  if (!/^sha256:[0-9a-f]{64}$/.test(String(frontier.previous_frontier_digest || '')) || Number(frontier.previous_host_universe_count) < 1) fail('PREVIOUS_FRONTIER_PROVENANCE');
} else if (frontier.previous_frontier_valid !== false || frontier.previous_frontier_digest !== null || Number(frontier.previous_host_universe_count) !== 0) fail('FRESH_FRONTIER_PROVENANCE');
if (!/^sha256:[0-9a-f]{64}$/.test(String(frontier.removed_host_history_digest || ''))) fail('REMOVED_HOST_HISTORY_DIGEST');
const neverSelected = frontier.host_frontier.filter(row => Number(row.selected_count) === 0).length;
if (Number(frontier.never_selected_host_count_after) !== neverSelected) fail('NEVER_SELECTED_COUNT');
const completedSweeps = minimumAfter;
if (Number(frontier.completed_sweep_count) !== completedSweeps) fail('COMPLETED_SWEEP_COUNT');
if (Number(frontier.sweep_number) !== completedSweeps + 1) fail('SWEEP_NUMBER');
if (frontier.full_sweep_complete !== (neverSelected === 0)) fail('FULL_SWEEP_STATE');
if (!frontier.input_discovery_digest?.startsWith('sha256:') || !frontier.frontier_digest?.startsWith('sha256:')) fail('DIGEST_FORMAT');
const expectedDigest = `sha256:${sha(JSON.stringify({ cycle_count: frontier.cycle_count, selected_hosts: frontier.selected_hosts, host_frontier: frontier.host_frontier }))}`;
if (frontier.frontier_digest !== expectedDigest) fail('FRONTIER_DIGEST');

console.log(JSON.stringify({
  status: 'PASS',
  cycle_count: frontier.cycle_count,
  completed_sweep_count: completedSweeps,
  sweep_number: frontier.sweep_number,
  host_universe: frontier.host_universe_count,
  selected_hosts: frontier.selected_host_count,
  minimum_before: minimumPrior,
  minimum_after: minimumAfter,
  maximum_after: maximumAfter,
  never_selected_after: neverSelected,
  full_sweep_complete: frontier.full_sweep_complete,
  fairness_delta: maximumAfter - minimumAfter,
  production: 'HOLD'
}));
