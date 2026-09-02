import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('.github/workflows');
const POLICY_VERSION = '1.2';
const ATOMIC_LANDING_WORKFLOW = path.resolve(ROOT, 'kidults-atomic-governed-landing-v1.yml');
const ATOMIC_LANDING_RUNNER = path.resolve('scripts/kidults/kpmo/run-atomic-governed-landing-v1.mjs');
const ATOMIC_LANDING_POST_VALIDATOR = path.resolve('scripts/kidults/market/current-sold-postlanding-v1.mjs');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    if (/\.ya?ml$/i.test(entry.name)) return [full];
    return [];
  });
}

function activeLines(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+#.*$/, '').trimEnd())
    .filter((line) => line.trim() && !line.trimStart().startsWith('#'));
}

function containsDirectGitPush(line) {
  let candidate = line.trim();
  if (/^run:\s*/i.test(candidate)) candidate = candidate.replace(/^run:\s*/i, '');
  if (/^-\s*/.test(candidate)) candidate = candidate.replace(/^-\s*/, '');
  return /^(?:git\s+push)\b/i.test(candidate)
    || /(?:&&|\|\||;)\s*git\s+push\b/i.test(candidate);
}

function containsDirectRepositoryApiMutation(line) {
  let candidate = line.trim();
  if (/^run:\s*/i.test(candidate)) candidate = candidate.replace(/^run:\s*/i, '');
  return /^(?:gh\s+api)\b.*\/repos\/[^\s]+\/(?:contents|git\/refs|git\/commits)\b/i.test(candidate)
    || /(?:&&|\|\||;)\s*gh\s+api\b.*\/repos\/[^\s]+\/(?:contents|git\/refs|git\/commits)\b/i.test(candidate);
}

function violationsFor(text) {
  const lines = activeLines(text);
  const findings = [];
  if (lines.some((line) => /^\s*contents:\s*write\s*$/i.test(line))) findings.push('contents-write');
  if (lines.some((line) => /^\s*permissions:\s*write-all\s*$/i.test(line))) findings.push('permissions-write-all');
  if (lines.some(containsDirectGitPush)) findings.push('direct-git-push');
  if (lines.some(containsDirectRepositoryApiMutation)) findings.push('direct-github-repository-mutation-api');
  return [...new Set(findings)];
}

function constrainedAtomicLandingViolations(workflow, runner, postValidator) {
  const workflowRequirements = [
    ['workflow-name', 'name: KIDULTS Atomic Governed Landing V1'],
    ['dispatch-only', 'on:\n  workflow_dispatch:'],
    ['exact-pr-input', 'pull_request_number:'],
    ['exact-head-input', 'expected_head_sha:'],
    ['operation-authorization-input', 'landing_authorization_id:'],
    ['global-main-serialization', 'group: kidults-atomic-governed-landing-v1-main'],
    ['serialized-pr-landing', 'cancel-in-progress: false'],
    ['main-checkout', 'ref: main'],
    ['credential-persistence-disabled', 'persist-credentials: false'],
    ['main-ref-assertion', 'test "$GITHUB_REF" = refs/heads/main'],
    ['live-actor-binding', 'LANDING_ACTOR: ${{ github.actor }}'],
    ['trusted-postlanding-stage', 'Stage trusted Current-SOLD post-landing validator'],
    ['trusted-postlanding-install', 'install -m 0500'],
    ['landing-step-output', 'id: landing'],
    ['fixed-runner', 'run: node scripts/kidults/kpmo/run-atomic-governed-landing-v1.mjs'],
    ['exact-merge-checkout', 'ref: ${{ steps.landing.outputs.merge_commit_sha }}'],
    ['exact-merge-depth', 'fetch-depth: 2'],
    ['postlanding-exact-sha-env', 'CURRENT_SOLD_MERGE_SHA: ${{ steps.landing.outputs.merge_commit_sha }}'],
    ['postlanding-runner-temp', 'run: node "$RUNNER_TEMP/current-sold-postlanding-v1.mjs"'],
    ['postlanding-artifact', 'kidults-current-sold-postlanding-v1-${{ github.run_id }}-${{ github.run_attempt }}'],
  ];
  const runnerRequirements = [
    ['owner-actor-source', 'const repositoryOwner = repositoryState.owner?.login;'],
    ['owner-actor-assertion', 'assertLandingActorAndAuthorization(landingActor, repositoryOwner, authorizationId, prNumber, expectedHeadSha);'],
    ['initial-live-pr-read', 'const initial = await request(`/pulls/${prNumber}`);'],
    ['changed-file-read', 'const changedFileRecords = await pages(`/pulls/${prNumber}/files`);'],
    ['current-sold-surface', 'const currentSoldChangedFiles = changedFilenames.filter(isCurrentSoldPath);'],
    ['final-live-pr-reread', 'const final = await request(`/pulls/${prNumber}`);'],
    ['post-status-live-pr-reread', 'const immediatePreMerge = await request(`/pulls/${prNumber}`);'],
    ['post-status-scope-reread', "throw new Error('IMMEDIATE_PREMERGE_SCOPE_STATUS_DRIFT')"],
    ['post-status-check-reread', 'evaluateRequiredCheckRuns(await checkRuns(expectedHeadSha), scopePolicy.technical_base_contexts);'],
    ['server-merge-put', "method: 'PUT'"],
    ['server-merge-exact-head', 'body: JSON.stringify({sha: expectedHeadSha, merge_method: \'merge\'})'],
    ['post-merge-main-read', "const postMergeMain = await request('/branches/main');"],
    ['post-merge-main-assertion', "throw new Error('POST_MERGE_MAIN_SHA_MISMATCH')"],
    ['workflow-output', 'fs.appendFileSync(githubOutput'],
    ['merge-output', '`merge_commit_sha=${merged.sha}`'],
    ['premerge-output', '`premerge_main_sha=${initial.base.sha}`'],
    ['approved-head-output', '`merged_pr_head_sha=${expectedHeadSha}`'],
    ['current-sold-output', '`current_sold_changed=${currentSoldChanged}`'],
    ['postlanding-required-state', 'MERGED_VERIFIED_POSTLANDING_REQUIRED'],
    ['same-job-boundary', 'REQUIRED_SAME_TRUSTED_JOB'],
    ['failure-status-revocation', "await publish('failure', error?.code || error?.message || 'atomic landing failed')"],
    ['label-atomicity-caveat', 'no_merge_label_server_transactionality_claimed: false'],
  ];
  const postValidatorRequirements = [
    ['status-context', "const statusContext = 'KIDULTS Current-SOLD Post-Landing V1';"],
    ['pending-status', "await postStatus('pending'"],
    ['success-status', "await postStatus('success'"],
    ['failure-status', "await postStatus('failure'"],
    ['two-parent-merge', 'parentLine.length === 3'],
    ['first-parent', 'parentLine[1] === premergeMainSha'],
    ['second-parent', 'parentLine[2] === mergedPrHeadSha'],
    ['merge-subject', 'Merge pull request #${prNumber} from'],
    ['current-sold-surface', 'POSTLANDING_CURRENT_SOLD_SURFACE_NOT_TOUCHED'],
    ['test-count', 'expected_tests: 56'],
    ['empirical-zero', 'lawful_empirical_current_sold_count: 0'],
    ['candidate-zero', 'private_candidate_current_sold_count: 0'],
    ['postgres-migration-hold', 'postgres_migration_applied: false'],
    ['postgres-write-hold', 'postgres_rows_written: 0'],
    ['provider-hold', 'provider_calls: 0'],
    ['deployment-hold', 'deployment: false'],
    ['public-hold', "public: 'HOLD'"],
    ['production-hold', "production: 'HOLD'"],
    ['g5-hold', "g5: 'HOLD'"],
  ];
  const findings = [];
  for (const [id, fragment] of workflowRequirements) {
    if (!workflow.includes(fragment)) findings.push(`atomic-landing-workflow-${id}`);
  }
  for (const [id, fragment] of runnerRequirements) {
    if (!runner.includes(fragment)) findings.push(`atomic-landing-runner-${id}`);
  }
  for (const [id, fragment] of postValidatorRequirements) {
    if (!postValidator.includes(fragment)) findings.push(`atomic-landing-post-validator-${id}`);
  }
  if ((workflow.match(/^\s*contents:\s*write\s*$/gmi) || []).length !== 1) {
    findings.push('atomic-landing-single-contents-write');
  }
  if (/^\s{2}(?:push|pull_request|pull_request_target|schedule|workflow_run|repository_dispatch):\s*$/mi.test(workflow)) {
    findings.push('atomic-landing-workflow-dispatch-only');
  }
  const nonContentsViolations = violationsFor(workflow).filter(value => value !== 'contents-write');
  if (nonContentsViolations.length) findings.push(...nonContentsViolations.map(value => `atomic-landing-${value}`));
  return [...new Set(findings)];
}

const mutationCases = [
  ['permissions:\n  contents: write', 'contents-write'],
  ['permissions: write-all', 'permissions-write-all'],
  ['run: git push origin HEAD:main', 'direct-git-push'],
  ['run: git add x && git push', 'direct-git-push'],
  ['run: gh api --method POST /repos/acme/repo/git/refs', 'direct-github-repository-mutation-api'],
];
const negativeCases = [
  "run: echo 'Repository mutation did not occur; no direct push was performed.'",
  "run: echo 'git push is forbidden by policy'",
];
for (const [sample, expected] of mutationCases) {
  const found = violationsFor(sample);
  if (!found.includes(expected)) throw new Error(`workflow mutation guard self-test missed ${expected}: ${sample}`);
}
for (const sample of negativeCases) {
  const found = violationsFor(sample);
  if (found.length) throw new Error(`workflow mutation guard false-positive self-test: ${sample} -> ${found.join(',')}`);
}

const files = walk(ROOT);
const findings = [];
let constrainedAtomicLandingExceptions = 0;
for (const file of files) {
  const workflow = fs.readFileSync(file, 'utf8');
  let violations = violationsFor(workflow);
  if (path.resolve(file) === ATOMIC_LANDING_WORKFLOW && violations.includes('contents-write')) {
    const runner = fs.readFileSync(ATOMIC_LANDING_RUNNER, 'utf8');
    const postValidator = fs.readFileSync(ATOMIC_LANDING_POST_VALIDATOR, 'utf8');
    const exceptionViolations = constrainedAtomicLandingViolations(workflow, runner, postValidator);
    if (exceptionViolations.length === 0 && violations.length === 1) {
      violations = [];
      constrainedAtomicLandingExceptions += 1;
    } else {
      violations = [...new Set([...violations, ...exceptionViolations])];
    }
  }
  if (violations.length) findings.push({ file: path.relative('.', file), violations });
}

if (constrainedAtomicLandingExceptions !== 1) {
  findings.push({
    file: path.relative('.', ATOMIC_LANDING_WORKFLOW),
    violations: ['constrained-atomic-landing-exception-not-proven-exactly-once'],
  });
}

const atomicWorkflow = fs.readFileSync(ATOMIC_LANDING_WORKFLOW, 'utf8');
const atomicRunner = fs.readFileSync(ATOMIC_LANDING_RUNNER, 'utf8');
const atomicPostValidator = fs.readFileSync(ATOMIC_LANDING_POST_VALIDATOR, 'utf8');
const atomicMutationCases = [
  {
    id: 'owner-actor-source',
    workflow: atomicWorkflow,
    runner: atomicRunner.replace(
      'const repositoryOwner = repositoryState.owner?.login;',
      'const repositoryOwner = landingActor;',
    ),
    postValidator: atomicPostValidator,
    expected: 'atomic-landing-runner-owner-actor-source',
  },
  {
    id: 'owner-actor-assertion',
    workflow: atomicWorkflow,
    runner: atomicRunner.replace(
      'assertLandingActorAndAuthorization(landingActor, repositoryOwner, authorizationId, prNumber, expectedHeadSha);',
      'assertLandingActorAndAuthorization(landingActor, landingActor, authorizationId, prNumber, expectedHeadSha);',
    ),
    postValidator: atomicPostValidator,
    expected: 'atomic-landing-runner-owner-actor-assertion',
  },
  {
    id: 'final-reread',
    workflow: atomicWorkflow,
    runner: atomicRunner.replace('const immediatePreMerge = await request(`/pulls/${prNumber}`);', 'const immediatePreMerge = final;'),
    postValidator: atomicPostValidator,
    expected: 'atomic-landing-runner-post-status-live-pr-reread',
  },
  {
    id: 'expected-head',
    workflow: atomicWorkflow,
    runner: atomicRunner.replace("body: JSON.stringify({sha: expectedHeadSha, merge_method: 'merge'})", "body: JSON.stringify({merge_method: 'merge'})"),
    postValidator: atomicPostValidator,
    expected: 'atomic-landing-runner-server-merge-exact-head',
  },
  {
    id: 'failure-revocation',
    workflow: atomicWorkflow,
    runner: atomicRunner.replace("await publish('failure', error?.code || error?.message || 'atomic landing failed')", 'void error'),
    postValidator: atomicPostValidator,
    expected: 'atomic-landing-runner-failure-status-revocation',
  },
  {
    id: 'label-caveat',
    workflow: atomicWorkflow,
    runner: atomicRunner.replace('no_merge_label_server_transactionality_claimed: false', 'no_merge_label_server_transactionality_claimed: true'),
    postValidator: atomicPostValidator,
    expected: 'atomic-landing-runner-label-atomicity-caveat',
  },
  {
    id: 'trusted-stage',
    workflow: atomicWorkflow.replace('install -m 0500', 'install -m 0777'),
    runner: atomicRunner,
    postValidator: atomicPostValidator,
    expected: 'atomic-landing-workflow-trusted-postlanding-install',
  },
  {
    id: 'second-parent',
    workflow: atomicWorkflow,
    runner: atomicRunner,
    postValidator: atomicPostValidator.replace('parentLine[2] === mergedPrHeadSha', 'parentLine[2] === premergeMainSha'),
    expected: 'atomic-landing-post-validator-second-parent',
  },
  {
    id: 'postlanding-success-status',
    workflow: atomicWorkflow,
    runner: atomicRunner,
    postValidator: atomicPostValidator.replace("await postStatus('success'", "await postStatus('pending'"),
    expected: 'atomic-landing-post-validator-success-status',
  },
];
for (const mutation of atomicMutationCases) {
  const mutationApplied = mutation.workflow !== atomicWorkflow
    || mutation.runner !== atomicRunner
    || mutation.postValidator !== atomicPostValidator;
  if (!mutationApplied) {
    throw new Error(`atomic landing exception self-test mutation did not apply: ${mutation.id}`);
  }
  const found = constrainedAtomicLandingViolations(mutation.workflow, mutation.runner, mutation.postValidator);
  if (!found.includes(mutation.expected)) {
    throw new Error(`atomic landing exception self-test missed ${mutation.id}: ${mutation.expected}`);
  }
}

const result = {
  suite: 'KIDULTS_WORKFLOW_REPOSITORY_MUTATION_BOUNDARY_V1',
  policy_version: POLICY_VERSION,
  workflows_scanned: files.length,
  mutation_cases_detected: mutationCases.length,
  negative_cases_rejected: negativeCases.length,
  policy: 'NO_DIRECT_REPOSITORY_MUTATION_FROM_GITHUB_ACTIONS_EXCEPT_CONSTRAINED_ATOMIC_GOVERNED_SERVER_MERGE_WITH_SAME_JOB_POSTLANDING_VALIDATION',
  constrained_atomic_landing_exceptions: constrainedAtomicLandingExceptions,
  atomic_landing_mutation_cases_detected: atomicMutationCases.length,
  findings,
  result: findings.length === 0 ? 'PASS' : 'FAIL',
  empirical_gate_effect: 'NONE',
  production: 'HOLD',
  public: 'HOLD',
  g5: 'EXPLICIT_APPROVAL_REQUIRED',
};
console.log(JSON.stringify(result, null, 2));
if (findings.length) process.exit(1);
