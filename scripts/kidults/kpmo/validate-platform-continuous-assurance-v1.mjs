#!/usr/bin/env node
import fs from 'node:fs';

await import('./validate-platform-continuous-assurance-core-v1.mjs');

const workflowPath = '.github/workflows/kidults-platform-continuous-assurance-v1.yml';
const workflowName = 'KIDULTS Platform Continuous Assurance V1';
const barrierMarker = 'Enforce exact-main core-four producer health before canonical leader publication';
const leaderMarker = 'Publish successful bounded canonical leader artifact';
const workflow = fs.readFileSync(workflowPath, 'utf8');

export function mustFailClosedForP11550({ ref, event, activeWorkflow, source }) {
  const liveAssurance = ref === 'refs/heads/main' && event !== 'pull_request' && activeWorkflow === workflowName;
  const barrierIndex = typeof source === 'string' ? source.indexOf(barrierMarker) : -1;
  const leaderIndex = typeof source === 'string' ? source.indexOf(leaderMarker) : -1;
  const inlineBarrierPresent = barrierIndex >= 0 && leaderIndex >= 0 && barrierIndex < leaderIndex;
  return liveAssurance && !inlineBarrierPresent;
}

if (!mustFailClosedForP11550({ ref: 'refs/heads/main', event: 'schedule', activeWorkflow: workflowName, source: workflow })) {
  throw new Error('P1_1550_CONTAINMENT_SELFTEST_LIVE_MAIN_MUST_FAIL_WITHOUT_INLINE_BARRIER');
}
if (mustFailClosedForP11550({ ref: 'refs/heads/main', event: 'schedule', activeWorkflow: workflowName, source: `${barrierMarker}\n${leaderMarker}` })) {
  throw new Error('P1_1550_CONTAINMENT_SELFTEST_INLINE_BARRIER_MUST_RELEASE_CONTAINMENT');
}
if (mustFailClosedForP11550({ ref: 'refs/heads/main', event: 'pull_request', activeWorkflow: workflowName, source: workflow })) {
  throw new Error('P1_1550_CONTAINMENT_SELFTEST_PR_MUST_REMAIN_VALIDATABLE');
}
if (mustFailClosedForP11550({ ref: 'refs/heads/main', event: 'push', activeWorkflow: 'CI Validation', source: workflow })) {
  throw new Error('P1_1550_CONTAINMENT_SELFTEST_OTHER_WORKFLOW_MUST_NOT_BE_BLOCKED');
}

const blocked = mustFailClosedForP11550({
  ref: process.env.GITHUB_REF || '',
  event: process.env.GITHUB_EVENT_NAME || '',
  activeWorkflow: process.env.GITHUB_WORKFLOW || '',
  source: workflow,
});

if (blocked) {
  console.error('P1_1550_LIVE_MAIN_PREPUBLICATION_PRODUCER_HEALTH_BARRIER_MISSING');
  console.error('FAIL_CLOSED: canonical leader publication is not eligible until exact-main core-four producer health is enforced inside the Assurance generation.');
  process.exit(1);
}

console.log(JSON.stringify({
  suite: 'KIDULTS_PLATFORM_CONTINUOUS_ASSURANCE_P1_1550_CONTAINMENT_V1',
  state: 'VERIFIED_PASS',
  live_main_fail_closed_until_inline_barrier: true,
  barrier_marker: barrierMarker,
  production: 'HOLD',
  public: 'HOLD',
  g5: 'HOLD'
}));
