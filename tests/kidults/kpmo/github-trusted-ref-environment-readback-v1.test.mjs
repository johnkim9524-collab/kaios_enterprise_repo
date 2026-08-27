import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  CONTRACT_PATH,
  LIVE_MAIN_GUARD_STEP_NAME,
  REGISTRY_PATH,
  analyzeWorkflow,
  buildReadbackReceipt,
  buildWorkflowInventory,
  computeReadbackDigest,
  githubGetCompleteList,
  validateRequiredEnvironmentBindings
} from '../../../scripts/kidults/kpmo/github-trusted-ref-environment-readback-v1.mjs';
import { validateReceipt } from '../../../scripts/kidults/kpmo/validate-github-trusted-ref-environment-readback-v1.mjs';

const contract = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
const currentInventory = buildWorkflowInventory(process.cwd(), registry);
const mainSha = 'a'.repeat(40);

function replaceInLiveMainGuard(source, before, after) {
  const header = `      - name: ${LIVE_MAIN_GUARD_STEP_NAME}`;
  const start = source.indexOf(header);
  assert.notEqual(start, -1, 'live-main guard step fixture missing');
  const end = source.indexOf('\n      - ', start + header.length);
  const boundary = end < 0 ? source.length : end;
  const block = source.slice(start, boundary);
  assert.ok(block.includes(before), `live-main guard marker missing: ${before}`);
  const mutatedBlock = block.replace(before, after);
  return `${source.slice(0, start)}${mutatedBlock}${source.slice(boundary)}`;
}

function replaceLaneSource(inventory, workflow, source) {
  const mutated = structuredClone(inventory);
  const laneIndex = mutated.lanes.findIndex((lane) => lane.workflow === workflow);
  assert.notEqual(laneIndex, -1, `registered workflow fixture missing: ${workflow}`);
  mutated.lanes[laneIndex] = analyzeWorkflow(source, workflow);
  return mutated;
}

function injectJobScopeSecret(source, jobName) {
  const jobHeader = `  ${jobName}:`;
  const jobStart = source.indexOf(jobHeader);
  assert.notEqual(jobStart, -1, `job fixture missing: ${jobName}`);
  const steps = source.indexOf('    steps:', jobStart);
  assert.notEqual(steps, -1, `steps fixture missing: ${jobName}`);
  const secretExpression = '$' + '{{ secrets.MUTATED_SCOPE_SECRET }}';
  return `${source.slice(0, steps)}    env:\n      MUTATED_SCOPE_SECRET: ${secretExpression}\n${source.slice(steps)}`;
}

function injectJobPermissionOverride(source, jobName) {
  const jobHeader = `  ${jobName}:`;
  const jobStart = source.indexOf(jobHeader);
  assert.notEqual(jobStart, -1, `job fixture missing: ${jobName}`);
  const steps = source.indexOf('    steps:', jobStart);
  assert.notEqual(steps, -1, `steps fixture missing: ${jobName}`);
  return `${source.slice(0, steps)}    permissions: write-all\n${source.slice(steps)}`;
}

function moveNamedStepAfter(source, stepName, afterStepName) {
  const header = `      - name: ${stepName}`;
  const start = source.indexOf(header);
  assert.notEqual(start, -1, `step fixture missing: ${stepName}`);
  const endMatch = source.indexOf('\n      - ', start + header.length);
  const end = endMatch < 0 ? source.length : endMatch;
  const block = source.slice(start, end);
  const withoutBlock = `${source.slice(0, start)}${source.slice(end)}`;

  const afterHeader = `      - name: ${afterStepName}`;
  const afterStart = withoutBlock.indexOf(afterHeader);
  assert.notEqual(afterStart, -1, `step fixture missing: ${afterStepName}`);
  const afterEndMatch = withoutBlock.indexOf('\n      - ', afterStart + afterHeader.length);
  const afterEnd = afterEndMatch < 0 ? withoutBlock.length : afterEndMatch;
  return `${withoutBlock.slice(0, afterEnd)}\n${block}${withoutBlock.slice(afterEnd)}`;
}

function verifiedInventory() {
  const inventory = structuredClone(currentInventory);
  for (const lane of inventory.lanes) {
    for (const job of lane.secret_bearing_jobs) {
      job.dynamic_secret_context = false;
      job.inherited_reusable_secrets = false;
      if (job.secret_names.length === 0) job.secret_names = ['STATIC_TEST_SECRET'];
    }
  }
  return inventory;
}

function requiredSecretsByEnvironment(inventory) {
  const grouped = new Map();
  for (const lane of inventory.lanes) {
    for (const job of lane.secret_bearing_jobs) {
      const names = grouped.get(job.environment.name) || [];
      grouped.set(job.environment.name, [...new Set([...names, ...job.secret_names])].sort());
    }
  }
  return grouped;
}

function verifiedSnapshot(inventory = verifiedInventory()) {
  const secretsByEnvironment = requiredSecretsByEnvironment(inventory);
  const environmentNames = [...secretsByEnvironment.keys()].sort();
  return {
    repository: {
      ok: true,
      status: 200,
      body: { full_name: contract.scope.repository, default_branch: 'main' }
    },
    branch: {
      ok: true,
      status: 200,
      body: { name: 'main', commit: { sha: mainSha }, protected: true }
    },
    environments: {
      ok: true,
      status: 200,
      complete: true,
      body: {
        total_count: environmentNames.length,
        environments: environmentNames.map((name) => ({
          name,
          can_admins_bypass: false,
          protection_rules: [{ type: 'branch_policy' }],
          deployment_branch_policy: { protected_branches: false, custom_branch_policies: true }
        }))
      }
    },
    environmentPolicies: Object.fromEntries(environmentNames.map((name) => [name, {
        ok: true,
        status: 200,
        complete: true,
        body: { total_count: 1, branch_policies: [{ name: 'main', type: 'branch' }] }
      }])),
    environmentSecrets: Object.fromEntries(environmentNames.map((name) => {
      const secretNames = secretsByEnvironment.get(name);
      return [name, {
        ok: true,
        status: 200,
        complete: true,
        body: { total_count: secretNames.length, secrets: secretNames.map((name) => ({ name })) }
      }];
    })),
    repositorySecrets: { ok: true, status: 200, complete: true, body: { total_count: 0, secrets: [] } },
    organizationSecrets: { ok: true, status: 200, complete: true, body: { total_count: 0, secrets: [] } },
    negativeExecutionProof: {
      selected_non_main_ref: {
        state: 'VERIFIED_REJECTED',
        evidence_ref: 'https://github.com/johnkim9524-collab/kaios_enterprise_repo/actions/runs/1001',
        source_ref: 'refs/heads/negative-non-main-control',
        observed_at: '2026-08-23T00:00:00.000Z'
      },
      branch_controlled_workflow_replacement: {
        state: 'VERIFIED_REJECTED',
        evidence_ref: 'https://github.com/johnkim9524-collab/kaios_enterprise_repo/actions/runs/1002',
        source_ref: 'refs/heads/negative-workflow-replacement-control',
        observed_at: '2026-08-23T00:00:00.000Z'
      }
    },
    rulesets: { ok: true, status: 200, complete: true, body: [{ id: 1 }] },
    rulesetDetails: [{
      ok: true,
      status: 200,
      body: {
        name: 'Protect main',
        target: 'branch',
        enforcement: 'active',
        conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
        rules: [{ type: 'pull_request' }, { type: 'non_fast_forward' }]
      }
    }]
  };
}

function receipt({ inventory = verifiedInventory(), snapshot = null, ref = 'refs/heads/main', sha = mainSha, authorizationMode = 'TEST_FIXTURE' } = {}) {
  return buildReadbackReceipt({
    contract,
    registry,
    inventory,
    snapshot: snapshot || verifiedSnapshot(inventory),
    sourceContext: { ref, sha },
    observedAt: '2026-08-23T00:00:00.000Z',
    authorizationMode
  });
}

test('current exact registry binds all 16 privileged lanes but external policy remains fail closed', () => {
  assert.equal(currentInventory.registered_lane_count, 16);
  assert.equal(currentInventory.secret_bearing_job_count, 16);
  assert.deepEqual(validateRequiredEnvironmentBindings(currentInventory, registry), []);
  const repositoryGuardedLanes = currentInventory.lanes
    .filter((lane) => lane.secret_bearing_jobs.some((job) => job.explicit_main_ref_guard))
    .map((lane) => lane.workflow)
    .sort();
  assert.deepEqual(repositoryGuardedLanes, [...registry.registered_workflows].sort());
  assert.ok(currentInventory.lanes.every((lane) => lane.secret_bearing_jobs.every((job) => job.environment.declared && job.environment.static)));
  const externalUnavailable = verifiedSnapshot(currentInventory);
  externalUnavailable.environments = { ok: false, status: 403, complete: false, body: null };
  externalUnavailable.environmentPolicies = {};
  externalUnavailable.environmentSecrets = {};
  const current = receipt({ inventory: currentInventory, snapshot: externalUnavailable });
  assert.equal(current.state, 'BLOCKED');
  assert.equal(current.issue_974_closure_eligible, false);
  assert.ok(current.binding_results.every((result) => result.blockers.includes('DECLARED_ENVIRONMENT_NOT_OBSERVED')));
  assert.equal(current.issue_881_control_pass_promoted, false);
  assert.equal(current.empirical_evidence_promoted, false);
});

test('synthetic exact-main environment and secret-name metadata is a test-only positive control', () => {
  const positive = receipt();
  assert.equal(positive.state, 'VERIFIED_PASS');
  assert.equal(positive.issue_974_closure_eligible, false);
  assert.equal(positive.proof_scope, 'SYNTHETIC_TEST_CONTROL');
  assert.equal(positive.control_truth, 'SYNTHETIC_POSITIVE_CONTROL_ONLY_NOT_EXTERNAL_PROOF');
  assert.equal(positive.external_proof_state, 'BLOCKED');
  assert.equal(positive.trusted_execution_attestation.state, 'NOT_IMPLEMENTED');
  assert.equal(positive.issue_974_closed_by_this_readback, false);
  assert.equal(positive.issue_881_control_pass_promoted, false);
  assert.equal(positive.settings_mutated, false);
  assert.equal(positive.secret_material_read, false);
  assert.equal(positive.secret_names_emitted, false);
  assert.equal(positive.credential_activation, 'NONE');
  assert.equal(positive.stored_repository_or_environment_secret_activated, false);
  assert.equal(positive.provider_credential_activated, false);
  assert.ok(positive.binding_results.every((result) => (
    result.repository_main_guard_present === true
    && result.registry_environment_binding_declared === true
    && result.registry_environment_name === result.environment_name
    && result.registry_required_secret_name_digest === result.required_secret_name_digest
  )));
});

test('authorization mode is bound to truthful ephemeral credential semantics', () => {
  const githubToken = receipt({ authorizationMode: 'GITHUB_TOKEN_METADATA_READ' });
  assert.equal(githubToken.credential_activation, 'EPHEMERAL_GITHUB_TOKEN_METADATA_READ');
  assert.equal(githubToken.stored_repository_or_environment_secret_activated, false);
  assert.equal(githubToken.provider_credential_activated, false);
  assert.deepEqual(validateReceipt(githubToken), []);
  assert.ok(validateReceipt(githubToken, { requireExternalProof: true }).includes('external_proof_authorization_mode'));

  const githubApp = receipt({ authorizationMode: 'GITHUB_APP_ENVIRONMENTS_AND_SECRETS_READ' });
  assert.equal(githubApp.credential_activation, 'EPHEMERAL_GITHUB_APP_INSTALLATION_TOKEN_ENVIRONMENTS_AND_SECRETS_READ');
  assert.equal(githubApp.proof_scope, 'AUTHORIZED_ENVIRONMENT_AND_SECRET_SCOPE_METADATA_READBACK');
  assert.equal(githubApp.issue_974_closure_eligible, false);
  assert.ok(validateReceipt(githubApp, { requireExternalProof: true }).includes('external_proof_validator_fail_closed_until_trusted_attestor'));
  assert.ok(validateReceipt(githubApp, { requireExternalProof: true }).includes('external_proof_trusted_execution_attestation'));

  const understated = structuredClone(githubToken);
  understated.credential_activation = 'NONE';
  assert.ok(validateReceipt(understated).includes('credential_activation_semantics'));

  const publicMetadata = receipt({ authorizationMode: 'PUBLIC_METADATA_ONLY' });
  assert.equal(publicMetadata.credential_activation, 'NONE');
  const overstated = structuredClone(publicMetadata);
  overstated.credential_activation = 'EPHEMERAL_GITHUB_TOKEN_METADATA_READ';
  assert.ok(validateReceipt(overstated).includes('credential_activation_semantics'));

  const storedSecretClaim = structuredClone(githubToken);
  storedSecretClaim.stored_repository_or_environment_secret_activated = true;
  assert.ok(validateReceipt(storedSecretClaim).includes('stored_secret_activation_boundary'));

  const providerClaim = structuredClone(githubToken);
  providerClaim.provider_credential_activated = true;
  assert.ok(validateReceipt(providerClaim).includes('provider_credential_activation_boundary'));
});

test('selected non-main ref and stale main SHA are independently rejected', () => {
  const nonMain = receipt({ ref: 'refs/heads/attacker-controlled' });
  assert.equal(nonMain.state, 'BLOCKED');
  assert.ok(nonMain.blockers.includes('READBACK_SOURCE_REF_NOT_DEFAULT_BRANCH'));

  const stale = receipt({ sha: 'b'.repeat(40) });
  assert.equal(stale.state, 'BLOCKED');
  assert.ok(stale.blockers.includes('EXACT_SOURCE_SHA_NOT_OBSERVED_DEFAULT_BRANCH_HEAD'));
});

test('all 16 privileged jobs reject unreadable, stale, and non-main live-main guards', () => {
  const mutations = [
    [
      'unreadable_api_fail_open',
      'curl --fail-with-body --silent --show-error',
      'curl --silent --show-error'
    ],
    [
      'stale_main_fail_open',
      'test "$LIVE_MAIN_SHA" = "$GITHUB_SHA"',
      'test -n "$LIVE_MAIN_SHA"'
    ],
    [
      'non_main_fail_open',
      'test "$GITHUB_REF" = "refs/heads/main"',
      'test -n "$GITHUB_REF"'
    ]
  ];
  let rejected = 0;
  for (const lane of currentInventory.lanes) {
    const source = fs.readFileSync(lane.workflow, 'utf8');
    for (const [id, before, after] of mutations) {
      const mutatedSource = replaceInLiveMainGuard(source, before, after);
      const failures = validateRequiredEnvironmentBindings(
        replaceLaneSource(currentInventory, lane.workflow, mutatedSource),
        registry
      );
      assert.ok(
        failures.some((failure) => failure.startsWith('LIVE_MAIN_GUARD_CONTRACT:')),
        `${lane.workflow} accepted ${id}: ${failures.join(',')}`
      );
      rejected += 1;
    }
  }
  assert.equal(rejected, 48);
});

test('all 16 privileged jobs reject secret scope and guard order mutations', () => {
  let rejected = 0;
  for (const lane of currentInventory.lanes) {
    const job = lane.secret_bearing_jobs[0];
    const source = fs.readFileSync(lane.workflow, 'utf8');
    const secretExpression = '$' + '{{ secrets.MUTATED_SCOPE_SECRET }}';

    const workflowScoped = source.replace(
      '\njobs:\n',
      `\nenv:\n  MUTATED_SCOPE_SECRET: ${secretExpression}\njobs:\n`
    );
    let failures = validateRequiredEnvironmentBindings(
      replaceLaneSource(currentInventory, lane.workflow, workflowScoped),
      registry
    );
    assert.ok(failures.some((failure) => failure.startsWith('WORKFLOW_SCOPE_PROVIDER_SECRET:')));
    rejected += 1;

    const jobScoped = injectJobScopeSecret(source, job.job);
    failures = validateRequiredEnvironmentBindings(
      replaceLaneSource(currentInventory, lane.workflow, jobScoped),
      registry
    );
    assert.ok(failures.some((failure) => failure.startsWith('JOB_SCOPE_PROVIDER_SECRET:')));
    rejected += 1;

    const expandedJobToken = injectJobPermissionOverride(source, job.job);
    failures = validateRequiredEnvironmentBindings(
      replaceLaneSource(currentInventory, lane.workflow, expandedJobToken),
      registry
    );
    assert.ok(failures.some((failure) => failure.startsWith('GITHUB_TOKEN_JOB_PERMISSION_OVERRIDE:')));
    rejected += 1;

    const binding = registry.required_environment_bindings.find((item) => (
      item.workflow === lane.workflow && item.job === job.job
    ));
    const secretStepName = binding.required_secret_step_names[0];
    const reorderedSource = moveNamedStepAfter(source, LIVE_MAIN_GUARD_STEP_NAME, secretStepName);
    failures = validateRequiredEnvironmentBindings(
      replaceLaneSource(currentInventory, lane.workflow, reorderedSource),
      registry
    );
    assert.ok(failures.some((failure) => failure.startsWith('LIVE_MAIN_GUARD_ORDER:')));
    rejected += 1;

    const renamedSource = source.replace(
      `      - name: ${secretStepName}`,
      '      - name: Mutated broad provider-secret step'
    );
    failures = validateRequiredEnvironmentBindings(
      replaceLaneSource(currentInventory, lane.workflow, renamedSource),
      registry
    );
    assert.ok(failures.some((failure) => failure.startsWith('REQUIRED_SECRET_STEP_MISMATCH:')));
    rejected += 1;
  }
  assert.equal(rejected, 80);
});

test('unprotected main, wildcard policy, and unreadable secret metadata fail closed', () => {
  const unprotected = verifiedSnapshot();
  unprotected.branch.body.protected = false;
  assert.ok(receipt({ snapshot: unprotected }).blockers.includes('DEFAULT_BRANCH_NOT_PROTECTED'));

  const wildcard = verifiedSnapshot();
  for (const policy of Object.values(wildcard.environmentPolicies)) policy.body.branch_policies = [{ name: '*', type: 'branch' }];
  const wildcardReceipt = receipt({ snapshot: wildcard });
  assert.ok(wildcardReceipt.binding_results.every((result) => result.blockers.includes('EXACT_MAIN_DEPLOYMENT_POLICY_NOT_PROVEN')));

  const unreadable = verifiedSnapshot();
  for (const name of Object.keys(unreadable.environmentSecrets)) unreadable.environmentSecrets[name] = { ok: false, status: 403, complete: false, body: null };
  const unreadableReceipt = receipt({ snapshot: unreadable });
  assert.ok(unreadableReceipt.binding_results.every((result) => result.blockers.includes('ENVIRONMENT_SECRET_METADATA_INCOMPLETE')));
});

test('truncated list metadata fails closed even when required names appear on the first page', () => {
  const truncatedRepositorySecrets = verifiedSnapshot();
  truncatedRepositorySecrets.repositorySecrets.complete = false;
  truncatedRepositorySecrets.repositorySecrets.body.total_count = 101;
  const truncated = receipt({ snapshot: truncatedRepositorySecrets });
  assert.equal(truncated.state, 'BLOCKED');
  assert.ok(truncated.blockers.includes('REPOSITORY_SECRET_METADATA_INCOMPLETE'));
  assert.ok(truncated.binding_results.every((result) => result.credential_environment_exclusive === false));
});

test('list collector exhausts pagination and reconciles the reported count', async () => {
  const originalFetch = globalThis.fetch;
  const requestedPages = [];
  globalThis.fetch = async (url) => {
    const page = Number(new URL(url).searchParams.get('page'));
    requestedPages.push(page);
    const offset = (page - 1) * 100;
    const count = page === 1 ? 100 : 1;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        total_count: 101,
        secrets: Array.from({ length: count }, (_, index) => ({ name: `SECRET_${offset + index}` }))
      })
    };
  };
  try {
    const result = await githubGetCompleteList(
      'johnkim9524-collab/kaios_enterprise_repo',
      '/actions/secrets',
      'test-token',
      { listKey: 'secrets', identityFields: ['name'] }
    );
    assert.equal(result.ok, true);
    assert.equal(result.complete, true);
    assert.equal(result.body.total_count, 101);
    assert.equal(result.body.secrets.length, 101);
    assert.deepEqual(requestedPages, [1, 2]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('list collector rejects duplicate identities across otherwise count-complete pages', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const page = Number(new URL(url).searchParams.get('page'));
    return {
      ok: true,
      status: 200,
      json: async () => ({
        total_count: 101,
        secrets: page === 1
          ? Array.from({ length: 100 }, (_, index) => ({ name: `SECRET_${index}` }))
          : [{ name: 'SECRET_0' }]
      })
    };
  };
  try {
    const result = await githubGetCompleteList(
      'johnkim9524-collab/kaios_enterprise_repo',
      '/actions/secrets',
      'test-token',
      { listKey: 'secrets', identityFields: ['name'] }
    );
    assert.equal(result.ok, false);
    assert.equal(result.complete, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('partial environment secret-name coverage fails without emitting names', () => {
  const inventory = verifiedInventory();
  const snapshot = verifiedSnapshot(inventory);
  const environmentName = Object.keys(snapshot.environmentSecrets)[0];
  const removedName = snapshot.environmentSecrets[environmentName].body.secrets.pop().name;
  snapshot.environmentSecrets[environmentName].body.total_count -= 1;
  const partial = receipt({ inventory, snapshot });
  assert.equal(partial.state, 'BLOCKED');
  assert.ok(partial.binding_results.some((result) => result.blockers.includes('ENVIRONMENT_SECRET_NAME_COVERAGE_INCOMPLETE')));
  assert.ok(!JSON.stringify(partial).includes(removedName));
});

test('workflow analyzer binds workflow-scope secrets to every job and detects dynamic access', () => {
  const analysis = analyzeWorkflow(`
on:
  workflow_dispatch:
env:
  GLOBAL_TOKEN: \${{ secrets.GLOBAL_TOKEN }}
jobs:
  first:
    environment:
      name: staging
    steps:
      - run: echo safe
  second:
    environment: \${{ inputs.environment }}
    env:
      DYNAMIC: \${{ secrets[inputs.secret_name] }}
    steps:
      - run: echo safe
`, 'fixture.yml');
  assert.equal(analysis.privileged_manual_lane, true);
  assert.deepEqual(analysis.secret_bearing_jobs.map((job) => job.secret_names), [['GLOBAL_TOKEN'], ['GLOBAL_TOKEN']]);
  assert.deepEqual(analysis.secret_bearing_jobs[0].environment, { declared: true, name: 'staging', static: true });
  assert.equal(analysis.secret_bearing_jobs[1].environment.static, false);
  assert.equal(analysis.secret_bearing_jobs[1].dynamic_secret_context, true);
});

test('ruleset context is recorded but never promoted to issue 936 closure', () => {
  const current = receipt();
  assert.equal(current.ruleset_context_only, true);
  assert.equal(current.effective_ruleset_readback_issue_936_closed, false);
  assert.ok(current.ruleset_context.some((ruleset) => ruleset.default_branch_targeted));
});

test('receipt validator rejects mutation and semantic-boundary promotion claims', () => {
  const positive = receipt();
  assert.deepEqual(validateReceipt(positive), []);

  const settingsMutation = structuredClone(positive);
  settingsMutation.settings_mutated = true;
  assert.ok(validateReceipt(settingsMutation).includes('settings_mutation_boundary'));

  const parentPromotion = structuredClone(positive);
  parentPromotion.issue_881_control_pass_promoted = true;
  assert.ok(validateReceipt(parentPromotion).includes('issue_881_promotion_forbidden'));

  const secretLeak = structuredClone(positive);
  secretLeak.secret_names_emitted = true;
  assert.ok(validateReceipt(secretLeak).includes('secret_name_output_boundary'));

  const rawSecretMetadata = structuredClone(positive);
  rawSecretMetadata.raw = { secrets: [{ name: 'MUST_NOT_APPEAR' }] };
  assert.ok(validateReceipt(rawSecretMetadata).includes('raw_secret_or_credential_field_forbidden'));

  const unavailable = verifiedSnapshot(currentInventory);
  unavailable.environments = { ok: false, status: 403, complete: false, body: null };
  unavailable.environmentPolicies = {};
  unavailable.environmentSecrets = {};
  const blocked = receipt({ inventory: currentInventory, snapshot: unavailable });
  assert.ok(validateReceipt(blocked, { requireExternalProof: true }).includes('external_proof_required'));
});

test('external-proof mode rejects forged state, fixture scope, stale digest, stale SHA, and non-exclusive credentials', () => {
  const forgedFixture = receipt();
  forgedFixture.issue_974_closure_eligible = true;
  forgedFixture.control_truth = 'CONTROL_PLANE_READBACK_COMPLETE_EXTERNAL_TRUSTED_EXECUTION_NOT_PROVEN';
  assert.ok(validateReceipt(forgedFixture, { requireExternalProof: true }).includes('external_proof_authorization_mode'));

  const validExternal = receipt({ authorizationMode: 'GITHUB_APP_ENVIRONMENTS_AND_SECRETS_READ' });
  assert.ok(validateReceipt(validExternal, { requireExternalProof: true }).includes('external_proof_validator_fail_closed_until_trusted_attestor'));

  const forgedAttestor = structuredClone(validExternal);
  forgedAttestor.issue_974_closure_eligible = true;
  forgedAttestor.external_proof_state = 'VERIFIED_PASS';
  forgedAttestor.external_proof_blockers = [];
  forgedAttestor.trusted_execution_attestation = {
    state: 'VERIFIED_PASS',
    provenance_type: 'FORGED',
    subject_digest: `sha256:${'c'.repeat(64)}`,
    workflow_run_id: 999999,
    verified_by: 'UNTRUSTED_INPUT'
  };
  forgedAttestor.readback_digest = computeReadbackDigest(forgedAttestor);
  assert.ok(validateReceipt(forgedAttestor, { requireExternalProof: true }).includes('external_proof_validator_fail_closed_until_trusted_attestor'));
  const staleDigest = structuredClone(validExternal);
  staleDigest.binding_results[0].environment_observed = false;
  assert.ok(validateReceipt(staleDigest, { requireExternalProof: true }).includes('readback_digest_integrity'));

  const staleSha = structuredClone(validExternal);
  staleSha.exact_source_sha = 'b'.repeat(40);
  staleSha.readback_digest = computeReadbackDigest(staleSha);
  assert.ok(validateReceipt(staleSha, { requireExternalProof: true }).includes('external_proof_exact_main_sha'));

  const repoScoped = structuredClone(validExternal);
  repoScoped.binding_results[0].repository_scoped_required_secret_count = 1;
  repoScoped.binding_results[0].credential_environment_exclusive = false;
  repoScoped.readback_digest = computeReadbackDigest(repoScoped);
  assert.ok(validateReceipt(repoScoped, { requireExternalProof: true }).includes('external_proof_binding_semantics'));

  const bypassableAdmin = structuredClone(validExternal);
  bypassableAdmin.environment_summary[0].can_admins_bypass = true;
  bypassableAdmin.readback_digest = computeReadbackDigest(bypassableAdmin);
  assert.ok(validateReceipt(bypassableAdmin, { requireExternalProof: true }).includes('external_proof_environment_summary'));
});
