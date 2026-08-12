import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const workflowPath = path.join(ROOT, '..', '..', '.github', 'workflows', 'kidults-p0-speed-quality.yml');
const workflow = fs.readFileSync(workflowPath, 'utf8');

function stepBody(name, nextName) {
  const startMarker = `      - name: ${name}`;
  const endMarker = `      - name: ${nextName}`;
  const start = workflow.indexOf(startMarker);
  const end = workflow.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `missing workflow step: ${name}`);
  assert.ok(end > start, `missing workflow boundary after: ${name}`);
  return workflow.slice(start, end);
}

test('Wikimedia demand stage is hard-bounded and cannot accept partial evidence', () => {
  const stage = stepBody(
    'Wikimedia Analytics CC0 demand-attention supplement',
    'Canon evidence recordization from existing rights-classified metadata',
  );

  assert.doesNotMatch(stage, /continue-on-error:\s*true/);
  assert.match(stage, /timeout --signal=TERM --kill-after=10s 90s node scripts\/kidult100-wikimedia-demand-evidence\.mjs/);
  assert.match(stage, /status:code===0\?"PASS":code===124\?"TIMEOUT_FAIL_CLOSED":"FAIL_CLOSED"/);
  assert.match(stage, /timeoutSeconds:90/);
  assert.match(stage, /partialEvidenceAccepted:false/);
  assert.match(stage, /staleOutputPurgedBeforeRun:true/);
  assert.match(stage, /exit "\$code"/);
});

test('Wikimedia demand stage purges stale canonical and downstream outputs before fail-closed exit', () => {
  const stage = stepBody(
    'Wikimedia Analytics CC0 demand-attention supplement',
    'Canon evidence recordization from existing rights-classified metadata',
  );

  const stalePurge = 'rm -f reports/kidult100-right-data/wikimedia-demand-evidence-latest.json';
  assert.ok(stage.indexOf(stalePurge) >= 0);
  assert.ok(stage.indexOf(stalePurge) < stage.indexOf('start=$(date +%s)'), 'stale demand output must be purged before network work');
  assert.match(stage, /if \[ "\$code" -ne 0 \]; then/);
  assert.ok(stage.split(stalePurge).length - 1 >= 2, 'demand output must also be purged on failure');
  assert.match(stage, /rm -f reports\/kidult100-right-data\/right-data-latest\.json/);
  assert.match(stage, /rm -f reports\/kidult100-ranking\/\*\.json/);
  assert.match(stage, /rm -f reports\/live-open-data\/live-open-data-latest\.json/);
});

test('Wikimedia demand latency diagnostic is retained while production certification remains hard', () => {
  assert.match(workflow, /reports\/engineering-hardening\/wikimedia-demand-latency-latest\.json/);

  const production = stepBody(
    'Production 300+ decision-grade Right Data certification gate',
    'Real external open-data operational run + unified preflight',
  );
  assert.doesNotMatch(production, /continue-on-error:\s*true/);
  assert.match(production, /run: node scripts\/kidult100-stage2-right-data-gate\.mjs/);
});
