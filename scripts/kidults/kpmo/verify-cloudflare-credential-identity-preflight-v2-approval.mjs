#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const AUTH_PATH = 'coordination/kidults/governance/cloudflare-credential-identity-preflight-authorization-20260901-v2.json';
const APPROVAL_PATH = 'coordination/kidults/governance/receipts/CF-CREDENTIAL-IDENTITY-PREFLIGHT-20260901-02.md';
const EXTRACTOR_PATH = 'scripts/kidults/kpmo/extract-github-comment-body-byte-exact-v1.mjs';
const WORKFLOW_PATH = '.github/workflows/kidults-cloudflare-credential-identity-preflight-v2.yml';
const APPROVAL_ID = 'CF-CREDENTIAL-IDENTITY-PREFLIGHT-20260901-02';
const ISSUE_NUMBER = 1774;
const ROOT_COMMENT_ID = 5490553068;
const ROOT_COMMENT_NODE_ID = 'IC_kwDOTF-G-M8AAAABR0Mw7A';
const ROOT_BODY_SHA256 = 'sha256:3d6ea6b4c95d9abe7e3328c0402a6ae9a7b12013d2d4e34ce0cba3c18aaeccf6';
const NONCE = '4e47ac299e26f983d9773efdf913c7619b587978d2ab2e3b';
const EXPIRES_AT = '2026-09-02T07:36:40Z';

const fail = (code) => { throw new Error(`CLOUDFLARE_CREDENTIAL_PREFLIGHT_V2_APPROVAL_FAIL:${code}`); };
const ok = (condition, code) => { if (!condition) fail(code); };
const digest = (buffer) => `sha256:${crypto.createHash('sha256').update(buffer).digest('hex')}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const receiptPath = process.argv[2];
ok(receiptPath, 'RECEIPT_PATH_REQUIRED');
ok(process.env.GITHUB_EVENT_NAME === 'workflow_dispatch', 'EVENT');
ok(process.env.GITHUB_REF === 'refs/heads/main', 'REF');
ok(process.env.GITHUB_RUN_ATTEMPT === '1', 'RUN_ATTEMPT');
ok(/^[0-9a-f]{40}$/.test(String(process.env.GITHUB_SHA || '')), 'SOURCE_SHA');
ok(/^[1-9][0-9]*$/.test(String(process.env.GITHUB_RUN_ID || '')), 'RUN_ID');
ok(process.env.GITHUB_REPOSITORY === 'johnkim9524-collab/kaios_enterprise_repo', 'REPOSITORY');

const auth = JSON.parse(fs.readFileSync(AUTH_PATH, 'utf8'));
const expectedBody = fs.readFileSync(APPROVAL_PATH);
const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));

ok(auth.id === APPROVAL_ID, 'AUTH_ID');
ok(auth.status === 'APPROVED_PENDING_POST_LANDING_EXACT_MAIN_BINDING', 'AUTH_STATUS');
ok(auth.authorized_by?.github_login === 'johnkim9524-collab', 'AUTH_OWNER');
ok(auth.authorized_by?.author_association === 'OWNER', 'AUTH_ASSOCIATION');
ok(auth.root_approval_receipt?.issue_number === ISSUE_NUMBER, 'AUTH_ISSUE');
ok(auth.root_approval_receipt?.comment_id === ROOT_COMMENT_ID, 'AUTH_ROOT_COMMENT');
ok(auth.root_approval_receipt?.comment_node_id === ROOT_COMMENT_NODE_ID, 'AUTH_ROOT_NODE');
ok(auth.root_approval_receipt?.body_sha256 === ROOT_BODY_SHA256, 'AUTH_ROOT_DIGEST');
ok(auth.issuance_binding?.protected_main_sha_at_receipt_issuance === 'ecfa2fd2b6d24d3e8d977544411cf590d84d48ee', 'AUTH_ISSUANCE_MAIN');
ok(auth.issuance_binding?.nonce === NONCE, 'AUTH_NONCE');
ok(auth.issuance_binding?.expires_at === EXPIRES_AT, 'AUTH_EXPIRY');
ok(auth.post_landing_execution_binding?.required === true, 'AUTH_BINDING_REQUIRED');
ok(auth.post_landing_execution_binding?.valid_binding_count_required === 1, 'AUTH_BINDING_COUNT');
ok(auth.authorized_scope?.workflow === WORKFLOW_PATH, 'AUTH_WORKFLOW');
ok(auth.authorized_scope?.environment === 'kidults-cloudflare-staging-deploy', 'AUTH_ENVIRONMENT');
ok(auth.authorized_scope?.workflow_dispatch_count_max === 1, 'AUTH_DISPATCH_COUNT');
ok(auth.authorized_scope?.external_request_count_max === 2, 'AUTH_REQUEST_COUNT');
ok(auth.runtime_state?.authorization_consumed === false, 'AUTH_ALREADY_CONSUMED');
ok(auth.replay === 'FORBIDDEN_AFTER_FIRST_VALID_V2_PREFLIGHT_DISPATCH_REGARDLESS_OF_TERMINAL_STATE', 'AUTH_REPLAY');

ok(receipt.approval_id === APPROVAL_ID, 'RECEIPT_APPROVAL_ID');
ok(receipt.source_sha === process.env.GITHUB_SHA, 'RECEIPT_SOURCE_SHA');
ok(receipt.run_id === Number(process.env.GITHUB_RUN_ID), 'RECEIPT_RUN_ID');
ok(receipt.run_attempt === 1, 'RECEIPT_RUN_ATTEMPT');
ok(receipt.authorization_consumed === false, 'RECEIPT_ALREADY_CONSUMED');
ok(receipt.external_read_request_count === 0, 'RECEIPT_REQUEST_COUNT');

const headers = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'kidults-cloudflare-credential-identity-preflight-v2-approval-verifier',
};
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

async function getJson(url) {
  const response = await fetch(url, { method: 'GET', headers, redirect: 'error' });
  if (!response.ok) fail(`GITHUB_HTTP_${response.status}`);
  return response.json();
}

const api = process.env.GITHUB_API_URL || 'https://api.github.com';
const repo = process.env.GITHUB_REPOSITORY;
const runtimeSha = process.env.GITHUB_SHA;

const rootComment = await getJson(`${api}/repos/${repo}/issues/comments/${ROOT_COMMENT_ID}`);
ok(rootComment?.id === ROOT_COMMENT_ID, 'ROOT_COMMENT_ID');
ok(rootComment?.node_id === ROOT_COMMENT_NODE_ID, 'ROOT_COMMENT_NODE');
ok(rootComment?.html_url === `https://github.com/${repo}/issues/${ISSUE_NUMBER}#issuecomment-${ROOT_COMMENT_ID}`, 'ROOT_COMMENT_URL');
ok(rootComment?.issue_url === `${api}/repos/${repo}/issues/${ISSUE_NUMBER}`, 'ROOT_COMMENT_ISSUE');
ok(rootComment?.user?.login === 'johnkim9524-collab', 'ROOT_COMMENT_OWNER');
ok(rootComment?.author_association === 'OWNER', 'ROOT_COMMENT_ASSOCIATION');
ok(rootComment?.created_at === '2026-09-01T07:36:59Z', 'ROOT_COMMENT_CREATED');
ok(rootComment?.updated_at === rootComment?.created_at, 'ROOT_COMMENT_EDITED');
ok(rootComment?.performed_via_github_app?.slug === 'chatgpt-codex-connector', 'ROOT_COMMENT_APP');
ok(typeof rootComment?.body === 'string', 'ROOT_COMMENT_BODY');
const commentJsonPath = path.join(path.dirname(receiptPath), 'root-approval-comment-body.json');
fs.writeFileSync(commentJsonPath, JSON.stringify({ body: rootComment.body }));
let actualBody;
try {
  actualBody = execFileSync(process.execPath, [EXTRACTOR_PATH, commentJsonPath], { encoding: null });
} finally {
  fs.rmSync(commentJsonPath, { force: true });
}
ok(Buffer.isBuffer(actualBody), 'ROOT_COMMENT_BODY_BUFFER');
ok(actualBody.equals(expectedBody), 'ROOT_COMMENT_BODY_BYTE_EXACT');
ok(digest(actualBody) === ROOT_BODY_SHA256, 'ROOT_COMMENT_BODY_DIGEST');

const start = auth.post_landing_execution_binding.marker_start;
const end = auth.post_landing_execution_binding.marker_end;
const issueComments = [];
for (let page = 1; page <= 10; page += 1) {
  const batch = await getJson(`${api}/repos/${repo}/issues/${ISSUE_NUMBER}/comments?per_page=100&page=${page}`);
  ok(Array.isArray(batch), 'COMMENTS_SHAPE');
  issueComments.push(...batch);
  if (batch.length < 100) break;
  if (page === 10) fail('COMMENTS_PAGINATION_BOUND');
}
const marked = issueComments.filter((comment) => String(comment?.body || '').includes(start));
ok(marked.length === 1, `EXECUTION_BINDING_MARKER_COUNT_${marked.length}`);
const bindingComment = marked[0];
const bindingBody = String(bindingComment.body || '');
ok(bindingBody.split(start).length - 1 === 1, 'EXECUTION_BINDING_START_COUNT');
ok(bindingBody.split(end).length - 1 === 1, 'EXECUTION_BINDING_END_COUNT');
const a = bindingBody.indexOf(start) + start.length;
const b = bindingBody.indexOf(end, a);
ok(b > a, 'EXECUTION_BINDING_MARKER_ORDER');
let binding;
try {
  binding = JSON.parse(bindingBody.slice(a, b).trim());
} catch {
  fail('EXECUTION_BINDING_JSON_INVALID');
}

const required = {
  schema: 'CF_CREDENTIAL_IDENTITY_PREFLIGHT_V2_EXECUTION_BINDING_V1',
  state: 'BOUND_TO_EXACT_POST_LANDING_MAIN',
  approval_id: APPROVAL_ID,
  root_approval_comment_id: ROOT_COMMENT_ID,
  root_approval_body_sha256: ROOT_BODY_SHA256,
  repository: repo,
  workflow: WORKFLOW_PATH,
  environment: 'kidults-cloudflare-staging-deploy',
  protected_main_sha: runtimeSha,
  landing_merge_sha: runtimeSha,
  landing_base_sha: auth.issuance_binding.protected_main_sha_at_receipt_issuance,
  nonce: NONCE,
  expires_at: EXPIRES_AT,
  authorization_consumed_on: 'FIRST_VALID_V2_PREFLIGHT_DISPATCH_PASS_OR_FAIL',
  rerun_authorized: false,
  replay_authorized: false,
  second_dispatch_authorized: false,
  external_read_request_count_max: 2,
  worker_mutation_count: 0,
  pages_mutation_count: 0,
  route_mutation_count: 0,
  domain_mutation_count: 0,
  public: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
};
for (const [key, expected] of Object.entries(required)) {
  ok(binding?.[key] === expected, `EXECUTION_BINDING_FIELD_${key.toUpperCase()}`);
}
ok(Number.isInteger(binding.landing_pr_number) && binding.landing_pr_number > 0, 'EXECUTION_BINDING_PR_NUMBER');
ok(/^[0-9a-f]{40}$/.test(String(binding.landing_exact_head_sha || '')), 'EXECUTION_BINDING_HEAD_SHA');
ok(bindingComment?.user?.login === 'johnkim9524-collab', 'EXECUTION_BINDING_OWNER');
ok(bindingComment?.author_association === 'OWNER', 'EXECUTION_BINDING_ASSOCIATION');
ok(bindingComment?.created_at === bindingComment?.updated_at, 'EXECUTION_BINDING_EDITED');
ok(bindingComment?.performed_via_github_app?.slug === 'chatgpt-codex-connector', 'EXECUTION_BINDING_APP');
const now = Date.now();
const expiry = Date.parse(EXPIRES_AT);
const bindingCreated = Date.parse(String(bindingComment.created_at || ''));
ok(Number.isFinite(expiry) && Number.isFinite(bindingCreated), 'EXECUTION_BINDING_TIME');
ok(now <= expiry && bindingCreated <= expiry, 'EXECUTION_BINDING_EXPIRED');

const pr = await getJson(`${api}/repos/${repo}/pulls/${binding.landing_pr_number}`);
ok(pr?.base?.ref === 'main', 'EXECUTION_BINDING_PR_BASE');
ok(pr?.head?.sha === binding.landing_exact_head_sha, 'EXECUTION_BINDING_PR_HEAD');
ok(pr?.merged_at, 'EXECUTION_BINDING_PR_NOT_MERGED');
ok(pr?.merge_commit_sha === runtimeSha, 'EXECUTION_BINDING_PR_NOT_MERGED_TO_RUNTIME_MAIN');

const issuanceMain = auth.issuance_binding.protected_main_sha_at_receipt_issuance;
const comparison = await getJson(`${api}/repos/${repo}/compare/${issuanceMain}...${binding.landing_exact_head_sha}`);
ok(comparison?.merge_base_commit?.sha === issuanceMain, 'EXECUTION_BINDING_HEAD_MERGE_BASE_DRIFT');
ok(['ahead', 'identical'].includes(comparison?.status), 'EXECUTION_BINDING_HEAD_NOT_DESCENDED_FROM_ISSUANCE_MAIN');

let ledger = null;
for (let observation = 1; observation <= 10; observation += 1) {
  const candidate = await getJson(`${api}/repos/${repo}/actions/workflows/kidults-cloudflare-credential-identity-preflight-v2.yml/runs?event=workflow_dispatch&branch=main&per_page=100`);
  const only = Array.isArray(candidate?.workflow_runs) ? candidate.workflow_runs : [];
  if (candidate?.total_count > 1) fail('V2_PREFLIGHT_ONE_SHOT_REPLAY_OR_CONCURRENT_DISPATCH_FORBIDDEN');
  if (
    candidate?.total_count === 1
    && only.length === 1
    && only[0]?.id === Number(process.env.GITHUB_RUN_ID)
    && only[0]?.run_attempt === 1
    && only[0]?.event === 'workflow_dispatch'
    && only[0]?.head_branch === 'main'
    && only[0]?.head_sha === runtimeSha
  ) {
    ledger = candidate;
    break;
  }
  await sleep(3000);
}
ok(ledger, 'V2_PREFLIGHT_UNIQUE_FIRST_DISPATCH_NOT_PROVEN');

const updated = {
  ...receipt,
  state: 'AUTHORIZATION_CONSUMED_EXTERNAL_READ_NOT_STARTED',
  root_approval_verified: true,
  post_landing_binding_verified: true,
  unique_first_dispatch_verified: true,
  authorization_consumed: true,
  execution_binding: {
    ...binding,
    binding_comment_id: bindingComment.id,
    binding_comment_node_id: bindingComment.node_id,
    binding_comment_created_at: bindingComment.created_at,
    landing_merged_at: pr.merged_at,
  },
  dispatch_ledger: {
    state: 'UNIQUE_FIRST_V2_PREFLIGHT_MAIN_DISPATCH_VERIFIED',
    run_id: Number(process.env.GITHUB_RUN_ID),
    run_attempt: 1,
    event: 'workflow_dispatch',
    head_branch: 'main',
    head_sha: runtimeSha,
    total_count: 1,
  },
};
const temporary = `${receiptPath}.tmp`;
fs.writeFileSync(temporary, `${JSON.stringify(updated, null, 2)}\n`);
fs.renameSync(temporary, receiptPath);

console.log(JSON.stringify({
  state: updated.state,
  approval_id: APPROVAL_ID,
  root_approval_verified: true,
  post_landing_binding_verified: true,
  authorization_consumed: true,
  unique_first_dispatch_verified: true,
  external_read_request_count: 0,
}, null, 2));
