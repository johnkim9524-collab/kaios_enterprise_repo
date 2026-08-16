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

test('Stage 2 precision recovery remains bounded and fail-closed with measured reliability headroom', () => {
  const block = stageBlock(
    'Stage 2 Wikidata-only precision recovery',
    'Stage 2 institutional archive product-object precision hardening',
  );

  assert.match(
    block,
    /timeout --signal=TERM --kill-after=10s 150s node scripts\/kidult100-precision-recovery-live\.mjs/,
  );
  assert.match(block, /timeoutSeconds:150/);
  assert.doesNotMatch(block, /continue-on-error:\s*true/);
  assert.match(block, /partialEvidenceAccepted:false/);
});

test('precision recovery failure restores the fresh pre-recovery candidate universe and purges stale downstream evidence', () => {
  const block = stageBlock(
    'Stage 2 Wikidata-only precision recovery',
    'Stage 2 institutional archive product-object precision hardening',
  );

  assert.match(
    block,
    /cp reports\/kidult100-poc\/kidult100-poc-latest\.json \/tmp\/kidult100-poc-pre-precision-recovery\.json/,
  );
  assert.match(
    block,
    /cp \/tmp\/kidult100-poc-pre-precision-recovery\.json reports\/kidult100-poc\/kidult100-poc-latest\.json/,
  );
  assert.match(block, /rm -f reports\/kidult100-poc\/kidult100-precision-recovery-latest\.json/);
  assert.match(block, /rm -f reports\/kidult100-right-data\/\*\.json/);
  assert.match(block, /rm -f reports\/kidult100-ranking\/\*\.json/);
  assert.match(block, /rm -f reports\/live-open-data\/live-open-data-latest\.json/);
  assert.match(block, /preRecoveryCandidateUniverseRestoredOnFailure:code!==0/);
});

test('precision recovery latency is measured as diagnostic evidence without creating a production bypass', () => {
  assert.match(
    workflow,
    /services\/kidults-autonomous-intelligence\/reports\/engineering-hardening\/stage2-precision-recovery-latency-latest\.json/,
  );
  assert.match(
    workflow,
    /services\/kidults-autonomous-intelligence\/reports\/kidult100-poc\/kidult100-precision-recovery-latest\.json/,
  );
  assert.match(workflow, /- name: Production 300\+ decision-grade Right Data certification gate/);
  assert.match(workflow, /run: node scripts\/kidult100-stage2-right-data-gate\.mjs/);
});
