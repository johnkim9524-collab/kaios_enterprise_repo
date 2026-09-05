import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const workflow = fs.readFileSync('.github/workflows/kidults-direct-owner-landing-handoff-v1.yml', 'utf8');
const runner = fs.readFileSync('scripts/kidults/kpmo/run-direct-owner-landing-handoff-v1.mjs', 'utf8');
const atomic = fs.readFileSync('.github/workflows/kidults-atomic-governed-landing-v1.yml', 'utf8');

test('direct-owner handoff separates status authorization from the event-emitting merge', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /issue_comment:\n    types: \[created, edited, deleted\]/);
  assert.match(workflow, /statuses: write/);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /pull-requests: read/);
  assert.doesNotMatch(workflow, /contents: write/);
  assert.doesNotMatch(workflow, /pull-requests: write/);
  assert.match(runner, /transport: TRANSPORT/);
  assert.match(runner, /merge_performed_by_workflow: false/);
  assert.match(runner, /event_emitting_merge_required: true/);
  assert.doesNotMatch(runner, /merge_method/);
  assert.doesNotMatch(runner, /\/merges/);
});

test('handoff is exact-head, direct-owner, unedited, expiring and fail-closed', () => {
  assert.match(runner, /KIDULTS_DIRECT_OWNER_EVENT_EMITTING_MERGE_APPROVAL_V2/);
  assert.match(runner, /DIRECT-PR-\$\{prNumber\}-\$\{expectedHeadSha\.slice\(0, 12\)\}/);
  assert.match(runner, /DIRECT_OWNER_HANDOFF_APPROVAL_APP_MEDIATED/);
  assert.match(runner, /DIRECT_OWNER_HANDOFF_APPROVAL_EDITED/);
  assert.match(runner, /DIRECT_OWNER_HANDOFF_APPROVAL_MUST_PRECEDE_READY/);
  assert.match(runner, /DIRECT_OWNER_HANDOFF_APPROVAL_EXPIRES_BEFORE_WINDOW/);
  assert.match(runner, /DIRECT_OWNER_HANDOFF_RULESET_BYPASS_FORBIDDEN/);
  assert.match(runner, /DIRECT_OWNER_HANDOFF_SCOPE_STATUS_NOT_SUCCESS/);
  assert.match(runner, /evaluateRequiredCheckRuns\(runs, scopePolicy\.technical_base_contexts\)/);
  assert.match(runner, /await publish\('success', `Direct Owner UI merge authorized/);
  assert.match(runner, /await publish\('pending', 'Direct Owner handoff expired unconsumed; fresh authorization required'\)/);
  assert.match(runner, /await publish\('failure'/);
});

test('approval comment mutation revokes any open direct-owner handoff', () => {
  assert.match(workflow, /KIDULTS_DIRECT_OWNER_EVENT_EMITTING_MERGE_APPROVAL_V2/);
  assert.match(workflow, /Direct Owner approval changed; fresh handoff authorization required/);
  assert.match(workflow, /state: 'pending'/);
});

test('Atomic Landing remains fail-closed before authority consumption while direct-owner handoff is the successor transport', () => {
  const transportIndex = atomic.indexOf('Require event-emitting post-merge CI transport');
  const lifecycleIndex = atomic.indexOf('Require latest terminal exact-head lifecycle authority');
  const consumptionIndex = atomic.indexOf('Consume one-use exact-head landing authorization');
  assert.ok(transportIndex >= 0 && transportIndex < lifecycleIndex && lifecycleIndex < consumptionIndex);
  assert.match(atomic, /ATOMIC_LANDING_GITHUB_TOKEN_POSTMERGE_CI_SUPPRESSED/);
});

test('approval revocation cannot queue behind the handoff window or be triggered by an untrusted commenter', () => {
  assert.match(workflow, /group: kidults-direct-owner-landing-handoff-v1-\$\{\{ github\.event_name == 'workflow_dispatch' && 'handoff' \|\| 'revocation' \}\}/);
  assert.match(workflow, /github\.event\.comment\.user\.login == github\.repository_owner/);
  assert.match(workflow, /github\.event\.comment\.author_association == 'OWNER'/);
  assert.doesNotMatch(workflow, /github\.event\.action == 'deleted' \|\|/);
});

test('dispatch actor is verified before any governed status mutation', () => {
  const actorGuard = runner.indexOf("DIRECT_OWNER_HANDOFF_DISPATCH_ACTOR_NOT_OWNER");
  const firstPublish = runner.indexOf("await publish('pending'");
  assert.ok(actorGuard >= 0 && actorGuard < firstPublish);
});

test('post-window merge classification revalidates approval, ready event, head and current main', () => {
  const sleepIndex = runner.indexOf('await sleep(handoffWindowSeconds * 1000)');
  const approvalRecheck = runner.indexOf('DIRECT_OWNER_HANDOFF_APPROVAL_DRIFT_AFTER_WINDOW');
  const readyRecheck = runner.indexOf('DIRECT_OWNER_HANDOFF_READY_EVENT_DRIFT_AFTER_WINDOW');
  const headRecheck = runner.indexOf('DIRECT_OWNER_HANDOFF_MERGED_HEAD_DRIFT');
  const mainRecheck = runner.indexOf('DIRECT_OWNER_HANDOFF_MERGE_NOT_CURRENT_MAIN');
  assert.ok(sleepIndex >= 0);
  for (const index of [approvalRecheck, readyRecheck, headRecheck, mainRecheck]) assert.ok(index > sleepIndex);
});
