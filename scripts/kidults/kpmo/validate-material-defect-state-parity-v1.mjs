#!/usr/bin/env node
import fs from 'node:fs';

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

export function declaredSeverityLabels(title) {
  const declared = new Set();
  for (const match of String(title || '').matchAll(/\[([^\]]+)\]/g)) {
    const parts = String(match[1] || '').split('/').map(x => x.trim()).filter(Boolean);
    if (parts.length && parts.every(x => x === 'P0' || x === 'P1')) {
      for (const part of parts) declared.add(part);
    }
  }
  return [...declared].sort();
}

function labels(issue) {
  return [...new Set((issue?.labels || []).map(x => typeof x === 'string' ? x : x?.name).filter(Boolean))].sort();
}

function materialPriorities(issue) {
  return [...new Set([
    ...declaredSeverityLabels(issue?.title),
    ...labels(issue).filter(x => x === 'P0' || x === 'P1')
  ])].sort();
}

export function severityFailures(issue) {
  const declared = new Set(declaredSeverityLabels(issue?.title));
  const actual = new Set(labels(issue));
  const failures = [];
  for (const severity of declared) {
    if (!actual.has(severity)) failures.push(`#${issue.number}:${severity}_TITLE_WITHOUT_${severity}_LABEL`);
  }
  if (declared.size === 1 && declared.has('P0') && actual.has('P1')) failures.push(`#${issue.number}:P1_LABEL_WITH_P0_ONLY_TITLE`);
  if (declared.size === 1 && declared.has('P1') && actual.has('P0')) failures.push(`#${issue.number}:P0_LABEL_WITH_P1_ONLY_TITLE`);
  return failures;
}

export function latestStructuredState(body) {
  const matches = [...String(body || '').matchAll(/^\s*(?:\*\*)?State:(?:\*\*)?\s*`?\s*(P0|P1)\s+(OPEN|CLOSED)\b/igm)];
  if (!matches.length) return null;
  const last = matches.at(-1);
  return { severity: String(last[1]).toUpperCase(), state: String(last[2]).toUpperCase() };
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
  const failures = severityFailures(issue);
  const bodyMarker = latestStructuredState(issue?.body);
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
  const missingLabel = { ...base, title: '[P1] missing label', labels: [] };
  if (!closedIssueCommentFailures(base, selfOpen).some(x => x.includes('POST_CLOSE_SELF_REMAINS_OPEN'))) throw new Error('SELF_OPEN_NOT_REJECTED');
  if (closedIssueCommentFailures(base, siblingOpen).length) throw new Error('SIBLING_OPEN_FALSE_POSITIVE');
  if (closedIssueCommentFailures(base, successor).length) throw new Error('SUCCESSOR_RECURRENCE_FALSE_POSITIVE');
  if (closedIssueCommentFailures(bodyClosed, selfOpen).length) throw new Error('TERMINAL_BODY_CLOSED_NOT_AUTHORITATIVE');
  if (!closeEventFailures(badClose).some(x => x.includes('GITHUB_CLOSE_WITH_AUTHORITATIVE_P1_OPEN'))) throw new Error('FUTURE_CLOSE_OPEN_NOT_REJECTED');
  if (!severityFailures(missingLabel).some(x => x.includes('P1_TITLE_WITHOUT_P1_LABEL'))) throw new Error('CLOSED_SEVERITY_DRIFT_NOT_REJECTED');
  console.log(JSON.stringify({
    test: 'MATERIAL_DEFECT_STATE_PARITY_V1_SELF_TEST',
    state: 'VERIFIED_PASS',
    future_close_terminal_state_required: true,
    self_specific_post_close_open_rejected: true,
    sibling_open_ignored: true,
    successor_recurrence_ignored: true,
    terminal_body_closed_wins: true,
    closed_title_label_parity_checked: true
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
    let waitMs = Number.isFinite(retryAfter) && retryAfter > 0
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

  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const queries = [
    [`repo:${repository} is:issue is:closed updated:>=${cutoff} label:P0,P1`, 'recent-closed-labeled'],
    [`repo:${repository} is:issue is:closed updated:>=${cutoff} "[P0]" in:title`, 'recent-closed-title-p0'],
    [`repo:${repository} is:issue is:closed updated:>=${cutoff} "[P1]" in:title`, 'recent-closed-title-p1']
  ];
  const byNumber = new Map();
  for (const [query, key] of queries) {
    for (const issue of await completeSearch(query, key)) byNumber.set(issue.number, issue);
  }

  const failures = [];
  let commentAudited = 0;
  for (const issue of [...byNumber.values()].sort((a, b) => a.number - b.number)) {
    failures.push(...severityFailures(issue));
    const bodyMarker = latestStructuredState(issue.body);
    if (bodyMarker?.state === 'CLOSED') continue;
    const closedAt = Date.parse(issue.closed_at || '');
    const updatedAt = Date.parse(issue.updated_at || '');
    if (!Number.isFinite(closedAt) || !Number.isFinite(updatedAt)) {
      failures.push(`#${issue.number}:INVALID_CLOSED_OR_UPDATED_AT`);
      continue;
    }
    if (updatedAt <= closedAt + GRACE_MS || Number(issue.comments || 0) === 0) continue;
    const comments = await commentsFor(issue);
    commentAudited += 1;
    failures.push(...closedIssueCommentFailures(issue, comments));
  }
  if (failures.length) fail(`MATERIAL_DEFECT_STATE_PARITY:${[...new Set(failures)].join(',')}`);

  console.log(JSON.stringify({
    validator: 'MATERIAL_DEFECT_STATE_PARITY_V1',
    state: 'VERIFIED_PASS',
    recent_closed_candidate_count: byNumber.size,
    comment_audited_issue_count: commentAudited,
    lookback_days: 7,
    future_close_terminal_state_required: true,
    issue_comment_closed_state_guard: true,
    self_specific_post_close_open_guard: true,
    closed_title_label_parity_checked: true,
    promotion_eligible: false,
    production: 'HOLD',
    public: 'HOLD',
    g5: 'HOLD'
  }, null, 2));
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
