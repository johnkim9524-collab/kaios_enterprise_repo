#!/usr/bin/env node
import {
  buildMaterialRegistry,
  materialRegistryDigest,
  parityFailures,
  runMaterialRegistrySelfTest
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

if (process.argv.includes('--self-test')) {
  try {
    console.log(JSON.stringify(runMaterialRegistrySelfTest(), null, 2));
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
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
    const data = await get(`https://api.github.com/search/issues?q=${q}&sort=created&order=asc&per_page=100&page=${page}`);
    if (data.incomplete_results !== false) throw new Error(`INCOMPLETE_RESULTS:all-open:page=${page}`);
    if (!Number.isInteger(data.total_count) || data.total_count < 0 || data.total_count > 1000) {
      throw new Error(`INVALID_TOTAL:all-open:${data.total_count}`);
    }
    if (total === null) total = data.total_count;
    if (total !== data.total_count) throw new Error(`CARDINALITY_MOVED:all-open:${total}->${data.total_count}`);
    if (!Array.isArray(data.items)) throw new Error(`INVALID_ITEMS:all-open:page=${page}`);
    out.push(...data.items);
    if (out.length >= total) break;
    if (data.items.length === 0 || page === 10) {
      throw new Error(`PAGINATION_TRUNCATED:all-open:${out.length}/${total}`);
    }
  }
  if (out.length !== total) throw new Error(`CARDINALITY_MISMATCH:all-open:${out.length}/${total}`);
  const issueNumbers = out.map((issue) => issue?.number);
  if (issueNumbers.some((number) => !Number.isInteger(number) || number < 1)) throw new Error('OPEN_ISSUE_NUMBER_INVALID');
  if (new Set(issueNumbers).size !== issueNumbers.length) throw new Error('OPEN_ISSUE_PAGINATION_DUPLICATE');
  if (out.some((issue) => issue?.pull_request)) throw new Error('PULL_REQUEST_LEAKED_INTO_ISSUE_QUERY');
  return out;
}

try {
  const issues = await fetchAllOpenIssues();
  const failures = issues.flatMap(parityFailures);
  if (failures.length) fail(`SEVERITY_METADATA_MISMATCH:${failures.join(',')}`);
  const registry = buildMaterialRegistry(issues);
  console.log(JSON.stringify({
    validator: 'MATERIAL_DEFECT_SEVERITY_PARITY_V2',
    registry_contract_version: '3.0.0',
    state: 'VERIFIED_PASS',
    open_issue_count: issues.length,
    material_defect_count: registry.length,
    material_registry_sha256: materialRegistryDigest(registry),
    material_defects: registry,
    complete_open_issue_pagination: true,
    cardinality_stable: true,
    exact_and_combined_bracket_marker_normalization: true,
    strict_leading_prefix_marker_normalization: true,
    support_and_subclass_aliases_excluded: true,
    label_only_material_authority_preserved: true,
    volatile_issue_updated_at_excluded_from_registry_digest: true,
    promotion_eligible: false,
    production: 'HOLD',
    public: 'HOLD',
    g5: 'HOLD'
  }, null, 2));
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
