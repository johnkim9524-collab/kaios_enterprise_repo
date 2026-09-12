#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const workflowDir = path.resolve('.github/workflows');
const supersessionWorkflow = 'kpmo-exact-head-ci-supersession-v1.yml';
const lifecycleWorkflow = 'kpmo-pr-lifecycle-integrity-v1.yml';
const allowedUnbounded = new Set([
  'ci-validation.yml',
  'kidults-governed-landing-authorization-v1.yml',
  'kidults-scope-aware-authoritative-status-v1.yml',
  lifecycleWorkflow,
  supersessionWorkflow,
  'solo-owner-preflight.yml'
]);

function eventBlock(source) {
  const lines = source.split(/\r?\n/);
  const start = lines.findIndex((line) => /^  pull_request(?:_target)?:\s*$/.test(line));
  if (start < 0) return null;
  const block = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^  [A-Za-z_][\w-]*:\s*/.test(lines[index])) break;
    if (/^[^\s#]/.test(lines[index])) break;
    block.push(lines[index]);
  }
  return block;
}

function supersessionViolations(source) {
  const problems = [];
  const jobsIndex = source.indexOf('\njobs:');
  const workflowScope = jobsIndex >= 0 ? source.slice(0, jobsIndex) : source;

  if (!/pull_request_target:\s*\n\s{4}branches:\s*\[main\]/.test(source)) {
    problems.push('PULL_REQUEST_TARGET_NOT_RESTRICTED_TO_MAIN');
  }
  if (/^\s{2}actions:\s*write\s*$/m.test(workflowScope)) {
    problems.push('WORKFLOW_LEVEL_ACTIONS_WRITE');
  }
  if (!/if:\s*github\.event_name == 'push' \|\| github\.event\.pull_request\.head\.repo\.full_name == github\.repository/.test(source)) {
    problems.push('MISSING_SAME_REPOSITORY_JOB_GUARD');
  }
  if (!/\n\s{4}permissions:\s*\n\s{6}actions:\s*write\s*$/m.test(source)) {
    problems.push('MISSING_JOB_SCOPED_ACTIONS_WRITE');
  }
  if (!source.includes('HEAD_REPOSITORY: ${{ github.event.pull_request.head.repo.full_name || github.repository }}')) {
    problems.push('MISSING_HEAD_REPOSITORY_BINDING');
  }
  if (!source.includes('[[ "${HEAD_REPOSITORY}" == "${REPOSITORY}" ]] || { echo "Refusing Actions write for fork PR" >&2; exit 1; }')) {
    problems.push('MISSING_RUNTIME_FORK_REJECTION');
  }
  if (!source.includes('--data-urlencode "branch=${HEAD_BRANCH}"')) {
    problems.push('MISSING_URL_ENCODED_BRANCH_QUERY');
  }
  if (source.includes('/actions/runs?branch=${HEAD_BRANCH}')) {
    problems.push('RAW_BRANCH_QUERY_INTERPOLATION');
  }
  return problems;
}

function lifecycleViolations(source) {
  const problems = [];
  const jobsIndex = source.indexOf('\njobs:');
  const workflowScope = jobsIndex >= 0 ? source.slice(0, jobsIndex) : source;

  if (!/pull_request_target:\s*\n\s{4}branches:\s*\[main\]/.test(source)) {
    problems.push('LIFECYCLE_TARGET_NOT_RESTRICTED_TO_MAIN');
  }
  if (/^\s{2}(?:actions|checks|contents|deployments|issues|packages|pull-requests|statuses):\s*write\s*$/m.test(workflowScope)) {
    problems.push('LIFECYCLE_WORKFLOW_LEVEL_WRITE');
  }
  if (!/^permissions:\s*\n\s{2}contents:\s*read\s*$/m.test(source)) {
    problems.push('LIFECYCLE_WORKFLOW_READ_ONLY_BASELINE_MISSING');
  }
  if (!/classify-live-pr:[\s\S]*?permissions:\s*\n\s{6}contents:\s*read\s*\n\s{6}pull-requests:\s*read\s*\n\s{6}statuses:\s*read/.test(source)) {
    problems.push('LIFECYCLE_JOB_READ_ONLY_PERMISSIONS_MISSING');
  }
  if (/classify-live-pr:[\s\S]*?permissions:[\s\S]*?\n\s{6}[A-Za-z-]+:\s*write\s*$/m.test(source)) {
    problems.push('LIFECYCLE_JOB_WRITE_PERMISSION');
  }
  if (!source.includes('ref: ${{ github.event.pull_request.base.sha }}')) {
    problems.push('LIFECYCLE_TRUSTED_BASE_CHECKOUT_MISSING');
  }
  if (source.includes('ref: ${{ github.event.pull_request.head.sha }}')) {
    problems.push('LIFECYCLE_UNTRUSTED_HEAD_CHECKOUT');
  }
  if (!source.includes('persist-credentials: false')) {
    problems.push('LIFECYCLE_PERSIST_CREDENTIALS_NOT_DISABLED');
  }
  if (!source.includes('EXPECTED_HEAD_SHA: ${{ github.event.pull_request.head.sha }}')) {
    problems.push('LIFECYCLE_EVENT_HEAD_BINDING_MISSING');
  }
  if (!source.includes('EXPECTED_BASE_SHA: ${{ github.event.pull_request.base.sha }}')) {
    problems.push('LIFECYCLE_EVENT_BASE_BINDING_MISSING');
  }
  if (!source.includes('if: always()') || !source.includes('Reapply fail-closed lifecycle verdict')) {
    problems.push('LIFECYCLE_TERMINAL_RECEIPT_OR_VERDICT_REAPPLY_MISSING');
  }
  return problems;
}

function assertSupersessionMutationRejected(label, pristine, mutate, violations) {
  const mutated = mutate(pristine);
  if (mutated === pristine) {
    violations.push({ file: supersessionWorkflow, kind: `TRUST_SELF_TEST_MUTATION_NOT_APPLIED:${label}` });
    return;
  }
  if (supersessionViolations(mutated).length === 0) {
    violations.push({ file: supersessionWorkflow, kind: `TRUST_SELF_TEST_FALSE_GREEN:${label}` });
  }
}

function assertLifecycleMutationRejected(label, pristine, mutate, violations) {
  const mutated = mutate(pristine);
  if (mutated === pristine) {
    violations.push({ file: lifecycleWorkflow, kind: `LIFECYCLE_TRUST_SELF_TEST_MUTATION_NOT_APPLIED:${label}` });
    return;
  }
  if (lifecycleViolations(mutated).length === 0) {
    violations.push({ file: lifecycleWorkflow, kind: `LIFECYCLE_TRUST_SELF_TEST_FALSE_GREEN:${label}` });
  }
}

const files = fs.readdirSync(workflowDir)
  .filter((name) => /\.ya?ml$/.test(name))
  .sort();
const violations = [];
let prWorkflows = 0;
let bounded = 0;
let protectedUnbounded = 0;

for (const file of files) {
  const source = fs.readFileSync(path.join(workflowDir, file), 'utf8');
  const block = eventBlock(source);
  if (!block) continue;
  prWorkflows += 1;
  const hasBound = block.some((line) => /^    paths(?:-ignore)?:\s*$/.test(line));
  if (hasBound) {
    bounded += 1;
    continue;
  }
  if (allowedUnbounded.has(file)) {
    protectedUnbounded += 1;
    continue;
  }
  violations.push({ file, kind: 'UNBOUNDED_PULL_REQUEST_TRIGGER' });
}

for (const required of allowedUnbounded) {
  if (!files.includes(required)) violations.push({ file: required, kind: 'MISSING_PROTECTED_WORKFLOW' });
}

if (files.includes(supersessionWorkflow)) {
  const source = fs.readFileSync(path.join(workflowDir, supersessionWorkflow), 'utf8');
  for (const kind of supersessionViolations(source)) {
    violations.push({ file: supersessionWorkflow, kind });
  }

  assertSupersessionMutationRejected('REMOVE_SAME_REPOSITORY_JOB_GUARD', source,
    (text) => text.replace("if: github.event_name == 'push' || github.event.pull_request.head.repo.full_name == github.repository", "if: github.event_name == 'push' || true"), violations);
  assertSupersessionMutationRejected('ADD_WORKFLOW_LEVEL_ACTIONS_WRITE', source,
    (text) => text.replace('  pull-requests: read\n\nconcurrency:', '  pull-requests: read\n  actions: write\n\nconcurrency:'), violations);
  assertSupersessionMutationRejected('RESTORE_RAW_BRANCH_QUERY', source,
    (text) => text.replace('--data-urlencode "branch=${HEAD_BRANCH}" \\\n              --data-urlencode "per_page=100" \\\n              --data-urlencode "page=${page}" \\\n              "${api}/actions/runs"', '"${api}/actions/runs?branch=${HEAD_BRANCH}&per_page=100&page=${page}"'), violations);
  assertSupersessionMutationRejected('REMOVE_MAIN_TARGET_RESTRICTION', source,
    (text) => text.replace('  pull_request_target:\n    branches: [main]\n    types:', '  pull_request_target:\n    types:'), violations);
  assertSupersessionMutationRejected('REMOVE_RUNTIME_FORK_REJECTION', source,
    (text) => text.replace('            [[ "${HEAD_REPOSITORY}" == "${REPOSITORY}" ]] || { echo "Refusing Actions write for fork PR" >&2; exit 1; }\n', ''), violations);
}

if (files.includes(lifecycleWorkflow)) {
  const source = fs.readFileSync(path.join(workflowDir, lifecycleWorkflow), 'utf8');
  for (const kind of lifecycleViolations(source)) {
    violations.push({ file: lifecycleWorkflow, kind });
  }

  assertLifecycleMutationRejected('REMOVE_MAIN_TARGET_RESTRICTION', source,
    (text) => text.replace('  pull_request_target:\n    branches: [main]\n    types:', '  pull_request_target:\n    types:'), violations);
  assertLifecycleMutationRejected('ADD_WORKFLOW_LEVEL_CONTENTS_WRITE', source,
    (text) => text.replace('permissions:\n  contents: read', 'permissions:\n  contents: write'), violations);
  assertLifecycleMutationRejected('CHECKOUT_UNTRUSTED_HEAD', source,
    (text) => text.replace('ref: ${{ github.event.pull_request.base.sha }}', 'ref: ${{ github.event.pull_request.head.sha }}'), violations);
  assertLifecycleMutationRejected('REMOVE_HEAD_BINDING', source,
    (text) => text.replace('EXPECTED_HEAD_SHA: ${{ github.event.pull_request.head.sha }}', 'EXPECTED_HEAD_SHA: unbound'), violations);
  assertLifecycleMutationRejected('REMOVE_VERDICT_REAPPLY', source,
    (text) => text.replace('      - name: Reapply fail-closed lifecycle verdict', '      - name: Removed lifecycle verdict step'), violations);
}

const receipt = {
  id: 'kpmo-pr-impact-routing-v1',
  state: violations.length ? 'VERIFIED_FAIL' : 'VERIFIED_PASS',
  workflow_count: files.length,
  pull_request_workflow_count: prWorkflows,
  bounded_pull_request_workflow_count: bounded,
  protected_unbounded_workflow_count: protectedUnbounded,
  protected_unbounded_allowlist: [...allowedUnbounded].sort(),
  exact_head_supersession_trust_boundary: {
    fork_pr_actions_write: 'DENIED_BY_JOB_GUARD',
    pull_request_target_base: 'main',
    branch_query_encoding: 'DATA_URLENCODE',
    mutation_cases: 5
  },
  pr_lifecycle_trust_boundary: {
    authorization: 'READ_ONLY_CLASSIFICATION',
    pull_request_target_base: 'main',
    source_checkout: 'TRUSTED_BASE_ONLY',
    mutation_cases: 5
  },
  violations
};
console.log(JSON.stringify(receipt, null, 2));
if (violations.length) process.exit(1);
