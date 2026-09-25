import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const workflow = fs.readFileSync('.github/workflows/kidults-direct-owner-landing-handoff-v1.yml', 'utf8');
const runner = fs.readFileSync('scripts/kidults/kpmo/run-direct-owner-landing-handoff-v1.mjs', 'utf8');
const landedLifecycleVerifier = fs.readFileSync('scripts/kidults/kpmo/verify-direct-owner-postmerge-lifecycle-v1.mjs', 'utf8');
const landedLifecycleLibrary = fs.readFileSync('scripts/kidults/kpmo/lib/direct-owner-postmerge-lifecycle-v1.mjs', 'utf8');
const atomic = fs.readFileSync('.github/workflows/kidults-atomic-governed-landing-v1.yml', 'utf8');
const postMergeConsumer = fs.readFileSync('scripts/kidults/kpmo/consume-direct-owner-postmerge-push-suite-v1.mjs', 'utf8');
const postMergePolicy = JSON.parse(fs.readFileSync('coordination/kidults/kpmo/direct-owner-postmerge-push-suite-policy-v1.json', 'utf8'));

function assertUnfilteredMainPush(requiredWorkflow, name) {
  requiredWorkflow = requiredWorkflow.replace(/\r\n/g, '\n');
  const push = requiredWorkflow.match(/^  push:\n([\s\S]*?)(?=^  [a-z_]+:|^permissions:)/m);
  assert.ok(push, `${name} must declare a push trigger`);
  assert.match(push[1], /^    branches:/m, `${name} must bind push to main`);
  assert.match(push[1], /\bmain\b/, `${name} must bind push to main`);
  assert.doesNotMatch(push[1], /^    paths(?:-ignore)?:/m,
    `${name} cannot be path-filtered because the post-merge consumer requires it for every main push`);
}

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
  const factory = new Function('MARKER', 'fail', `${runner.slice(keysStart, keysEnd)}\n${runner.slice(functionStart, functionEnd)}\nreturn {approvalKeys, parseApproval};`);
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
  assert.match(runner, /DIRECT_OWNER_HANDOFF_APPROVAL_NOT_AFTER_FINAL_LIFECYCLE_BOUNDARY/);
  assert.match(runner, /DIRECT_OWNER_HANDOFF_APPROVAL_NOT_BEFORE_LANDING_ATTEMPT/);
  assert.match(runner, /DIRECT_OWNER_HANDOFF_MULTIPLE_CURRENT_GENERATION_APPROVALS/);
  assert.match(runner, /evaluateAtomicLandingOneUseRunSet/);
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
    'expected_head_tree_sha=31d9785d2a9513e4c6432c810cdfce27200fe94b',
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

  assert.equal(approvalKeys.length, 16);
  assert.equal(parseApproval(approval).g5, 'HOLD');
  assert.throws(() => parseApproval(approval.replace('g5=HOLD', 'g6=HOLD')), /DIRECT_OWNER_HANDOFF_APPROVAL_FIELD_INVALID/);
  assert.throws(() => parseApproval(approval.replace('public=HOLD', 'production=HOLD')), /DIRECT_OWNER_HANDOFF_APPROVAL_FIELD_INVALID/);
  assert.throws(() => parseApproval(approval.replace(/\nexpected_head_tree_sha=[^\n]+/, '')), /DIRECT_OWNER_HANDOFF_APPROVAL_SHAPE_INVALID/);
  assert.equal(parseApproval(approval.replace('31d9785d2a9513e4c6432c810cdfce27200fe94b',
    '41d9785d2a9513e4c6432c810cdfce27200fe94c')).expected_head_tree_sha,
  '41d9785d2a9513e4c6432c810cdfce27200fe94c');
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

test('Atomic Landing validates the direct-owner event transport before authority consumption', () => {
  const transportIndex = atomic.indexOf('Verify event-emitting merge transport before authority consumption');
  const lifecycleIndex = atomic.indexOf('Require latest terminal exact-head lifecycle authority');
  const consumptionIndex = atomic.indexOf('Consume one-use exact-head landing authorization');
  assert.ok(transportIndex >= 0 && transportIndex < lifecycleIndex && lifecycleIndex < consumptionIndex);
  assert.match(atomic, /run-atomic-event-emitting-transport-preflight-v1\.mjs/);
  assert.doesNotMatch(atomic, /contents: write/);
  assert.doesNotMatch(atomic, /pull-requests: write/);
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

test('post-window trusted-base classification preserves transport facts and landed main revalidates lifecycle semantics', () => {
  const sleepIndex = runner.indexOf('await sleep(handoffWindowSeconds * 1000)');
  const approvalRecheck = runner.indexOf('assertApprovalCommentUnchanged(afterComments, owner, approval)');
  const headRecheck = runner.indexOf('DIRECT_OWNER_HANDOFF_MERGED_HEAD_DRIFT');
  const mainRecheck = runner.indexOf('DIRECT_OWNER_HANDOFF_MERGE_NOT_CURRENT_MAIN');
  assert.ok(sleepIndex >= 0);
  const treeRecheck = runner.indexOf('DIRECT_OWNER_HANDOFF_HEAD_TREE_DRIFT_AFTER_WINDOW');
  for (const index of [approvalRecheck, treeRecheck, headRecheck, mainRecheck]) assert.ok(index > sleepIndex);
  assert.doesNotMatch(runner.slice(sleepIndex), /selectLatestLifecycleReadyEvent/,
    'stale pre-merge implementation must not reinterpret the post-merge lifecycle');
  assert.match(workflow, /Verify post-merge lifecycle with exact landed implementation/);
  assert.match(workflow, /node scripts\/kidults\/kpmo\/verify-direct-owner-postmerge-lifecycle-v1\.mjs/);
  assert.match(landedLifecycleVerifier, /verifyDirectOwnerPostmergeLifecycle/);
  assert.match(landedLifecycleLibrary, /selectLatestLifecycleReadyEvent/);
  assert.match(landedLifecycleLibrary, /DIRECT_OWNER_POSTMERGE_READY_BOUNDARY_DRIFT/);
});

test('post-window approval reconciliation is immutable and does not reinterpret authorization', () => {
  assert.match(runner, /function assertApprovalCommentUnchanged\(comments, repositoryOwner, approval\)/);
  assert.match(runner, /DIRECT_OWNER_HANDOFF_APPROVAL_DELETED_AFTER_WINDOW/);
  assert.match(runner, /DIRECT_OWNER_HANDOFF_APPROVAL_BODY_DRIFT_AFTER_WINDOW/);
  const sleepIndex = runner.indexOf('await sleep(handoffWindowSeconds * 1000)');
  const immutableRecheck = runner.indexOf('assertApprovalCommentUnchanged(afterComments, owner, approval)', sleepIndex);
  assert.ok(immutableRecheck > sleepIndex);
});

test('head tree is explicit in input, structured approval, receipt, preflight and window readbacks', () => {
  assert.match(workflow, /expected_head_tree_sha:/);
  assert.match(workflow, /EXPECTED_HEAD_TREE_SHA: \$\{\{ inputs\.expected_head_tree_sha \}\}/);
  assert.match(runner, /'expected_head_tree_sha'/);
  assert.match(runner, /fields\.expected_head_tree_sha !== expectedHeadTreeSha/);
  assert.match(runner, /expected_head_tree_sha: expectedHeadTreeSha/);
  assert.match(runner, /DIRECT_OWNER_HANDOFF_HEAD_TREE_MISMATCH/);
  assert.match(runner, /DIRECT_OWNER_HANDOFF_FINAL_HEAD_TREE_DRIFT/);
  assert.match(runner, /DIRECT_OWNER_HANDOFF_HEAD_TREE_DRIFT_AFTER_WINDOW/);
  assert.match(runner, /DIRECT_OWNER_HANDOFF_RESULTING_TREE_MISMATCH/);
  assert.match(runner, /DIRECT_OWNER_HANDOFF_ORDERED_PARENTS_MISMATCH/);
});

test('consumed merge is explicitly bounded to opened window and approval expiry', () => {
  const mergedBranch = runner.indexOf('if (after?.merged === true)');
  for (const code of [
    'DIRECT_OWNER_HANDOFF_MERGE_BEFORE_WINDOW_OPEN',
    'DIRECT_OWNER_HANDOFF_MERGE_AFTER_WINDOW',
    'DIRECT_OWNER_HANDOFF_MERGE_AFTER_APPROVAL_EXPIRY',
  ]) {
    const index = runner.indexOf(code);
    assert.ok(index > mergedBranch, `${code} must be enforced inside merged classification`);
  }
  assert.match(runner, /const closesAtMs = openedAtMs \+ handoffWindowSeconds \* 1000/);
  assert.match(runner, /const approvalExpiresAtMs = parseTime\(approval\.expires_at/);
});

test('terminal Handoff consumption is followed by exact merge-SHA push-suite consumption before artifact upload', () => {
  const handoffIndex = workflow.indexOf('Validate exact-head direct-owner handoff and open bounded merge window');
  const consumeIndex = workflow.indexOf('Consume exact merge-SHA protected-main push suite');
  const uploadIndex = workflow.indexOf('Upload bounded direct-owner handoff receipt');
  assert.ok(handoffIndex >= 0 && handoffIndex < consumeIndex && consumeIndex < uploadIndex);
  assert.match(workflow, /POSTMERGE_PUSH_SUITE_POLICY_PATH: coordination\/kidults\/kpmo\/direct-owner-postmerge-push-suite-policy-v1\.json/);
  assert.match(workflow, /POSTMERGE_PUSH_SUITE_WAIT_SECONDS: '90'/);
  assert.match(workflow, /id: handoff/);
  assert.match(workflow, /ref: \$\{\{ steps\.handoff\.outputs\.merge_sha \}\}/);
  assert.match(workflow, /clean: false/);
  assert.match(workflow, /Verify exact landed implementation and retained handoff receipt/);
  assert.match(workflow, /Verify post-merge lifecycle with exact landed implementation/);
  assert.match(workflow, /test "\$\(git rev-parse HEAD\)" = "\$MERGE_SHA"/);
  assert.match(workflow, /node scripts\/kidults\/kpmo\/consume-direct-owner-postmerge-push-suite-v1\.mjs/);
  assert.match(workflow, /required_failure_count === 1/);
  assert.match(workflow, /ASSURANCE_FAIL_CLOSED_HOLD_RECEIPT_RETAINED/);
  assert.match(workflow, /classified_assurance_hold_accepted_as_landing_evidence/);
  assert.match(workflow, /promotion_eligible:false/);
});

test('post-merge suite policy binds core protected-main push controls and preserves RED as evidence', () => {
  const requiredPaths = postMergePolicy.required_workflows.map(item => item.path);
  assert.deepEqual(requiredPaths, [
    '.github/workflows/ci-validation.yml',
    '.github/workflows/kidults-p0-control-plane-closure-v1.yml',
    '.github/workflows/kidults-full-value-chain-redteam-orchestrator-v1.yml',
    '.github/workflows/kidults-platform-continuous-assurance-v1.yml',
    '.github/workflows/kpmo-exact-head-ci-supersession-v1.yml',
    '.github/workflows/solo-owner-preflight.yml',
  ]);
  assert.deepEqual(postMergePolicy.accepted_terminal_conclusions, ['success', 'failure']);
  assert.equal(postMergePolicy.proof_contract.exact_merge_sha_only, true);
  assert.equal(postMergePolicy.proof_contract.predecessor_head_proof_reuse_forbidden, true);
  assert.equal(postMergePolicy.proof_contract.terminal_failure_does_not_become_promotion_authority, true);
  assert.equal(postMergePolicy.proof_contract.production, 'HOLD');
  assert.equal(postMergePolicy.proof_contract.public, 'HOLD');
  assert.equal(postMergePolicy.proof_contract.g5, 'HOLD');
});

test('every required post-merge workflow is guaranteed to run on every main push', () => {
  for (const {path: workflowPath, name} of postMergePolicy.required_workflows) {
    assertUnfilteredMainPush(fs.readFileSync(workflowPath, 'utf8'), name);
  }
});

test('a path-filtered required main-push workflow is rejected', () => {
  const workflowPath = '.github/workflows/kidults-p0-control-plane-closure-v1.yml';
  const requiredWorkflow = fs.readFileSync(workflowPath, 'utf8');
  const weakened = requiredWorkflow.replace('    branches: [main]\n',
    "    branches: [main]\n    paths:\n      - 'scripts/kidults/**'\n");
  assert.throws(() => assertUnfilteredMainPush(weakened, 'synthetic weakened P0'), /cannot be path-filtered/);
});

test('post-merge consumer rejects PR-head reuse, nonterminal, cancelled and ambiguous workflow evidence', () => {
  assert.match(postMergeConsumer, /head_sha: mergeSha/);
  assert.match(postMergeConsumer, /event: policy\.event/);
  assert.match(postMergeConsumer, /branch: policy\.branch/);
  assert.match(postMergeConsumer, /run\?\.head_sha === mergeSha && run\?\.event === policy\.event && run\?\.head_branch === policy\.branch/);
  assert.match(postMergeConsumer, /AMBIGUOUS_MULTIPLE_RUNS/);
  assert.match(postMergeConsumer, /NOT_TERMINAL/);
  assert.match(postMergeConsumer, /TERMINAL_CONCLUSION_FORBIDDEN/);
  assert.match(postMergeConsumer, /predecessor_head_proof_reused: false/);
  assert.match(postMergeConsumer, /state: 'CONSUMED_EXACT_MERGE_SHA_PUSH_SUITE'/);
  assert.match(postMergeConsumer, /post_merge_push_suite_consumed: true/);
  assert.match(postMergeConsumer, /promotion_eligible: false/);
});
