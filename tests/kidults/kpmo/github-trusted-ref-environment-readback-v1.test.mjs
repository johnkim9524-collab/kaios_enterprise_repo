import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  CONTRACT_PATH,
  REGISTRY_PATH,
  analyzeWorkflow,
  buildReadbackReceipt,
  buildWorkflowInventory
} from '../../../scripts/kidults/kpmo/github-trusted-ref-environment-readback-v1.mjs';
import { validateReceipt } from '../../../scripts/kidults/kpmo/validate-github-trusted-ref-environment-readback-v1.mjs';

const contract = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
const currentInventory = buildWorkflowInventory(process.cwd(), registry);
const mainSha = 'a'.repeat(40);

function verifiedInventory() {
  const inventory = structuredClone(currentInventory);
  for (const lane of inventory.lanes) {
    for (const job of lane.secret_bearing_jobs) {
      job.environment = { declared: true, name: 'staging', static: true };
      job.dynamic_secret_context = false;
      job.inherited_reusable_secrets = false;
      if (job.secret_names.length === 0) job.secret_names = ['STATIC_TEST_SECRET'];
    }
  }
  return inventory;
}

function requiredSecretNames(inventory) {
  return [...new Set(inventory.lanes.flatMap((lane) => lane.secret_bearing_jobs.flatMap((job) => job.secret_names)))].sort();
}

function verifiedSnapshot(inventory = verifiedInventory()) {
  const secretNames = requiredSecretNames(inventory);
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
      body: {
        environments: [{
          name: 'staging',
          can_admins_bypass: false,
          protection_rules: [{ type: 'branch_policy' }],
          deployment_branch_policy: { protected_branches: false, custom_branch_policies: true }
        }]
      }
    },
    environmentPolicies: {
      staging: {
        ok: true,
        status: 200,
        body: { total_count: 1, branch_policies: [{ name: 'main', type: 'branch' }] },
        items: [{ name: 'main', type: 'branch' }]
      }
    },
    environmentSecrets: {
      staging: {
        ok: true,
        status: 200,
        body: { total_count: secretNames.length, secrets: secretNames.map((name) => ({ name })) }
      }
    },
    rulesets: { ok: true, status: 200, body: [{ id: 1 }] },
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

test('current exact registry remains 15 privileged manual lanes and unbound jobs fail closed', () => {
  assert.equal(currentInventory.registered_lane_count, 15);
  assert.ok(currentInventory.secret_bearing_job_count >= 15);
  const current = receipt({ inventory: currentInventory, snapshot: verifiedSnapshot(currentInventory) });
  assert.equal(current.state, 'BLOCKED');
  assert.equal(current.issue_974_closure_eligible, false);
  assert.ok(current.binding_results.every((result) => result.blockers.includes('JOB_ENVIRONMENT_NOT_DECLARED')));
  assert.equal(current.issue_881_control_pass_promoted, false);
  assert.equal(current.empirical_evidence_promoted, false);
});

test('synthetic exact-main environment and secret-name metadata is a test-only positive control', () => {
  const positive = receipt();
  assert.equal(positive.state, 'VERIFIED_PASS');
  assert.equal(positive.issue_974_closure_eligible, true);
  assert.equal(positive.issue_974_closed_by_this_readback, false);
  assert.equal(positive.issue_881_control_pass_promoted, false);
  assert.equal(positive.settings_mutated, false);
  assert.equal(positive.secret_material_read, false);
  assert.equal(positive.secret_names_emitted, false);
  assert.equal(positive.credential_activation, 'NONE');
  assert.equal(positive.stored_repository_or_environment_secret_activated, false);
  assert.equal(positive.provider_credential_activated, false);
});

test('authorization mode is bound to truthful ephemeral credential semantics', () => {
  const githubToken = receipt({ authorizationMode: 'GITHUB_TOKEN_METADATA_READ' });
  assert.equal(githubToken.credential_activation, 'EPHEMERAL_GITHUB_TOKEN_METADATA_READ');
  assert.equal(githubToken.stored_repository_or_environment_secret_activated, false);
  assert.equal(githubToken.provider_credential_activated, false);
  assert.deepEqual(validateReceipt(githubToken), []);

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

test('unprotected main, wildcard policy, and unreadable secret metadata fail closed', () => {
  const unprotected = verifiedSnapshot();
  unprotected.branch.body.protected = false;
  assert.ok(receipt({ snapshot: unprotected }).blockers.includes('DEFAULT_BRANCH_NOT_PROTECTED'));

  const wildcard = verifiedSnapshot();
  wildcard.environmentPolicies.staging.items = [{ name: '*', type: 'branch' }];
  const wildcardReceipt = receipt({ snapshot: wildcard });
  assert.ok(wildcardReceipt.binding_results.every((result) => result.blockers.includes('EXACT_MAIN_DEPLOYMENT_POLICY_NOT_PROVEN')));

  const unreadable = verifiedSnapshot();
  unreadable.environmentSecrets.staging = { ok: false, status: 403, body: null };
  const unreadableReceipt = receipt({ snapshot: unreadable });
  assert.ok(unreadableReceipt.binding_results.every((result) => result.blockers.includes('ENVIRONMENT_SECRET_METADATA_NOT_READABLE')));
});

test('partial environment secret-name coverage fails without emitting names', () => {
  const inventory = verifiedInventory();
  const snapshot = verifiedSnapshot(inventory);
  const removedName = snapshot.environmentSecrets.staging.body.secrets.pop().name;
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

  const blocked = receipt({ inventory: currentInventory, snapshot: verifiedSnapshot(currentInventory) });
  assert.ok(validateReceipt(blocked, { requireExternalProof: true }).includes('external_proof_required'));
});
