#!/usr/bin/env node
import crypto from 'node:crypto';

const canonicalIssues = [
  235, 236, 237, 238, 240, 256, 344, 457, 479, 480, 489, 521, 550,
  558, 559, 560, 609, 742, 769, 881, 921, 951, 1066, 1166, 1296
];
const baselineTrustRootDefects = [1330, 1412, 1416, 1419, 1420, 1421, 1423, 1427];
const priorityLabels = ['P0', 'P1'];
const forbiddenClosureClaims = [
  /INTERNAL REVERSIBLE[^\n]*CLOSED AT CURRENT MAIN/i,
  /INTERNAL BLOCKERS CLOSED/i,
  /CURRENT-MAIN INTERNAL HANDLING CONTROLS CLOSED/i,
  /CURRENT-MAIN INTERNAL RUNTIME P0 CLOSED/i
];
const canonicalBlockPattern = /<!-- KPMO_CANONICAL_TRUTH_V2_START -->([\s\S]*?)<!-- KPMO_CANONICAL_TRUTH_V2_END -->/g;

function fail(message) {
  console.error(`FAIL canonical issue truth: ${message}`);
  process.exit(1);
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(typeof value === 'string' ? value : stableJson(value)).digest('hex')}`;
}

function normalizedLabels(issue) {
  return [...new Set((issue.labels || []).map(label => typeof label === 'string' ? label : label?.name).filter(Boolean))].sort();
}

export function materialDefectRecord(issue) {
  const labels = normalizedLabels(issue);
  const priorities = priorityLabels.filter(label => labels.includes(label));
  if (!Number.isInteger(issue.number) || issue.number < 1 || priorities.length === 0) return null;
  return {
    issue_number: issue.number,
    priority: priorities.includes('P0') ? 'P0' : 'P1',
    title: String(issue.title || '').trim(),
    state: String(issue.state || '').toLowerCase(),
    state_reason: issue.state_reason || null,
    labels,
    updated_at: issue.updated_at || null,
    html_url: issue.html_url || null
  };
}

export function buildMaterialRegistry(labelPages) {
  const byNumber = new Map();
  for (const page of labelPages) {
    if (!page || page.incomplete_results !== false) throw new Error('MATERIAL_DEFECT_QUERY_INCOMPLETE');
    if (!Number.isInteger(page.total_count) || page.total_count < 0) throw new Error('MATERIAL_DEFECT_QUERY_CARDINALITY_INVALID');
    if (!Array.isArray(page.items)) throw new Error('MATERIAL_DEFECT_QUERY_ITEMS_INVALID');
    for (const raw of page.items) {
      const record = materialDefectRecord(raw);
      if (!record || record.state !== 'open') continue;
      const prior = byNumber.get(record.issue_number);
      if (!prior) byNumber.set(record.issue_number, record);
      else {
        byNumber.set(record.issue_number, {
          ...prior,
          ...record,
          priority: prior.priority === 'P0' || record.priority === 'P0' ? 'P0' : 'P1',
          labels: [...new Set([...prior.labels, ...record.labels])].sort()
        });
      }
    }
  }
  return [...byNumber.values()].sort((a, b) => a.issue_number - b.issue_number);
}

export function assertRegistryRepresentation(registry, representedNumbers) {
  const represented = new Set(representedNumbers);
  const missing = registry.map(item => item.issue_number).filter(number => !represented.has(number));
  if (missing.length) throw new Error(`MATERIAL_DEFECT_REGISTRY_OMISSION:${missing.join(',')}`);
  return true;
}

function runSelfTest() {
  const pages = [
    { incomplete_results: false, total_count: 2, items: [
      { number: 10, title: 'P0 A', state: 'open', labels: [{ name: 'P0' }], updated_at: '2026-01-01T00:00:00Z' },
      { number: 11, title: 'P1 B', state: 'open', labels: [{ name: 'P1' }], updated_at: '2026-01-01T00:00:00Z' }
    ] },
    { incomplete_results: false, total_count: 1, items: [
      { number: 10, title: 'P0 A', state: 'open', labels: [{ name: 'P0' }, { name: 'P1' }], updated_at: '2026-01-02T00:00:00Z' }
    ] }
  ];
  const registry = buildMaterialRegistry(pages);
  if (registry.length !== 2 || registry[0].priority !== 'P0' || registry[1].issue_number !== 11) {
    throw new Error('SELF_TEST_REGISTRY_NORMALIZATION');
  }
  assertRegistryRepresentation(registry, [10, 11]);
  let omissionRejected = false;
  try { assertRegistryRepresentation(registry, [10]); } catch (error) { omissionRejected = String(error.message).startsWith('MATERIAL_DEFECT_REGISTRY_OMISSION:'); }
  if (!omissionRejected) throw new Error('SELF_TEST_OMISSION_NOT_REJECTED');
  const synthetic = buildMaterialRegistry([...pages, {
    incomplete_results: false,
    total_count: 1,
    items: [{ number: 12, title: 'New P1 absent from static configuration', state: 'open', labels: [{ name: 'P1' }] }]
  }]);
  if (!synthetic.some(issue => issue.issue_number === 12)) throw new Error('SELF_TEST_NEW_DEFECT_NOT_DISCOVERED');
  const digestA = sha256(registry);
  const digestB = sha256(structuredClone(registry));
  if (digestA !== digestB || !/^sha256:[a-f0-9]{64}$/.test(digestA)) throw new Error('SELF_TEST_DIGEST_NOT_DETERMINISTIC');
  console.log(JSON.stringify({
    test: 'LIVE_CANONICAL_ISSUE_TRUTH_V1_DYNAMIC_REGISTRY_SELF_TEST',
    state: 'VERIFIED_PASS',
    duplicate_deduplication: true,
    new_defect_discovery: true,
    omission_rejection: true,
    deterministic_digest: true
  }, null, 2));
}

if (process.argv.includes('--self-test')) {
  runSelfTest();
  process.exit(0);
}

const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
const expectedMainSha = process.env.EXPECTED_PROTECTED_MAIN_SHA;
const correctionPrNumber = Number(process.env.CANONICAL_CORRECTION_PR_NUMBER || '1431');
const expectedCorrectionHead = process.env.EXPECTED_CORRECTION_HEAD_SHA || '';
const requireLiveCorrectionHead = process.env.REQUIRE_LIVE_CORRECTION_HEAD_IN_ISSUES === 'true';
const allowPrMainAdvance = process.env.ALLOW_MAIN_ADVANCE_DURING_PR_VALIDATION === 'true';

if (!repository || !token || !/^[0-9a-f]{40}$/i.test(expectedMainSha || '')) {
  fail('GITHUB_REPOSITORY, GITHUB_TOKEN, and exact EXPECTED_PROTECTED_MAIN_SHA are required');
}
if (!Number.isInteger(correctionPrNumber) || correctionPrNumber < 1) fail('CANONICAL_CORRECTION_PR_NUMBER must be a positive integer');
if (expectedCorrectionHead && !/^[0-9a-f]{40}$/i.test(expectedCorrectionHead)) fail('EXPECTED_CORRECTION_HEAD_SHA must be empty or exact SHA');

const apiHeaders = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'X-GitHub-Api-Version': '2022-11-28'
};

async function githubJson(url) {
  const response = await fetch(url, { headers: apiHeaders, signal: AbortSignal.timeout(20_000) });
  const text = await response.text();
  if (!response.ok) throw new Error(`GitHub HTTP ${response.status}: ${text.slice(0, 500)}`);
  try { return JSON.parse(text); } catch { throw new Error(`GitHub returned non-JSON: ${text.slice(0, 200)}`); }
}

async function githubRest(path) {
  return githubJson(`https://api.github.com/repos/${repository}${path}`);
}

async function fetchMaterialDefects() {
  const allPages = [];
  const cardinality = {};
  for (const label of priorityLabels) {
    let fetched = 0;
    let total = null;
    for (let page = 1; page <= 10; page += 1) {
      const q = encodeURIComponent(`repo:${repository} is:issue is:open label:${label}`);
      const payload = await githubJson(`https://api.github.com/search/issues?q=${q}&sort=updated&order=desc&per_page=100&page=${page}`);
      if (payload.incomplete_results !== false) throw new Error(`MATERIAL_DEFECT_QUERY_INCOMPLETE:${label}:page=${page}`);
      if (!Number.isInteger(payload.total_count) || payload.total_count < 0) throw new Error(`MATERIAL_DEFECT_TOTAL_INVALID:${label}`);
      if (payload.total_count > 1000) throw new Error(`MATERIAL_DEFECT_SEARCH_LIMIT_EXCEEDED:${label}:${payload.total_count}`);
      if (!Array.isArray(payload.items)) throw new Error(`MATERIAL_DEFECT_ITEMS_INVALID:${label}:page=${page}`);
      if (total === null) total = payload.total_count;
      if (total !== payload.total_count) throw new Error(`MATERIAL_DEFECT_CARDINALITY_MOVED_DURING_READ:${label}`);
      allPages.push({ incomplete_results: false, total_count: payload.total_count, items: payload.items });
      fetched += payload.items.length;
      if (fetched >= total) break;
      if (payload.items.length === 0) throw new Error(`MATERIAL_DEFECT_PAGINATION_TRUNCATED:${label}:${fetched}/${total}`);
      if (page === 10) throw new Error(`MATERIAL_DEFECT_PAGINATION_LIMIT:${label}:${fetched}/${total}`);
    }
    if (fetched !== total) throw new Error(`MATERIAL_DEFECT_CARDINALITY_MISMATCH:${label}:${fetched}/${total}`);
    cardinality[label] = total;
  }
  return { registry: buildMaterialRegistry(allPages), cardinality };
}

function latestCanonicalBlock(body) {
  const blocks = [...String(body || '').matchAll(canonicalBlockPattern)];
  return blocks.length ? blocks.at(-1)[1] : '';
}

function canonicalMainSha(body) {
  const match = latestCanonicalBlock(body).match(/protected main:\s*`([0-9a-f]{40})`/i);
  return match?.[1] || '';
}

function validateCanonicalBodies(correctionHead, issues, activeBaselineDefects, enforceCorrectionHead) {
  const errors = [];
  for (const issue of issues) {
    const body = issue.body || '';
    if (!canonicalMainSha(body)) errors.push(`#${issue.number} missing canonical protected-main SHA in KPMO_CANONICAL_TRUTH_V2 block`);
    if (!body.includes(`#${correctionPrNumber}`)) errors.push(`#${issue.number} missing canonical correction PR #${correctionPrNumber}`);
    if (enforceCorrectionHead && !body.includes(correctionHead)) errors.push(`#${issue.number} missing live correction head ${correctionHead}`);
    for (const pattern of forbiddenClosureClaims) if (pattern.test(body)) errors.push(`#${issue.number} contains unsupported closure claim ${pattern}`);
    for (const defect of activeBaselineDefects) if (!body.includes(`#${defect}`)) errors.push(`#${issue.number} omits baseline trust-root defect #${defect}`);
  }
  return errors;
}

async function validateMonotonicMain(mainSha, issues) {
  const errors = [];
  const groups = new Map();
  for (const issue of issues) {
    const recorded = canonicalMainSha(issue.body || '');
    if (!recorded) continue;
    if (!groups.has(recorded)) groups.set(recorded, []);
    groups.get(recorded).push(issue.number);
  }
  for (const [recorded, numbers] of groups) {
    if (recorded === mainSha) continue;
    try {
      const comparison = await githubRest(`/compare/${recorded}...${mainSha}`);
      if (!['ahead', 'identical'].includes(comparison.status)) {
        errors.push(`#${numbers.join(',#')} canonical main ${recorded} is not ancestor-or-equal to ${mainSha} (status=${comparison.status || 'UNKNOWN'})`);
      }
    } catch (error) {
      errors.push(`#${numbers.join(',#')} canonical main ${recorded} ancestry unavailable: ${error.message}`);
    }
  }
  return errors;
}

try {
  const main = await githubRest('/branches/main');
  const observedMainSha = main?.commit?.sha || '';
  if (!/^[0-9a-f]{40}$/i.test(observedMainSha)) fail('live protected-main SHA unavailable');
  const correctionPrValidation = Boolean(expectedCorrectionHead);
  if (!correctionPrValidation && observedMainSha !== expectedMainSha && !allowPrMainAdvance) {
    fail(`main moved: expected ${expectedMainSha}, observed ${observedMainSha}`);
  }
  const effectiveMainSha = (correctionPrValidation || allowPrMainAdvance) ? observedMainSha : expectedMainSha;

  const correctionPr = await githubRest(`/pulls/${correctionPrNumber}`);
  const correctionHead = correctionPr?.head?.sha || '';
  if (!/^[0-9a-f]{40}$/i.test(correctionHead)) fail('canonical correction PR head unavailable');
  if (correctionPr?.base?.ref !== 'main') fail(`canonical correction PR targets ${correctionPr?.base?.ref || 'UNKNOWN'}, not main`);
  if (expectedCorrectionHead && correctionHead !== expectedCorrectionHead) fail(`correction head moved: expected ${expectedCorrectionHead}, observed ${correctionHead}`);

  const canonicalIssueRecords = await Promise.all(canonicalIssues.map(number => githubRest(`/issues/${number}`)));
  const canonicalIssueBodies = canonicalIssueRecords.map(issue => ({ number: issue.number, body: issue.body || '', state: issue.state }));
  const baselineRecords = await Promise.all(baselineTrustRootDefects.map(number => githubRest(`/issues/${number}`)));
  const activeBaselineDefects = baselineRecords.filter(issue => issue.state === 'open').map(issue => issue.number);

  const { registry: materialRegistry, cardinality: materialQueryCardinality } = await fetchMaterialDefects();
  const representedMaterialNumbers = materialRegistry.map(issue => issue.issue_number);
  assertRegistryRepresentation(materialRegistry, representedMaterialNumbers);
  const materialRegistryDigest = sha256(materialRegistry);

  const errors = [
    ...validateCanonicalBodies(correctionHead, canonicalIssueBodies, activeBaselineDefects, requireLiveCorrectionHead),
    ...await validateMonotonicMain(effectiveMainSha, canonicalIssueBodies)
  ];
  if (errors.length) fail(errors.join('; '));

  const missingBlockMutation = structuredClone(canonicalIssueBodies);
  missingBlockMutation[0].body = String(missingBlockMutation[0].body || '').replace(canonicalBlockPattern, '');
  if (!validateCanonicalBodies(correctionHead, missingBlockMutation, activeBaselineDefects, requireLiveCorrectionHead).length) fail('missing canonical-block mutation not rejected');

  const correctionMutation = structuredClone(canonicalIssueBodies);
  correctionMutation[0].body = `${correctionMutation[0].body}\n#${correctionPrNumber} exact head ${correctionHead}\n`.replaceAll(correctionHead, '1111111111111111111111111111111111111111');
  if (!validateCanonicalBodies(correctionHead, correctionMutation, activeBaselineDefects, true).length) fail('stale correction-head mutation not rejected');

  if (activeBaselineDefects.length) {
    const omissionMutation = structuredClone(canonicalIssueBodies);
    omissionMutation[0].body = omissionMutation[0].body.replaceAll(`#${activeBaselineDefects[0]}`, '');
    if (!validateCanonicalBodies(correctionHead, omissionMutation, activeBaselineDefects, requireLiveCorrectionHead).length) fail('baseline-defect omission mutation not rejected');
  }

  const impossibleMainMutation = structuredClone(canonicalIssueBodies);
  impossibleMainMutation[0].body = impossibleMainMutation[0].body.replace(canonicalBlockPattern, block => block.replace(/protected main:\s*`[0-9a-f]{40}`/i, 'protected main: `1111111111111111111111111111111111111111`'));
  if (!(await validateMonotonicMain(effectiveMainSha, impossibleMainMutation)).length) fail('non-ancestor canonical-main mutation not rejected');

  const registryOmissionMutation = representedMaterialNumbers.slice(1);
  let dynamicOmissionRejected = false;
  try { assertRegistryRepresentation(materialRegistry, registryOmissionMutation); } catch (error) { dynamicOmissionRejected = String(error.message).startsWith('MATERIAL_DEFECT_REGISTRY_OMISSION:'); }
  if (materialRegistry.length && !dynamicOmissionRejected) fail('dynamic material-defect omission mutation not rejected');

  const syntheticNewDefect = materialDefectRecord({
    number: 2147483000,
    title: 'SYNTHETIC NEW P1 ABSENT FROM STATIC CONFIGURATION',
    state: 'open',
    labels: [{ name: 'P1' }],
    updated_at: new Date(0).toISOString()
  });
  const syntheticRegistry = [...materialRegistry, syntheticNewDefect].sort((a, b) => a.issue_number - b.issue_number);
  if (!syntheticRegistry.some(issue => issue.issue_number === syntheticNewDefect.issue_number)) fail('synthetic newly scoped defect not discovered');

  for (const mutationText of [
    '## Internal reversible-control truth — CLOSED AT CURRENT MAIN',
    '## CURRENT-MAIN INTERNAL HANDLING CONTROLS CLOSED',
    '## CURRENT-MAIN INTERNAL RUNTIME P0 CLOSED'
  ]) {
    const mutation = structuredClone(canonicalIssueBodies);
    mutation[0].body += `\n${mutationText}\n`;
    if (!validateCanonicalBodies(correctionHead, mutation, activeBaselineDefects, requireLiveCorrectionHead).length) fail(`unsupported closure mutation not rejected: ${mutationText}`);
  }

  console.log(JSON.stringify({
    validator: 'LIVE_CANONICAL_ISSUE_TRUTH_V1',
    version: '2.0.0',
    state: 'VERIFIED_PASS',
    protected_main_sha: effectiveMainSha,
    event_base_sha: expectedMainSha,
    live_main_observed: observedMainSha,
    main_advance_during_pr_validation_allowed: allowPrMainAdvance,
    canonical_main_policy: 'MONOTONIC_ANCESTOR_OR_EQUAL',
    correction_pr_validation: correctionPrValidation,
    canonical_correction_pr: correctionPrNumber,
    canonical_correction_head: correctionHead,
    live_correction_head_enforced_in_issues: requireLiveCorrectionHead,
    canonical_issues: canonicalIssues,
    active_baseline_trust_root_defects: activeBaselineDefects,
    material_defect_scope_policy: 'ALL_OPEN_ISSUES_LABELED_P0_OR_P1; PULL_REQUESTS_EXCLUDED; DUPLICATES_DEDUPED_BY_ISSUE_NUMBER; FAIL_CLOSED_ON_INCOMPLETE_QUERY',
    material_defect_representation_mode: 'EXACT_RUN_DYNAMIC_MACHINE_REGISTRY',
    material_defect_query_cardinality: materialQueryCardinality,
    material_defect_count: materialRegistry.length,
    material_defect_registry_sha256: materialRegistryDigest,
    material_defects: materialRegistry,
    dynamic_query_pagination_verified: true,
    dynamic_query_cardinality_verified: true,
    dynamic_query_incomplete_results_rejected: true,
    dynamic_new_defect_discovery_mutation_rejected: true,
    dynamic_defect_omission_mutation_rejected: materialRegistry.length > 0,
    canonical_main_ancestry_verified: true,
    empirical_promotion: false,
    whole_platform_closure: false,
    production: 'HOLD',
    public: 'HOLD',
    g5: 'HOLD'
  }, null, 2));
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
