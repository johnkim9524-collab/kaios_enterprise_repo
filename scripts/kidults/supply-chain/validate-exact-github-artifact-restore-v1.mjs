#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  ExactArtifactRestoreError,
  collectCompletePages,
  validateArtifact,
  validateProducerRun,
} from './restore-exact-github-artifact-v1.mjs';

const resolverPath = 'scripts/kidults/supply-chain/restore-exact-github-artifact-v1.mjs';
const criticalPaths = [
  '.github/workflows/kidults-asi-source-fabric-scale-pi1.yml',
  '.github/workflows/kidults-asi-self-driving-control-loop-v1.yml',
  '.github/workflows/kidults-asi-global-any-site-hourly-pooling-v1.yml',
  'scripts/kidults/source-intelligence/asi-global-low-risk-discovery-v1.mjs',
];

function expectRejected(operation, code) {
  let caught = null;
  try {
    operation();
  } catch (error) {
    caught = error;
  }
  assert(caught instanceof ExactArtifactRestoreError, `expected ${code}, got ${caught}`);
  assert.equal(caught.code, code);
}

async function expectAsyncRejected(operation, code) {
  let caught = null;
  try {
    await operation();
  } catch (error) {
    caught = error;
  }
  assert(caught instanceof ExactArtifactRestoreError, `expected ${code}, got ${caught}`);
  assert.equal(caught.code, code);
}

const rows = Array.from({ length: 101 }, (_, index) => ({ id: index + 1 }));
const complete = await collectCompletePages({
  label: 'MUTATION_HISTORY',
  rowsKey: 'workflow_runs',
  maxPages: 2,
  fetchPage: async (page) => ({
    total_count: 101,
    workflow_runs: page === 1 ? rows.slice(0, 100) : rows.slice(100),
  }),
});
assert.equal(complete.rows.length, 101);
assert.equal(complete.pagesFetched, 2);
assert.equal(complete.paginationReconciledComplete, true);

await expectAsyncRejected(() => collectCompletePages({
  label: 'MUTATION_HISTORY', rowsKey: 'workflow_runs', maxPages: 1,
  fetchPage: async () => ({ total_count: 101, workflow_runs: rows.slice(0, 100) }),
}), 'PAGINATION_BOUND_EXCEEDED');
await expectAsyncRejected(() => collectCompletePages({
  label: 'MUTATION_HISTORY', rowsKey: 'workflow_runs', maxPages: 2,
  fetchPage: async (page) => page === 1
    ? { total_count: 101, workflow_runs: rows.slice(0, 100) }
    : { total_count: 102, workflow_runs: rows.slice(100) },
}), 'MUTATION_HISTORY_TOTAL_COUNT_CHANGED');
await expectAsyncRejected(() => collectCompletePages({
  label: 'MUTATION_HISTORY', rowsKey: 'workflow_runs', maxPages: 2,
  fetchPage: async (page) => page === 1
    ? { total_count: 101, workflow_runs: rows.slice(0, 100) }
    : { total_count: 101, workflow_runs: [{ id: 100 }] },
}), 'MUTATION_HISTORY_DUPLICATE_ROW_ID');
await expectAsyncRejected(() => collectCompletePages({
  label: 'MUTATION_HISTORY', rowsKey: 'workflow_runs', maxPages: 2,
  fetchPage: async (page) => page === 1
    ? { total_count: 101, workflow_runs: rows.slice(0, 100) }
    : { total_count: 101, workflow_runs: [] },
}), 'MUTATION_HISTORY_PAGINATION_INCOMPLETE');

const specification = {
  workflowName: 'KIDULTS ASI Test Producer v1',
  workflowPath: '.github/workflows/kidults-asi-test-producer-v1.yml',
  artifactName: 'kidults-asi-test-state-v1',
  branch: 'main',
  allowedEvents: ['schedule', 'workflow_dispatch', 'push'],
};
const repository = 'kidults/example';
const run = {
  id: 41,
  run_attempt: 2,
  repository: { full_name: repository },
  name: specification.workflowName,
  path: specification.workflowPath,
  head_branch: 'main',
  head_sha: 'a'.repeat(40),
  status: 'completed',
  conclusion: 'success',
  event: 'schedule',
  created_at: new Date().toISOString(),
};
validateProducerRun(run, specification, repository);
const runMutations = [
  ['RUN_REPOSITORY_MISMATCH', { repository: { full_name: 'attacker/repo' } }],
  ['RUN_WORKFLOW_NAME_MISMATCH', { name: 'Forged Workflow' }],
  ['RUN_WORKFLOW_PATH_MISMATCH', { path: '.github/workflows/forged.yml' }],
  ['RUN_BRANCH_MISMATCH', { head_branch: 'feature' }],
  ['RUN_SOURCE_SHA_INVALID', { head_sha: 'short' }],
  ['RUN_NOT_SUCCESSFUL', { conclusion: 'failure' }],
  ['RUN_EVENT_FORBIDDEN', { event: 'pull_request_target' }],
];
for (const [code, mutation] of runMutations) {
  expectRejected(() => validateProducerRun({ ...run, ...mutation }, specification, repository), code);
}

const artifact = {
  id: 71,
  name: specification.artifactName,
  expired: false,
  digest: `sha256:${'b'.repeat(64)}`,
  expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  workflow_run: { id: run.id, head_sha: run.head_sha, head_branch: run.head_branch },
};
validateArtifact(artifact, run, specification);
const artifactMutations = [
  ['ARTIFACT_NAME_MISMATCH', { name: 'forged-artifact' }],
  ['ARTIFACT_EXPIRED', { expired: true }],
  ['ARTIFACT_DIGEST_INVALID', { digest: 'sha256:unbound' }],
  ['ARTIFACT_RUN_ID_MISMATCH', { workflow_run: { ...artifact.workflow_run, id: 72 } }],
  ['ARTIFACT_SOURCE_SHA_MISMATCH', { workflow_run: { ...artifact.workflow_run, head_sha: 'c'.repeat(40) } }],
  ['ARTIFACT_BRANCH_MISMATCH', { workflow_run: { ...artifact.workflow_run, head_branch: 'feature' } }],
  ['ARTIFACT_EXPIRY_INVALID', { expires_at: new Date(Date.now() - 1_000).toISOString() }],
];
for (const [code, mutation] of artifactMutations) {
  expectRejected(() => validateArtifact({ ...artifact, ...mutation }, run, specification), code);
}

function staticFailures(resolverSource, criticalSources) {
  const failures = [];
  const resolverMarkers = [
    'collectCompletePages',
    'PAGINATION_BOUND_EXCEEDED',
    'pagination_reconciled_complete: true',
    'validateWorkflowMetadata',
    'validateProducerRun',
    'validateArtifact',
    'ARTIFACT_CARDINALITY_INVALID',
    'ARTIFACT_READBACK_MISMATCH',
    'ARCHIVE_DIGEST_MISMATCH',
    'validate-safe-zip-archive-v1.py',
    '--required-basename',
    'VERIFIED_PASS_PRE_EXTRACTION',
    'safe_zip_validated_before_extraction: true',
    'PRODUCER_HISTORY_OUTSIDE_LOOKBACK',
  ];
  for (const marker of resolverMarkers) {
    if (!resolverSource.includes(marker)) failures.push(`resolver marker missing: ${marker}`);
  }
  const safeIndex = resolverSource.indexOf("execFileSync('python3', safeZipArguments");
  const unzipIndex = resolverSource.indexOf("execFileSync('unzip'");
  if (safeIndex < 0 || unzipIndex < 0 || safeIndex >= unzipIndex) {
    failures.push('Safe-ZIP must execute before extraction');
  }
  if (resolverSource.includes('/actions/artifacts?per_page=100')) {
    failures.push('broad repository-global first-page artifact lookup present in resolver');
  }
  for (const [criticalPath, source] of criticalSources) {
    if (source.includes('/actions/artifacts?per_page=100')) {
      failures.push(`${criticalPath}: broad repository-global artifact lookup remains`);
    }
    if (!source.includes('restore-exact-github-artifact-v1.mjs')) {
      failures.push(`${criticalPath}: governed exact restore missing`);
    }
  }
  return failures;
}

const resolverSource = fs.readFileSync(resolverPath, 'utf8');
const criticalSources = criticalPaths.map((criticalPath) => [criticalPath, fs.readFileSync(criticalPath, 'utf8')]);
assert.deepEqual(staticFailures(resolverSource, criticalSources), []);

const sourceMutations = [
  ['remove complete pagination', 'pagination_reconciled_complete: true', 'pagination_reconciled_complete: false'],
  ['remove artifact cardinality', 'ARTIFACT_CARDINALITY_INVALID', 'ARTIFACT_CARDINALITY_IGNORED'],
  ['remove exact producer validation', 'validateProducerRun', 'acceptProducerRun'],
  ['remove archive digest binding', 'ARCHIVE_DIGEST_MISMATCH', 'ARCHIVE_DIGEST_IGNORED'],
  ['remove required basename binding', '--required-basename', '--optional-basename'],
  ['move Safe-ZIP after extraction', "execFileSync('python3', safeZipArguments", "execFileSync('python3-after-unzip', safeZipArguments"],
  ['allow stale baseline reset', 'PRODUCER_HISTORY_OUTSIDE_LOOKBACK', 'PRODUCER_HISTORY_BASELINE_ALLOWED'],
];
for (const [label, from, to] of sourceMutations) {
  assert(resolverSource.includes(from), `missing mutation fixture: ${label}`);
  assert(staticFailures(resolverSource.replaceAll(from, to), criticalSources).length > 0, `mutation accepted: ${label}`);
}
for (let index = 0; index < criticalSources.length; index += 1) {
  const mutatedCriticalSources = criticalSources.map(([criticalPath, source], sourceIndex) => [
    criticalPath,
    sourceIndex === index
      ? source.replaceAll('restore-exact-github-artifact-v1.mjs', 'restore-unbound-artifact.mjs')
      : source,
  ]);
  assert(
    staticFailures(resolverSource, mutatedCriticalSources).length > 0,
    `critical resolver removal accepted: ${criticalSources[index][0]}`,
  );
}

console.log(JSON.stringify({
  state: 'VERIFIED_PASS',
  control: 'EXACT_GITHUB_ARTIFACT_RESTORE',
  complete_pagination_page_two_case: true,
  pagination_mutations_rejected: 4,
  producer_provenance_mutations_rejected: runMutations.length,
  artifact_binding_mutations_rejected: artifactMutations.length,
  source_mutations_rejected: sourceMutations.length + criticalSources.length,
  critical_consumers: criticalPaths.length,
  public_release: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
}, null, 2));
