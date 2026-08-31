#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';

function concurrencyBlock(source) {
  const match = source.match(/\nconcurrency:\n([\s\S]*?)\n\njobs:/);
  assert.ok(match, 'CONCURRENCY_BLOCK_MISSING');
  return match[1];
}

export function validateWholeBoardWorkflow(source, globalKey) {
  assert.match(source, /issues:\n\s+types:\s*\[[^\]]*edited[^\]]*\]/, 'ISSUES_EDITED_TRIGGER_MISSING');
  const block = concurrencyBlock(source);
  assert.ok(block.includes(`github.event_name == 'issues' && '${globalKey}'`), 'ISSUE_BURST_GLOBAL_GROUP_MISSING');
  assert.ok(!block.includes('github.event.issue.number'), 'ISSUE_NUMBER_SPLITS_WHOLE_BOARD_CONCURRENCY');
  assert.match(block, /cancel-in-progress:\s*true/, 'CANCEL_IN_PROGRESS_MISSING');
  assert.ok(source.includes('if [ "$GITHUB_EVENT_NAME" = issues ]; then\n            sleep 15\n          fi'), 'ISSUE_EVENT_DEBOUNCE_MISSING');
}

export function validateLocalTransitionWorkflow(source) {
  const block = concurrencyBlock(source);
  assert.ok(block.includes('github.event.issue.number || inputs.issue_number'), 'LOCAL_TRANSITION_PER_ISSUE_GROUP_MISSING');
  assert.match(block, /cancel-in-progress:\s*true/, 'LOCAL_TRANSITION_CANCELLATION_MISSING');
}

function expectReject(fn, label) {
  assert.throws(fn, undefined, label);
}

function selfTest() {
  const whole = `
on:
  issues:
    types: [opened, edited]
concurrency:
  group: test-\${{ github.event_name }}-\${{ github.event_name == 'issues' && 'all-members' || github.ref || github.run_id }}
  cancel-in-progress: true

jobs:
  validate:
    steps:
      - run: |
          if [ "$GITHUB_EVENT_NAME" = issues ]; then
            sleep 15
          fi
`;
  validateWholeBoardWorkflow(whole, 'all-members');
  expectReject(() => validateWholeBoardWorkflow(whole.replace("'all-members'", 'github.event.issue.number'), 'all-members'), 'per-issue split must fail');
  expectReject(() => validateWholeBoardWorkflow(whole.replace('sleep 15', 'true'), 'all-members'), 'missing debounce must fail');
  expectReject(() => validateWholeBoardWorkflow(whole.replace('cancel-in-progress: true', 'cancel-in-progress: false'), 'all-members'), 'disabled cancellation must fail');

  const local = `
on:
  issues:
    types: [edited]
concurrency:
  group: local-\${{ github.event.issue.number || inputs.issue_number }}
  cancel-in-progress: true

jobs:
  validate: {}
`;
  validateLocalTransitionWorkflow(local);
  expectReject(() => validateLocalTransitionWorkflow(local.replace('github.event.issue.number || inputs.issue_number', 'all-members')), 'globalized local guard must fail');
}

function main() {
  selfTest();
  const [severityPath, latestPath, transitionPath] = process.argv.slice(2);
  if (!severityPath || !latestPath || !transitionPath) {
    throw new Error('USAGE: validate-canonical-issue-fanout-budget-v1.mjs <severity-workflow> <latest-block-workflow> <transition-workflow>');
  }
  validateWholeBoardWorkflow(fs.readFileSync(severityPath, 'utf8'), 'all-material-defects');
  validateWholeBoardWorkflow(fs.readFileSync(latestPath, 'utf8'), 'all-canonical-issues');
  validateLocalTransitionWorkflow(fs.readFileSync(transitionPath, 'utf8'));
  console.log(JSON.stringify({
    state: 'VERIFIED_PASS',
    invariant: 'CANONICAL_ISSUE_FANOUT_BUDGET_BOUND',
    whole_board_issue_burst_survivors_max: 2,
    local_transition_runs_per_edited_member: 1,
    canonical_member_count: 25,
    previous_uncoalesced_runs_per_batch: 75,
    promotion_authority: false,
    production: 'HOLD',
    public: 'HOLD',
    g5: 'HOLD'
  }));
}

main();
