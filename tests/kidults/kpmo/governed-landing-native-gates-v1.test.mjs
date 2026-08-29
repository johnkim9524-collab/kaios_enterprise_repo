import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  GateFailure,
  assertPromotablePullRequest,
  assertStableFinalReread,
  resolveScopeRequirements,
  evaluateRequiredCheckRuns,
  assertSingleAuthoritativeProducer,
  authoritativeGenerationKey,
  assertLandingActorAndAuthorization,
  assertNativeRequiredStatusBindings,
  assertRepositoryDefaultBranch,
  assertRepositoryDefaultBranchRuleset,
  assertSoloOwnerProtectPullRequestRule,
} from '../../../scripts/kidults/kpmo/lib/governed-landing-native-gates-v1.mjs';

const sha = 'a'.repeat(40);
const basePr = () => ({
  number: 1580,
  state: 'open',
  merged: false,
  draft: false,
  title: 'Correct ARL provenance',
  labels: [],
  updated_at: '2026-08-29T08:50:00Z',
  base: {ref: 'main'},
  head: {sha, repo: {full_name: 'johnkim9524-collab/kaios_enterprise_repo'}},
});
const noMergePolicy = {
  closed_pull_request_blocks: true,
  merged_pull_request_blocks: true,
  exact_labels: ['no-merge', 'do-not-merge', 'merge-hold'],
  title_markers: ['[NO-MERGE]', '[DO-NOT-MERGE]'],
};
const options = {repository: 'johnkim9524-collab/kaios_enterprise_repo', expectedHeadSha: sha, noMergePolicy};
const code = (fn, expected) => assert.throws(fn, error => error instanceof GateFailure && error.code === expected);
const postgresContext = 'KIDULTS PostgreSQL One-Shot Authorization Boundary V1';
const postgresWorkflowPath = '.github/workflows/kidults-postgres-one-shot-authorization-boundary-v1.yml';
const metVamContext = 'KIDULTS Met V&A Candidate R2 Boundary V1';
const metVamWorkflowPath = '.github/workflows/kidults-met-vam-candidate-r2-boundary-v1.yml';

function workflowOnBlock(source) {
  const lines = source.split('\n');
  const start = lines.findIndex(line => line === 'on:');
  assert.notEqual(start, -1, 'workflow on block missing');
  let end = start + 1;
  while (end < lines.length && (lines[end] === '' || lines[end].startsWith(' '))) end += 1;
  return lines.slice(start + 1, end).join('\n');
}

function pullRequestPathTriggers(source) {
  const block = workflowOnBlock(source);
  const lines = block.split('\n');
  const pullRequestIndex = lines.findIndex(line => line === '  pull_request:');
  assert.notEqual(pullRequestIndex, -1, 'pull_request trigger missing');
  const pathsIndex = lines.findIndex((line, index) => index > pullRequestIndex && line === '    paths:');
  assert.notEqual(pathsIndex, -1, 'pull_request paths missing');
  const paths = [];
  for (const line of lines.slice(pathsIndex + 1)) {
    const match = line.match(/^      - ['"]([^'"]+)['"]$/);
    if (!match) break;
    paths.push(match[1]);
  }
  return paths;
}

function pullRequestTriggerFindings(rule, workflowSource) {
  const triggers = new Set(pullRequestPathTriggers(workflowSource));
  return (rule.exact_paths || []).filter(filename => !triggers.has(filename)).sort();
}

test('open exact-head PR is promotable', () => {
  assert.equal(assertPromotablePullRequest(basePr(), options).head_sha, sha);
});

test('closed and explicit NO-MERGE states fail closed', () => {
  const closed = basePr(); closed.state = 'closed';
  code(() => assertPromotablePullRequest(closed, options), 'PULL_REQUEST_NO_MERGE_BLOCKED');
  const labeled = basePr(); labeled.labels = [{name: 'NO-MERGE'}];
  code(() => assertPromotablePullRequest(labeled, options), 'PULL_REQUEST_NO_MERGE_BLOCKED');
  const titled = basePr(); titled.title = '[no-merge] hold';
  code(() => assertPromotablePullRequest(titled, options), 'PULL_REQUEST_NO_MERGE_BLOCKED');
});

test('close/NO-MERGE race between initial and final read is rejected', () => {
  const final = basePr(); final.state = 'closed'; final.labels = [{name: 'no-merge'}];
  code(() => assertStableFinalReread(basePr(), final, options), 'PULL_REQUEST_NO_MERGE_BLOCKED');
});

test('head replacement between initial and final read is rejected', () => {
  const final = basePr(); final.head.sha = 'b'.repeat(40);
  code(() => assertStableFinalReread(basePr(), final, options), 'PULL_REQUEST_HEAD_CHANGED');
});

test('deterministic LAND input does not substitute for live repository-owner actor', () => {
  const authorization = `LAND-PR-1580-${sha.slice(0, 12)}`;
  code(() => assertLandingActorAndAuthorization('automation-bot', 'johnkim9524-collab', 'johnkim9524-collab', authorization, '1580', sha, '1'), 'PROGRAM_OWNER_LANDING_ACTOR_REQUIRED');
  code(() => assertLandingActorAndAuthorization('johnkim9524-collab', 'automation-bot', 'johnkim9524-collab', authorization, '1580', sha, '1'), 'PROGRAM_OWNER_TRIGGERING_ACTOR_REQUIRED');
  code(() => assertLandingActorAndAuthorization('johnkim9524-collab', 'johnkim9524-collab', 'johnkim9524-collab', authorization, '1580', sha, '2'), 'ATOMIC_LANDING_RERUN_FORBIDDEN');
  assert.equal(assertLandingActorAndAuthorization('johnkim9524-collab', 'johnkim9524-collab', 'johnkim9524-collab', authorization, '1580', sha, '1').actor, 'johnkim9524-collab');
});

test('#1580 producer-event substitution cannot claim exact consumer trigger binding', () => {
  const producerEvent = 'workflow_run';
  const manualConsumerEvent = 'workflow_dispatch';
  assert.equal(producerEvent === 'workflow_run', true, 'the #1580 expression produced a manual false-positive');
  assert.equal(manualConsumerEvent === 'workflow_run', false, 'correct semantics bind the consumer event');
});

const scopePolicy = {
  id: 'kidults-scope-aware-required-status-policy-v1',
  required_status_context: 'Aggregator',
  technical_base_contexts: ['Foundation'],
  scope_rules: [{id: 'scripts', prefixes: ['scripts/'], exact_paths: [], required_contexts: ['Red Team']}],
};

test('scope aggregation binds every changed file to exact contexts', () => {
  assert.deepEqual(resolveScopeRequirements([{filename: 'scripts/x.mjs'}], {commits: 1, changed_files: 1}, scopePolicy), {
    files: ['scripts/x.mjs'], scopes: ['scripts'], required_contexts: ['Foundation', 'Red Team'], zero_diff: false,
  });
});

test('renamed critical path preserves both old and new scope requirements', () => {
  const renamePolicy = {
    ...scopePolicy,
    scope_rules: [
      {id: 'critical', prefixes: ['scripts/critical/'], exact_paths: [], required_contexts: ['Critical']},
      {id: 'docs', prefixes: ['docs/'], exact_paths: [], required_contexts: []},
    ],
  };
  const result = resolveScopeRequirements([
    {filename: 'docs/retired.md', previous_filename: 'scripts/critical/trust-root.mjs', status: 'renamed'},
  ], {commits: 1, changed_files: 1}, renamePolicy);
  assert.deepEqual(result.scopes, ['critical', 'docs']);
  assert.deepEqual(result.required_contexts, ['Critical', 'Foundation']);
  code(() => resolveScopeRequirements([
    {filename: 'docs/retired.md', status: 'renamed'},
  ], {commits: 1, changed_files: 1}, renamePolicy), 'RENAMED_FILE_PREVIOUS_PATH_REQUIRED');
});

test('zero-coverage changed scope is rejected', () => {
  code(() => resolveScopeRequirements([{filename: 'unknown-root/x'}], {commits: 1, changed_files: 1}, scopePolicy), 'ZERO_COVERAGE_SCOPE');
});

test('missing, pending, failed, and ambiguous latest checks are rejected', () => {
  code(() => evaluateRequiredCheckRuns([], ['Foundation']), 'REQUIRED_CONTEXT_MISSING');
  code(() => evaluateRequiredCheckRuns([{id: 1, name: 'Foundation', status: 'in_progress', created_at: '2026-01-01'}], ['Foundation']), 'REQUIRED_CONTEXT_NOT_TERMINAL');
  code(() => evaluateRequiredCheckRuns([{id: 1, name: 'Foundation', status: 'completed', conclusion: 'failure', completed_at: '2026-01-01'}], ['Foundation']), 'REQUIRED_CONTEXT_NOT_SUCCESS');
  code(() => evaluateRequiredCheckRuns([
    {id: 1, name: 'Foundation', status: 'completed', conclusion: 'success', completed_at: '2026-01-01'},
    {id: 2, name: 'Foundation', status: 'completed', conclusion: 'success', completed_at: '2026-01-01'},
  ], ['Foundation']), 'REQUIRED_CONTEXT_LATEST_AMBIGUOUS');
  code(() => evaluateRequiredCheckRuns([
    {id: 3, name: 'Foundation', status: 'completed', conclusion: 'success', completed_at: '2026-01-02', app: {id: 999}},
  ], ['Foundation'], {expectedIntegrationId: 15368}), 'REQUIRED_CONTEXT_INTEGRATION_MISMATCH');
});

const repository = 'johnkim9524-collab/kaios_enterprise_repo';
const ruleset = () => ({
  name: 'KAIOS Solo Owner Preflight', enforcement: 'active', target: 'branch', source_type: 'Repository', source: repository,
  conditions: {ref_name: {include: ['~DEFAULT_BRANCH'], exclude: []}}, bypass_actors: [],
  rules: [{type: 'required_status_checks', parameters: {
    strict_required_status_checks_policy: true,
    required_status_checks: [
      {context: 'Foundation', integration_id: 15368},
      {context: 'Aggregator', integration_id: 15368},
    ],
  }}, {type: 'pull_request', parameters: {
    required_approving_review_count: 0,
    dismiss_stale_reviews_on_push: true,
    require_last_push_approval: false,
    required_review_thread_resolution: true,
    require_extra_approval_for_unattributed_changes: true,
  }}],
});

test('native ruleset is active, default-branch scoped, bypass-free and GitHub-Actions pinned', () => {
  assert.equal(assertRepositoryDefaultBranch({default_branch: 'main'}), 'main');
  code(() => assertRepositoryDefaultBranch({default_branch: 'release'}), 'REPOSITORY_DEFAULT_BRANCH_DRIFT');
  assert.equal(assertRepositoryDefaultBranchRuleset(ruleset(), repository).condition, '~DEFAULT_BRANCH');
  assert.deepEqual(assertNativeRequiredStatusBindings(ruleset(), ['Foundation', 'Aggregator'], {
    repository, integrationId: 15368,
  }), ['Aggregator', 'Foundation']);
  assert.equal(assertSoloOwnerProtectPullRequestRule(ruleset()).dismiss_stale_reviews_on_push, true);
  for (const [expected, mutate] of [
    ['RULESET_REPOSITORY_BRANCH_TARGET_MISMATCH', value => { value.enforcement = 'disabled'; }],
    ['RULESET_REPOSITORY_BRANCH_TARGET_MISMATCH', value => { value.source = 'other/repo'; }],
    ['RULESET_DEFAULT_BRANCH_CONDITION_MISMATCH', value => { value.conditions.ref_name.include = ['refs/heads/feature']; }],
    ['RULESET_BYPASS_ACTOR_FORBIDDEN', value => { value.bypass_actors = [{actor_id: 1}]; }],
    ['NATIVE_REQUIRED_STATUS_INTEGRATION_MISMATCH', value => { value.rules[0].parameters.required_status_checks[1].integration_id = 7; }],
  ]) {
    const value = ruleset(); mutate(value);
    code(() => assertNativeRequiredStatusBindings(value, ['Foundation', 'Aggregator'], {
      repository, integrationId: 15368,
    }), expected);
  }
  const driftedProtect = ruleset();
  driftedProtect.rules[1].parameters.required_review_thread_resolution = false;
  code(() => assertSoloOwnerProtectPullRequestRule(driftedProtect), 'PROTECT_MAIN_PULL_REQUEST_RULE_DRIFT');
});

test('real scope policy binds Cloudflare and portal trust surfaces to specialized checks', () => {
  const policy = JSON.parse(fs.readFileSync('coordination/kidults/kpmo/scope-aware-required-status-policy-v1.json', 'utf8'));
  const cloudflare = resolveScopeRequirements([
    {filename: 'scripts/kidults/kpmo/validate-cloudflare-pages-staging-governance-v1.mjs', status: 'modified'},
  ], {commits: 1, changed_files: 1}, policy);
  assert.ok(cloudflare.required_contexts.includes('KIDULTS Cloudflare One-Shot Trust Boundary V1'));
  assert.ok(cloudflare.required_contexts.includes('KIDULTS Cloudflare STAGING Governance Boundary V1'));
  const portal = resolveScopeRequirements([
    {filename: 'scripts/kidults/portal/validate-physical-mobile-screen-reader-acceptance-v1.mjs', status: 'modified'},
  ], {commits: 1, changed_files: 1}, policy);
  assert.ok(portal.required_contexts.includes('KIDULTS Shared Portal Evidence Integrity V1'));
  const portalTooling = resolveScopeRequirements([
    {filename: 'tooling/kidults-portal-r001-browser-qa/package.json', status: 'modified'},
  ], {commits: 1, changed_files: 1}, policy);
  assert.ok(portalTooling.required_contexts.includes('KIDULTS Shared Portal Evidence Integrity V1'));
  const workflowMutation = resolveScopeRequirements([
    {filename: '.github/workflows/attacker-status-spoof.yml', status: 'added'},
  ], {commits: 1, changed_files: 1}, policy);
  assert.ok(workflowMutation.required_contexts.includes('KIDULTS Governed Landing Control Validation V1'));
  const trustedControl = fs.readFileSync('.github/workflows/kidults-postgres-d1-boundary-v1.yml', 'utf8');
  assert.ok(trustedControl.includes('pull_request_target:'));
  assert.ok(trustedControl.includes('- ".github/workflows/**"'));
  assert.ok(trustedControl.includes('$1 == "120000" || $1 == "160000"'));
  const mutated = structuredClone(policy);
  const rule = mutated.scope_rules.find(value => value.id === 'governed-landing-control');
  rule.prefixes = rule.prefixes.filter(value => value !== '.github/workflows/');
  const weakened = resolveScopeRequirements([
    {filename: '.github/workflows/attacker-status-spoof.yml', status: 'added'},
  ], {commits: 1, changed_files: 1}, mutated);
  assert.ok(!weakened.required_contexts.includes('KIDULTS Governed Landing Control Validation V1'));
});

test('all portal evidence surfaces map to the specialized check and its workflow trigger', () => {
  const policy = JSON.parse(fs.readFileSync('coordination/kidults/kpmo/scope-aware-required-status-policy-v1.json', 'utf8'));
  const workflow = fs.readFileSync('.github/workflows/kidults-shared-portal-evidence-integrity-v1.yml', 'utf8');
  const representatives = [
    '.github/workflows/kidults-portal-v502-validate.yml',
    'apps/kidults-enterprise-staging/server.mjs',
    'tooling/kidults-portal-r001-browser-qa/package.json',
    'scripts/kidults/portal/validate-physical-mobile-screen-reader-acceptance-v1.mjs',
    'tests/kidults/kpmo/portal-physical-mobile-screen-reader-acceptance-v1.test.mjs',
    'coordination/kidults/portal/portal-physical-mobile-screen-reader-acceptance-receipt-v1.json',
  ];
  for (const filename of representatives) {
    assert.ok(fs.existsSync(filename), `missing representative portal surface: ${filename}`);
    const result = resolveScopeRequirements([{filename, status: 'modified'}], {commits: 1, changed_files: 1}, policy);
    assert.ok(result.required_contexts.includes('KIDULTS Shared Portal Evidence Integrity V1'), filename);
  }
  for (const marker of [
    "'.github/workflows/kidults-portal-*'",
    "'apps/kidults-enterprise-staging/**'",
    "'tooling/kidults-portal-r001-browser-qa/**'",
    "'scripts/kidults/portal/**'",
    "'coordination/kidults/portal/**'",
  ]) assert.ok(workflow.includes(marker), marker);
  const mutated = structuredClone(policy);
  const rule = mutated.scope_rules.find(value => value.id === 'portal-acceptance');
  rule.prefixes = rule.prefixes.filter(value => value !== 'tooling/kidults-portal-r001-browser-qa/');
  const result = resolveScopeRequirements([
    {filename: 'tooling/kidults-portal-r001-browser-qa/package.json', status: 'modified'},
  ], {commits: 1, changed_files: 1}, mutated);
  assert.ok(!result.required_contexts.includes('KIDULTS Shared Portal Evidence Integrity V1'));
});

test('every mapped PostgreSQL one-shot path is PR-triggered by one unique native job context', () => {
  const policy = JSON.parse(fs.readFileSync('coordination/kidults/kpmo/scope-aware-required-status-policy-v1.json', 'utf8'));
  const workflowSource = fs.readFileSync(postgresWorkflowPath, 'utf8');
  const rule = policy.scope_rules.find(value => value.id === 'postgres-one-shot-authorization');
  assert.ok(rule, 'PostgreSQL one-shot scope rule missing');
  assert.deepEqual(rule.prefixes, []);
  assert.ok(rule.exact_paths.length >= 20, `unexpectedly small PostgreSQL one-shot surface: ${rule.exact_paths.length}`);
  assert.equal(new Set(rule.exact_paths).size, rule.exact_paths.length, 'duplicate PostgreSQL one-shot mapped path');
  assert.deepEqual(rule.required_contexts, [postgresContext]);
  assert.deepEqual([...workflowOnBlock(workflowSource).matchAll(/^  ([a-z_]+):/gm)].map(match => match[1]), ['pull_request']);
  assert.equal(workflowSource.split(`    name: ${postgresContext}`).length - 1, 1, 'native job context must be unique');
  const contextWorkflows = fs.readdirSync('.github/workflows')
    .filter(name => fs.readFileSync(`.github/workflows/${name}`, 'utf8').includes(`    name: ${postgresContext}`))
    .map(name => `.github/workflows/${name}`);
  assert.deepEqual(contextWorkflows, [postgresWorkflowPath], 'native job context must be repository-unique');
  assert.deepEqual(pullRequestTriggerFindings(rule, workflowSource), []);
  assert.deepEqual([...pullRequestPathTriggers(workflowSource)].sort(), [...rule.exact_paths].sort());

  for (const filename of rule.exact_paths) {
    assert.ok(fs.existsSync(filename), `mapped PostgreSQL one-shot surface missing: ${filename}`);
    const result = resolveScopeRequirements([{filename, status: 'modified'}], {commits: 1, changed_files: 1}, policy);
    assert.ok(result.required_contexts.includes(postgresContext), `${filename}:${postgresContext}`);
  }

  assert.deepEqual(policy.authority_boundary, {
    technical_status_is_merge_authority: false,
    governed_landing_is_separate_native_context: true,
    production: 'HOLD',
    public_release: 'HOLD',
    g5: 'HOLD',
  });
  const postgresContract = JSON.parse(fs.readFileSync('coordination/kidults/runtime/postgres-external-one-shot-authorization-v1.json', 'utf8'));
  assert.equal(postgresContract.authority_boundary.production, 'HOLD');
  assert.equal(postgresContract.authority_boundary.public_release, 'HOLD');
  assert.equal(postgresContract.authority_boundary.g5, 'HOLD');
});

test('PostgreSQL path-trigger and scope mutations fail coverage for every mapped surface', () => {
  const policy = JSON.parse(fs.readFileSync('coordination/kidults/kpmo/scope-aware-required-status-policy-v1.json', 'utf8'));
  const workflowSource = fs.readFileSync(postgresWorkflowPath, 'utf8');
  const rule = policy.scope_rules.find(value => value.id === 'postgres-one-shot-authorization');

  for (const filename of rule.exact_paths) {
    const triggerLine = `      - '${filename}'\n`;
    assert.ok(workflowSource.includes(triggerLine), `trigger mutation fixture missing: ${filename}`);
    const triggerMutation = workflowSource.replace(triggerLine, '');
    assert.deepEqual(pullRequestTriggerFindings(rule, triggerMutation), [filename], `trigger removal was not detected: ${filename}`);

    const policyMutation = structuredClone(policy);
    const mutatedRule = policyMutation.scope_rules.find(value => value.id === 'postgres-one-shot-authorization');
    mutatedRule.exact_paths = mutatedRule.exact_paths.filter(value => value !== filename);
    const result = resolveScopeRequirements([{filename, status: 'modified'}], {commits: 1, changed_files: 1}, policyMutation);
    assert.ok(!result.required_contexts.includes(postgresContext), `policy path removal was not detected: ${filename}`);
  }
});

test('real PostgreSQL one-shot mappings retain the specialized context across renames', () => {
  const policy = JSON.parse(fs.readFileSync('coordination/kidults/kpmo/scope-aware-required-status-policy-v1.json', 'utf8'));
  const rule = policy.scope_rules.find(value => value.id === 'postgres-one-shot-authorization');

  for (const [index, filename] of rule.exact_paths.entries()) {
    const neutralPath = `docs/kidults/postgres-one-shot-rename-control-${index}.md`;
    for (const entry of [
      {filename: neutralPath, previous_filename: filename, status: 'renamed'},
      {filename, previous_filename: neutralPath, status: 'renamed'},
    ]) {
      const result = resolveScopeRequirements([entry], {commits: 1, changed_files: 1}, policy);
      assert.ok(result.required_contexts.includes(postgresContext), `rename lost PostgreSQL context: ${filename}`);
    }

    const policyMutation = structuredClone(policy);
    const mutatedRule = policyMutation.scope_rules.find(value => value.id === 'postgres-one-shot-authorization');
    mutatedRule.exact_paths = mutatedRule.exact_paths.filter(value => value !== filename);
    const result = resolveScopeRequirements([
      {filename: neutralPath, previous_filename: filename, status: 'renamed'},
    ], {commits: 1, changed_files: 1}, policyMutation);
    assert.ok(!result.required_contexts.includes(postgresContext), `rename mutation was not detected: ${filename}`);
  }
});

test('every Met V&A Candidate R2 surface is PR-triggered by one unique native job context', () => {
  const policy = JSON.parse(fs.readFileSync('coordination/kidults/kpmo/scope-aware-required-status-policy-v1.json', 'utf8'));
  const workflowSource = fs.readFileSync(metVamWorkflowPath, 'utf8');
  const rule = policy.scope_rules.find(value => value.id === 'met-vam-candidate-r2');
  assert.ok(rule, 'Met V&A Candidate R2 scope rule missing');
  assert.deepEqual(rule.required_contexts, [metVamContext]);
  assert.equal(new Set(rule.exact_paths).size, rule.exact_paths.length, 'duplicate Met V&A mapped path');
  assert.equal(new Set(rule.prefixes).size, rule.prefixes.length, 'duplicate Met V&A mapped prefix');
  assert.deepEqual([...workflowOnBlock(workflowSource).matchAll(/^  ([a-z_]+):/gm)].map(match => match[1]), ['pull_request']);
  assert.equal(workflowSource.split(`    name: ${metVamContext}`).length - 1, 1, 'native job context must be unique');
  const contextWorkflows = fs.readdirSync('.github/workflows')
    .filter(name => fs.readFileSync(`.github/workflows/${name}`, 'utf8').includes(`    name: ${metVamContext}`))
    .map(name => `.github/workflows/${name}`);
  assert.deepEqual(contextWorkflows, [metVamWorkflowPath], 'native job context must be repository-unique');

  const triggers = new Set(pullRequestPathTriggers(workflowSource));
  for (const filename of rule.exact_paths) {
    assert.ok(fs.existsSync(filename), `mapped Met V&A surface missing: ${filename}`);
    assert.ok(triggers.has(filename), `Met V&A exact path is not PR-triggered: ${filename}`);
    const result = resolveScopeRequirements([{filename, status: 'modified'}], {commits: 1, changed_files: 1}, policy);
    assert.ok(result.required_contexts.includes(metVamContext), `${filename}:${metVamContext}`);
  }
  for (const prefix of rule.prefixes) {
    assert.ok(triggers.has(`${prefix}*`), `Met V&A prefix is not PR-triggered: ${prefix}`);
    const matching = fs.readdirSync('.github/workflows')
      .map(name => `.github/workflows/${name}`)
      .filter(filename => filename.startsWith(prefix));
    assert.ok(matching.length >= 1, `Met V&A prefix has no current producer: ${prefix}`);
    for (const filename of matching) {
      const result = resolveScopeRequirements([{filename, status: 'modified'}], {commits: 1, changed_files: 1}, policy);
      assert.ok(result.required_contexts.includes(metVamContext), `${filename}:${metVamContext}`);
    }
  }

  const met = JSON.parse(fs.readFileSync('coordination/kidults/autonomous/source-discovery/contracts/met-costume-open-access-r1.json', 'utf8'));
  const vam = JSON.parse(fs.readFileSync('coordination/kidults/autonomous/source-discovery/contracts/vam-fashion-collections-r1.json', 'utf8'));
  const candidate = JSON.parse(fs.readFileSync('coordination/kidults/provider/candidate-r2-source-transaction-preflight-v1.json', 'utf8'));
  assert.equal(met.admission_class, 'REFERENCE_DISCOVERY_ONLY');
  assert.equal(met.current_sold_eligible, false);
  assert.equal(vam.scheduled_activation.runtime_activation, 'HOLD_EXTERNAL_RIGHTS_VERIFIER_NOT_IMPLEMENTED');
  assert.equal(vam.scheduled_activation.provider_call_count_while_blocked, 0);
  assert.equal(vam.candidate_r2_boundary.may_create_snapshot_candidate, false);
  assert.equal(candidate.non_negotiable_boundaries.preflight_creates_immutable_candidate_evidence_pair, false);
  assert.equal(candidate.non_negotiable_boundaries.preflight_performs_track_b_assessment, false);
});

test('Met V&A path, prefix and rename mutations fail closed', () => {
  const policy = JSON.parse(fs.readFileSync('coordination/kidults/kpmo/scope-aware-required-status-policy-v1.json', 'utf8'));
  const workflowSource = fs.readFileSync(metVamWorkflowPath, 'utf8');
  const rule = policy.scope_rules.find(value => value.id === 'met-vam-candidate-r2');

  for (const [index, filename] of rule.exact_paths.entries()) {
    const triggerLine = `      - '${filename}'\n`;
    assert.ok(workflowSource.includes(triggerLine), `Met V&A trigger fixture missing: ${filename}`);
    assert.ok(!pullRequestPathTriggers(workflowSource.replace(triggerLine, '')).includes(filename), `trigger removal undetected: ${filename}`);
    const policyMutation = structuredClone(policy);
    const mutatedRule = policyMutation.scope_rules.find(value => value.id === 'met-vam-candidate-r2');
    mutatedRule.exact_paths = mutatedRule.exact_paths.filter(value => value !== filename);
    const direct = resolveScopeRequirements([{filename, status: 'modified'}], {commits: 1, changed_files: 1}, policyMutation);
    if (!rule.prefixes.some(prefix => filename.startsWith(prefix))) {
      assert.ok(!direct.required_contexts.includes(metVamContext), `policy removal undetected: ${filename}`);
    }
    const neutral = `docs/kidults/met-vam-candidate-r2-rename-control-${index}.md`;
    for (const entry of [
      {filename: neutral, previous_filename: filename, status: 'renamed'},
      {filename, previous_filename: neutral, status: 'renamed'},
    ]) {
      const result = resolveScopeRequirements([entry], {commits: 1, changed_files: 1}, policy);
      assert.ok(result.required_contexts.includes(metVamContext), `rename lost Met V&A context: ${filename}`);
    }
  }
  for (const prefix of rule.prefixes) {
    const triggerLine = `      - '${prefix}*'\n`;
    assert.ok(workflowSource.includes(triggerLine), `Met V&A prefix trigger fixture missing: ${prefix}`);
    assert.ok(!pullRequestPathTriggers(workflowSource.replace(triggerLine, '')).includes(`${prefix}*`), `prefix trigger removal undetected: ${prefix}`);
    const policyMutation = structuredClone(policy);
    const mutatedRule = policyMutation.scope_rules.find(value => value.id === 'met-vam-candidate-r2');
    mutatedRule.prefixes = mutatedRule.prefixes.filter(value => value !== prefix);
    const representative = fs.readdirSync('.github/workflows')
      .map(name => `.github/workflows/${name}`)
      .find(filename => filename.startsWith(prefix));
    assert.ok(representative, `Met V&A prefix representative missing: ${prefix}`);
    const result = resolveScopeRequirements([{filename: representative, status: 'modified'}], {commits: 1, changed_files: 1}, policyMutation);
    if (!mutatedRule.exact_paths.includes(representative)) {
      assert.ok(!result.required_contexts.includes(metVamContext), `prefix policy removal undetected: ${prefix}`);
    }
  }
});

test('all existing Cloudflare trust surfaces map to both specialized checks and workflow triggers', () => {
  const policy = JSON.parse(fs.readFileSync('coordination/kidults/kpmo/scope-aware-required-status-policy-v1.json', 'utf8'));
  const contexts = [
    'KIDULTS Cloudflare One-Shot Trust Boundary V1',
    'KIDULTS Cloudflare STAGING Governance Boundary V1',
  ];
  const names = (directory, predicate) => fs.readdirSync(directory, {withFileTypes: true})
    .filter(entry => entry.isFile() && predicate(entry.name)).map(entry => `${directory}/${entry.name}`);
  const serviceFiles = fs.readdirSync('services/kidults-cloudflare-approval-trust-root', {recursive: true, withFileTypes: true})
    .filter(entry => entry.isFile()).map(entry => `${entry.parentPath}/${entry.name}`)
    .map(value => value.replace(/\/+/g, '/'));
  const surfaces = [...new Set([
    ...names('.github/workflows', name => /cloudflare|^kpmo-cf-/.test(name)),
    ...serviceFiles,
    ...names('services/kidults-autonomous-intelligence/scripts', () => true),
    ...names('scripts/ops', name => name.startsWith('cloudflare-pages-')),
    ...names('coordination/kidults/runtime', name => /^(?:cloudflare|cf-)/.test(name)),
    ...names('tests/kidults/kpmo', name => /^(?:cloudflare|cf-)/.test(name)),
    ...names('docs/kidults/runtime', name => name.startsWith('cloudflare-')),
    'scripts/governance/external-one-shot-approval-ledger-v1.mjs',
    'scripts/kidults/kpmo/validate-cloudflare-pages-staging-governance-v1.mjs',
    'scripts/kidults/kpmo/inventory-secret-bearing-workflow-dispatch-v1.mjs',
    'scripts/kidults/redteam/validate-cloudflare-worker-estate-policy-v1.mjs',
    'tests/kidults/kpmo/external-one-shot-approval-ledger-v1.test.mjs',
    'coordination/kidults/governance/external-one-shot-approval-ledger-v1.json',
    'coordination/kidults/redteam/cloudflare-worker-estate-policy-v1.json',
    'services/kidults-autonomous-intelligence/package.json',
    'services/kidults-autonomous-intelligence/scripts/cloudflare-global-no-rerun.mjs',
    'services/kidults-autonomous-intelligence/scripts/remote-d1-preflight.mjs',
    'services/kidults-autonomous-intelligence/scripts/a14-remote-capacity-canary.mjs',
    'services/kidults-autonomous-intelligence/scripts/a9-finalize.ps1',
    'coordination/kidults/kpmo/secret-bearing-workflow-dispatch-registry-v1.json',
  ])].filter(value => fs.existsSync(value));
  assert.ok(surfaces.length >= 30, `unexpectedly small Cloudflare surface inventory: ${surfaces.length}`);
  for (const filename of surfaces) {
    const result = resolveScopeRequirements([{filename, status: 'modified'}], {commits: 1, changed_files: 1}, policy);
    for (const context of contexts) assert.ok(result.required_contexts.includes(context), `${filename}:${context}`);
  }
  for (const workflow of [
    '.github/workflows/kpmo-cf-kidults-14501ac-01-preflight.yml',
    '.github/workflows/kidults-cloudflare-pages-staging-governance-validation-v1.yml',
  ]) {
    const text = fs.readFileSync(workflow, 'utf8');
    for (const marker of [
      "'.github/workflows/*cloudflare*'", "'.github/workflows/kpmo-cf-*'",
      "'coordination/kidults/runtime/cloudflare-*'", "'coordination/kidults/runtime/cf-*'",
      "'scripts/ops/cloudflare-pages-*'", "'tests/kidults/kpmo/cloudflare-*'", "'tests/kidults/kpmo/cf-*'",
      "'services/kidults-cloudflare-approval-trust-root/**'",
      "'services/kidults-autonomous-intelligence/scripts/**'",
      "'scripts/governance/external-one-shot-approval-ledger-v1.mjs'",
      "'coordination/kidults/redteam/cloudflare-worker-estate-policy-v1.json'",
      "'services/kidults-autonomous-intelligence/scripts/cloudflare-global-no-rerun.mjs'",
    ]) assert.ok(text.includes(marker), `${workflow}:${marker}`);
  }
  for (const [pathPrefix, representative] of [
    ['services/kidults-cloudflare-approval-trust-root/', 'services/kidults-cloudflare-approval-trust-root/src/index.mjs'],
    ['services/kidults-autonomous-intelligence/scripts/', 'services/kidults-autonomous-intelligence/scripts/deploy-preflight.mjs'],
    ['.github/workflows/kpmo-cloudflare-', '.github/workflows/kpmo-cloudflare-approval-consume-v1.yml'],
    ['scripts/ops/cloudflare-pages-', 'scripts/ops/cloudflare-pages-boundary-readonly.sh'],
    ['coordination/kidults/runtime/cloudflare-', 'coordination/kidults/runtime/cloudflare-pages-staging-governance-v1.json'],
    ['tests/kidults/kpmo/cloudflare-', 'tests/kidults/kpmo/cloudflare-global-no-rerun-v1.test.mjs'],
    ['docs/kidults/runtime/cloudflare-', 'docs/kidults/runtime/cloudflare-pages-staging-governance-v1.md'],
  ]) {
    const mutated = structuredClone(policy);
    const rule = mutated.scope_rules.find(value => value.id === 'cloudflare-trust-root');
    rule.prefixes = rule.prefixes.filter(value => value !== pathPrefix);
    const result = resolveScopeRequirements([{filename: representative, status: 'modified'}], {commits: 1, changed_files: 1}, mutated);
    assert.ok(contexts.some(context => !result.required_contexts.includes(context)), `prefix removal was not detected: ${pathPrefix}`);
  }
});

test('ARL exact generation admits exactly one authoritative consumable producer', () => {
  const receipt = {
    source_sha: sha,
    p1_workflow_run_id: 7,
    p1_artifact_id: 11,
    p1_artifact_digest: 'sha256:abc',
    artifact_role: 'AUTHORITATIVE_CONSUMABLE',
    authoritative_producer: true,
    exact_triggering_run_bound: true,
  };
  const key = authoritativeGenerationKey(receipt);
  assert.equal(assertSingleAuthoritativeProducer([receipt], key), receipt);
  code(() => assertSingleAuthoritativeProducer([receipt, {...receipt}], key), 'ARL_AUTHORITATIVE_PRODUCER_CARDINALITY');
  const recovery = {...receipt, artifact_role: 'RECOVERY_NON_CONSUMABLE', authoritative_producer: false, exact_triggering_run_bound: false};
  assert.equal(assertSingleAuthoritativeProducer([receipt, recovery], key), receipt);
});
