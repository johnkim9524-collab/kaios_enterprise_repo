import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('.github/workflows');
const POLICY_VERSION = '1.1';
const ATOMIC_LANDING_WORKFLOW = path.resolve(ROOT, 'kidults-atomic-governed-landing-v1.yml');
const ATOMIC_LANDING_RUNNER = path.resolve('scripts/kidults/kpmo/run-atomic-governed-landing-v1.mjs');

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

function constrainedAtomicLandingViolations(workflow, runner) {
  const workflowRequirements = [
    ['workflow-name', 'name: KIDULTS Atomic Governed Landing V1'],
    ['dispatch-only', 'on:\n  workflow_dispatch:'],
    ['exact-pr-input', 'pull_request_number:'],
    ['exact-head-input', 'expected_head_sha:'],
    ['operation-authorization-input', 'landing_authorization_id:'],
    ['serialized-pr-landing', 'cancel-in-progress: false'],
    ['main-checkout', 'ref: main'],
    ['credential-persistence-disabled', 'persist-credentials: false'],
    ['main-ref-assertion', 'test "$GITHUB_REF" = refs/heads/main'],
    ['live-actor-binding', 'LANDING_ACTOR: ${{ github.actor }}'],
    ['fixed-runner', 'run: node scripts/kidults/kpmo/run-atomic-governed-landing-v1.mjs'],
  ];
  const runnerRequirements = [
    ['owner-actor-assertion', 'assertLandingActorAndAuthorization(landingActor, repositoryState.owner?.login'],
    ['initial-live-pr-read', 'const initial = await request(`/pulls/${prNumber}`);'],
    ['final-live-pr-reread', 'const final = await request(`/pulls/${prNumber}`);'],
    ['post-status-live-pr-reread', 'const immediatePreMerge = await request(`/pulls/${prNumber}`);'],
    ['post-status-scope-reread', "throw new Error('IMMEDIATE_PREMERGE_SCOPE_STATUS_DRIFT')"],
    ['post-status-check-reread', 'evaluateRequiredCheckRuns(await checkRuns(expectedHeadSha), scopePolicy.technical_base_contexts);'],
    ['server-merge-put', "method: 'PUT'"],
    ['server-merge-exact-head', 'body: JSON.stringify({sha: expectedHeadSha, merge_method: \'merge\'})'],
    ['failure-status-revocation', "await publish('failure', error?.code || error?.message || 'atomic landing failed')"],
    ['label-atomicity-caveat', 'no_merge_label_server_transactionality_claimed: false'],
  ];
  const findings = [];
  for (const [id, fragment] of workflowRequirements) {
    if (!workflow.includes(fragment)) findings.push(`atomic-landing-workflow-${id}`);
  }
  for (const [id, fragment] of runnerRequirements) {
    if (!runner.includes(fragment)) findings.push(`atomic-landing-runner-${id}`);
  }
  if ((workflow.match(/^\s*contents:\s*write\s*$/gmi) || []).length !== 1) {
    findings.push('atomic-landing-single-contents-write');
  }
  if (/^\s{2}(?:push|pull_request|pull_request_target|schedule|workflow_run):\s*$/mi.test(workflow)) {
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
    const exceptionViolations = constrainedAtomicLandingViolations(workflow, runner);
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
const atomicMutationCases = [
  ['owner-actor', atomicRunner.replace('assertLandingActorAndAuthorization(landingActor, repositoryState.owner?.login', 'assertLandingActorAndAuthorization(landingActor, landingActor'), 'atomic-landing-runner-owner-actor-assertion'],
  ['final-reread', atomicRunner.replace('const immediatePreMerge = await request(`/pulls/${prNumber}`);', 'const immediatePreMerge = final;'), 'atomic-landing-runner-post-status-live-pr-reread'],
  ['expected-head', atomicRunner.replace("body: JSON.stringify({sha: expectedHeadSha, merge_method: 'merge'})", "body: JSON.stringify({merge_method: 'merge'})"), 'atomic-landing-runner-server-merge-exact-head'],
  ['failure-revocation', atomicRunner.replace("await publish('failure', error?.code || error?.message || 'atomic landing failed')", 'void error'), 'atomic-landing-runner-failure-status-revocation'],
  ['label-caveat', atomicRunner.replace('no_merge_label_server_transactionality_claimed: false', 'no_merge_label_server_transactionality_claimed: true'), 'atomic-landing-runner-label-atomicity-caveat'],
];
for (const [id, mutatedRunner, expected] of atomicMutationCases) {
  const found = constrainedAtomicLandingViolations(atomicWorkflow, mutatedRunner);
  if (!found.includes(expected)) throw new Error(`atomic landing exception self-test missed ${id}: ${expected}`);
}

const result = {
  suite: 'KIDULTS_WORKFLOW_REPOSITORY_MUTATION_BOUNDARY_V1',
  policy_version: POLICY_VERSION,
  workflows_scanned: files.length,
  mutation_cases_detected: mutationCases.length,
  negative_cases_rejected: negativeCases.length,
  policy: 'NO_DIRECT_REPOSITORY_MUTATION_FROM_GITHUB_ACTIONS_EXCEPT_CONSTRAINED_ATOMIC_GOVERNED_SERVER_MERGE',
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
