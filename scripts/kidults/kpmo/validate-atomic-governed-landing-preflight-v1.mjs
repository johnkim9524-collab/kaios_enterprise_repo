#!/usr/bin/env node
import fs from 'node:fs';

const workflowPath = '.github/workflows/kidults-atomic-governed-landing-v1.yml';
const runnerPath = 'scripts/kidults/kpmo/run-atomic-governed-landing-v1.mjs';
const controlPath = 'coordination/kidults/kpmo/atomic-governed-landing-preflight-control-v1.json';

const workflow = fs.readFileSync(workflowPath, 'utf8');
const runner = fs.readFileSync(runnerPath, 'utf8');
const control = JSON.parse(fs.readFileSync(controlPath, 'utf8'));

function findingsFor(workflowText, runnerText, controlObject) {
  const findings = [];
  const require = (condition, code) => { if (!condition) findings.push(code); };

  require(controlObject.id === 'KIDULTS_ATOMIC_GOVERNED_LANDING_PREFLIGHT_CONTROL_V1', 'CONTROL_ID_INVALID');
  require(controlObject.version === '1.0.0', 'CONTROL_VERSION_INVALID');
  require(controlObject.approval_command === '/kpmo-land pr=<number> head=<40-char-sha>', 'CONTROL_COMMAND_INVALID');
  require(controlObject.approval_binding?.comment_author_must_equal_repository_owner === true, 'CONTROL_OWNER_BINDING_MISSING');
  require(controlObject.approval_binding?.approved_initial_head_sha_required === true, 'CONTROL_INITIAL_HEAD_BINDING_MISSING');
  require(controlObject.preflight?.auto_base_sync === 'ALLOWED_ONLY_WHEN_DELTA_DIGEST_IS_UNCHANGED', 'CONTROL_DELTA_STABILITY_MISSING');
  require(controlObject.preflight?.max_main_sync_cycles === 3, 'CONTROL_SYNC_BOUND_INVALID');
  require(controlObject.preflight?.global_main_landing_concurrency === true, 'CONTROL_GLOBAL_CONCURRENCY_MISSING');
  require(controlObject.landing?.server_side_expected_head_compare === true, 'CONTROL_SERVER_HEAD_COMPARE_MISSING');
  require(controlObject.receipt?.approval_comment_body_persisted === false, 'CONTROL_COMMENT_BODY_PERSISTENCE_FORBIDDEN');
  require(controlObject.production === 'HOLD' && controlObject.public === 'HOLD' && controlObject.g5 === 'HOLD', 'CONTROL_RELEASE_HOLD_INVALID');

  for (const marker of [
    'workflow_dispatch:',
    'issue_comment:',
    'types: [created]',
    'group: kidults-atomic-governed-landing-main',
    "github.event.issue.pull_request != null",
    "startsWith(github.event.comment.body, '/kpmo-land ')",
    'github.event.comment.user.login == github.repository_owner',
    "github.event.comment.author_association == 'OWNER'",
    'contents: write',
    'issues: write',
    'pull-requests: write',
    'statuses: write',
    'ref: main',
    'persist-credentials: false',
    'Validate trusted atomic preflight control',
    'validate-atomic-governed-landing-preflight-v1.mjs',
    'ATOMIC_LANDING_RECEIPT_PATH:',
    'Upload sanitized atomic preflight and landing receipt',
    'if: ${{ always() }}',
    'if-no-files-found: error',
  ]) require(workflowText.includes(marker), `WORKFLOW_MARKER_MISSING:${marker}`);
  require(!workflowText.includes('secrets.'), 'WORKFLOW_SECRET_CONTEXT_FORBIDDEN');
  require(!/^\s{2}(?:push|pull_request|pull_request_target|schedule|workflow_run):/m.test(workflowText), 'WORKFLOW_UNTRUSTED_TRIGGER_FORBIDDEN');
  require((workflowText.match(/^\s*contents:\s*write\s*$/gmi) || []).length === 1, 'WORKFLOW_CONTENTS_WRITE_CARDINALITY_INVALID');

  for (const marker of [
    "['workflow_dispatch', 'issue_comment'].includes(triggerMode)",
    "approvalAssociation !== 'OWNER'",
    "match(/^\\/kpmo-land\\s+pr=(\\d+)\\s+head=([0-9a-f]{40})$/i)",
    'approvalIssueNumber !== prNumber',
    'landingActor !== repositoryState.owner?.login',
    'candidateManifest',
    'candidate_manifest_digest',
    'PREFLIGHT_CANDIDATE_DELTA_DIGEST_DRIFT',
    'PREFLIGHT_SYNC_CHANGED_CANDIDATE_DELTA',
    '/pulls/${prNumber}/update-branch',
    'body: JSON.stringify({expected_head_sha: currentHeadSha})',
    'preflight_max_main_sync_cycles || 3',
    'waitForTechnicalGreen',
    'waitForServerMergeable',
    '/compare/${liveMainSha}...${currentHeadSha}',
    'LAND-PR-${prNumber}-${expectedHeadSha.slice(0, 12)}',
    "body: JSON.stringify({sha: expectedHeadSha, merge_method: 'merge'})",
    "receipt.state = 'MERGED_VERIFIED'",
    "receipt.state = 'VERIFIED_FAIL'",
    'approval_comment_digest',
    'approvalCommentBody ? sha256(approvalCommentBody) : null',
  ]) require(runnerText.includes(marker), `RUNNER_MARKER_MISSING:${marker}`);
  require(!runnerText.includes('approval_comment_body:'), 'RUNNER_RAW_APPROVAL_COMMENT_PERSISTENCE_FORBIDDEN');
  require(!runnerText.includes('approval_comment_body ='), 'RUNNER_RAW_APPROVAL_COMMENT_ASSIGNMENT_FORBIDDEN');

  return findings;
}

const findings = findingsFor(workflow, runner, control);
const mutations = [
  {
    id: 'OWNER_COMMENT_GUARD_REMOVED',
    workflow: workflow.replace('github.event.comment.user.login == github.repository_owner', 'true'),
    runner,
    control,
  },
  {
    id: 'OWNER_ASSOCIATION_GUARD_REMOVED',
    workflow: workflow.replace("github.event.comment.author_association == 'OWNER'", 'true'),
    runner,
    control,
  },
  {
    id: 'GLOBAL_CONCURRENCY_REPLACED_WITH_PER_PR',
    workflow: workflow.replace('group: kidults-atomic-governed-landing-main', 'group: kidults-atomic-governed-landing-${{ inputs.pull_request_number }}'),
    runner,
    control,
  },
  {
    id: 'DELTA_DIGEST_GUARD_REMOVED',
    workflow,
    runner: runner.replace("if (updatedManifest.digest !== approvedManifest.digest) throw new Error('PREFLIGHT_SYNC_CHANGED_CANDIDATE_DELTA');", ''),
    control,
  },
  {
    id: 'UPDATE_BRANCH_EXPECTED_HEAD_REMOVED',
    workflow,
    runner: runner.replace('body: JSON.stringify({expected_head_sha: currentHeadSha})', 'body: JSON.stringify({})'),
    control,
  },
  {
    id: 'SERVER_EXACT_HEAD_COMPARE_REMOVED',
    workflow,
    runner: runner.replace("body: JSON.stringify({sha: expectedHeadSha, merge_method: 'merge'})", "body: JSON.stringify({merge_method: 'merge'})"),
    control,
  },
  {
    id: 'MISSING_ARTIFACT_ALLOWED',
    workflow: workflow.replace('if-no-files-found: error', 'if-no-files-found: ignore'),
    runner,
    control,
  },
  {
    id: 'RAW_APPROVAL_COMMENT_PERSISTED',
    workflow,
    runner: runner.replace('approval_comment_digest: approvalCommentBody ? sha256(approvalCommentBody) : null,', 'approval_comment_body: approvalCommentBody,'),
    control,
  },
];
const mutationResults = mutations.map(mutation => ({
  id: mutation.id,
  rejected: findingsFor(mutation.workflow, mutation.runner, mutation.control).length > 0,
}));
for (const mutation of mutationResults) if (!mutation.rejected) findings.push(`MUTATION_FALSE_GREEN:${mutation.id}`);

const receipt = {
  id: 'KIDULTS_ATOMIC_GOVERNED_LANDING_PREFLIGHT_VALIDATION_V1',
  state: findings.length ? 'VERIFIED_FAIL' : 'VERIFIED_PASS',
  workflow_trigger_boundary: 'MANUAL_FALLBACK_OR_OWNER_ISSUE_COMMENT_ONLY',
  global_main_landing_concurrency: true,
  candidate_delta_digest_guard: true,
  server_side_exact_head_compare: true,
  sanitized_terminal_receipt: true,
  mutations: mutationResults,
  findings,
  production: 'HOLD',
  public: 'HOLD',
  g5: 'HOLD',
};
console.log(JSON.stringify(receipt, null, 2));
if (findings.length) process.exit(1);
