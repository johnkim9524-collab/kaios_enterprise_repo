#!/usr/bin/env node
import fs from 'node:fs';
import {
  MATERIAL_PRIORITY_LABELS,
  declaredSeverityLabels,
  normalizedLabels,
  parityFailures as canonicalParityFailures
} from './material-defect-registry-v3.mjs';

function fail(message) {
  console.error(JSON.stringify({
    state: 'VERIFIED_FAIL',
    failure_class: 'MATERIAL_DEFECT_STATE_PARITY',
    message,
    promotion_eligible: false,
    production: 'HOLD',
    public: 'HOLD',
    g5: 'HOLD'
  }, null, 2));
  process.exit(1);
}

function materialPriorities(issue) {
  return [...new Set([
    ...declaredSeverityLabels(issue?.title),
    ...normalizedLabels(issue).filter(label => MATERIAL_PRIORITY_LABELS.includes(label))
  ])].sort();
}

export function severityFailures(issue) {
  return canonicalParityFailures(issue);
}

export function latestStructuredState(body) {
  const matches = [...String(body || '').matchAll(/^\s*(?:\*\*)?State:(?:\*\*)?\s*`?\s*(P0|P1)\s+(OPEN|CLOSED)\b/igm)];
  if (!matches.length) return null;
  const last = matches.at(-1);
  return { severity: String(last[1]).toUpperCase(), state: String(last[2]).toUpperCase() };
}

export function closedBodyStateFailures(issue) {
  if (!materialPriorities(issue).length || String(issue?.state || '').toLowerCase() !== 'closed') return [];
  const marker = latestStructuredState(issue?.body);
  if (marker?.state === 'OPEN') return [`#${issue.number}:GITHUB_CLOSED_WITH_AUTHORITATIVE_${marker.severity}_OPEN`];
  return [];
}

function escaped(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function selfOpenMarker(body, issueNumber) {
  const text = String(body || '');
  const structured = latestStructuredState(text);
  if (structured?.state === 'OPEN') return `STRUCTURED_${structured.severity}_OPEN`;
  const compact = text.replace(/\s+/g, ' ');
  const n = escaped(issueNumber);
  if (new RegExp(`#${n}\\b.{0,160}\\b(?:remains?|must\\s+remain)\\s+OPEN\\b`, 'i').test(compact)) return 'SELF_REMAINS_OPEN';
  if (new RegExp(`(?:does\\s+not|did\\s+not)\\s+close\\s+#${n}\\b`, 'i').test(compact)) return 'SELF_NOT_CLOSED';
  return null;
}

const GRACE_MS = 60_000;
const RECENT_COMMENT_LOOKBACK_DAYS = 7;

export function closeEventFailures(issue) {
  if (!materialPriorities(issue).length) return [];
  const failures = severityFailures(issue);
  const marker = latestStructuredState(issue?.body);
  if (!marker) failures.push(`#${issue.number}:MATERIAL_CLOSE_WITHOUT_STRUCTURED_TERMINAL_STATE`);
  else if (marker.state !== 'CLOSED') failures.push(`#${issue.number}:GITHUB_CLOSE_WITH_AUTHORITATIVE_${marker.severity}_${marker.state}`);
  return failures;
}

export function closedIssueCommentFailures(issue, comments) {
  if (!materialPriorities(issue).length || String(issue?.state || '').toLowerCase() !== 'closed') return [];
  const failures = [];
  const bodyMarker = latestStructuredState(issue?.body);
  if (bodyMarker?.state === 'OPEN') failures.push(`#${issue.number}:GITHUB_CLOSED_WITH_AUTHORITATIVE_${bodyMarker.severity}_OPEN`);
  if (bodyMarker?.state === 'CLOSED') return failures;
  const closedAt = Date.parse(issue?.closed_at || '');
  if (!Number.isFinite(closedAt)) return [...failures, `#${issue.number}:CLOSED_MATERIAL_WITHOUT_CLOSED_AT`];
  for (const comment of comments || []) {
    const createdAt = Date.parse(comment?.created_at || '');
    if (!Number.isFinite(createdAt) || createdAt <= closedAt + GRACE_MS) continue;
    const marker = selfOpenMarker(comment?.body, issue.number);
    if (marker) failures.push(`#${issue.number}:POST_CLOSE_${marker}:COMMENT_${comment?.id || 'UNKNOWN'}`);
  }
  return failures;
}

function selfTest() {
  const base = { number: 10, state: 'closed', closed_at: '2026-09-01T00:00:00Z', title: '[P1] test', labels: [{ name: 'P1' }], body: 'historical body without terminal marker' };
  const selfOpen = [{ id: 1, created_at: '2026-09-01T00:02:00Z', body: '#10 remains OPEN pending exact-main canary.' }];
  const siblingOpen = [{ id: 2, created_at: '2026-09-01T00:02:00Z', body: '#99 remains OPEN; #10 was closed as superseded.' }];
  const successor = [{ id: 3, created_at: '2026-09-01T00:02:00Z', body: '#20 is a natural recurrence of this historical class.' }];
  const bodyClosed = { ...base, body: '**State:** `P1 CLOSED / verified`' };
  const badClose = { ...base, body: '**State:** `P1 OPEN / HOLD`' };
  const precedence = { ...base, body: '**State:** `P1 OPEN / historical`\n\n**State:** `P1 CLOSED / latest`' };
  const missingLabel = { ...base, title: '[P1] missing label', labels: [] };
  const prefixOpen = { ...base, number: 11, title: 'P1: prefix material', labels: [{ name: 'P1' }], body: '**State:** `P1 OPEN / HOLD`' };
  const support = { ...base, number: 12, title: '[P0-SUPPORT] support only', labels: [], body: '**State:** `P0 OPEN / support`' };
  if (!closedIssueCommentFailures(base, selfOpen).some(x => x.includes('POST_CLOSE_SELF_REMAINS_OPEN'))) throw new Error('SELF_OPEN_NOT_REJECTED');
  if (closedIssueCommentFailures(base, siblingOpen).length) throw new Error('SIBLING_OPEN_FALSE_POSITIVE');
  if (closedIssueCommentFailures(base, successor).length) throw new Error('SUCCESSOR_RECURRENCE_FALSE_POSITIVE');
  if (closedIssueCommentFailures(bodyClosed, selfOpen).length) throw new Error('TERMINAL_BODY_CLOSED_NOT_AUTHORITATIVE');
  if (!closeEventFailures(badClose).some(x => x.includes('GITHUB_CLOSE_WITH_AUTHORITATIVE_P1_OPEN'))) throw new Error('FUTURE_CLOSE_OPEN_NOT_REJECTED');
  if (!closedBodyStateFailures(badClose).some(x => x.includes('GITHUB_CLOSED_WITH_AUTHORITATIVE_P1_OPEN'))) throw new Error('CLOSED_OPEN_STATE_NOT_REJECTED');
  if (closedBodyStateFailures(bodyClosed).length) throw new Error('CLOSED_CLOSED_STATE_REJECTED');
  if (closedBodyStateFailures(precedence).length) throw new Error('LATEST_STRUCTURED_STATE_PRECEDENCE_BROKEN');
  if (!closedBodyStateFailures(prefixOpen).length) throw new Error('STRICT_PREFIX_MATERIAL_STATE_LOST');
  if (closedBodyStateFailures(support).length) throw new Error('SUPPORT_ALIAS_FALSE_MATERIAL');
  if (!severityFailures(missingLabel).some(x => x.includes('P1_TITLE_WITHOUT_P1_LABEL'))) throw new Error('OPEN_SEVERITY_DRIFT_NOT_REJECTED');
  console.log(JSON.stringify({
    test: 'MATERIAL_DEFECT_STATE_PARITY_V1_SELF_TEST',
    state: 'VERIFIED_PASS',
    canonical_parser_shared: true,
    canonical_severity_parity_shared: true,
    future_close_terminal_state_required: true,
    complete_closed_body_open_state_rejected: true,
    strict_prefix_material_supported: true,
    latest_marker_precedence: true,
    self_specific_post_close_open_rejected: true,
    sibling_open_ignored: true,
    successor_recurrence_ignored: true,
    terminal_body_closed_wins: true,
    support_alias_excluded: true
  }));
}

if (process.argv.includes('--self-test')) {
  try { selfTest(); } catch (error) { fail(error instanceof Error ? error.message : String(error)); }
  process.exit(0);
}

const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
if (!repository || !token) fail('REPOSITORY_OR_TOKEN_MISSING');

const headers = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'X-GitHub-Api-Version': '2022-11-28'
};

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
async function get(url) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
    const text = await response.text();
    if (response.ok) return JSON.parse(text);
    const retryAfter = Number(response.headers.get('retry-after'));
    const reset = Number(response.headers.get('x-ratelimit-reset'));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000 + 1000
      : Number.isFinite(reset) && reset > 0 ? Math.max(0, reset * 1000 - Date.now() + 1500) : 0;
    if ((response.status === 403 || response.status === 429) && attempt < 2 && waitMs > 0 && waitMs <= 75_000) {
      await sleep(waitMs);
      continue;
    }
    throw new Error(`GITHUB_HTTP_${response.status}:${text.slice(0, 300)}`);
  }
  throw new Error('GITHUB_RETRY_EXHAUSTED');
}

async function completeSearch(query, key) {
  const out = [];
  let total = null;
  for (let page = 1; page <= 10; page += 1) {
    const data = await get(`https://api.github.com/search/issues?q=${encodeURIComponent(query)}&sort=updated&order=desc&per_page=100&page=${page}`);
    if (data.incomplete_results !== false) throw new Error(`INCOMPLETE_RESULTS:${key}:page=${page}`);
    if (!Number.isInteger(data.total_count) || data.total_count < 0 || data.total_count > 1000) throw new Error(`INVALID_TOTAL:${key}:${data.total_count}`);
    if (total === null) total = data.total_count;
    if (total !== data.total_count) throw new Error(`CARDINALITY_MOVED:${key}:${total}->${data.total_count}`);
    if (!Array.isArray(data.items)) throw new Error(`INVALID_ITEMS:${key}:page=${page}`);
    out.push(...data.items);
    if (out.length >= total) break;
    if (!data.items.length || page === 10) throw new Error(`PAGINATION_TRUNCATED:${key}:${out.length}/${total}`);
  }
  if (out.length !== total) throw new Error(`CARDINALITY_MISMATCH:${key}:${out.length}/${total}`);
  const numbers = out.map(issue => issue?.number);
  if (numbers.some(number => !Number.isInteger(number) || number < 1)) throw new Error(`INVALID_ISSUE_NUMBER:${key}`);
  if (new Set(numbers).size !== numbers.length) throw new Error(`DUPLICATE_ISSUE_NUMBER:${key}`);
  return out;
}

async function commentsFor(issue) {
  const expected = Number(issue.comments || 0);
  if (!Number.isInteger(expected) || expected < 0 || expected > 1000) throw new Error(`INVALID_COMMENT_TOTAL:#${issue.number}:${issue.comments}`);
  if (!expected) return [];
  const out = [];
  for (let page = 1; page <= 10; page += 1) {
    const data = await get(`https://api.github.com/repos/${repository}/issues/${issue.number}/comments?per_page=100&page=${page}`);
    if (!Array.isArray(data)) throw new Error(`INVALID_COMMENTS:#${issue.number}:page=${page}`);
    out.push(...data);
    if (out.length >= expected) break;
    if (!data.length || page === 10) throw new Error(`COMMENT_PAGINATION_TRUNCATED:#${issue.number}:${out.length}/${expected}`);
  }
  if (out.length !== expected) throw new Error(`COMMENT_CARDINALITY_MOVED:#${issue.number}:${out.length}/${expected}`);
  return out;
}

function eventPayload() {
  if (!process.env.GITHUB_EVENT_PATH) return null;
  return JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
}

try {
  const payload = eventPayload();
  if (process.env.GITHUB_EVENT_NAME === 'issues' && payload?.action === 'closed' && payload?.issue && !payload.issue.pull_request) {
    const failures = closeEventFailures(payload.issue);
    if (failures.length) fail(`MATERIAL_DEFECT_CLOSE_EVENT_PARITY:${failures.join(',')}`);
  }
  if (process.env.GITHUB_EVENT_NAME === 'issue_comment' && payload?.issue && !payload.issue.pull_request && String(payload.issue.state).toLowerCase() === 'closed') {
    const failures = closedIssueCommentFailures(payload.issue, [{ ...payload.comment, created_at: payload.comment?.created_at || payload.comment?.updated_at }]);
    if (failures.length) fail(`MATERIAL_DEFECT_COMMENT_STATE_PARITY:${failures.join(',')}`);
  }

  const closedQueries = [
    [`repo:${repository} is:issue is:closed label:P0`, 'closed-label-p0'],
    [`repo:${repository} is:issue is:closed label:P1`, 'closed-label-p1'],
    [`repo:${repository} is:issue is:closed "[P0]" in:title`, 'closed-title-p0'],
    [`repo:${repository} is:issue is:closed "[P1]" in:title`, 'closed-title-p1'],
    [`repo:${repository} is:issue is:closed "P0:" in:title`, 'closed-prefix-p0'],
    [`repo:${repository} is:issue is:closed "P1:" in:title`, 'closed-prefix-p1']
  ];
  const byNumber = new Map();
  for (const [query, key] of closedQueries) {
    for (const issue of await completeSearch(query, key)) if (materialPriorities(issue).length) byNumber.set(issue.number, issue);
  }

  const failures = [];
  for (const issue of [...byNumber.values()].sort((a, b) => a.number - b.number)) failures.push(...closedBodyStateFailures(issue));

  const recentCutoff = Date.now() - RECENT_COMMENT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  let commentAudited = 0;
  for (const issue of [...byNumber.values()].sort((a, b) => a.number - b.number)) {
    const bodyMarker = latestStructuredState(issue.body);
    if (bodyMarker?.state === 'CLOSED') continue;
    const closedAt = Date.parse(issue.closed_at || '');
    const updatedAt = Date.parse(issue.updated_at || '');
    if (!Number.isFinite(closedAt) || !Number.isFinite(updatedAt)) {
      failures.push(`#${issue.number}:INVALID_CLOSED_OR_UPDATED_AT`);
      continue;
    }
    if (updatedAt < recentCutoff || updatedAt <= closedAt + GRACE_MS || Number(issue.comments || 0) === 0) continue;
    const comments = await commentsFor(issue);
    commentAudited += 1;
    failures.push(...closedIssueCommentFailures(issue, comments));
  }

  if (failures.length) fail(`MATERIAL_DEFECT_STATE_PARITY:${[...new Set(failures)].join(',')}`);

  console.log(JSON.stringify({
    validator: 'MATERIAL_DEFECT_STATE_PARITY_V1',
    state: 'VERIFIED_PASS',
    canonical_parser_shared: true,
    canonical_severity_parity_shared: true,
    complete_closed_material_candidate_count: byNumber.size,
    complete_closed_material_candidate_scan: true,
    closed_body_open_state_fail_closed: true,
    recent_comment_audited_issue_count: commentAudited,
    recent_comment_lookback_days: RECENT_COMMENT_LOOKBACK_DAYS,
    future_close_terminal_state_required: true,
    issue_comment_closed_state_guard: true,
    strict_title_prefix_supported: true,
    support_alias_excluded: true,
    promotion_eligible: false,
    production: 'HOLD',
    public: 'HOLD',
    g5: 'HOLD'
  }, null, 2));
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
