import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const workflow = fs.readFileSync('.github/workflows/kidults-direct-owner-landing-handoff-v1.yml', 'utf8');
const runner = fs.readFileSync('scripts/kidults/kpmo/run-direct-owner-landing-handoff-v1.mjs', 'utf8');
const atomic = fs.readFileSync('.github/workflows/kidults-atomic-governed-landing-v1.yml', 'utf8');

function loadProductionApprovalParser() {
  const keysStart = runner.indexOf('const approvalKeys = [');
  const keysEnd = runner.indexOf('];', keysStart) + 2;
  const functionStart = runner.indexOf('function parseApproval(body) {');
  assert.ok(keysStart >= 0 && keysEnd > keysStart && functionStart >= 0, 'production parser source unavailable');
  let cursor = runner.indexOf('{', functionStart);
  let depth = 0;
  let functionEnd = -1;
  for (; cursor < runner.length; cursor += 1) {
    if (runner[cursor] === '{') depth += 1;
    if (runner[cursor] === '}') {
      depth -= 1;
      if (depth === 0) {
        functionEnd = cursor + 1;
        break;
      }
    }
  }
  assert.ok(functionEnd > functionStart, 'production parser boundary unavailable');
  const factory = new Function('MARKER', 'fail', `${runner.slice(keysStart, keysEnd)}
${runner.slice(functionStart, functionEnd)}
return {approvalKeys, parseApproval};`);
  return factory(
    'KIDULTS_DIRECT_OWNER_EVENT_EMITTING_MERGE_APPROVAL_V2',
    code => {
      const error = new Error(code);
      error.code = code;
      throw error;
    },
  );
}

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

test('production approval parser accepts g5 and rejects unknown or duplicate digit-bearing keys', () => {
  const {approvalKeys, parseApproval} = loadProductionApprovalParser();
  const approval = [
    'KIDULTS_DIRECT_OWNER_EVENT_EMITTING_MERGE_APPROVAL_V2',
    'repository=johnkim9524-collab/kaios_enterprise_repo',
    'pull_request=1988',
    'exact_base_sha=0e5852b437afb89971f28641c2b230cc30c5b1e0',
    'exact_head_sha=21d9785d2a9513e4c6432c810cdfce27200fe94a',
    'operation=MERGE_PROTECTED_MAIN',
    'transport=DIRECT_OWNER_GITHUB_UI',
    'authorization_id=DIRECT-PR-1988-21d9785d2a95',
    'nonce=2e4a92805b23fb3eb9eba27f3e4f4d9f',
    'expires_at=2026-09-05T03:00:00Z',
    'purpose=P1_1987_REVOCATION_CANARY',
    'scope=ONE_DIRECT_OWNER_MERGE_ONLY',
    'approval_rebind=FORBIDDEN',
    'production=HOLD',
    'public=HOLD',
    'g5=HOLD',
  ].join('\n');

  assert.equal(approvalKeys.length, 15);
  assert.equal(parseApproval(approval).g5, 'HOLD');
  assert.throws(() => parseApproval(approval.replace('g5=HOLD', 'g6=HOLD')), /DIRECT_OWNER_HANDOFF_APPROVAL_FIELD_INVALID/);
  assert.throws(() => parseApproval(approval.replace('public=HOLD', 'production=HOLD')), /DIRECT_OWNER_HANDOFF_APPROVAL_FIELD_INVALID/);
  assert.equal(parseApproval('NOT_AN_APPROVAL'), null);
});

test('every pre-window rejection overwrites the initializer with a terminal sanitized receipt', () => {
  const tryIndex = runner.indexOf('try {\n  writeReceipt(receipt);');
  const inputGuardIndex = runner.indexOf("DIRECT_OWNER_HANDOFF_ENVIRONMENT_INVALID");
  const catchIndex = runner.lastIndexOf('} catch (error) {');
  const catchBlock = runner.slice(catchIndex);
  assert.ok(tryIndex >= 0 && inputGuardIndex > tryIndex, 'input validation must execute inside terminal reconciliation');
  assert.match(runner, /state: 'VALIDATION_PENDING'/);
  assert.match(catchBlock, /state: 'VERIFIED_FAIL'/);
  assert.match(catchBlock, /failure_code: failureCode/);
  assert.doesNotMatch(catchBlock, /if \(receipt\)/);
  assert.match(workflow, /name: Upload bounded direct-owner handoff receipt\n        if: always\(\)/);
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
