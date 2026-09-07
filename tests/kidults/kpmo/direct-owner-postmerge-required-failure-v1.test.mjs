import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const workflow = fs.readFileSync('.github/workflows/kidults-direct-owner-landing-handoff-v1.yml', 'utf8');

test('required post-merge workflow failure preserves consumed proof but makes handoff terminal RED', () => {
  const consumeIndex = workflow.indexOf('Consume exact merge-SHA protected-main push suite');
  const failClosedIndex = workflow.indexOf('Fail closed on required post-merge workflow failures');
  const uploadIndex = workflow.indexOf('Upload bounded direct-owner handoff receipt');
  assert.ok(consumeIndex >= 0 && consumeIndex < failClosedIndex && failClosedIndex < uploadIndex);
  assert.match(workflow, /post_merge_push_suite_consumed !== true/);
  assert.match(workflow, /proof\?\.state !== 'CONSUMED_EXACT_MERGE_SHA_PUSH_SUITE'/);
  assert.match(workflow, /proof\.all_required_success !== true/);
  assert.match(workflow, /state: 'VERIFIED_FAIL'/);
  assert.match(workflow, /prior_merge_terminal_state: receipt\.state/);
  assert.match(workflow, /failure_code: 'DIRECT_OWNER_POSTMERGE_REQUIRED_WORKFLOW_FAILURE'/);
  assert.match(workflow, /throw new Error\('DIRECT_OWNER_POSTMERGE_REQUIRED_WORKFLOW_FAILURE'\)/);
  assert.match(workflow, /promotion_eligible: false/);
  assert.match(workflow, /production: 'HOLD'/);
  assert.match(workflow, /public: 'HOLD'/);
  assert.match(workflow, /g5: 'HOLD'/);
});
