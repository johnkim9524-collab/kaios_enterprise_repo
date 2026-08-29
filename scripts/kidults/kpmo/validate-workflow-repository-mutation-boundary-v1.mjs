import fs from 'node:fs';
import path from 'node:path';
import {
  cloudflareRemoteMutationViolations,
  inspectWorkflowCloudflareMutations,
} from './lib/governed-landing-cloudflare-remote-mutation-boundary-v1.mjs';

const ROOT = path.resolve('.github/workflows');
const POLICY_VERSION = '1.2';
const ATOMIC_LANDING_WORKFLOW = path.resolve(ROOT, 'kidults-atomic-governed-landing-v1.yml');
const ATOMIC_LANDING_RUNNER = path.resolve('scripts/kidults/kpmo/run-atomic-governed-landing-v1.mjs');
const TRUSTED_CONTROL_WORKFLOW = path.resolve(ROOT, 'kidults-postgres-d1-boundary-v1.yml');
const STATUS_WRITE_ALLOWLIST = new Set([
  '.github/workflows/kidults-governed-landing-authorization-v1.yml',
  '.github/workflows/kidults-scope-aware-authoritative-status-v1.yml',
  '.github/workflows/kidults-atomic-governed-landing-v1.yml',
]);
const CHECKS_WRITE_ALLOWLIST = new Set();
const PROTECTED_CHECK_PRODUCERS = new Map([
  ['KAIOS Solo Owner Preflight', '.github/workflows/solo-owner-preflight.yml'],
  ['Validate KAIOS Foundation', '.github/workflows/ci-validation.yml'],
  ['Validate Production Container', '.github/workflows/ci-validation.yml'],
  ['KIDULTS Governed Landing Control Validation V1', '.github/workflows/kidults-postgres-d1-boundary-v1.yml'],
  ['KIDULTS Cloudflare One-Shot Trust Boundary V1', '.github/workflows/kpmo-cf-kidults-14501ac-01-preflight.yml'],
  ['KIDULTS Cloudflare STAGING Governance Boundary V1', '.github/workflows/kidults-cloudflare-pages-staging-governance-validation-v1.yml'],
  ['KIDULTS Shared Portal Evidence Integrity V1', '.github/workflows/kidults-shared-portal-evidence-integrity-v1.yml'],
  ['KIDULTS PostgreSQL One-Shot Authorization Boundary V1', '.github/workflows/kidults-postgres-one-shot-authorization-boundary-v1.yml'],
  ['KIDULTS Met V&A Candidate R2 Boundary V1', '.github/workflows/kidults-met-vam-candidate-r2-boundary-v1.yml'],
  ['KIDULTS Runtime Control Baseline R1', '.github/workflows/kidults-runtime-control-baseline-r1.yml'],
]);

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
  if (lines.some((line) => /(?:^|[{,])\s*statuses\s*:\s*write(?:\s*[,}]|\s*$)/i.test(line))) findings.push('statuses-write');
  if (lines.some((line) => /(?:^|[{,])\s*checks\s*:\s*write(?:\s*[,}]|\s*$)/i.test(line))) findings.push('checks-write');
  if (lines.some(containsDirectGitPush)) findings.push('direct-git-push');
  if (lines.some(containsDirectRepositoryApiMutation)) findings.push('direct-github-repository-mutation-api');
  return [...new Set(findings)];
}

function protectedContextViolations(relative, workflow) {
  const findings = [];
  const jobNames = [];
  const lines = workflow.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^ {4}name:\s*(.*?)\s*$/);
    if (!match) continue;
    const raw = match[1];
    if (!raw || /^[>|]/.test(raw) || raw.includes('${{')) {
      findings.push(`dynamic-or-block-job-name-forbidden:line-${index + 1}`);
      continue;
    }
    jobNames.push(raw.replace(/^['"]|['"]$/g, '').trim());
  }
  for (const [context, producer] of PROTECTED_CHECK_PRODUCERS) {
    if (jobNames.includes(context) && relative !== producer) findings.push(`protected-check-context-spoof:${context}`);
  }
  return findings;
}

function constrainedAtomicLandingViolations(workflow, runner) {
  const workflowRequirements = [
    ['workflow-name', 'name: KIDULTS Atomic Governed Landing V1'],
    ['dispatch-only', 'on:\n  workflow_dispatch:'],
    ['exact-pr-input', 'pull_request_number:'],
    ['exact-head-input', 'expected_head_sha:'],
    ['operation-authorization-input', 'landing_authorization_id:'],
    ['serialized-global-landing', 'group: kidults-atomic-governed-landing-v1-global'],
    ['serialized-no-cancel', 'cancel-in-progress: false'],
    ['control-sha-checkout', 'ref: ${{ github.sha }}'],
    ['credential-persistence-disabled', 'persist-credentials: false'],
    ['main-ref-assertion', 'test "$GITHUB_REF" = refs/heads/main'],
    ['live-actor-binding', 'LANDING_ACTOR: ${{ github.actor }}'],
    ['triggering-actor-binding', 'LANDING_TRIGGERING_ACTOR: ${{ github.triggering_actor }}'],
    ['run-attempt-binding', 'LANDING_RUN_ATTEMPT: ${{ github.run_attempt }}'],
    ['control-sha-binding', 'CONTROL_SHA: ${{ github.sha }}'],
    ['fixed-runner', 'run: node scripts/kidults/kpmo/run-atomic-governed-landing-v1.mjs'],
  ];
  const runnerRequirements = [
    ['owner-actor-assertion', 'assertLandingActorAndAuthorization(landingActor, landingTriggeringActor, repositoryState.owner?.login'],
    ['repository-default-main-assertion', 'assertRepositoryDefaultBranch(repositoryState);'],
    ['initial-live-pr-read', 'const initial = await request(`/pulls/${prNumber}`);'],
    ['final-live-pr-reread', 'const final = await request(`/pulls/${prNumber}`);'],
    ['post-status-live-pr-reread', 'const immediatePreMerge = await request(`/pulls/${prNumber}`);'],
    ['final-scope-status-reread', 'assertFreshExactHeadSuccessStatus(finalStatuses.statuses || [], scopePolicy.required_status_context, final.updated_at);'],
    ['final-scope-requirements-reread', 'const finalScopedRequirements = resolveScopeRequirements(finalFiles, final, scopePolicy);'],
    ['final-check-reread', 'evaluateProvenanceBoundRequiredCheckRuns(await attachWorkflowRunProvenance('],
    ['live-main-control-reread', 'await assertLiveControlMain(immediatePreMerge);'],
    ['post-success-scope-status-reread', 'assertFreshExactHeadSuccessStatus(immediateStatuses.statuses || [], scopePolicy.required_status_context, immediatePreMerge.updated_at);'],
    ['post-success-specialized-check-reread', 'await validateRequiredCheckProvenance(immediateScopedRequirements.required_contexts);'],
    ['bounded-api-timeout', 'AbortSignal.timeout(30_000)'],
    ['server-merge-put', "method: 'PUT'"],
    ['server-merge-exact-head', 'body: JSON.stringify({sha: expectedHeadSha, merge_method: \'merge\'})'],
    ['failure-status-revocation', 'await invalidateExactHeadStatusOnFailure(error, publishFailureWithReadBack);'],
    ['failure-status-independent-readback', 'assertFailureStatusPublicationReadBack(published, statuses, {'],
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
  const nonContentsViolations = violationsFor(workflow).filter(value => !['contents-write', 'statuses-write'].includes(value));
  if (nonContentsViolations.length) findings.push(...nonContentsViolations.map(value => `atomic-landing-${value}`));
  return [...new Set(findings)];
}

function trustedControlWorkflowViolations(workflow) {
  const requirements = [
    ['target-event', 'pull_request_target:'],
    ['trusted-base-checkout', 'path: trusted-control'],
    ['exact-base-checkout', 'ref: ${{ github.event.pull_request.base.sha }}'],
    ['exact-base-verification', 'test "$(git -C trusted-control rev-parse HEAD)" = "$EXPECTED_BASE_SHA"'],
    ['exact-head-checkout', 'ref: ${{ github.event.pull_request.head.sha }}'],
    ['candidate-isolated', 'path: candidate'],
    ['candidate-symlink-submodule-guard', '$1 == "120000" || $1 == "160000"'],
    ['trusted-freeze-validator', 'node ../trusted-control/scripts/kidults/kpmo/validate-trusted-governed-control-freeze-v1.mjs'],
    ['trusted-freeze-root', '--trusted-root ../trusted-control'],
    ['candidate-freeze-root', '--candidate-root .'],
    ['trusted-coverage-validator', 'node ../trusted-control/scripts/kidults/kpmo/validate-governed-landing-coverage-v1.mjs'],
    ['trusted-mutation-validator', 'node ../trusted-control/scripts/kidults/kpmo/validate-workflow-repository-mutation-boundary-v1.mjs'],
    ['native-check-name', 'name: KIDULTS Governed Landing Control Validation V1'],
  ];
  const findings = requirements.filter(([, marker]) => !workflow.includes(marker)).map(([id]) => `trusted-control-${id}`);
  if (workflow.includes('permissions:\n  checks: write') || workflow.includes("api('/check-runs'")) findings.push('trusted-control-synthetic-check-run-forbidden');
  const candidateBlock = workflow.split('      - name: Run only trusted-base repository governance validators against candidate')[1]
    ?.split(/^      - name:/m)[0] || '';
  if (candidateBlock.split(/\r?\n/).some(line => /\bnode\b/.test(line) && !line.includes('node ../trusted-control/'))) {
    findings.push('trusted-control-candidate-executable-used-as-authority');
  }
  return findings;
}

const mutationCases = [
  ['permissions:\n  contents: write', 'contents-write'],
  ['permissions: write-all', 'permissions-write-all'],
  ['run: git push origin HEAD:main', 'direct-git-push'],
  ['run: git add x && git push', 'direct-git-push'],
  ['run: gh api --method POST /repos/acme/repo/git/refs', 'direct-github-repository-mutation-api'],
  ['permissions:\n  statuses: write', 'statuses-write'],
  ['permissions:\n  checks: write', 'checks-write'],
  ['permissions: {statuses: write}', 'statuses-write'],
  ['permissions: {checks: write}', 'checks-write'],
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
for (const sample of [
  'jobs:\n  spoof:\n    name: KAIOS Solo Owner Preflight',
  'jobs:\n  spoof:\n    name: "KAIOS Solo Owner Preflight"',
  'jobs:\n  spoof:\n    name: >-\n      KAIOS Solo Owner Preflight',
  "jobs:\n  spoof:\n    name: ${{ 'KAIOS Solo Owner Preflight' }}",
]) if (!protectedContextViolations('.github/workflows/attacker.yml', sample).length) {
  throw new Error(`protected check context spoof self-test was not rejected: ${sample}`);
}
if (protectedContextViolations('.github/workflows/solo-owner-preflight.yml', 'jobs:\n  preflight:\n    name: KAIOS Solo Owner Preflight').length) {
  throw new Error('canonical protected check producer was falsely rejected');
}

const files = walk(ROOT);
const findings = [];
let constrainedAtomicLandingExceptions = 0;
for (const file of files) {
  const workflow = fs.readFileSync(file, 'utf8');
  let violations = violationsFor(workflow);
  const relative = path.relative('.', file).replaceAll('\\', '/');
  if (violations.includes('statuses-write') && STATUS_WRITE_ALLOWLIST.has(relative)) {
    violations = violations.filter(value => value !== 'statuses-write');
  }
  if (violations.includes('checks-write') && CHECKS_WRITE_ALLOWLIST.has(relative)) {
    violations = violations.filter(value => value !== 'checks-write');
  }
  violations.push(...cloudflareRemoteMutationViolations(workflow));
  violations.push(...protectedContextViolations(relative, workflow));
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

const actualStatusWriters = files
  .filter(file => violationsFor(fs.readFileSync(file, 'utf8')).includes('statuses-write'))
  .map(file => path.relative('.', file).replaceAll('\\', '/')).sort();
const expectedStatusWriters = [...STATUS_WRITE_ALLOWLIST].sort();
if (JSON.stringify(actualStatusWriters) !== JSON.stringify(expectedStatusWriters)) {
  findings.push({file: '.github/workflows', violations: ['status-write-allowlist-cardinality-or-identity-drift']});
}
const actualCheckWriters = files
  .filter(file => violationsFor(fs.readFileSync(file, 'utf8')).includes('checks-write'))
  .map(file => path.relative('.', file).replaceAll('\\', '/')).sort();
if (JSON.stringify(actualCheckWriters) !== JSON.stringify([...CHECKS_WRITE_ALLOWLIST].sort())) {
  findings.push({file: '.github/workflows', violations: ['checks-write-allowlist-cardinality-or-identity-drift']});
}

const cloudflareMutationJobs = files.flatMap(file => inspectWorkflowCloudflareMutations(fs.readFileSync(file, 'utf8'))
  .map(job => ({file: path.relative('.', file).replaceAll('\\', '/'), ...job})));

if (constrainedAtomicLandingExceptions !== 1) {
  findings.push({
    file: path.relative('.', ATOMIC_LANDING_WORKFLOW),
    violations: ['constrained-atomic-landing-exception-not-proven-exactly-once'],
  });
}

const atomicWorkflow = fs.readFileSync(ATOMIC_LANDING_WORKFLOW, 'utf8');
const atomicRunner = fs.readFileSync(ATOMIC_LANDING_RUNNER, 'utf8');
const trustedControlWorkflow = fs.readFileSync(TRUSTED_CONTROL_WORKFLOW, 'utf8');
const trustedControlFindings = trustedControlWorkflowViolations(trustedControlWorkflow);
if (trustedControlFindings.length) findings.push({file:path.relative('.', TRUSTED_CONTROL_WORKFLOW),violations:trustedControlFindings});
const atomicMutationCases = [
  ['owner-actor', atomicRunner.replace('assertLandingActorAndAuthorization(landingActor, landingTriggeringActor, repositoryState.owner?.login', 'assertLandingActorAndAuthorization(landingActor, landingTriggeringActor, landingActor'), 'atomic-landing-runner-owner-actor-assertion'],
  ['default-main', atomicRunner.replace('assertRepositoryDefaultBranch(repositoryState);', 'void repositoryState.default_branch;'), 'atomic-landing-runner-repository-default-main-assertion'],
  ['final-reread', atomicRunner.replace('const immediatePreMerge = await request(`/pulls/${prNumber}`);', 'const immediatePreMerge = final;'), 'atomic-landing-runner-post-status-live-pr-reread'],
  ['scope-reread', atomicRunner.replace('assertFreshExactHeadSuccessStatus(finalStatuses.statuses || [], scopePolicy.required_status_context, final.updated_at);', 'void finalStatuses;'), 'atomic-landing-runner-final-scope-status-reread'],
  ['check-reread', atomicRunner.replaceAll('evaluateProvenanceBoundRequiredCheckRuns(await attachWorkflowRunProvenance(', 'void ('), 'atomic-landing-runner-final-check-reread'],
  ['live-main-reread', atomicRunner.replace('await assertLiveControlMain(immediatePreMerge);', 'void immediatePreMerge;'), 'atomic-landing-runner-live-main-control-reread'],
  ['post-success-scope', atomicRunner.replace('assertFreshExactHeadSuccessStatus(immediateStatuses.statuses || [], scopePolicy.required_status_context, immediatePreMerge.updated_at);', 'void immediateStatuses;'), 'atomic-landing-runner-post-success-scope-status-reread'],
  ['post-success-checks', atomicRunner.replace('await validateRequiredCheckProvenance(immediateScopedRequirements.required_contexts);', 'void immediateScopedRequirements;'), 'atomic-landing-runner-post-success-specialized-check-reread'],
  ['expected-head', atomicRunner.replace("body: JSON.stringify({sha: expectedHeadSha, merge_method: 'merge'})", "body: JSON.stringify({merge_method: 'merge'})"), 'atomic-landing-runner-server-merge-exact-head'],
  ['failure-revocation', atomicRunner.replace('await invalidateExactHeadStatusOnFailure(error, publishFailureWithReadBack);', 'void error;'), 'atomic-landing-runner-failure-status-revocation'],
  ['failure-readback', atomicRunner.replace('assertFailureStatusPublicationReadBack(published, statuses, {', 'void published;'), 'atomic-landing-runner-failure-status-independent-readback'],
  ['label-caveat', atomicRunner.replace('no_merge_label_server_transactionality_claimed: false', 'no_merge_label_server_transactionality_claimed: true'), 'atomic-landing-runner-label-atomicity-caveat'],
];
for (const [id, mutatedRunner, expected] of atomicMutationCases) {
  const found = constrainedAtomicLandingViolations(atomicWorkflow, mutatedRunner);
  if (!found.includes(expected)) throw new Error(`atomic landing exception self-test missed ${id}: ${expected}`);
}
for (const [id, mutated] of [
  ['check-name', trustedControlWorkflow.replace('name: KIDULTS Governed Landing Control Validation V1', 'name: spoof')],
  ['trusted-validator', trustedControlWorkflow.replace('node ../trusted-control/scripts/kidults/kpmo/validate-workflow-repository-mutation-boundary-v1.mjs', 'node scripts/kidults/kpmo/validate-workflow-repository-mutation-boundary-v1.mjs')],
  ['base-sha', trustedControlWorkflow.replace('ref: ${{ github.event.pull_request.base.sha }}', 'ref: main')],
  ['trusted-freeze', trustedControlWorkflow.replace('node ../trusted-control/scripts/kidults/kpmo/validate-trusted-governed-control-freeze-v1.mjs', 'node scripts/kidults/kpmo/validate-trusted-governed-control-freeze-v1.mjs')],
  ['synthetic-check', `${trustedControlWorkflow}\n# api('/check-runs'`],
]) {
  if (!trustedControlWorkflowViolations(mutated).length) throw new Error(`trusted control self-test missed ${id}`);
}

const result = {
  suite: 'KIDULTS_WORKFLOW_REPOSITORY_MUTATION_BOUNDARY_V1',
  policy_version: POLICY_VERSION,
  workflows_scanned: files.length,
  mutation_cases_detected: mutationCases.length,
  negative_cases_rejected: negativeCases.length,
  protected_check_contexts_pinned: PROTECTED_CHECK_PRODUCERS.size,
  status_write_workflows_allowlisted: STATUS_WRITE_ALLOWLIST.size,
  checks_write_workflows_allowlisted: CHECKS_WRITE_ALLOWLIST.size,
  trusted_control_mutation_cases_detected: 5,
  cloudflare_remote_mutation_jobs_detected: cloudflareMutationJobs.length,
  cloudflare_remote_mutation_jobs_disabled_by_literal_false: cloudflareMutationJobs.filter(job => job.literal_false_job_gate).length,
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
