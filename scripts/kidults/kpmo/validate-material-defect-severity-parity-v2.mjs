#!/usr/bin/env node
import {
  declaredSeverityLabels as canonicalDeclaredSeverityLabels,
  materialRecord as canonicalMaterialRecord,
  materialRegistryDigest,
  parityFailures as canonicalParityFailures
} from './material-defect-registry-v3.mjs';

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
  return canonicalDeclaredSeverityLabels(title);
}

export function parityFailures(issue) {
  return canonicalParityFailures(issue);
}

export function materialRecord(issue) {
  const record = canonicalMaterialRecord(issue);
  if (!record) return null;
  return { ...record, updated_at: issue.updated_at || null };
}

function selfTest() {
  const exactP0 = { number: 1, state: 'open', title: '[P0] exact', labels: [{ name: 'P0' }] };
  const combined = { number: 2, state: 'open', title: '[P0/P1][Portal] combined', labels: [{ name: 'P0' }, { name: 'P1' }] };
  const missingCombined = { number: 3, state: 'open', title: '[P0/P1] missing P1', labels: [{ name: 'P0' }] };
  const support = { number: 4, state: 'open', title: '[P0-SUPPORT] support only', labels: [] };
  const labelOnly = { number: 5, state: 'open', title: 'material by authoritative label', labels: [{ name: 'P1' }] };
  const prefixP1 = { number: 6, state: 'open', title: 'P1: strict prefix', labels: [{ name: 'P1' }] };
  const prefixCombined = { number: 7, state: 'open', title: 'P1/P0: combined prefix', labels: [{ name: 'P0' }, { name: 'P1' }] };
  const prefixMissing = { number: 8, state: 'open', title: 'P1: missing label', labels: [] };
  const prefixConflict = { number: 9, state: 'open', title: 'P0: conflict', labels: [{ name: 'P0' }, { name: 'P1' }] };
  const prose = { number: 10, state: 'open', title: 'ordinary text mentioning P1: later', labels: [] };
  const subclass = { number: 11, state: 'open', title: '[P0-A] subclass', labels: [] };
  if (parityFailures(exactP0).length) throw new Error('SELF_TEST_EXACT_P0_REJECTED');
  if (parityFailures(combined).length) throw new Error('SELF_TEST_COMBINED_REJECTED');
  if (!parityFailures(missingCombined).some(x => x.includes('P1_TITLE_WITHOUT_P1_LABEL'))) throw new Error('SELF_TEST_COMBINED_MISMATCH_NOT_REJECTED');
  if (declaredSeverityLabels(support.title).length || declaredSeverityLabels(subclass.title).length) throw new Error('SELF_TEST_SUPPORT_ALIASING');
  if (!materialRecord(labelOnly)) throw new Error('SELF_TEST_LABEL_ONLY_MATERIAL_LOST');
  if (parityFailures(prefixP1).length || parityFailures(prefixCombined).length) throw new Error('SELF_TEST_PREFIX_REJECTED');
  if (!parityFailures(prefixMissing).some(x => x.includes('P1_TITLE_WITHOUT_P1_LABEL'))) throw new Error('SELF_TEST_PREFIX_MISMATCH_NOT_REJECTED');
  if (!parityFailures(prefixConflict).some(x => x.includes('P1_LABEL_WITH_P0_ONLY_TITLE'))) throw new Error('SELF_TEST_PREFIX_CONFLICT_NOT_REJECTED');
  if (declaredSeverityLabels(prose.title).length || parityFailures(prose).length) throw new Error('SELF_TEST_NONPREFIX_PROSE_FALSE_MATERIAL');
  console.log(JSON.stringify({
    test: 'MATERIAL_DEFECT_SEVERITY_PARITY_V2_SELF_TEST',
    state: 'VERIFIED_PASS',
    canonical_parser_shared: true,
    exact_marker: true,
    combined_marker_normalization: true,
    strict_prefix_normalization: true,
    support_alias_excluded: true,
    subclass_alias_excluded: true,
    nonprefix_prose_excluded: true,
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
  const numbers = out.map(issue => issue?.number);
  if (numbers.some(number => !Number.isInteger(number) || number < 1)) throw new Error('INVALID_ISSUE_NUMBER');
  if (new Set(numbers).size !== numbers.length) throw new Error('DUPLICATE_ISSUE_NUMBER');
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
    material_registry_sha256: materialRegistryDigest(registry.map(({updated_at,...stable}) => stable)),
    complete_open_issue_pagination: true,
    cardinality_stable: true,
    canonical_parser_shared: true,
    exact_and_combined_marker_normalization: true,
    strict_prefix_normalization: true,
    support_alias_excluded: true,
    nonprefix_prose_excluded: true,
    label_only_material_authority_preserved: true,
    bounded_rate_limit_retry: true,
    promotion_eligible: false,
    production: 'HOLD',
    public: 'HOLD',
    g5: 'HOLD'
  }, null, 2));
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
