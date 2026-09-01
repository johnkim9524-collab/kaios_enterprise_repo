import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const workflowPath = '.github/workflows/kidults-current-sold-engine-v1.yml';

function workflowText() {
  return fs.readFileSync(workflowPath, 'utf8');
}

function eventPaths(text, eventName) {
  const lines = text.split(/\r?\n/);
  const start = lines.indexOf(`  ${eventName}:`);
  assert.notEqual(start, -1, `${eventName} trigger must exist`);

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^  [A-Za-z_][A-Za-z0-9_]*:$/.test(lines[index])) {
      end = index;
      break;
    }
  }

  const pathsIndex = lines.findIndex((line, index) => index > start && index < end && line === '    paths:');
  assert.notEqual(pathsIndex, -1, `${eventName} trigger must have a paths list`);

  const paths = [];
  for (let index = pathsIndex + 1; index < end; index += 1) {
    const match = lines[index].match(/^      - '([^']+)'$/);
    if (match) paths.push(match[1]);
  }
  assert.ok(paths.length > 0, `${eventName} paths list must not be empty`);
  return paths;
}

test('Current-SOLD workflow naturally validates the exact protected-main merge SHA', () => {
  const text = workflowText();
  assert.match(
    text,
    /on:\n  push:\n    branches:\n      - main\n    paths:\n/,
    'Current-SOLD workflow must bind natural post-merge validation to main only',
  );
  assert.doesNotMatch(text, /branches-ignore:/, 'post-merge validation must not use branch exclusions');

  const pushPaths = eventPaths(text, 'push');
  const pullRequestPaths = eventPaths(text, 'pull_request');
  assert.deepEqual(pushPaths, pullRequestPaths, 'push and pull-request Current-SOLD change surfaces must stay identical');
  assert.ok(pushPaths.includes('.github/workflows/kidults-current-sold-engine-v1.yml'));
  assert.ok(pushPaths.includes('tests/kidults/market/current-sold-*.mjs'));
  assert.ok(pushPaths.includes('coordination/kidults/market/current-sold-private-dry-run-receipt-schema-v1.json'));
  assert.ok(pushPaths.includes('scripts/kidults/market/current-sold-atomic-batch-v1.mjs'));
  assert.ok(pushPaths.includes('scripts/kidults/market/current-sold-private-dry-run-v1.mjs'));
  assert.ok(pushPaths.includes('scripts/kidults/market/current-sold-control-smoke-v1.mjs'));
});

test('natural exact-main receipt preserves the non-empirical and no-write boundary', () => {
  const text = workflowText();
  assert.match(text, /"expected_tests":53/);
  assert.match(text, /"lawful_empirical_current_sold_count":0/);
  assert.match(text, /"private_candidate_current_sold_count":0/);
  assert.match(text, /"postgres_migration_applied":false/);
  assert.match(text, /"postgres_rows_written":0/);
  assert.match(text, /"provider_calls":0/);
  assert.match(text, /"deployment":false/);
  assert.match(text, /"public":"HOLD"/);
  assert.match(text, /"production":"HOLD"/);
  assert.match(text, /"g5":"HOLD"/);
});
