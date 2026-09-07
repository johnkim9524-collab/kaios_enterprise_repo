#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  OrchestrationRunHistoryError,
  reconcileArlAuthoritativeGenerationPages,
  resolveCoverageAuthoritativeProducer,
  resolveCoveragePriorSuccessExactQuery,
} from './resolve-asi-orchestration-run-history-v1.mjs';

const sourceSha = 'a'.repeat(40);
const createdSince = '2026-08-30T00:00:00.000Z';
const createdThrough = '2026-08-30T00:10:00.000Z';
const arlWorkflowPath = '.github/workflows/kidults-asi-autonomous-resolution-layer-v1.yml';

function validateDirectCurrentRunContract(workflowSource) {
  const required = [
    '/actions/runs/${GITHUB_RUN_ID}',
    '> /tmp/arl-current-run.json',
    '--argjson run "$GITHUB_RUN_ID"',
    '--argjson attempt "$GITHUB_RUN_ATTEMPT"',
    '.id==$run and .run_attempt==$attempt',
    'and .display_title==$title',
    'and .path==".github/workflows/kidults-asi-autonomous-resolution-layer-v1.yml"',
    'and .event=="workflow_run"',
    'and .head_sha==env.GITHUB_SHA and .head_branch=="main"',
    'CURRENT_ARL_CREATED_AT=$(jq -er',
  ];
  return required.filter((marker) => !workflowSource.includes(marker));
}

const arlWorkflowSource = fs.readFileSync(arlWorkflowPath, 'utf8');
assert.deepEqual(validateDirectCurrentRunContract(arlWorkflowSource), []);
for (const marker of [
  '/actions/runs/${GITHUB_RUN_ID}',
  '--argjson attempt "$GITHUB_RUN_ATTEMPT"',
  '.id==$run and .run_attempt==$attempt',
  'and .display_title==$title',
  'and .path==".github/workflows/kidults-asi-autonomous-resolution-layer-v1.yml"',
  'and .event=="workflow_run"',
  'and .head_sha==env.GITHUB_SHA and .head_branch=="main"',
]) {
  assert.notDeepEqual(validateDirectCurrentRunContract(arlWorkflowSource.replace(marker, '__REMOVED_DIRECT_CURRENT_RUN_BINDING__')), []);
}

function arlRun(id, displayTitle = `KIDULTS ARL / p1-${id}`) {
  return {
    id,
    name: 'KIDULTS ASI Autonomous Resolution Layer v1',
    path: '.github/workflows/kidults-asi-autonomous-resolution-layer-v1.yml',
    display_title: displayTitle,
    event: 'workflow_run',
    status: 'completed',
    conclusion: 'success',
    head_sha: sourceSha,
    head_branch: 'main',
    created_at: '2026-08-30T00:05:00.000Z',
  };
}

function coverageRun(id) {
  return {
    id,
    name: 'KIDULTS ASI Requirement-to-Adapter Coverage v1',
    path: '.github/workflows/kidults-asi-requirement-adapter-coverage-v1.yml',
    display_title: `KIDULTS Coverage / source-${sourceSha}`,
    event: 'workflow_run',
    status: 'completed',
    conclusion: 'success',
    head_sha: sourceSha,
    head_branch: 'main',
    created_at: '2026-08-30T00:05:00.000Z',
  };
}

const oneHundredOne = Array.from({ length: 101 }, (_, index) => arlRun(index + 1));
oneHundredOne[100] = arlRun(9999, 'KIDULTS ARL / p1-9999');
const reconciled101 = reconcileArlAuthoritativeGenerationPages({
  pages: [
    { total_count: 101, workflow_runs: oneHundredOne.slice(0, 100) },
    { total_count: 101, workflow_runs: oneHundredOne.slice(100) },
  ],
  sourceSha,
  headBranch: 'main',
  expectedDisplayTitle: 'KIDULTS ARL / p1-9999',
  currentRunId: 9999,
  createdSince,
  createdThrough,
});
assert.equal(reconciled101.returned_count, 101);
assert.equal(reconciled101.pagination_reconciled_complete, true);
assert.equal(reconciled101.current_run_in_complete_query, true);
assert.equal(reconciled101.current_run_identity_authority, 'DIRECT_RUN_ENDPOINT_REQUIRED');
assert.equal(reconciled101.history_query_role, 'HISTORICAL_PEER_RECONCILIATION');

assert.throws(() => reconcileArlAuthoritativeGenerationPages({
  pages: [{ total_count: 101, workflow_runs: oneHundredOne.slice(0, 100) }],
  sourceSha,
  headBranch: 'main',
  expectedDisplayTitle: 'KIDULTS ARL / p1-9999',
  currentRunId: 9999,
  createdSince,
  createdThrough,
}), (error) => error instanceof OrchestrationRunHistoryError && error.message.startsWith('ARL_AUTHORITATIVE_PRODUCER_QUERY_PAGINATION_INCOMPLETE'));

const duplicateGeneration = structuredClone(oneHundredOne);
duplicateGeneration[99].display_title = 'KIDULTS ARL / p1-9999';
assert.throws(() => reconcileArlAuthoritativeGenerationPages({
  pages: [
    { total_count: 101, workflow_runs: duplicateGeneration.slice(0, 100) },
    { total_count: 101, workflow_runs: duplicateGeneration.slice(100) },
  ],
  sourceSha,
  headBranch: 'main',
  expectedDisplayTitle: 'KIDULTS ARL / p1-9999',
  currentRunId: 9999,
  createdSince,
  createdThrough,
}), (error) => error instanceof OrchestrationRunHistoryError && error.message === 'ARL_AUTHORITATIVE_PRODUCER_DUPLICATE:100');

const missingCurrent = structuredClone(oneHundredOne);
missingCurrent[100] = arlRun(101);
const missingCurrentReconciled = reconcileArlAuthoritativeGenerationPages({
  pages: [
    { total_count: 101, workflow_runs: missingCurrent.slice(0, 100) },
    { total_count: 101, workflow_runs: missingCurrent.slice(100) },
  ],
  sourceSha,
  headBranch: 'main',
  expectedDisplayTitle: 'KIDULTS ARL / p1-9999',
  currentRunId: 9999,
  createdSince,
  createdThrough,
});
assert.equal(missingCurrentReconciled.current_run_in_complete_query, false);
assert.equal(missingCurrentReconciled.current_run_listing_visibility_required, false);
assert.equal(missingCurrentReconciled.current_run_identity_authority, 'DIRECT_RUN_ENDPOINT_REQUIRED');
assert.equal(missingCurrentReconciled.history_query_role, 'HISTORICAL_PEER_RECONCILIATION');

const wrongCurrentTitle = structuredClone(oneHundredOne);
wrongCurrentTitle[100] = arlRun(9999, 'KIDULTS ARL / p1-9998');
assert.throws(() => reconcileArlAuthoritativeGenerationPages({
  pages: [
    { total_count: 101, workflow_runs: wrongCurrentTitle.slice(0, 100) },
    { total_count: 101, workflow_runs: wrongCurrentTitle.slice(100) },
  ],
  sourceSha,
  headBranch: 'main',
  expectedDisplayTitle: 'KIDULTS ARL / p1-9999',
  currentRunId: 9999,
  createdSince,
  createdThrough,
}), (error) => error instanceof OrchestrationRunHistoryError && error.message === 'ARL_CURRENT_RUN_GENERATION_TITLE_MISMATCH:9999');

const exactArlRun = arlRun(8101, 'KIDULTS ARL / p1-7101');
const exactProducer = resolveCoverageAuthoritativeProducer({
  run: exactArlRun,
  receipt: {
    source_sha: sourceSha,
    p1_source_sha: sourceSha,
    producer_workflow_run_id: 8101,
    producer_display_title: 'KIDULTS ARL / p1-7101',
    p1_workflow_run_id: 7101,
    authoritative_producer: true,
    downstream_consumable: true,
    exact_generation_bound: true,
    exact_triggering_run_bound: true,
  },
  sourceSha,
  headBranch: 'main',
});
assert.equal(exactProducer.authoritative_producer_cardinality, 1);
assert.equal(exactProducer.global_same_head_history_scan_performed, false);

function exactPriorPayload(total) {
  return {
    total_count: total,
    workflow_runs: Array.from({ length: Math.min(total, 100) }, (_, index) => coverageRun(9000 + index)),
  };
}

const prior2000 = resolveCoveragePriorSuccessExactQuery({
  payload: exactPriorPayload(2000), sourceSha, headBranch: 'main', createdSince,
});
const prior2001 = resolveCoveragePriorSuccessExactQuery({
  payload: exactPriorPayload(2001), sourceSha, headBranch: 'main', createdSince,
});
assert.equal(prior2000.prior_success_count, 2000);
assert.equal(prior2001.prior_success_count, 2001);
assert.equal(prior2000.pagination_required_for_count, false);
assert.equal(prior2001.pagination_required_for_count, false);

const filterDrift = exactPriorPayload(2001);
filterDrift.workflow_runs[0].display_title = 'KIDULTS Coverage / manual-1';
assert.throws(() => resolveCoveragePriorSuccessExactQuery({
  payload: filterDrift, sourceSha, headBranch: 'main', createdSince,
}), (error) => error instanceof OrchestrationRunHistoryError && error.message.startsWith('COVERAGE_PRIOR_SUCCESS_TITLE_FILTER_DRIFT'));

const shortPage = exactPriorPayload(2001);
shortPage.workflow_runs.pop();
assert.throws(() => resolveCoveragePriorSuccessExactQuery({
  payload: shortPage, sourceSha, headBranch: 'main', createdSince,
}), (error) => error instanceof OrchestrationRunHistoryError && error.message.startsWith('COVERAGE_PRIOR_SUCCESS_EXACT_QUERY_RETURN_COUNT_INVALID'));

process.stdout.write(`${JSON.stringify({
  id: 'kidults-asi-orchestration-run-history-validation-v1',
  state: 'VERIFIED_PASS',
  arl_same_head_101_reconciled: true,
  arl_incomplete_101_rejected: true,
  arl_duplicate_generation_rejected: true,
  arl_current_run_list_visibility_race_tolerated: true,
  arl_current_run_visible_title_mismatch_rejected: true,
  arl_current_run_identity_requires_direct_endpoint: true,
  arl_direct_current_run_contract_static_bound: true,
  coverage_exact_upstream_query_history_independent: true,
  coverage_prior_success_2000_resolved: prior2000.prior_success_count,
  coverage_prior_success_2001_resolved: prior2001.prior_success_count,
  exact_query_filter_drift_rejected: true,
  exact_query_short_page_rejected: true,
  production: 'HOLD',
}, null, 2)}\n`);
