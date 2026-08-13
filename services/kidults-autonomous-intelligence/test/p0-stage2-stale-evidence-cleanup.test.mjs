import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const workflowPath = path.resolve(process.cwd(), '..', '..', '.github', 'workflows', 'kidults-p0-speed-quality.yml');
const workflow = fs.readFileSync(workflowPath, 'utf8');

function stageBlock(name, nextName) {
  const start = workflow.indexOf(`- name: ${name}`);
  assert.notEqual(start, -1, `missing workflow step: ${name}`);
  const end = workflow.indexOf(`- name: ${nextName}`, start + 1);
  assert.notEqual(end, -1, `missing following workflow step: ${nextName}`);
  return workflow.slice(start, end);
}

test('Stage 2 failure purges stale downstream evidence before failing closed', () => {
  const block = stageBlock(
    'Stage 2 normalized candidate universe build',
    'Stage 2 Wikidata-only precision recovery',
  );

  assert.match(block, /timeout --signal=TERM --kill-after=10s 240s node scripts\/kidult100-poc-live-observed\.mjs/);
  assert.match(block, /partialEvidenceAccepted:false/);
  assert.match(block, /if \[ "\$code" -ne 0 \]; then/);
  assert.match(block, /rm -f reports\/kidult100-poc\/\*\.json/);
  assert.match(block, /rm -f reports\/kidult100-right-data\/\*\.json/);
  assert.match(block, /rm -f reports\/kidult100-ranking\/\*\.json/);
  assert.match(block, /rm -f reports\/live-open-data\/live-open-data-latest\.json/);
  assert.match(block, /exit "\$code"/);
  assert.doesNotMatch(block, /continue-on-error:\s*true/);
});
