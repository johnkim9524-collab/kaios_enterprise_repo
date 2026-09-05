import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const workflow = fs.readFileSync('.github/workflows/kidults-atomic-governed-landing-v1.yml', 'utf8');

const marker = 'Require event-emitting post-merge CI transport';
const lifecycle = 'Require latest terminal exact-head lifecycle authority';
const consumption = 'Consume one-use exact-head landing authorization';
const merge = 'Re-read live authority and execute exact-head server merge';

test('Atomic Landing blocks non-event-emitting GITHUB_TOKEN transport before approval consumption', () => {
  const guardIndex = workflow.indexOf(marker);
  const lifecycleIndex = workflow.indexOf(lifecycle);
  const consumptionIndex = workflow.indexOf(consumption);
  const mergeIndex = workflow.indexOf(merge);

  assert.ok(guardIndex >= 0, 'post-merge transport guard missing');
  assert.equal(workflow.split(marker).length - 1, 1, 'post-merge transport guard must be unique');
  assert.ok(guardIndex < lifecycleIndex, 'guard must precede lifecycle authority');
  assert.ok(guardIndex < consumptionIndex, 'guard must precede one-use approval consumption');
  assert.ok(guardIndex < mergeIndex, 'guard must precede irreversible merge');
  assert.match(workflow, /ATOMIC_LANDING_GITHUB_TOKEN_POSTMERGE_CI_SUPPRESSED/);
  assert.match(workflow.slice(guardIndex, lifecycleIndex), /exit 1/);
});

test('Containment does not claim that a suppressed GITHUB_TOKEN push can satisfy post-merge proof', () => {
  const section = workflow.slice(workflow.indexOf(marker), workflow.indexOf(lifecycle));
  assert.match(section, /independently approved event-emitting merge transport or an exact-main dispatch plan/);
  assert.doesNotMatch(section, /GITHUB_TOKEN_POSTMERGE_CI_AVAILABLE/);
});
