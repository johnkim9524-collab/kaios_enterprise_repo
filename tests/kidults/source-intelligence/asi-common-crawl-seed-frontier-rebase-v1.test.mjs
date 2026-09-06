import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const builder = 'scripts/kidults/source-intelligence/build-asi-common-crawl-seed-frontier-v1.mjs';
const validator = 'scripts/kidults/source-intelligence/validate-asi-common-crawl-seed-frontier-v1.mjs';
const expander = 'scripts/kidults/source-intelligence/asi-common-crawl-host-expansion-v1.mjs';
const sha = value => crypto.createHash('sha256').update(String(value)).digest('hex');

const discovery = hosts => ({
  id: 'kidults-asi-global-low-risk-discovery-v1',
  primary_target: 'GLOBAL_ANY_SITE_SOURCE_UNIVERSE',
  candidate_count: hosts.length,
  candidates: hosts.map((host, index) => ({
    endpoint_url: `https://${host}/catalog/${index}`,
    discovery_provider: 'TEST_METADATA_INDEX',
    discovery_providers: ['TEST_METADATA_INDEX'],
    provider_record_id: `record-${index}`,
    provider_record_ids: [`record-${index}`],
    live_external_observation: false
  })),
  acquisition_authorized: false,
  content_acquired: false,
  public_release: 'HOLD',
  production: 'HOLD'
});

const rewriteDigest = frontier => {
  frontier.frontier_digest = `sha256:${sha(JSON.stringify({
    cycle_count: frontier.cycle_count,
    selected_hosts: frontier.selected_hosts,
    host_frontier: frontier.host_frontier
  }))}`;
  return frontier;
};

const runBuilder = ({ hosts, previous, previousBytes }) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'asi-frontier-rebase-'));
  try {
    const discoveryPath = path.join(root, 'discovery.json');
    const previousPath = path.join(root, 'previous.json');
    const outputPath = path.join(root, 'frontier.json');
    fs.writeFileSync(discoveryPath, `${JSON.stringify(discovery(hosts))}\n`);
    if (previousBytes !== undefined) fs.writeFileSync(previousPath, previousBytes);
    else if (previous !== undefined) fs.writeFileSync(previousPath, `${JSON.stringify(previous)}\n`);
    const args = [builder, discoveryPath, previous === undefined && previousBytes === undefined ? '' : previousPath, outputPath];
    const result = spawnSync(process.execPath, args, { encoding: 'utf8' });
    const output = result.status === 0 ? JSON.parse(fs.readFileSync(outputPath, 'utf8')) : null;
    if (output) {
      const validation = spawnSync(process.execPath, [validator, outputPath], { encoding: 'utf8' });
      assert.equal(validation.status, 0, validation.stderr || validation.stdout);
    }
    return { result, output };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
};

const legacySkew = (frontier, counts) => {
  const copy = structuredClone(frontier);
  for (const row of copy.host_frontier) {
    row.selected_count = counts[row.host];
    delete row.historical_selected_count_before_cycle;
    delete row.historical_selected_count;
    delete row.selection_count_rebase_delta;
  }
  return rewriteDigest(copy);
};

const runValidator = frontier => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'asi-frontier-validator-negative-'));
  try {
    const outputPath = path.join(root, 'frontier.json');
    fs.writeFileSync(outputPath, `${JSON.stringify(frontier)}\n`);
    return spawnSync(process.execPath, [validator, outputPath], { encoding: 'utf8' });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
};

test('new hosts start at zero while retained absolute history survives bounded rebasing', () => {
  const first = runBuilder({ hosts: ['a.example.com', 'b.example.com'] }).output;
  const previous = legacySkew(first, { 'a.example.com': 40, 'b.example.com': 12 });
  const built = runBuilder({ hosts: ['a.example.com', 'b.example.com', 'c.example.com'], previous });
  assert.equal(built.result.status, 0, built.result.stderr);
  const next = built.output;
  assert.equal(next.new_host_count, 1);
  assert.equal(next.retained_host_count, 2);
  assert.ok(next.selection_count_delta_after <= 1);
  assert.deepEqual(Object.fromEntries(next.host_frontier.map(row => [row.host, row.historical_selected_count])), {
    'a.example.com': 41,
    'b.example.com': 13,
    'c.example.com': 1
  });
  assert.ok(next.historical_selection_rebased);
});

test('removed hosts leave the active universe while retained host history is preserved', () => {
  const first = runBuilder({ hosts: ['a.example.com', 'b.example.com', 'c.example.com'] }).output;
  const previous = legacySkew(first, { 'a.example.com': 9, 'b.example.com': 4, 'c.example.com': 7 });
  const built = runBuilder({ hosts: ['b.example.com'], previous });
  assert.equal(built.result.status, 0, built.result.stderr);
  const next = built.output;
  assert.deepEqual(next.host_frontier.map(row => row.host), ['b.example.com']);
  assert.equal(next.removed_host_count, 2);
  assert.equal(next.host_frontier[0].historical_selected_count, 5);
  assert.match(next.removed_host_history_digest, /^sha256:[0-9a-f]{64}$/);
});

test('extreme historical skew is retained absolutely but operational spread is at most one', () => {
  const hosts = Array.from({ length: 12 }, (_, index) => `h${String(index).padStart(2, '0')}.example.com`);
  const first = runBuilder({ hosts }).output;
  const counts = Object.fromEntries(hosts.map((host, index) => [host, index === 0 ? 1000000 : index * 17]));
  const previous = legacySkew(first, counts);
  const built = runBuilder({ hosts, previous });
  assert.equal(built.result.status, 0, built.result.stderr);
  const next = built.output;
  const operational = next.host_frontier.map(row => row.selected_count);
  assert.ok(Math.max(...operational) - Math.min(...operational) <= 1);
  const extreme = next.host_frontier.find(row => row.host === 'h00.example.com');
  assert.equal(extreme.historical_selected_count_before_cycle, 1000000);
  assert.equal(extreme.historical_selected_count, 1000000 + (extreme.selected_this_cycle ? 1 : 0));
  assert.ok(next.historical_selection_rebase_max_delta > 999000);
});

test('selection cap remains eight under rebasing and does not repeat ahead of lower counts', () => {
  const hosts = Array.from({ length: 12 }, (_, index) => `cap${String(index).padStart(2, '0')}.example.com`);
  const output = runBuilder({ hosts }).output;
  assert.equal(output.selected_hosts.length, 8);
  assert.equal(output.host_frontier.filter(row => row.selected_this_cycle).length, 8);
  assert.ok(output.selection_count_delta_after <= 1);
});

test('identical inputs have deterministic selection, history projection and digest', () => {
  const hosts = ['z.example.com', 'a.example.com', 'm.example.com'];
  const previous = legacySkew(runBuilder({ hosts }).output, {
    'a.example.com': 99,
    'm.example.com': 4,
    'z.example.com': 17
  });
  const leftBuilt = runBuilder({ hosts, previous });
  const rightBuilt = runBuilder({ hosts, previous });
  assert.equal(leftBuilt.result.status, 0, leftBuilt.result.stderr);
  assert.equal(rightBuilt.result.status, 0, rightBuilt.result.stderr);
  const left = leftBuilt.output;
  const right = rightBuilt.output;
  assert.deepEqual(left.selected_hosts, right.selected_hosts);
  assert.deepEqual(left.host_frontier, right.host_frontier);
  assert.equal(left.frontier_digest, right.frontier_digest);
  assert.equal(left.removed_host_history_digest, right.removed_host_history_digest);
});

test('duplicate host rows in prior state fail closed', () => {
  const previous = runBuilder({ hosts: ['a.example.com', 'b.example.com'] }).output;
  previous.host_frontier.push(structuredClone(previous.host_frontier[0]));
  previous.host_universe_count = previous.host_frontier.length;
  rewriteDigest(previous);
  const { result } = runBuilder({ hosts: ['a.example.com'], previous });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /PREVIOUS_FRONTIER_DUPLICATE_HOST/);
});

test('forbidden localhost and IP hosts fail closed before selection', () => {
  for (const host of ['localhost', '127.0.0.1']) {
    const { result } = runBuilder({ hosts: [host] });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /FORBIDDEN_HOST/);
  }
});

test('empty current universe fails closed', () => {
  const { result } = runBuilder({ hosts: [] });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /NO_HOSTS/);
});

test('malformed JSON and malformed prior state fail closed instead of resetting history', () => {
  const malformedJson = runBuilder({ hosts: ['a.example.com'], previousBytes: '{' }).result;
  assert.notEqual(malformedJson.status, 0);
  assert.match(malformedJson.stderr, /PREVIOUS_FRONTIER_MALFORMED_JSON/);

  const previous = runBuilder({ hosts: ['a.example.com'] }).output;
  previous.cycle_count = 'not-an-integer';
  const malformedState = runBuilder({ hosts: ['a.example.com'], previous }).result;
  assert.notEqual(malformedState.status, 0);
  assert.match(malformedState.stderr, /PREVIOUS_FRONTIER_MALFORMED_STATE/);
});

test('tampered absolute history fails closed even when the frontier digest is recomputed', () => {
  const output = runBuilder({ hosts: ['a.example.com', 'b.example.com'] }).output;
  output.host_frontier[0].historical_selected_count += 5;
  rewriteDigest(output);
  const result = runValidator(output);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /HOST_HISTORICAL_COUNT_AFTER/);
});

test('weakened rebasing policy fails closed', () => {
  const output = runBuilder({ hosts: ['a.example.com', 'b.example.com'] }).output;
  output.historical_selection_rebase_policy = 'ALLOW_UNBOUNDED_HISTORY';
  const result = runValidator(output);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /HISTORICAL_REBASE_POLICY/);
});

test('runtime expansion rejects malformed restored state before any provider request or legacy fallback', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'asi-frontier-runtime-negative-'));
  try {
    const discoveryPath = path.join(root, 'discovery.json');
    const priorExpansionPath = path.join(root, 'prior-expansion.json');
    const outputPath = path.join(root, 'output.json');
    fs.writeFileSync(discoveryPath, `${JSON.stringify(discovery(['a.example.com']))}\n`);
    fs.writeFileSync(priorExpansionPath, `${JSON.stringify({ seed_frontier_snapshot: { id: 'tampered' } })}\n`);
    const result = spawnSync(process.execPath, [expander, discoveryPath, outputPath], {
      encoding: 'utf8',
      env: { ...process.env, ASI_COMMON_CRAWL_PREVIOUS_EXPANSION: priorExpansionPath }
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /PREVIOUS_SNAPSHOT_MALFORMED:ENV_PREVIOUS_EXPANSION:PREVIOUS_FRONTIER_INVALID/);
    assert.equal(fs.existsSync(outputPath), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
