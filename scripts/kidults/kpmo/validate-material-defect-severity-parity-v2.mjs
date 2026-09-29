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

  // Authoritative severity may be expressed either as an exact bracket marker
  // ([P0], [P1], [P0/P1], [P1/P0]) or as a strict leading prefix
  // (P0:, P1:, P0/P1:, P1/P0:). Prefix recognition is deliberately anchored
  // so aliases/prose such as [P0-SUPPORT], [P0-A] or "P1 producer" are not
  // silently promoted into material severity declarations.
  const prefixMatch = text.match(/^\s*((?:P0|P1)(?:\s*\/\s*(?:P0|P1))*)\s*:/);
  if (prefixMatch) {
    for (const part of String(prefixMatch[1] || '').split('/').map(part => part.trim()).filter(Boolean)) {
      declared.add(part);
    }
  }

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
  const exactP0 = { number: 1, state: 'open', title: '[P0] exact', labels: [{ name: 'P0' }] };
  const combined = { number: 2, state: 'open', title: '[P0/P1][Portal] combined', labels: [{ name: 'P0' }, { name: 'P1' }] };
  const missingCombined = { number: 3, state: 'open', title: '[P0/P1] missing P1', labels: [{ name: 'P0' }] };
  const support = { number: 4, state: 'open', title: '[P0-SUPPORT] support only', labels: [] };
  const labelOnly = { number: 5, state: 'open', title: 'material by authoritative label', labels: [{ name: 'P1' }] };
  const prefixP1 = { number: 6, state: 'open', title: 'P1: strict prefix', labels: [{ name: 'P1' }] };
  const prefixP0 = { number: 7, state: 'open', title: 'P0: strict prefix', labels: [{ name: 'P0' }] };
  const prefixCombined = { number: 8, state: 'open', title: 'P1/P0: strict combined prefix', labels: [{ name: 'P0' }, { name: 'P1' }] };
  const prefixMissing = { number: 9, state: 'open', title: 'P1: missing label', labels: [] };
  const prefixConflict = { number: 10, state: 'open', title: 'P1: conflicting label', labels: [{ name: 'P0' }, { name: 'P1' }] };
  const ordinaryProse = { number: 11, state: 'open', title: 'P1 producer contract discussion', labels: [] };

  if (parityFailures(exactP0).length) throw new Error('SELF_TEST_EXACT_P0_REJECTED');
  if (parityFailures(combined).length) throw new Error('SELF_TEST_COMBINED_REJECTED');
  if (!parityFailures(missingCombined).some(x => x.includes('P1_TITLE_WITHOUT_P1_LABEL'))) throw new Error('SELF_TEST_COMBINED_MISMATCH_NOT_REJECTED');
  if (declaredSeverityLabels(support.title).length !== 0) throw new Error('SELF_TEST_SUPPORT_ALIASING');
  if (parityFailures(support).length) throw new Error('SELF_TEST_SUPPORT_FALSE_MISMATCH');
  if (!materialRecord(labelOnly)) throw new Error('SELF_TEST_LABEL_ONLY_MATERIAL_LOST');
  if (materialRecord({ number: 12, state: 'open', title: 'ordinary issue', labels: [] })) throw new Error('SELF_TEST_ORDINARY_FALSE_MATERIAL');
  if (parityFailures(prefixP1).length || declaredSeverityLabels(prefixP1.title).join(',') !== 'P1') throw new Error('SELF_TEST_PREFIX_P1_REJECTED');
  if (parityFailures(prefixP0).length || declaredSeverityLabels(prefixP0.title).join(',') !== 'P0') throw new Error('SELF_TEST_PREFIX_P0_REJECTED');
  if (parityFailures(prefixCombined).length || declaredSeverityLabels(prefixCombined.title).join(',') !== 'P0,P1') throw new Error('SELF_TEST_PREFIX_COMBINED_REJECTED');
  if (!parityFailures(prefixMissing).some(x => x.includes('P1_TITLE_WITHOUT_P1_LABEL'))) throw new Error('SELF_TEST_PREFIX_MISMATCH_NOT_REJECTED');
  if (!parityFailures(prefixConflict).some(x => x.includes('P0_LABEL_WITH_P1_ONLY_TITLE'))) throw new Error('SELF_TEST_PREFIX_CONFLICT_NOT_REJECTED');
  if (declaredSeverityLabels(ordinaryProse.title).length !== 0 || parityFailures(ordinaryProse).length) throw new Error('SELF_TEST_PREFIX_PROSE_ALIASING');

  console.log(JSON.stringify({
    test: 'MATERIAL_DEFECT_SEVERITY_PARITY_V2_SELF_TEST',
    state: 'VERIFIED_PASS',
    exact_marker: true,
    combined_marker_normalization: true,
    strict_prefix_marker_normalization: true,
    support_alias_excluded: true,
    non_prefix_prose_excluded: true,
    label_only_authority_preserved: true,
    mismatch_fail_closed: true
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

async function get(url) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
  const text = await response.text();
  if (!response.ok) throw new Error(`GITHUB_HTTP_${response.status}:${text.slice(0, 300)}`);
  return JSON.parse(text);
}

async function fetchAllOpenIssues() {
  const out = [];
  let total = null;
  for (let page = 1; page <= 10; page += 1) {
    const q = encodeURIComponent(`repo:${repository} is:issue is:open`);
    const data = await get(`https://api.github.com/search/issues?q=${q}&sort=updated&order=desc&per_page=100&page=${page}`);
    if (data.incomplete_results !== false) throw new Error(`INCOMPLETE_RESULTS:all-open:page=${page}`);
    if (!Number.isInteger(data.total_count) || data.total_count < 0 || data.total_count > 1000) throw new Error(`INVALID_TOTAL:all-open:${data.total_count}`);
    if (total === null) total = data.total_count;
    if (total !== data.total_count) throw new Error(`CARDINALITY_MOVED:all-open:${total}->${data.total_count}`);
    if (!Array.isArray(data.items)) throw new Error(`INVALID_ITEMS:all-open:page=${page}`);
    out.push(...data.items);
    if (out.length >= total) break;
    if (data.items.length === 0 || page === 10) throw new Error(`PAGINATION_TRUNCATED:all-open:${out.length}/${total}`);
  }
  if (out.length !== total) throw new Error(`CARDINALITY_MISMATCH:all-open:${out.length}/${total}`);
  return out;
}

try {
  const issues = await fetchAllOpenIssues();
  const failures = issues.flatMap(parityFailures);
  if (failures.length) fail(`SEVERITY_METADATA_MISMATCH:${failures.join(',')}`);
  const registry = issues.map(materialRecord).filter(Boolean).sort((a, b) => a.issue_number - b.issue_number);
  console.log(JSON.stringify({
    validator: 'MATERIAL_DEFECT_SEVERITY_PARITY_V2',
    state: 'VERIFIED_PASS',
    open_issue_count: issues.length,
    material_defect_count: registry.length,
    material_registry_sha256: sha256(registry),
    complete_open_issue_pagination: true,
    cardinality_stable: true,
    exact_and_combined_marker_normalization: true,
    strict_prefix_marker_normalization: true,
    support_alias_excluded: true,
    non_prefix_prose_excluded: true,
    label_only_material_authority_preserved: true,
    promotion_eligible: false,
    production: 'HOLD',
    public: 'HOLD',
    g5: 'HOLD'
  }, null, 2));
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
