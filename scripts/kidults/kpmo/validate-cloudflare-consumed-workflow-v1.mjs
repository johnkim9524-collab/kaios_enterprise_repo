import assert from 'node:assert/strict';

// Closed, deliberately narrow YAML surface for already exhausted lanes. This is
// not a general YAML parser. Unknown/duplicate top-level keys and extra jobs are
// rejected, and every recognized job must have the literal false job gate.
export const INACTIVE_EVENTS = "on:\n  push:\n    branches-ignore: ['**']\n    tags-ignore: ['**']";
export function assertConsumedWorkflowInactive(source) {
  assert.equal(typeof source, 'string', 'TOMBSTONE_SOURCE_TYPE');
  assert.ok(source.length < 32768 && !source.includes('\r') && !source.includes('\t'), 'TOMBSTONE_SOURCE_BOUNDARY');
  const top = source.split('\n').filter(line => line && !/^\s|^#/.test(line));
  assert.equal(top.length, 5, 'TOMBSTONE_TOP_LEVEL_CARDINALITY');
  assert.match(top[0], /^name: [A-Za-z0-9 ._-]+$/, 'TOMBSTONE_NAME');
  assert.deepEqual(top.slice(1), ['on:', 'permissions:', 'concurrency:', 'jobs:'], 'TOMBSTONE_TOP_LEVEL_KEYS');
  const activeEvents = source.slice(source.indexOf('\non:\n') + 1, source.indexOf('\npermissions:\n')).trimEnd();
  assert.equal(activeEvents, INACTIVE_EVENTS, 'TOMBSTONE_ALL_BRANCHES_AND_TAGS_EXCLUDED');
  const permissions = source.slice(source.indexOf('\npermissions:\n') + 1, source.indexOf('\nconcurrency:\n')).trimEnd();
  assert.equal(permissions, 'permissions:\n  contents: read', 'TOMBSTONE_READ_ONLY_PERMISSIONS');
  const concurrency = source.slice(source.indexOf('\nconcurrency:\n') + 1, source.indexOf('\njobs:\n')).trimEnd();
  assert.match(concurrency, /^concurrency:\n  group: [a-z0-9-]+\n  cancel-in-progress: false$/, 'TOMBSTONE_CONCURRENCY');
  const jobs = source.slice(source.indexOf('\njobs:\n') + 1);
  const headers = jobs.split('\n').filter(line => /^ {1,3}\S/.test(line));
  assert.equal(headers.length, 1, 'TOMBSTONE_ONE_JOB_REQUIRED');
  assert.match(headers[0], /^  [a-z][a-z0-9-]*:$/, 'TOMBSTONE_JOB_HEADER');
  assert.ok(jobs.startsWith(`jobs:\n${headers[0]}\n    if: \${{ false }}\n    runs-on: ubuntu-24.04\n`), 'TOMBSTONE_LITERAL_FALSE_JOB_GATE');
  assert.equal((jobs.match(/^    if:/gm) || []).length, 1, 'TOMBSTONE_DUPLICATE_JOB_GATE');
  assert.ok(!/^ {4}(?:permissions|environment|uses|secrets)\s*:/m.test(jobs), 'TOMBSTONE_JOB_AUTHORITY_FORBIDDEN');
  assert.ok(!/\$\{\{\s*secrets\b|actions\/checkout@|actions\/setup-node@|api\.cloudflare\.com|\b(?:curl|wrangler|npm|npx)\s/.test(source), 'TOMBSTONE_EXECUTABLE_PROVIDER_AUTHORITY');
  return {state: 'VERIFIED_PASS', trigger_strategy: 'ALL_PUSH_REFS_EXCLUDED_AND_LITERAL_FALSE_JOB', manual_dispatch_present: false, provider_authority: false};
}
