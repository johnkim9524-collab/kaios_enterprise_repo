import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, '../../..');
const WORKFLOW_PATH = path.join(REPO_ROOT, '.github/workflows/kidults-p0-speed-quality.yml');
const CONTRACT_PATH = path.join(
  REPO_ROOT,
  'coordination/kidults/contracts/rankability-assessment-contract-v1.0.json',
);

function readWorkflow() {
  return fs.readFileSync(WORKFLOW_PATH, 'utf8');
}

function readContract() {
  return JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
}

function workflowStep(workflow, stepName, nextStepName) {
  const start = workflow.indexOf(`      - name: ${stepName}`);
  const end = workflow.indexOf(`      - name: ${nextStepName}`);
  assert.notEqual(start, -1, `workflow step is missing: ${stepName}`);
  assert.notEqual(end, -1, `next workflow step is missing: ${nextStepName}`);
  assert.equal(start < end, true, `${stepName} must precede ${nextStepName}`);
  return workflow.slice(start, end);
}

test('P0 executes the Track B registry readiness gate before live candidate and evidence work', () => {
  const workflow = readWorkflow();
  const gateIndex = workflow.indexOf('Track B integrated registry readiness gate');
  const wave1Index = workflow.indexOf('Wave1 real external source discovery evaluation');
  const stage2Index = workflow.indexOf('Stage 2 normalized candidate universe build');

  assert.notEqual(gateIndex, -1, 'Track B readiness gate is missing from P0');
  assert.notEqual(wave1Index, -1, 'Wave1 live step is missing from P0');
  assert.notEqual(stage2Index, -1, 'Stage 2 candidate step is missing from P0');
  assert.equal(gateIndex < wave1Index, true, 'Track B readiness gate must precede live source work');
  assert.equal(gateIndex < stage2Index, true, 'Track B readiness gate must precede candidate build');
});

test('P0 cannot synthesize Track B official inputs or its sole official output', () => {
  const workflow = readWorkflow();
  const contract = readContract();
  const officialArtifacts = [
    ...contract.official_inputs.map((row) => row.artifact),
    contract.output_boundary.only_official_output,
  ];

  for (const artifact of officialArtifacts) {
    assert.equal(
      workflow.includes(artifact),
      false,
      `P0 workflow must not synthesize or publish Track B official artifact: ${artifact}`,
    );
  }
});

test('P0 workflow has no direct canonical registry mutation path', () => {
  const workflow = readWorkflow();

  assert.doesNotMatch(workflow, /coordination\/kidults\/registry/);
  assert.doesNotMatch(workflow, /registry-change/i);
});

test('production Right Data certification remains a hard fail-closed step', () => {
  const workflow = readWorkflow();
  const productionGate = workflow.match(
    /- name: Production 300\+ decision-grade Right Data certification gate\n(?<body>(?:\s{8,}.*\n){1,4})/,
  );

  assert.ok(productionGate, 'production certification gate is missing');
  assert.match(productionGate.groups.body, /run: node scripts\/kidult100-stage2-right-data-gate\.mjs/);
  assert.doesNotMatch(productionGate.groups.body, /continue-on-error:\s*true/);
});

test('Wave1 remains advisory, bounded, and unable to preserve stale live evidence after failure', () => {
  const workflow = readWorkflow();
  const wave1 = workflowStep(
    workflow,
    'Wave1 real external source discovery evaluation',
    'Stage 2 normalized candidate universe build',
  );

  assert.match(wave1, /continue-on-error:\s*true/);
  assert.match(wave1, /timeout --signal=TERM --kill-after=10s 90s node scripts\/kidult100-wave1-live\.mjs/);
  assert.match(wave1, /partialEvidenceAccepted:false/);
  assert.match(wave1, /rm -f reports\/kidult100-wave1\/wave1-live-latest\.json/);
  assert.match(wave1, /apps\/kidults-enterprise-staging\/public\/data\/kidults-live\.json/);
  assert.match(wave1, /exit "\$code"/);
});

test('Stage 2 candidate build and precision recovery retain hard bounded failure budgets', () => {
  const workflow = readWorkflow();
  const stage2 = workflowStep(
    workflow,
    'Stage 2 normalized candidate universe build',
    'Stage 2 Wikidata-only precision recovery',
  );
  const precision = workflowStep(
    workflow,
    'Stage 2 Wikidata-only precision recovery',
    'Stage 2 institutional archive product-object precision hardening',
  );

  assert.match(stage2, /timeout --signal=TERM --kill-after=10s 240s node scripts\/kidult100-poc-live-observed\.mjs/);
  assert.match(stage2, /partialEvidenceAccepted:false/);
  assert.doesNotMatch(stage2, /continue-on-error:\s*true/);

  assert.match(precision, /timeout --signal=TERM --kill-after=10s 120s node scripts\/kidult100-precision-recovery-live\.mjs/);
  assert.doesNotMatch(precision, /continue-on-error:\s*true/);
});
