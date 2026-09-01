import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const workflowPath = '.github/workflows/kidults-current-sold-engine-v1.yml';

function workflowText() {
  return fs.readFileSync(workflowPath, 'utf8');
}

test('Current-SOLD workflow naturally validates landed changes on protected main', () => {
  const text = workflowText();
  assert.match(
    text,
    /on:\n  push:\n    branches:\n      - main\n    paths:\n/,
    'Current-SOLD workflow must bind push validation to protected main',
  );
  assert.doesNotMatch(text, /branches-ignore:/, 'post-merge validation must not use a branch exclusion');
  assert.match(
    text,
    /      - '\.github\/workflows\/kidults-current-sold-engine-v1\.yml'/,
    'workflow self-changes must trigger exact-main validation',
  );
  assert.match(
    text,
    /      - 'tests\/kidults\/market\/current-sold-\*\.mjs'/,
    'Current-SOLD regression changes must trigger exact-main validation',
  );
});

test('Current-SOLD terminal receipt preserves non-empirical HOLD boundary', () => {
  const text = workflowText();
  assert.match(text, /"empirical_current_sold_count":0/);
  assert.match(text, /"postgres_migration_applied":false/);
  assert.match(text, /"postgres_rows_written":0/);
  assert.match(text, /"public":"HOLD"/);
  assert.match(text, /"production":"HOLD"/);
  assert.match(text, /"g5":"HOLD"/);
});
