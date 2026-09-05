#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ISSUE_NUMBER = 1809;
const WORKFLOW_PATH = '.github/workflows/kidults-cloudflare-estate-inventory-v1.yml';
const ENVIRONMENT = 'kidults-cloudflare-staging-deploy';
const MAX_REQUESTS = 25;
const SHA40 = /^[0-9a-f]{40}$/;
const NONCE = /^[0-9a-f]{48}$/;
const APPROVAL_ID = /^CF-CLOUDFLARE-ESTATE-INVENTORY-[0-9]{8}-[0-9]{2}$/;

const outputPath = process.argv[2];
if (!outputPath) throw new Error('ESTATE_APPROVAL_RECEIPT_PATH_REQUIRED');
fs.mkdirSync(path.dirname(outputPath), {recursive: true});

const write = (value) => {
  const temporary = `${outputPath}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {mode: 0o600});
  fs.renameSync(temporary, outputPath);
};
const digest = value => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const fail = (code, detail = null) => {
  const error = new Error(code);
  error.code = code;
  error.detail = detail;
  throw error;
};
const requireValue = (condition, code, detail = null) => {
  if (!condition) fail(code, detail);
};

const initial = {
  id: 'kidults-cloudflare-estate-inventory-approval-receipt-v1',
  state: 'PREAUTHORIZATION_PENDING',
  repository: process.env.GITHUB_REPOSITORY || null,
  workflow_run_id: Number(process.env.GITHUB_RUN_ID || 0) || null,
  workflow_run_attempt: Number(process.env.GITHUB_RUN_ATTEMPT || 0) || null,
  source_ref: process.env.GITHUB_REF || null,
  source_sha: process.env.GITHUB_SHA || null,
  issue_number: Number(process.env.APPROVAL_ISSUE_NUMBER || 0) || null,
  comment_id: Number(process.env.APPROVAL_COMMENT_ID || 0) || null,
  authorization_consumed: false,
  unique_created_comment_event_verified: false,
  provider_secret_resolution_started: false,
  cloudflare_request_count: 0,
  mutation_count: 0,
  public: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
};
write(initial);

async function publicGitHubGet(endpoint) {
  const response = await fetch(`${process.env.GITHUB_API_URL || 'https://api.github.com'}${endpoint}`, {
    method: 'GET',
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'kidults-cloudflare-estate-inventory-public-fail-closed-v1',
    },
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) fail(`PUBLIC_GITHUB_READ_HTTP_${response.status}`, endpoint);
  return response.json();
}

function parseBody(body) {
  requireValue(typeof body === 'string' && body.length > 0, 'APPROVAL_BODY_MISSING');
  const lines = body.replace(/\r\n/g, '\n').split('\n').map(line => line.trim()).filter(Boolean);
  const approvalId = lines[0] || '';
  requireValue(APPROVAL_ID.test(approvalId), 'APPROVAL_ID_INVALID');
  const fields = {};
  for (const line of lines.slice(1)) {
    const index = line.indexOf('=');
    requireValue(index > 0, 'APPROVAL_FIELD_FORMAT_INVALID');
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    requireValue(key && value && !(key in fields), 'APPROVAL_FIELD_DUPLICATE_OR_EMPTY', key);
    fields[key] = value;
  }
  return {approvalId, fields};
}

try {
  const repository = process.env.GITHUB_REPOSITORY || '';
  const sourceSha = process.env.GITHUB_SHA || '';
  const commentId = Number(process.env.APPROVAL_COMMENT_ID || 0);
  const issueNumber = Number(process.env.APPROVAL_ISSUE_NUMBER || 0);
  const runId = Number(process.env.GITHUB_RUN_ID || 0);
  const runAttempt = Number(process.env.GITHUB_RUN_ATTEMPT || 0);
  const body = process.env.APPROVAL_BODY || '';
  const eventAction = process.env.APPROVAL_EVENT_ACTION || '';
  const eventCreatedAt = process.env.APPROVAL_COMMENT_CREATED_AT || '';
  const eventUpdatedAt = process.env.APPROVAL_COMMENT_UPDATED_AT || '';
  const eventAuthor = process.env.APPROVAL_AUTHOR || '';
  const eventAssociation = process.env.APPROVAL_AUTHOR_ASSOCIATION || '';

  requireValue(process.env.GITHUB_EVENT_NAME === 'issue_comment', 'EVENT_NOT_ISSUE_COMMENT');
  requireValue(eventAction === 'created', 'COMMENT_EVENT_NOT_CREATED');
  requireValue(repository === 'johnkim9524-collab/kaios_enterprise_repo', 'REPOSITORY_MISMATCH');
  requireValue(process.env.GITHUB_REF === 'refs/heads/main', 'SOURCE_REF_NOT_MAIN');
  requireValue(SHA40.test(sourceSha), 'SOURCE_SHA_INVALID');
  requireValue(runAttempt === 1, 'RERUN_FORBIDDEN');
  requireValue(Number.isInteger(runId) && runId > 0, 'WORKFLOW_RUN_ID_INVALID');
  requireValue(issueNumber === ISSUE_NUMBER, 'APPROVAL_ISSUE_MISMATCH');
  requireValue(Number.isInteger(commentId) && commentId > 0, 'APPROVAL_COMMENT_ID_INVALID');
  requireValue(eventAuthor === 'johnkim9524-collab', 'PROGRAM_OWNER_REQUIRED');
  requireValue(eventAssociation === 'OWNER', 'PROGRAM_OWNER_ASSOCIATION_REQUIRED');
  requireValue(eventCreatedAt && eventCreatedAt === eventUpdatedAt, 'EDITED_APPROVAL_COMMENT_FORBIDDEN');

  const rootComment = await publicGitHubGet(`/repos/${repository}/issues/comments/${commentId}`);
  requireValue(rootComment?.id === commentId, 'APPROVAL_COMMENT_ID_MISMATCH');
  requireValue(rootComment?.issue_url === `${process.env.GITHUB_API_URL || 'https://api.github.com'}/repos/${repository}/issues/${ISSUE_NUMBER}`, 'APPROVAL_COMMENT_ISSUE_MISMATCH');
  requireValue(rootComment?.user?.login === eventAuthor, 'CANONICAL_COMMENT_OWNER_MISMATCH');
  requireValue(rootComment?.author_association === 'OWNER', 'CANONICAL_COMMENT_ASSOCIATION_INVALID');
  requireValue(rootComment?.created_at === eventCreatedAt && rootComment?.updated_at === eventUpdatedAt, 'CANONICAL_COMMENT_TIME_MISMATCH');
  requireValue(String(rootComment?.body || '') === body, 'CANONICAL_COMMENT_BODY_MISMATCH');

  const {approvalId, fields} = parseBody(body);
  const exactKeys = [
    'state', 'protected_main_sha', 'workflow', 'environment',
    'max_cloudflare_get_requests', 'worker_mutation_count', 'pages_mutation_count',
    'route_mutation_count', 'domain_mutation_count', 'deployment_mutation_count',
    'secret_output_allowed', 'raw_provider_response_persistence_allowed',
    'rerun_authorized', 'replay_authorized', 'second_execution_authorized',
    'expires_at', 'nonce',
  ];
  requireValue(Object.keys(fields).sort().join('|') === [...exactKeys].sort().join('|'), 'APPROVAL_FIELD_SET_INVALID');
  requireValue(fields.state === 'APPROVED_ONE_SHOT_READ_ONLY', 'APPROVAL_STATE_INVALID');
  requireValue(fields.protected_main_sha === sourceSha, 'APPROVAL_MAIN_NOT_EVENT_MAIN');
  requireValue(fields.workflow === WORKFLOW_PATH, 'APPROVAL_WORKFLOW_MISMATCH');
  requireValue(fields.environment === ENVIRONMENT, 'APPROVAL_ENVIRONMENT_MISMATCH');
  requireValue(Number(fields.max_cloudflare_get_requests) === MAX_REQUESTS, 'APPROVAL_REQUEST_CEILING_MISMATCH');
  for (const key of ['worker_mutation_count','pages_mutation_count','route_mutation_count','domain_mutation_count','deployment_mutation_count']) {
    requireValue(fields[key] === '0', `APPROVAL_MUTATION_NOT_ZERO:${key}`);
  }
  requireValue(fields.secret_output_allowed === 'false', 'SECRET_OUTPUT_NOT_FORBIDDEN');
  requireValue(fields.raw_provider_response_persistence_allowed === 'false', 'RAW_RESPONSE_PERSISTENCE_NOT_FORBIDDEN');
  requireValue(fields.rerun_authorized === 'false', 'RERUN_NOT_FORBIDDEN');
  requireValue(fields.replay_authorized === 'false', 'REPLAY_NOT_FORBIDDEN');
  requireValue(fields.second_execution_authorized === 'false', 'SECOND_EXECUTION_NOT_FORBIDDEN');
  requireValue(NONCE.test(fields.nonce), 'NONCE_INVALID');

  const expiry = Date.parse(fields.expires_at);
  const creation = Date.parse(eventCreatedAt);
  const now = Date.now();
  requireValue(Number.isFinite(expiry) && Number.isFinite(creation), 'APPROVAL_TIME_INVALID');
  requireValue(expiry > creation && expiry - creation <= 24 * 60 * 60 * 1000, 'APPROVAL_EXPIRY_WINDOW_INVALID');
  requireValue(now <= expiry, 'APPROVAL_EXPIRED');

  const liveMain = await publicGitHubGet(`/repos/${repository}/branches/main`);
  requireValue(liveMain?.commit?.sha === sourceSha, 'LIVE_MAIN_DRIFT_BEFORE_SECRET_RESOLUTION');

  const matching = [];
  for (let page = 1; page <= 5; page += 1) {
    const batch = await publicGitHubGet(`/repos/${repository}/issues/${ISSUE_NUMBER}/comments?per_page=100&page=${page}`);
    requireValue(Array.isArray(batch), 'ISSUE_COMMENTS_SHAPE_INVALID');
    for (const comment of batch) {
      const first = String(comment?.body || '').replace(/\r\n/g, '\n').split('\n')[0]?.trim();
      if (first === approvalId) matching.push(comment);
    }
    if (batch.length < 100) break;
    if (page === 5) fail('ISSUE_COMMENTS_PAGINATION_BOUND_EXCEEDED');
  }
  requireValue(matching.length === 1, `APPROVAL_ID_CARDINALITY_${matching.length}`);
  requireValue(matching[0]?.id === commentId, 'APPROVAL_EVENT_COMMENT_NOT_CANONICAL');

  const verified = {
    ...initial,
    state: 'AUTHORIZATION_CONSUMED_EXTERNAL_READ_NOT_STARTED',
    approval_id: approvalId,
    approval_comment_body_sha256: digest(Buffer.from(body, 'utf8')),
    approval_comment_created_at: eventCreatedAt,
    approved_protected_main_sha: sourceSha,
    workflow: WORKFLOW_PATH,
    environment: ENVIRONMENT,
    nonce_sha256: digest(Buffer.from(fields.nonce, 'utf8')),
    expires_at: fields.expires_at,
    max_cloudflare_get_requests: MAX_REQUESTS,
    authorization_consumed: true,
    unique_approval_comment_verified: true,
    unique_created_comment_event_verified: true,
    public_github_read_mode: 'UNAUTHENTICATED_PUBLIC_FAIL_CLOSED',
    live_main_verified_before_secret_resolution: true,
    rerun_authorized: false,
    replay_authorized: false,
    second_execution_authorized: false,
  };
  write(verified);
  console.log(JSON.stringify({
    state: verified.state,
    approval_id: approvalId,
    approved_protected_main_sha: sourceSha,
    max_cloudflare_get_requests: MAX_REQUESTS,
    authorization_consumed: true,
    unique_created_comment_event_verified: true,
    cloudflare_request_count: 0,
    mutation_count: 0,
  }, null, 2));
} catch (error) {
  write({
    ...initial,
    state: 'FAIL_CLOSED_PREAUTHORIZATION',
    failure_code: String(error?.code || error?.message || 'UNKNOWN_APPROVAL_FAILURE').slice(0, 160),
    failure_detail: error?.detail ? String(error.detail).slice(0, 160) : null,
  });
  throw error;
}
