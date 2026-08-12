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

test('Stage 2 precision recovery remains bounded and fail-closed', () => {
  const block = stageBlock(
    'Stage 2 Wikidata-only precision recovery',
    'Stage 2 institutional archive product-object precision hardening',
  );

  assert.match(
    block,
    /timeout --signal=TERM --kill-after=10s 120s node scripts\/kidult100-precision-recovery-live\.mjs/,
  );
  assert.doesNotMatch(block, /continue-on-error:\s*true/);
});

test('precision recovery evidence is uploaded only as a diagnostic artifact, not a production certification bypass', () => {
  assert.match(
    workflow,
    /services\/kidults-autonomous-intelligence\/reports\/kidult100-poc\/kidult100-precision-recovery-latest\.json/,
  );
  assert.match(workflow, /- name: Production 300\+ decision-grade Right Data certification gate/);
  assert.match(workflow, /run: node scripts\/kidult100-stage2-right-data-gate\.mjs/);
});
