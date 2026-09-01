#!/usr/bin/env node
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const script = 'scripts/kidults/kpmo/extract-github-comment-body-byte-exact-v1.mjs';
assert.equal(fs.existsSync(script), true, 'extractor must exist');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-comment-body-byte-exact-'));
const cases = [
  {name: 'no-terminal-lf', body: 'approval'},
  {name: 'one-terminal-lf', body: 'approval\n'},
  {name: 'two-terminal-lfs', body: 'approval\n\n'},
  {name: 'unicode-one-terminal-lf', body: '승인합니다.\n'},
];

for (const entry of cases) {
  const input = path.join(temp, `${entry.name}.json`);
  fs.writeFileSync(input, JSON.stringify({body: entry.body}));
  const exact = execFileSync(process.execPath, [script, input]);
  assert.deepEqual(exact, Buffer.from(entry.body), `${entry.name} must preserve bytes exactly`);
}

const oneLfJson = path.join(temp, 'jq-one-lf.json');
fs.writeFileSync(oneLfJson, JSON.stringify({body: 'approval\n'}));
const jqRaw = execFileSync('jq', ['-r', '.body', oneLfJson]);
const jqJoin = execFileSync('jq', ['-j', '.body', oneLfJson]);
assert.deepEqual(jqJoin, Buffer.from('approval\n'), 'jq -j must preserve the single terminal LF');
assert.deepEqual(jqRaw, Buffer.from('approval\n\n'), 'jq -r negative control must expose the extra record-separator LF');
assert.notDeepEqual(jqRaw, jqJoin, 'raw and join-output modes must not be treated as equivalent');

assert.throws(
  () => execFileSync(process.execPath, [script, path.join(temp, 'missing.json')], {stdio: 'pipe'}),
  /Command failed/,
  'missing input must fail closed',
);

const nonString = path.join(temp, 'non-string.json');
fs.writeFileSync(nonString, JSON.stringify({body: 7}));
assert.throws(
  () => execFileSync(process.execPath, [script, nonString], {stdio: 'pipe'}),
  /Command failed/,
  'non-string body must fail closed',
);

console.log(JSON.stringify({
  id: 'github-comment-body-byte-exact-v1',
  state: 'VERIFIED_PASS',
  exact_cases: cases.length,
  one_terminal_lf_preserved: true,
  jq_raw_output_extra_record_separator_detected: true,
  recommended_extractor: "jq -j '.body' or process.stdout.write(body)",
}, null, 2));
