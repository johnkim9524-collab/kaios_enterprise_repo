#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const root = process.cwd();
const builder = path.join(root, 'scripts/kidults/source-intelligence/build-asi-common-crawl-seed-frontier-v1.mjs');
const validator = path.join(root, 'scripts/kidults/source-intelligence/validate-asi-common-crawl-seed-frontier-v1.mjs');
const expansionValidator = path.join(root, 'scripts/kidults/source-intelligence/validate-asi-common-crawl-host-expansion-v1.mjs');
const sha = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const fail = code => { throw new Error(code); };
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-dynamic-frontier-'));

try {
  const oldHosts = Array.from({ length: 8 }, (_, index) => `old-${index}.example`);
  const newHosts = Array.from({ length: 8 }, (_, index) => `new-${index}.example`);
  const candidates = [...oldHosts, ...newHosts].map((host, index) => ({
    candidate_id: `candidate-${index}`,
    endpoint_url: `https://${host}/metadata`,
    discovery_provider: 'TEST_PUBLIC_METADATA',
    provider_record_id: `record-${index}`,
    discovery_providers: ['TEST_PUBLIC_METADATA'],
    provider_record_ids: [`record-${index}`],
    live_external_observation: false
  }));
  const discovery = {
    id: 'kidults-asi-global-low-risk-discovery-v1',
    primary_target: 'GLOBAL_ANY_SITE_SOURCE_UNIVERSE',
    candidate_count: candidates.length,
    candidates,
    production: 'HOLD',
    public_release: 'HOLD',
    acquisition_authorized: false,
    content_acquired: false
  };
  const previous = {
    id: 'kidults-asi-common-crawl-seed-frontier-v1',
    version: '1.0.0',
    status: 'SHADOW_COMMON_CRAWL_SEED_FRONTIER_READY',
    cycle_count: 10,
    production: 'HOLD',
    public_release: 'HOLD',
    rights_promoted: false,
    admission_promoted: false,
    acquisition_authorized: false,
    host_frontier: oldHosts.map(host => ({
      host,
      first_seen_cycle: 1,
      selected_count: 3,
      last_selected_cycle: 9,
      last_expansion_status: 'SUCCESS_WITH_RESULTS',
      last_expanded_candidate_count: 1
    }))
  };
  const discoveryPath = path.join(temp, 'discovery.json');
  const previousPath = path.join(temp, 'previous.json');
  const outputPath = path.join(temp, 'frontier.json');
  fs.writeFileSync(discoveryPath, JSON.stringify(discovery));
  fs.writeFileSync(previousPath, JSON.stringify(previous));
  execFileSync(process.execPath, [builder, discoveryPath, previousPath, outputPath], { stdio: 'pipe' });
  execFileSync(process.execPath, [validator, outputPath], { stdio: 'pipe' });

  const result = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  if (result.selection_count_delta_after <= 1) fail('DYNAMIC_SPREAD_NOT_EXERCISED');
  if (result.previous_frontier_valid !== true) fail('PREVIOUS_FRONTIER_NOT_USED');
  if (result.selected_hosts.length !== 8 || result.selected_hosts.some(host => !newHosts.includes(host))) {
    fail('LOWEST_COUNT_HOSTS_NOT_SELECTED');
  }

  const unfair = structuredClone(result);
  const displaced = unfair.selected_hosts.at(-1);
  const promoted = oldHosts[0];
  unfair.selected_hosts[unfair.selected_hosts.length - 1] = promoted;
  for (const row of unfair.host_frontier) {
    if (row.host === displaced) {
      row.selected_this_cycle = false;
      row.selected_count -= 1;
      row.last_selected_cycle = null;
    } else if (row.host === promoted) {
      row.selected_this_cycle = true;
      row.selected_count += 1;
      row.last_selected_cycle = unfair.cycle_count;
    }
  }
  const counts = unfair.host_frontier.map(row => Number(row.selected_count));
  unfair.minimum_selection_count_after = Math.min(...counts);
  unfair.maximum_selection_count_after = Math.max(...counts);
  unfair.selection_count_delta_after = unfair.maximum_selection_count_after - unfair.minimum_selection_count_after;
  unfair.never_selected_host_count_after = counts.filter(count => count === 0).length;
  unfair.completed_sweep_count = unfair.minimum_selection_count_after;
  unfair.sweep_number = unfair.completed_sweep_count + 1;
  unfair.full_sweep_complete = unfair.never_selected_host_count_after === 0;
  unfair.frontier_digest = `sha256:${sha(JSON.stringify({
    cycle_count: unfair.cycle_count,
    selected_hosts: unfair.selected_hosts,
    host_frontier: unfair.host_frontier
  }))}`;
  const unfairPath = path.join(temp, 'unfair.json');
  fs.writeFileSync(unfairPath, JSON.stringify(unfair));
  const rejected = spawnSync(process.execPath, [validator, unfairPath], { encoding: 'utf8' });
  if (rejected.status === 0 || !rejected.stderr.includes('UNFAIR_REPEAT_BEFORE_LOWER_COUNT_HOST')) {
    fail('UNFAIR_SKIP_NOT_REJECTED');
  }

  const legacyExpansion = {
    id: 'kidults-asi-common-crawl-host-expansion-v1',
    version: '1.2.0',
    status: 'SHADOW_COMMON_CRAWL_HOST_EXPANSION_ZERO_RESULTS',
    universe_target: 'GLOBAL_ANY_SITE_SOURCE_UNIVERSE',
    metadata_index_only: true,
    target_site_body_crawled: false,
    content_acquired: false,
    rights_promoted: false,
    admission_promoted: false,
    acquisition_authorized: false,
    public_release: 'HOLD',
    production: 'HOLD',
    frontier_runtime_managed: true,
    seed_frontier_bootstrap_state: 'FRONTIER_BUILD_FAILED_LEGACY_FAIL_SAFE',
    seed_frontier_previous_snapshot_found: false,
    seed_frontier_previous_snapshot_source: 'NONE',
    seed_selection_mode: 'LEGACY_FIRST_SEEN_FAIL_SAFE'
  };
  const legacyPath = path.join(temp, 'legacy-expansion.json');
  fs.writeFileSync(legacyPath, JSON.stringify(legacyExpansion));
  const legacyRejected = spawnSync(process.execPath, [expansionValidator, legacyPath], { encoding: 'utf8' });
  if (legacyRejected.status === 0 || !legacyRejected.stderr.includes('LEGACY_FRONTIER_FALLBACK_FORBIDDEN')) {
    fail('LEGACY_FRONTIER_FALLBACK_NOT_REJECTED');
  }

  console.log(JSON.stringify({
    suite: 'KIDULTS_ASI_COMMON_CRAWL_DYNAMIC_FRONTIER_FAIRNESS_V1',
    state: 'VERIFIED_PASS',
    dynamic_arrival_positive: true,
    global_count_spread: result.selection_count_delta_after,
    unfair_lower_count_skip_rejected: true,
    legacy_frontier_fallback_rejected: true,
    acquisition_authorized: false,
    production: 'HOLD',
    public: 'HOLD'
  }));
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
