#!/usr/bin/env node
import crypto from 'node:crypto';

function fail(message) {
  console.error(JSON.stringify({
    state: 'VERIFIED_FAIL',
    failure_class: 'MATERIAL_DEFECT_SEVERITY_PARITY',
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
  const text = String(title || '');
  for (const match of text.matchAll(/\[([^\]]+)\]/g)) {
    const parts = String(match[1] || '').split('/').map(part => part.trim()).filter(Boolean);
    if (parts.length === 0 || !parts.every(part => part === 'P0' || part === 'P1')) continue;
    for (const part of parts) declared.add(part);
  }
  return [...declared].sort();
}

function normalizedLabels(issue) {
  return [...new Set((issue.labels || []).map(label => typeof label === 'string' ? label : label?.name).filter(Boolean))].sort();
}

export function parityFailures(issue) {
  const declared = new Set(declaredSeverityLabels(issue.title));
  const labels = new Set(normalizedLabels(issue));
  const failures = [];
  for (const severity of declared) {
    if (!labels.has(severity)) failures.push(`#${issue.number}:${severity}_TITLE_WITHOUT_${severity}_LABEL`);
  }
  if (declared.size === 1 && declared.has('P0') && labels.has('P1')) failures.push(`#${issue.number}:P1_LABEL_WITH_P0_ONLY_TITLE`);
  if (declared.size === 1 && declared.has('P1') && labels.has('P0')) failures.push(`#${issue.number}:P0_LABEL_WITH_P1_ONLY_TITLE`);
  return failures;
}

export function latestStructuredMaterialState(body) {
  const text = String(body || '');
  const matches = [...text.matchAll(/^\s*(?:\*\*)?State:(?:\*\*)?\s*`?\s*(P0|P1)\s+(OPEN|CLOSED)\b/igm)];
  if (!matches.length) return null;
  const last = matches.at(-1);
  return { severity: String(last[1]).toUpperCase(), state: String(last[2]).toUpperCase() };
}

function effectiveMaterialPriorities(issue) {
  const declared = declaredSeverityLabels(issue.title);
  const labels = normalizedLabels(issue).filter(label => label === 'P0' || label === 'P1');
  return [...new Set([...declared, ...labels])].sort();
}

export function stateParityFailures(issue) {
  const priorities = effectiveMaterialPriorities(issue);
  if (!priorities.length) return [];
  const marker = latestStructuredMaterialState(issue.body);
  if (!marker) return [];
  const githubState = String(issue.state || '').toLowerCase();
  const failures = [];
  if (!priorities.includes(marker.severity)) {
    failures.push(`#${issue.number}:AUTHORITATIVE_${marker.severity}_STATE_WITHOUT_${marker.severity}_MATERIAL_METADATA`);
  }
  if (githubState === 'closed' && marker.state === 'OPEN') {
    failures.push(`#${issue.number}:GITHUB_CLOSED_WITH_AUTHORITATIVE_${marker.severity}_OPEN`);
  }
  if (githubState === 'open' && marker.state === 'CLOSED') {
    failures.push(`#${issue.number}:GITHUB_OPEN_WITH_AUTHORITATIVE_${marker.severity}_CLOSED`);
  }
  return failures;
}

export function materialRecord(issue) {
  const declared = declaredSeverityLabels(issue.title);
  const labels = normalizedLabels(issue);
  const priorities = [...new Set([...declared, ...labels.filter(label => label === 'P0' || label === 'P1')])].sort();
  if (!Number.isInteger(issue.number) || String(issue.state || '').toLowerCase() !== 'open' || priorities.length === 0) return null;
  return {
    issue_number: issue.number,
    declared_severity: declared,
    labels,
    effective_priority: priorities.includes('P0') ? 'P0' : 'P1',
    title: String(issue.title || '').trim(),
    updated_at: issue.updated_at || null
  };
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(stableJson(value)).digest('hex')}`;
}

function selfTest() {
  const exactP0 = { number: 1, state: 'open', title: '[P0] exact', labels: [{ name: 'P0' }], body: '**State:** `P0 OPEN / HOLD`' };
  const combined = { number: 2, state: 'open', title: '[P0/P1][Portal] combined', labels: [{ name: 'P0' }, { name: 'P1' }], body: 'State: `P1 OPEN / HOLD`' };
  const missingCombined = { number: 3, state: 'open', title: '[P0/P1] missing P1', labels: [{ name: 'P0' }] };
  const support = { number: 4, state: 'open', title: '[P0-SUPPORT] support only', labels: [] };
  const labelOnly = { number: 5, state: 'open', title: 'material by authoritative label', labels: [{ name: 'P1' }] };
  const closedOpen = { number: 6, state: 'closed', title: '[P1] closed drift', labels: [{ name: 'P1' }], body: '**State:** `P1 OPEN / HOLD`' };
  const closedClosed = { number: 7, state: 'closed', title: '[P1] legitimate closure', labels: [{ name: 'P1' }], body: '**State:** `P1 OPEN / old`\ntext\n**State:** `P1 CLOSED / verified`' };
  const openClosed = { number: 8, state: 'open', title: '[P0] reopened stale body', labels: [{ name: 'P0' }], body: 'State: `P0 CLOSED / stale`' };
  if (parityFailures(exactP0).length) throw new Error('SELF_TEST_EXACT_P0_REJECTED');
  if (parityFailures(combined).length) throw new Error('SELF_TEST_COMBINED_REJECTED');
  if (!parityFailures(missingCombined).some(x => x.includes('P1_TITLE_WITHOUT_P1_LABEL'))) throw new Error('SELF_TEST_COMBINED_MISMATCH_NOT_REJECTED');
  if (declaredSeverityLabels(support.title).length !== 0) throw new Error('SELF_TEST_SUPPORT_ALIASING');
  if (parityFailures(support).length) throw new Error('SELF_TEST_SUPPORT_FALSE_MISMATCH');
  if (!materialRecord(labelOnly)) throw new Error('SELF_TEST_LABEL_ONLY_MATERIAL_LOST');
  if (materialRecord({ number: 9, state: 'open', title: 'ordinary issue', labels: [] })) throw new Error('SELF_TEST_ORDINARY_FALSE_MATERIAL');
  if (!stateParityFailures(closedOpen).some(x => x.includes('GITHUB_CLOSED_WITH_AUTHORITATIVE_P1_OPEN'))) throw new Error('SELF_TEST_CLOSED_OPEN_STATE_DRIFT_NOT_REJECTED');
  if (stateParityFailures(closedClosed).length) throw new Error('SELF_TEST_LATEST_CLOSED_STATE_REJECTED');
  if (!stateParityFailures(openClosed).some(x => x.includes('GITHUB_OPEN_WITH_AUTHORITATIVE_P0_CLOSED'))) throw new Error('SELF_TEST_OPEN_CLOSED_STATE_DRIFT_NOT_REJECTED');
  if (latestStructuredMaterialState(closedClosed.body)?.state !== 'CLOSED') throw new Error('SELF_TEST_LATEST_STATE_SELECTION_FAILED');
  console.log(JSON.stringify({
    test: 'MATERIAL_DEFECT_SEVERITY_PARITY_V2_SELF_TEST',
    state: 'VERIFIED_PASS',
    exact_marker: true,
    combined_marker_normalization: true,
    support_alias_excluded: true,
    label_only_authority_preserved: true,
    mismatch_fail_closed: true,
    closed_open_state_drift_rejected: true,
    open_closed_state_drift_rejected: true,
    latest_structured_state_wins: true
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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function get(url) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
    const text = await response.text();
    if (response.ok) return JSON.parse(text);

    const rateLimited = response.status === 403 || response.status === 429;
    const retryAfterSeconds = Number(response.headers.get('retry-after'));
    const resetEpochSeconds = Number(response.headers.get('x-ratelimit-reset'));
    let waitMs = 0;
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
      waitMs = retryAfterSeconds * 1000 + 1000;
    } else if (Number.isFinite(resetEpochSeconds) && resetEpochSeconds > 0) {
      waitMs = Math.max(0, resetEpochSeconds * 1000 - Date.now() + 1500);
    }
    if (rateLimited && attempt < 2 && waitMs > 0 && waitMs <= 75_000) {
      console.error(JSON.stringify({ state: 'RATE_LIMIT_BACKOFF', attempt: attempt + 1, wait_ms: waitMs }));
      await sleep(waitMs);
      continue;
    }
    throw new Error(`GITHUB_HTTP_${response.status}:${text.slice(0, 300)}`);
  }
  throw new Error('GITHUB_RATE_LIMIT_RETRY_EXHAUSTED');
}

async function fetchCompleteSearch(query, key) {
  const out = [];
  let total = null;
  for (let page = 1; page <= 10; page += 1) {
    const q = encodeURIComponent(query);
    const data = await get(`https://api.github.com/search/issues?q=${q}&sort=updated&order=desc&per_page=100&page=${page}`);
    if (data.incomplete_results !== false) throw new Error(`INCOMPLETE_RESULTS:${key}:page=${page}`);
    if (!Number.isInteger(data.total_count) || data.total_count < 0 || data.total_count > 1000) throw new Error(`INVALID_TOTAL:${key}:${data.total_count}`);
    if (total === null) total = data.total_count;
    if (total !== data.total_count) throw new Error(`CARDINALITY_MOVED:${key}:${total}->${data.total_count}`);
    if (!Array.isArray(data.items)) throw new Error(`INVALID_ITEMS:${key}:page=${page}`);
    out.push(...data.items);
    if (out.length >= total) break;
    if (data.items.length === 0 || page === 10) throw new Error(`PAGINATION_TRUNCATED:${key}:${out.length}/${total}`);
  }
  if (out.length !== total) throw new Error(`CARDINALITY_MISMATCH:${key}:${out.length}/${total}`);
  return out;
}

async function fetchAllOpenIssues() {
  return fetchCompleteSearch(`repo:${repository} is:issue is:open`, 'all-open');
}

async function fetchClosedMaterialCandidates() {
  // GitHub's comma-separated label qualifier is OR. Query all labeled material
  // closures once, then add exact-title mismatch probes so title authority cannot
  // disappear merely because the corresponding severity label was stripped.
  const queries = [
    [`repo:${repository} is:issue is:closed label:P0,P1`, 'closed-label-material'],
    [`repo:${repository} is:issue is:closed "[P0]" in:title -label:P0`, 'closed-title-p0-label-drift'],
    [`repo:${repository} is:issue is:closed "[P1]" in:title -label:P1`, 'closed-title-p1-label-drift']
  ];
  const byNumber = new Map();
  for (const [query, key] of queries) {
    const items = await fetchCompleteSearch(query, key);
    for (const issue of items) {
      if (Number.isInteger(issue.number)) byNumber.set(issue.number, issue);
    }
  }
  return [...byNumber.values()].sort((a, b) => a.number - b.number);
}

try {
  const openIssues = await fetchAllOpenIssues();
  const closedMaterialCandidates = await fetchClosedMaterialCandidates();
  const metadataFailures = [...openIssues, ...closedMaterialCandidates].flatMap(parityFailures);
  if (metadataFailures.length) fail(`SEVERITY_METADATA_MISMATCH:${metadataFailures.join(',')}`);
  const stateFailures = [...openIssues, ...closedMaterialCandidates].flatMap(stateParityFailures);
  if (stateFailures.length) fail(`MATERIAL_DEFECT_STATE_PARITY:${stateFailures.join(',')}`);
  const registry = openIssues.map(materialRecord).filter(Boolean).sort((a, b) => a.issue_number - b.issue_number);
  console.log(JSON.stringify({
    validator: 'MATERIAL_DEFECT_SEVERITY_PARITY_V2',
    state: 'VERIFIED_PASS',
    open_issue_count: openIssues.length,
    closed_material_candidate_count: closedMaterialCandidates.length,
    material_defect_count: registry.length,
    material_registry_sha256: sha256(registry),
    complete_open_issue_pagination: true,
    complete_closed_material_candidate_pagination: true,
    cardinality_stable: true,
    exact_and_combined_marker_normalization: true,
    support_alias_excluded: true,
    label_only_material_authority_preserved: true,
    authoritative_state_parity_checked: true,
    bounded_rate_limit_backoff: true,
    promotion_eligible: false,
    production: 'HOLD',
    public: 'HOLD',
    g5: 'HOLD'
  }, null, 2));
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
