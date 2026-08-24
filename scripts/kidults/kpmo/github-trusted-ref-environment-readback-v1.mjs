#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const CONTRACT_PATH = 'coordination/kidults/kpmo/github-trusted-ref-environment-readback-contract-v1.json';
export const REGISTRY_PATH = 'coordination/kidults/kpmo/secret-bearing-workflow-dispatch-registry-v1.json';
const DEFAULT_REPOSITORY = 'johnkim9524-collab/kaios_enterprise_repo';
const DEFAULT_BRANCH = 'main';

const digest = (value) => `sha256:${crypto.createHash('sha256').update(String(value)).digest('hex')}`;
const uniqueSorted = (values) => [...new Set(values)].sort();

export function activeWorkflowText(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('#'))
    .map((line) => line.replace(/\s+#.*$/, ''))
    .join('\n');
}

export function secretMetadata(text) {
  const active = activeWorkflowText(text);
  const names = [];
  let secretContextExpression = false;
  let dynamicSecretContext = false;

  for (const expression of active.matchAll(/\$\{\{([\s\S]*?)\}\}/g)) {
    const body = expression[1];
    if (!/\bsecrets\b/.test(body)) continue;
    secretContextExpression = true;

    for (const match of body.matchAll(/\bsecrets\.([A-Za-z_][A-Za-z0-9_]*)\b/g)) names.push(match[1]);
    for (const match of body.matchAll(/\bsecrets\s*\[\s*(['"])([A-Za-z_][A-Za-z0-9_]*)\1\s*\]/g)) names.push(match[2]);

    const withoutStaticReferences = body
      .replace(/\bsecrets\.[A-Za-z_][A-Za-z0-9_]*\b/g, '')
      .replace(/\bsecrets\s*\[\s*(['"])[A-Za-z_][A-Za-z0-9_]*\1\s*\]/g, '');
    if (/\bsecrets\b/.test(withoutStaticReferences)) dynamicSecretContext = true;
  }

  const inheritedReusableSecrets = /^\s*secrets\s*:\s*inherit\s*$/mi.test(active);
  return {
    secret_names: uniqueSorted(names),
    secret_context_expression: secretContextExpression,
    dynamic_secret_context: dynamicSecretContext,
    inherited_reusable_secrets: inheritedReusableSecrets,
    secret_bearing: secretContextExpression || inheritedReusableSecrets
  };
}

function scalarValue(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function jobEnvironment(block) {
  const lines = block.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^ {4}environment\s*:\s*(.*?)\s*$/);
    if (!match) continue;
    if (match[1]) {
      const name = scalarValue(match[1]);
      return {
        declared: true,
        name: name && !name.includes('${{') ? name : null,
        static: Boolean(name && !name.includes('${{'))
      };
    }
    for (let nested = index + 1; nested < lines.length; nested += 1) {
      if (/^ {0,4}\S/.test(lines[nested])) break;
      const nameMatch = lines[nested].match(/^ {6}name\s*:\s*(.*?)\s*$/);
      if (nameMatch) {
        const name = scalarValue(nameMatch[1]);
        return {
          declared: true,
          name: name && !name.includes('${{') ? name : null,
          static: Boolean(name && !name.includes('${{'))
        };
      }
    }
    return { declared: true, name: null, static: false };
  }
  return { declared: false, name: null, static: false };
}

export function analyzeWorkflow(text, workflow = 'fixture.yml') {
  const active = activeWorkflowText(text);
  const workflowDispatch = /^\s*workflow_dispatch\s*:/mi.test(active);
  const jobsStart = active.search(/^jobs\s*:\s*$/m);
  const workflowScope = jobsStart >= 0 ? active.slice(0, jobsStart) : active;
  const workflowSecrets = secretMetadata(workflowScope);
  const lines = active.split(/\r?\n/);
  const jobHeaders = [];
  let insideJobs = false;

  for (let index = 0; index < lines.length; index += 1) {
    if (/^jobs\s*:\s*$/.test(lines[index])) {
      insideJobs = true;
      continue;
    }
    if (!insideJobs) continue;
    if (/^[^\s].*:\s*$/.test(lines[index])) break;
    const match = lines[index].match(/^ {2}([A-Za-z0-9_-]+)\s*:\s*$/);
    if (match) jobHeaders.push({ id: match[1], line: index });
  }

  const jobs = jobHeaders.map((header, position) => {
    const nextLine = position + 1 < jobHeaders.length ? jobHeaders[position + 1].line : lines.length;
    const block = lines.slice(header.line, nextLine).join('\n');
    const jobSecrets = secretMetadata(block);
    const secretNames = uniqueSorted([...workflowSecrets.secret_names, ...jobSecrets.secret_names]);
    const dynamicSecretContext = workflowSecrets.dynamic_secret_context || jobSecrets.dynamic_secret_context;
    const inheritedReusableSecrets = workflowSecrets.inherited_reusable_secrets || jobSecrets.inherited_reusable_secrets;
    const secretBearing = workflowSecrets.secret_bearing || jobSecrets.secret_bearing;
    const environment = jobEnvironment(block);
    const explicitMainRefGuard = /github\.ref\s*==\s*['"]refs\/heads\/main['"]/.test(block)
      || /GITHUB_REF[^\n]*refs\/heads\/main/.test(block);
    return {
      job: header.id,
      secret_bearing: secretBearing,
      secret_names: secretNames,
      dynamic_secret_context: dynamicSecretContext,
      inherited_reusable_secrets: inheritedReusableSecrets,
      environment,
      explicit_main_ref_guard: explicitMainRefGuard
    };
  });

  if (jobs.length === 0 && workflowSecrets.secret_bearing) {
    jobs.push({
      job: '__workflow_scope_without_job__',
      secret_bearing: true,
      secret_names: workflowSecrets.secret_names,
      dynamic_secret_context: workflowSecrets.dynamic_secret_context,
      inherited_reusable_secrets: workflowSecrets.inherited_reusable_secrets,
      environment: { declared: false, name: null, static: false },
      explicit_main_ref_guard: false
    });
  }

  const secretBearingJobs = jobs.filter((job) => job.secret_bearing);
  return {
    workflow,
    workflow_dispatch: workflowDispatch,
    privileged_manual_lane: workflowDispatch && secretBearingJobs.length > 0,
    workflow_scope_secret_names: workflowSecrets.secret_names,
    jobs,
    secret_bearing_jobs: secretBearingJobs
  };
}

export function buildWorkflowInventory(root = process.cwd(), registry = null) {
  const currentRegistry = registry || JSON.parse(fs.readFileSync(path.join(root, REGISTRY_PATH), 'utf8'));
  const lanes = [];
  for (const workflow of currentRegistry.registered_workflows || []) {
    const absolute = path.join(root, workflow);
    if (!fs.existsSync(absolute)) throw new Error(`REGISTERED_WORKFLOW_MISSING:${workflow}`);
    const analysis = analyzeWorkflow(fs.readFileSync(absolute, 'utf8'), workflow);
    if (!analysis.privileged_manual_lane) throw new Error(`REGISTERED_WORKFLOW_NOT_PRIVILEGED_MANUAL_LANE:${workflow}`);
    lanes.push(analysis);
  }
  return {
    registry_id: currentRegistry.id,
    registered_lane_count: lanes.length,
    secret_bearing_job_count: lanes.reduce((sum, lane) => sum + lane.secret_bearing_jobs.length, 0),
    lanes
  };
}

function endpoint(status, ok) {
  return { http_status: Number(status || 0), readable: Boolean(ok) };
}

function exactMainPolicy(environment, policyReadback) {
  const branchPolicyRule = (environment.protection_rules || []).some((rule) => rule?.type === 'branch_policy');
  const deployment = environment.deployment_branch_policy;
  const policies = policyReadback?.items || [];
  const exactMainOnly = policies.length === 1 && policies[0]?.type === 'branch' && policies[0]?.name === DEFAULT_BRANCH;
  return Boolean(
    branchPolicyRule
      && deployment?.protected_branches === false
      && deployment?.custom_branch_policies === true
      && policyReadback?.ok
      && exactMainOnly
  );
}

function sanitizedRulesets(snapshot) {
  return (snapshot.rulesetDetails || []).map((result) => ({
    readable: Boolean(result.ok),
    http_status: Number(result.status || 0),
    name: result.ok ? String(result.body?.name || '') : null,
    target: result.ok ? String(result.body?.target || '') : null,
    enforcement: result.ok ? String(result.body?.enforcement || '') : null,
    default_branch_targeted: Boolean(result.ok && result.body?.conditions?.ref_name?.include?.includes('~DEFAULT_BRANCH')),
    rule_types: result.ok ? uniqueSorted((result.body?.rules || []).map((rule) => String(rule?.type || '')).filter(Boolean)) : []
  }));
}

export function buildReadbackReceipt({
  contract,
  registry,
  inventory,
  snapshot,
  sourceContext,
  observedAt = new Date().toISOString(),
  authorizationMode = 'PUBLIC_METADATA_ONLY'
}) {
  const repositoryBody = snapshot.repository?.body || {};
  const branchBody = snapshot.branch?.body || {};
  const observedBranchSha = branchBody.sha || branchBody.commit?.sha || null;
  const environmentItems = snapshot.environments?.ok && Array.isArray(snapshot.environments.body?.environments)
    ? snapshot.environments.body.environments
    : [];
  const environmentsByName = new Map(environmentItems.map((environment) => [environment.name, environment]));
  const bindingResults = [];

  for (const lane of inventory.lanes) {
    for (const job of lane.secret_bearing_jobs) {
      const environmentName = job.environment.name;
      const environment = environmentName ? environmentsByName.get(environmentName) : null;
      const policyReadback = environmentName ? snapshot.environmentPolicies?.[environmentName] : null;
      const secretReadback = environmentName ? snapshot.environmentSecrets?.[environmentName] : null;
      const observedSecretNames = secretReadback?.ok && Array.isArray(secretReadback.body?.secrets)
        ? uniqueSorted(secretReadback.body.secrets.map((item) => item?.name).filter(Boolean))
        : [];
      const requiredNames = uniqueSorted(job.secret_names);
      const matchedSecretCount = requiredNames.filter((name) => observedSecretNames.includes(name)).length;
      const blockers = [];
      if (!job.environment.declared) blockers.push('JOB_ENVIRONMENT_NOT_DECLARED');
      else if (!job.environment.static) blockers.push('JOB_ENVIRONMENT_NAME_NOT_STATIC');
      if (job.dynamic_secret_context) blockers.push('DYNAMIC_OR_WHOLE_SECRET_CONTEXT_NOT_PROVABLE');
      if (job.inherited_reusable_secrets) blockers.push('INHERITED_SECRET_SET_NOT_PROVABLE');
      if (!environment) blockers.push('DECLARED_ENVIRONMENT_NOT_OBSERVED');
      if (environment && !exactMainPolicy(environment, policyReadback)) blockers.push('EXACT_MAIN_DEPLOYMENT_POLICY_NOT_PROVEN');
      if (environment && !secretReadback?.ok) blockers.push('ENVIRONMENT_SECRET_METADATA_NOT_READABLE');
      if (environment && secretReadback?.ok && matchedSecretCount !== requiredNames.length) blockers.push('ENVIRONMENT_SECRET_NAME_COVERAGE_INCOMPLETE');
      if (requiredNames.length === 0) blockers.push('STATIC_SECRET_NAME_SET_EMPTY_OR_DYNAMIC');

      bindingResults.push({
        workflow: lane.workflow,
        job: job.job,
        required_secret_count: requiredNames.length,
        required_secret_name_digest: digest(requiredNames.join('\n')),
        dynamic_secret_context: job.dynamic_secret_context,
        inherited_reusable_secrets: job.inherited_reusable_secrets,
        repository_main_guard_present: job.explicit_main_ref_guard,
        environment_declared: job.environment.declared,
        environment_binding_static: job.environment.static,
        environment_name: environmentName,
        environment_observed: Boolean(environment),
        exact_main_deployment_policy_verified: Boolean(environment && exactMainPolicy(environment, policyReadback)),
        environment_secret_metadata_readable: Boolean(secretReadback?.ok),
        observed_environment_secret_count: observedSecretNames.length,
        observed_environment_secret_name_digest: secretReadback?.ok ? digest(observedSecretNames.join('\n')) : null,
        matched_required_secret_count: matchedSecretCount,
        environment_secret_name_coverage_complete: Boolean(secretReadback?.ok && requiredNames.length > 0 && matchedSecretCount === requiredNames.length),
        state: blockers.length === 0 ? 'VERIFIED_PASS' : 'BLOCKED',
        blockers
      });
    }
  }

  const globalBlockers = [];
  if (!snapshot.repository?.ok) globalBlockers.push('REPOSITORY_METADATA_NOT_READABLE');
  if (repositoryBody.full_name !== contract.scope.repository) globalBlockers.push('REPOSITORY_IDENTITY_MISMATCH');
  if (repositoryBody.default_branch !== contract.scope.default_branch) globalBlockers.push('DEFAULT_BRANCH_MISMATCH');
  if (!snapshot.branch?.ok) globalBlockers.push('DEFAULT_BRANCH_METADATA_NOT_READABLE');
  if (branchBody.name !== contract.scope.default_branch) globalBlockers.push('OBSERVED_BRANCH_NAME_MISMATCH');
  if (!branchBody.protected) globalBlockers.push('DEFAULT_BRANCH_NOT_PROTECTED');
  if (!snapshot.environments?.ok) globalBlockers.push('ENVIRONMENT_LIST_NOT_READABLE');
  if (sourceContext.ref !== `refs/heads/${contract.scope.default_branch}`) globalBlockers.push('READBACK_SOURCE_REF_NOT_DEFAULT_BRANCH');
  if (!/^[0-9a-f]{40}$/.test(String(sourceContext.sha || ''))) globalBlockers.push('EXACT_SOURCE_SHA_MISSING_OR_INVALID');
  if (sourceContext.ref === `refs/heads/${contract.scope.default_branch}` && sourceContext.sha !== observedBranchSha) {
    globalBlockers.push('EXACT_SOURCE_SHA_NOT_OBSERVED_DEFAULT_BRANCH_HEAD');
  }
  if (bindingResults.length === 0) globalBlockers.push('NO_SECRET_BEARING_JOB_BINDINGS_FOUND');
  if (bindingResults.some((result) => result.state !== 'VERIFIED_PASS')) globalBlockers.push('ONE_OR_MORE_PRIVILEGED_JOBS_UNVERIFIED');
  globalBlockers.push('TRUSTED_DEFAULT_BRANCH_OR_RELEASE_HANDOFF_NOT_IMPLEMENTED_OR_PROVEN');

  const environmentSummary = environmentItems.map((environment) => {
    const policyReadback = snapshot.environmentPolicies?.[environment.name];
    const secretReadback = snapshot.environmentSecrets?.[environment.name];
    const secretNames = secretReadback?.ok && Array.isArray(secretReadback.body?.secrets)
      ? uniqueSorted(secretReadback.body.secrets.map((item) => item?.name).filter(Boolean))
      : [];
    return {
      name: environment.name,
      can_admins_bypass: environment.can_admins_bypass,
      protection_rule_types: uniqueSorted((environment.protection_rules || []).map((rule) => rule?.type).filter(Boolean)),
      deployment_branch_policy: environment.deployment_branch_policy || null,
      deployment_branch_policy_readback: endpoint(policyReadback?.status, policyReadback?.ok),
      exact_main_only: exactMainPolicy(environment, policyReadback),
      environment_secret_metadata_readback: endpoint(secretReadback?.status, secretReadback?.ok),
      environment_secret_count: secretNames.length,
      environment_secret_name_digest: secretReadback?.ok ? digest(secretNames.join('\n')) : null
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const endpointStatuses = {
    repository: endpoint(snapshot.repository?.status, snapshot.repository?.ok),
    default_branch: endpoint(snapshot.branch?.status, snapshot.branch?.ok),
    environments: endpoint(snapshot.environments?.status, snapshot.environments?.ok),
    rulesets: endpoint(snapshot.rulesets?.status, snapshot.rulesets?.ok)
  };
  const uniqueGlobalBlockers = uniqueSorted(globalBlockers);
  const closureEligible = uniqueGlobalBlockers.length === 1
    && uniqueGlobalBlockers[0] === 'TRUSTED_DEFAULT_BRANCH_OR_RELEASE_HANDOFF_NOT_IMPLEMENTED_OR_PROVEN'
    && bindingResults.every((result) => result.state === 'VERIFIED_PASS');
  if (closureEligible) uniqueGlobalBlockers.splice(0, uniqueGlobalBlockers.length);

  const credentialActivation = authorizationMode === 'GITHUB_TOKEN_METADATA_READ'
    ? 'EPHEMERAL_GITHUB_TOKEN_METADATA_READ'
    : 'NONE';

  const receipt = {
    id: 'kidults-github-trusted-ref-environment-readback-receipt-v1',
    version: '1.1.0',
    issue: 974,
    parent_gate_issue: 881,
    observed_at: observedAt,
    state: closureEligible ? 'VERIFIED_PASS' : 'BLOCKED',
    control_truth: closureEligible
      ? 'EXTERNAL_TRUSTED_REF_ENVIRONMENT_POLICY_VERIFIED_CLOSURE_DECISION_STILL_EXTERNAL'
      : 'EXTERNAL_CONTROL_PLANE_PROOF_INCOMPLETE',
    repository: contract.scope.repository,
    authorization_mode: authorizationMode,
    source_ref: sourceContext.ref,
    exact_source_sha: sourceContext.sha,
    observed_default_branch: repositoryBody.default_branch || null,
    observed_default_branch_sha: observedBranchSha,
    observed_default_branch_protected: branchBody.protected === true,
    endpoint_http_statuses: endpointStatuses,
    registered_privileged_manual_lanes: inventory.registered_lane_count,
    secret_bearing_jobs: inventory.secret_bearing_job_count,
    verified_secret_bearing_jobs: bindingResults.filter((result) => result.state === 'VERIFIED_PASS').length,
    binding_results: bindingResults,
    environment_summary: environmentSummary,
    ruleset_context: sanitizedRulesets(snapshot),
    ruleset_context_only: true,
    effective_ruleset_readback_issue_936_closed: false,
    issue_974_closure_eligible: closureEligible,
    issue_974_closed_by_this_readback: false,
    issue_881_control_pass_promoted: false,
    empirical_evidence_promoted: false,
    external_partner_ingestion_authorized: false,
    settings_mutated: false,
    secret_material_read: false,
    secret_names_emitted: false,
    credential_activation: credentialActivation,
    stored_repository_or_environment_secret_activated: false,
    provider_credential_activated: false,
    blockers: uniqueGlobalBlockers,
    production: 'HOLD',
    public: 'HOLD',
    g5: 'EXPLICIT_APPROVAL_REQUIRED',
    autonomous_effect: contract.effects.autonomous_effect,
    global_effect: contract.effects.global_effect,
    irreplaceable_value_effect: contract.effects.irreplaceable_value_effect,
    transparency_effect: contract.effects.transparency_effect
  };
  receipt.readback_digest = digest(JSON.stringify({
    authorization_mode: receipt.authorization_mode,
    credential_activation: receipt.credential_activation,
    source_ref: receipt.source_ref,
    exact_source_sha: receipt.exact_source_sha,
    observed_default_branch_sha: receipt.observed_default_branch_sha,
    endpoint_http_statuses: receipt.endpoint_http_statuses,
    binding_results: receipt.binding_results,
    environment_summary: receipt.environment_summary,
    ruleset_context: receipt.ruleset_context,
    blockers: receipt.blockers
  }));
  return receipt;
}

async function githubGet(repository, suffix, token) {
  const response = await fetch(`https://api.github.com/repos/${repository}${suffix}`, {
    method: 'GET',
    redirect: 'error',
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'kidults-trusted-ref-environment-readback-v1',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { ok: response.ok, status: response.status, body: response.ok ? body : null };
}

export async function collectLiveSnapshot(repository, token = '') {
  const [repositoryResult, branchResult, environmentsResult, rulesetsResult] = await Promise.all([
    githubGet(repository, '', token),
    githubGet(repository, `/branches/${DEFAULT_BRANCH}`, token),
    githubGet(repository, '/environments', token),
    githubGet(repository, '/rulesets', token)
  ]);

  const environments = environmentsResult.ok && Array.isArray(environmentsResult.body?.environments)
    ? environmentsResult.body.environments
    : [];
  const environmentPolicies = {};
  const environmentSecrets = {};
  await Promise.all(environments.map(async (environment) => {
    const encoded = encodeURIComponent(environment.name);
    const [policy, secrets] = await Promise.all([
      githubGet(repository, `/environments/${encoded}/deployment-branch-policies`, token),
      githubGet(repository, `/environments/${encoded}/secrets`, token)
    ]);
    environmentPolicies[environment.name] = {
      ...policy,
      items: policy.ok && Array.isArray(policy.body?.branch_policies) ? policy.body.branch_policies : []
    };
    environmentSecrets[environment.name] = secrets;
  }));

  const listedRulesets = rulesetsResult.ok && Array.isArray(rulesetsResult.body) ? rulesetsResult.body : [];
  const rulesetDetails = await Promise.all(listedRulesets.map((ruleset) => githubGet(repository, `/rulesets/${ruleset.id}`, token)));
  return {
    repository: repositoryResult,
    branch: branchResult,
    environments: environmentsResult,
    environmentPolicies,
    environmentSecrets,
    rulesets: rulesetsResult,
    rulesetDetails
  };
}

function argument(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

async function main() {
  const root = process.cwd();
  const contract = JSON.parse(fs.readFileSync(path.join(root, CONTRACT_PATH), 'utf8'));
  const registry = JSON.parse(fs.readFileSync(path.join(root, REGISTRY_PATH), 'utf8'));
  const inventory = buildWorkflowInventory(root, registry);
  const repository = argument('--repository', contract.scope.repository || DEFAULT_REPOSITORY);
  const sourceContext = {
    ref: argument('--source-ref', process.env.GITHUB_REF || 'UNKNOWN'),
    sha: argument('--source-sha', process.env.GITHUB_SHA || '')
  };
  const fixturePath = argument('--fixture');
  const snapshot = fixturePath
    ? JSON.parse(fs.readFileSync(path.resolve(fixturePath), 'utf8'))
    : await collectLiveSnapshot(repository, process.env.GITHUB_TOKEN || '');
  const receipt = buildReadbackReceipt({
    contract,
    registry,
    inventory,
    snapshot,
    sourceContext,
    authorizationMode: fixturePath
      ? 'TEST_FIXTURE'
      : (process.env.GITHUB_TOKEN ? 'GITHUB_TOKEN_METADATA_READ' : 'PUBLIC_METADATA_ONLY')
  });
  const serialized = `${JSON.stringify(receipt, null, 2)}\n`;
  const output = argument('--output');
  if (output) fs.writeFileSync(path.resolve(output), serialized, { mode: 0o600 });
  process.stdout.write(serialized);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`READBACK_FAILED:${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
