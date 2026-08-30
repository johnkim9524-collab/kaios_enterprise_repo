#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const SHA_PATTERN = /^[a-f0-9]{40}$/;
const POSITIVE_INTEGER_PATTERN = /^[1-9][0-9]*$/;
const ARL_WORKFLOW_NAME = 'KIDULTS ASI Autonomous Resolution Layer v1';
const ARL_WORKFLOW_PATH = '.github/workflows/kidults-asi-autonomous-resolution-layer-v1.yml';
const COVERAGE_WORKFLOW_NAME = 'KIDULTS ASI Requirement-to-Adapter Coverage v1';
const COVERAGE_WORKFLOW_PATH = '.github/workflows/kidults-asi-requirement-adapter-coverage-v1.yml';
const MAX_ARL_HISTORY_PAGES = 20;
const GITHUB_PAGE_SIZE = 100;

export class OrchestrationRunHistoryError extends Error {}

function fail(code, detail = '') {
  throw new OrchestrationRunHistoryError(detail ? `${code}:${detail}` : code);
}

function requireSha(value, code = 'SOURCE_SHA_INVALID') {
  if (!SHA_PATTERN.test(String(value || ''))) fail(code, value);
  return String(value);
}

function requirePositiveInteger(value, code) {
  const text = String(value ?? '');
  if (!POSITIVE_INTEGER_PATTERN.test(text)) fail(code, text);
  return Number(text);
}

function requireIso(value, code) {
  const text = String(value || '');
  if (!Number.isFinite(Date.parse(text))) fail(code, text);
  return text;
}

function requireSafeCount(value, code) {
  if (!Number.isSafeInteger(value) || value < 0) fail(code, value);
  return value;
}

function validateRunIdentity(run, { workflowName, workflowPath, sourceSha, headBranch }) {
  if (!run || typeof run !== 'object') fail('WORKFLOW_RUN_INVALID');
  requirePositiveInteger(run.id, 'WORKFLOW_RUN_ID_INVALID');
  if (run.name !== workflowName || run.path !== workflowPath) fail('WORKFLOW_RUN_IDENTITY_MISMATCH', run.id);
  if (run.event !== 'workflow_run') fail('WORKFLOW_RUN_EVENT_FILTER_DRIFT', run.id);
  if (run.head_sha !== sourceSha || run.head_branch !== headBranch) fail('WORKFLOW_RUN_SOURCE_FILTER_DRIFT', run.id);
  return run;
}

function validateSuccessfulRun(run, expected) {
  validateRunIdentity(run, expected);
  if (run.status !== 'completed' || run.conclusion !== 'success') fail('WORKFLOW_RUN_SUCCESS_FILTER_DRIFT', run.id);
  return run;
}

export function reconcileArlAuthoritativeGenerationPages({
  pages,
  sourceSha,
  headBranch = 'main',
  expectedDisplayTitle,
  currentRunId,
  createdSince,
  createdThrough,
}) {
  requireSha(sourceSha);
  const current = requirePositiveInteger(currentRunId, 'CURRENT_RUN_ID_INVALID');
  const since = Date.parse(requireIso(createdSince, 'CREATED_SINCE_INVALID'));
  const through = Date.parse(requireIso(createdThrough, 'CREATED_THROUGH_INVALID'));
  if (since > through) fail('CREATED_WINDOW_INVALID');
  if (!Array.isArray(pages) || pages.length < 1 || pages.length > MAX_ARL_HISTORY_PAGES) {
    fail('ARL_HISTORY_PAGE_CARDINALITY_INVALID', pages?.length);
  }
  if (typeof expectedDisplayTitle !== 'string' || !/^KIDULTS ARL \/ p1-[1-9][0-9]*$/.test(expectedDisplayTitle)) {
    fail('ARL_EXPECTED_DISPLAY_TITLE_INVALID', expectedDisplayTitle);
  }

  const expectedTotal = requireSafeCount(pages[0]?.total_count, 'ARL_HISTORY_TOTAL_INVALID');
  const runs = [];
  for (const [index, page] of pages.entries()) {
    if (requireSafeCount(page?.total_count, 'ARL_HISTORY_TOTAL_INVALID') !== expectedTotal) {
      fail('ARL_HISTORY_TOTAL_CHANGED_DURING_READBACK', index + 1);
    }
    if (!Array.isArray(page.workflow_runs) || page.workflow_runs.length > GITHUB_PAGE_SIZE) {
      fail('ARL_HISTORY_PAGE_SHAPE_INVALID', index + 1);
    }
    runs.push(...page.workflow_runs);
  }
  if (runs.length !== expectedTotal) fail('ARL_AUTHORITATIVE_PRODUCER_QUERY_PAGINATION_INCOMPLETE', `${runs.length}/${expectedTotal}`);
  const ids = new Set();
  for (const run of runs) {
    validateRunIdentity(run, {
      workflowName: ARL_WORKFLOW_NAME,
      workflowPath: ARL_WORKFLOW_PATH,
      sourceSha,
      headBranch,
    });
    if (ids.has(run.id)) fail('ARL_HISTORY_DUPLICATE_RUN_ID', run.id);
    ids.add(run.id);
    const created = Date.parse(requireIso(run.created_at, 'ARL_RUN_CREATED_AT_INVALID'));
    if (created < since || created > through) fail('ARL_RUN_CREATED_WINDOW_FILTER_DRIFT', run.id);
  }
  const currentRun = runs.find((run) => run.id === current);
  if (!currentRun) fail('ARL_CURRENT_RUN_MISSING_FROM_COMPLETE_QUERY', current);
  if (currentRun.display_title !== expectedDisplayTitle) fail('ARL_CURRENT_RUN_GENERATION_TITLE_MISMATCH', current);
  const priorRunIds = runs
    .filter((run) => run.id !== current && run.display_title === expectedDisplayTitle &&
      run.status === 'completed' && run.conclusion === 'success')
    .map((run) => run.id)
    .sort((left, right) => left - right);
  if (priorRunIds.length) fail('ARL_AUTHORITATIVE_PRODUCER_DUPLICATE', priorRunIds.join(','));
  return {
    id: 'kidults-arl-authoritative-generation-history-receipt-v1',
    state: 'VERIFIED_PASS_BOUNDED_COMPLETE',
    source_sha: sourceSha,
    head_branch: headBranch,
    expected_display_title: expectedDisplayTitle,
    queried_total_count: expectedTotal,
    returned_count: runs.length,
    page_count: pages.length,
    page_limit: MAX_ARL_HISTORY_PAGES,
    prior_authoritative_producer_count: 0,
    current_run_in_complete_query: true,
    exact_generation_window_bound: true,
    pagination_reconciled_complete: true,
    production: 'HOLD',
  };
}

export function resolveCoverageAuthoritativeProducer({ run, receipt, sourceSha, headBranch = 'main' }) {
  requireSha(sourceSha);
  validateSuccessfulRun(run, {
    workflowName: ARL_WORKFLOW_NAME,
    workflowPath: ARL_WORKFLOW_PATH,
    sourceSha,
    headBranch,
  });
  if (!receipt || typeof receipt !== 'object') fail('ARL_RECEIPT_INVALID');
  const p1RunId = requirePositiveInteger(receipt.p1_workflow_run_id, 'ARL_RECEIPT_P1_RUN_ID_INVALID');
  if (run.display_title !== `KIDULTS ARL / p1-${p1RunId}`) fail('ARL_RECEIPT_GENERATION_TITLE_MISMATCH');
  if (receipt.producer_workflow_run_id !== run.id || receipt.producer_display_title !== run.display_title) {
    fail('AUTONOMOUS_RESOLUTION_RECEIPT_PRODUCER_IDENTITY_MISMATCH');
  }
  if (receipt.source_sha !== sourceSha || receipt.p1_source_sha !== sourceSha) fail('ARL_RECEIPT_SOURCE_SHA_MISMATCH');
  if (receipt.authoritative_producer !== true || receipt.downstream_consumable !== true ||
      receipt.exact_generation_bound !== true || receipt.exact_triggering_run_bound !== true) {
    fail('ARL_RECEIPT_AUTHORITATIVE_BOUNDARY_INVALID');
  }
  return {
    id: 'kidults-coverage-exact-upstream-producer-receipt-v1',
    state: 'VERIFIED_PASS_EXACT_RUN_QUERY',
    workflow_run_id: run.id,
    p1_workflow_run_id: p1RunId,
    source_sha: sourceSha,
    authoritative_producer_cardinality: 1,
    global_same_head_history_scan_performed: false,
    exact_triggering_run_bound: true,
    production: 'HOLD',
  };
}

export function resolveCoveragePriorSuccessExactQuery({
  payload,
  sourceSha,
  headBranch = 'main',
  createdSince,
}) {
  requireSha(sourceSha);
  const cutoff = Date.parse(requireIso(createdSince, 'CREATED_SINCE_INVALID'));
  const total = requireSafeCount(payload?.total_count, 'COVERAGE_PRIOR_SUCCESS_TOTAL_INVALID');
  if (!Array.isArray(payload?.workflow_runs) || payload.workflow_runs.length > GITHUB_PAGE_SIZE) {
    fail('COVERAGE_PRIOR_SUCCESS_RESPONSE_INVALID');
  }
  const expectedReturned = Math.min(total, GITHUB_PAGE_SIZE);
  if (payload.workflow_runs.length !== expectedReturned) {
    fail('COVERAGE_PRIOR_SUCCESS_EXACT_QUERY_RETURN_COUNT_INVALID', `${payload.workflow_runs.length}/${expectedReturned}`);
  }
  const expectedTitle = `KIDULTS Coverage / source-${sourceSha}`;
  const ids = new Set();
  for (const run of payload.workflow_runs) {
    validateSuccessfulRun(run, {
      workflowName: COVERAGE_WORKFLOW_NAME,
      workflowPath: COVERAGE_WORKFLOW_PATH,
      sourceSha,
      headBranch,
    });
    if (run.display_title !== expectedTitle) fail('COVERAGE_PRIOR_SUCCESS_TITLE_FILTER_DRIFT', run.id);
    if (ids.has(run.id)) fail('COVERAGE_PRIOR_SUCCESS_DUPLICATE_RUN_ID', run.id);
    ids.add(run.id);
    if (Date.parse(requireIso(run.created_at, 'COVERAGE_RUN_CREATED_AT_INVALID')) < cutoff) {
      fail('COVERAGE_PRIOR_SUCCESS_CREATED_FILTER_DRIFT', run.id);
    }
  }
  return {
    id: 'kidults-coverage-prior-success-exact-query-receipt-v1',
    state: 'VERIFIED_PASS_SERVER_FILTERED_EXACT_COUNT',
    workflow_name: COVERAGE_WORKFLOW_NAME,
    workflow_path: COVERAGE_WORKFLOW_PATH,
    source_sha: sourceSha,
    head_branch: headBranch,
    created_since: createdSince,
    prior_success_count: total,
    validation_sample_count: payload.workflow_runs.length,
    exact_query_filters: ['workflow_id', 'head_sha', 'branch', 'event', 'status', 'created'],
    pagination_required_for_count: false,
    production: 'HOLD',
  };
}

function parseArgs(argv) {
  const options = {};
  const allowed = new Set([
    '--mode', '--input', '--run', '--receipt', '--source-sha', '--head-branch', '--display-title',
    '--current-run-id', '--created-since', '--created-through', '--output',
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!allowed.has(key)) fail('UNKNOWN_ARGUMENT', key);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) fail('ARGUMENT_VALUE_REQUIRED', key);
    options[key.slice(2).replaceAll('-', '_')] = value;
    index += 1;
  }
  if (!['arl-generation-pages', 'coverage-exact-producer', 'coverage-prior-success'].includes(options.mode)) {
    fail('MODE_INVALID', options.mode);
  }
  if (!options.output) fail('OUTPUT_REQUIRED');
  return options;
}

function readJson(filePath, code) {
  if (!filePath) fail(code);
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(code, error.message);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  let result;
  if (options.mode === 'arl-generation-pages') {
    result = reconcileArlAuthoritativeGenerationPages({
      pages: readJson(options.input, 'ARL_HISTORY_INPUT_INVALID'),
      sourceSha: options.source_sha,
      headBranch: options.head_branch,
      expectedDisplayTitle: options.display_title,
      currentRunId: options.current_run_id,
      createdSince: options.created_since,
      createdThrough: options.created_through,
    });
  } else if (options.mode === 'coverage-exact-producer') {
    result = resolveCoverageAuthoritativeProducer({
      run: readJson(options.run, 'ARL_RUN_INPUT_INVALID'),
      receipt: readJson(options.receipt, 'ARL_RECEIPT_INPUT_INVALID'),
      sourceSha: options.source_sha,
      headBranch: options.head_branch,
    });
  } else {
    result = resolveCoveragePriorSuccessExactQuery({
      payload: readJson(options.input, 'COVERAGE_PRIOR_SUCCESS_INPUT_INVALID'),
      sourceSha: options.source_sha,
      headBranch: options.head_branch,
      createdSince: options.created_since,
    });
  }
  fs.mkdirSync(path.dirname(path.resolve(options.output)), { recursive: true });
  fs.writeFileSync(options.output, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error?.message || error}\n`);
    process.exitCode = 1;
  });
}

export const ORCHESTRATION_RUN_HISTORY_CONSTANTS = Object.freeze({
  ARL_WORKFLOW_NAME,
  ARL_WORKFLOW_PATH,
  COVERAGE_WORKFLOW_NAME,
  COVERAGE_WORKFLOW_PATH,
  MAX_ARL_HISTORY_PAGES,
  GITHUB_PAGE_SIZE,
});
