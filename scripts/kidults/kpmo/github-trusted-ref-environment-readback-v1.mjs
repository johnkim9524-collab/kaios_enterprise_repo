#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const CONTRACT_PATH = 'coordination/kidults/kpmo/github-trusted-ref-environment-readback-contract-v1.json';
export const REGISTRY_PATH = 'coordination/kidults/kpmo/secret-bearing-workflow-dispatch-registry-v1.json';
const DEFAULT_REPOSITORY = 'johnkim9524-collab/kaios_enterprise_repo';
const DEFAULT_BRANCH = 'main';
export const LIVE_MAIN_GUARD_STEP_NAME = 'Verify live main before provider credential resolution';
export const ACTIVATION_RECEIPT_STEP_NAME = 'Verify explicit STAGING activation authorization before secret resolution';
export const ONE_SHOT_AUTHORIZATION_STEP_NAME = 'Verify exact-run Program Owner environment approval';

const digest = (value) => `sha256:${crypto.createHash('sha256').update(String(value)).digest('hex')}`;
const uniqueSorted = (values) => [...new Set(values)].sort();

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])
  );
}

export function readbackDigestPayload(receipt) {
  const { readback_digest: omittedDigest, ...materialReceipt } = receipt || {};
  void omittedDigest;
  return canonicalize(materialReceipt);
}

export function computeReadbackDigest(receipt) {
  return digest(JSON.stringify(readbackDigestPayload(receipt)));
}

function sanitizeNegativeExecutionProof(snapshot) {
  const controls = [
    'selected_non_main_ref',
    'branch_controlled_workflow_replacement'
  ];
  return Object.fromEntries(controls.map((control) => {
    const observed = snapshot.negativeExecutionProof?.[control] || {};
    const evidenceRef = typeof observed.evidence_ref === 'string' ? observed.evidence_ref : null;
    const sourceRef = typeof observed.source_ref === 'string' ? observed.source_ref : null;
    const observedAt = typeof observed.observed_at === 'string' ? observed.observed_at : null;
    const verified = observed.state === 'VERIFIED_REJECTED'
      && /^https:\/\/github\.com\/johnkim9524-collab\/kaios_enterprise_repo\/actions\/runs\/[1-9][0-9]*$/.test(String(evidenceRef || ''))
      && /^refs\/heads\//.test(String(sourceRef || ''))
      && sourceRef !== 'refs/heads/main'
      && !Number.isNaN(Date.parse(String(observedAt || '')));
    return [control, {
      state: verified ? 'VERIFIED_REJECTED' : 'NOT_PROVEN',
      evidence_ref: verified ? evidenceRef : null,
      source_ref: verified ? sourceRef : null,
      observed_at: verified ? observedAt : null
    }];
  }));
}

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

function workflowTokenPermissions(workflowScope) {
  const block = workflowScope.match(/^permissions:\s*\n((?: {2}[^\n]+(?:\n|$))*)/m)?.[1] || '';
  const entries = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const parsed = [];
  for (const entry of entries) {
    const match = entry.match(/^([a-z-]+):\s*(read|write|none)$/);
    if (!match) return [];
    parsed.push(`${match[1]}:${match[2]}`);
  }
  return uniqueSorted(parsed);
}

function jobSteps(block) {
  const lines = block.split(/\r?\n/);
  const stepsIndex = lines.findIndex((line) => /^ {4}steps\s*:\s*$/.test(line));
  if (stepsIndex < 0) return { steps_index: -1, steps: [] };
  const headers = [];
  for (let index = stepsIndex + 1; index < lines.length; index += 1) {
    const match = lines[index].match(/^ {6}-\s+(name|uses)\s*:\s*(.*?)\s*$/);
    if (match) headers.push({ line: index, kind: match[1], value: scalarValue(match[2]) });
  }
  const steps = headers.map((header, position) => {
    const end = position + 1 < headers.length ? headers[position + 1].line : lines.length;
    const text = lines.slice(header.line, end).join('\n');
    const secrets = secretMetadata(text);
    return {
      index: position,
      kind: header.kind,
      name: header.kind === 'name' ? header.value : null,
      uses: header.kind === 'uses' ? header.value : null,
      text,
      secret_names: secrets.secret_names,
      secret_bearing: secrets.secret_bearing,
      github_token_context: /\$\{\{\s*github\.token\s*\}\}/.test(text)
    };
  });
  return { steps_index: stepsIndex, steps };
}

function liveMainGuardContract(step) {
  if (!step || step.name !== LIVE_MAIN_GUARD_STEP_NAME) return false;
  const required = [
    'GITHUB_TOKEN: ${{ github.token }}',
    'set -euo pipefail',
    'test "$GITHUB_REF" = "refs/heads/main"',
    'curl --fail-with-body --silent --show-error',
    '--connect-timeout 10',
    '--max-time 30',
    '--header "Authorization: Bearer $GITHUB_TOKEN"',
    '--header "Accept: application/vnd.github+json"',
    '--header "X-GitHub-Api-Version: 2022-11-28"',
    '"$GITHUB_API_URL/repos/$GITHUB_REPOSITORY/branches/main"',
    '.get("commit",{}).get("sha","")',
    're.fullmatch(r"[0-9a-f]{40}",sha)',
    'test "$LIVE_MAIN_SHA" = "$GITHUB_SHA"'
  ];
  return required.every((marker) => step.text.includes(marker))
    && (step.text.match(/\$\{\{\s*github\.token\s*\}\}/g) || []).length === 1
    && !secretMetadata(step.text).secret_bearing
    && !/continue-on-error\s*:\s*true/i.test(step.text)
    && !/\|\|\s*true|continue\s*$/m.test(step.text);
}

function activationReceiptContract(step, requiredVariable, triggerClasses) {
  if (!step || step.name !== ACTIVATION_RECEIPT_STEP_NAME || !requiredVariable) return false;
  const required = [
    `ACTIVATION_AUTHORIZED: \${{ vars.${requiredVariable} }}`,
    'set -euo pipefail',
    'test "$ACTIVATION_AUTHORIZED" = "true"',
    'test "$GITHUB_REF" = "refs/heads/main"'
  ];
  const eventPredicates = [...triggerClasses].sort().map(
    (trigger) => `"$GITHUB_EVENT_NAME" = "${trigger}"`
  );
  const eventContract = eventPredicates.length === 1
    ? step.text.includes(`test ${eventPredicates[0]}`)
    : step.text.includes(`test ${eventPredicates.join(' -o ')}`);
  return required.every((marker) => step.text.includes(marker))
    && eventContract
    && !secretMetadata(step.text).secret_bearing
    && !/continue-on-error\s*:\s*true/i.test(step.text)
    && !/\|\|\s*true|continue\s*$/m.test(step.text);
}

function oneShotAuthorizationContract(step) {
  if (!step || step.name !== ONE_SHOT_AUTHORIZATION_STEP_NAME) return false;
  const required = [
    'GITHUB_TOKEN: ${{ github.token }}',
    'AUTHORIZATION_NONCE: ${{ inputs.authorization_nonce }}',
    'AUTHORIZATION_EXPIRES_AT: ${{ inputs.authorization_expires_at }}',
    'EXACT_MAIN_SHA: ${{ inputs.exact_main_sha }}',
    'set -euo pipefail',
    'test "$GITHUB_REF" = "refs/heads/main"',
    'test "$GITHUB_EVENT_NAME" = "workflow_dispatch"',
    'test "$GITHUB_RUN_ATTEMPT" = "1"',
    'test "$EXACT_MAIN_SHA" = "$GITHUB_SHA"',
    '/actions/runs/$GITHUB_RUN_ID/approvals',
    'KPMO_PROGRAM_OWNER_APPROVED_STAGING_POSTGRES_ONE_SHOT:',
    "get('id')==297161720",
    "get('login')=='johnkim9524-collab'",
    "e.get('name')=='kidults-do-staging-ssh'",
    'assert len(matches)==1'
  ];
  return required.every((marker) => step.text.includes(marker))
    && !secretMetadata(step.text).secret_bearing
    && !/continue-on-error\s*:\s*true/i.test(step.text)
    && !/\|\|\s*true|continue\s*$/m.test(step.text);
}

export function workflowTriggerClasses(text) {
  const active = activeWorkflowText(text);
  const allowed = new Set(['push', 'pull_request', 'pull_request_target', 'workflow_dispatch', 'workflow_run', 'workflow_call', 'schedule', 'repository_dispatch']);
  const observed = new Set();
  const inlineList = active.match(/^on\s*:\s*\[([^\]]+)\]\s*$/m);
  if (inlineList) {
    for (const item of inlineList[1].split(',')) {
      const trigger = item.trim().replace(/^['"]|['"]$/g, '');
      if (allowed.has(trigger)) observed.add(trigger);
    }
  }
  const inlineScalar = active.match(/^on\s*:\s*([A-Za-z_][A-Za-z0-9_]*)\s*$/m);
  if (inlineScalar && allowed.has(inlineScalar[1])) observed.add(inlineScalar[1]);
  const lines = active.split(/\r?\n/);
  const onIndex = lines.findIndex((line) => /^on\s*:\s*$/.test(line));
  if (onIndex >= 0) {
    for (let index = onIndex + 1; index < lines.length; index += 1) {
      if (/^[^\s]/.test(lines[index])) break;
      const match = lines[index].match(/^ {2}([A-Za-z_][A-Za-z0-9_]*)\s*:/);
      if (match && allowed.has(match[1])) observed.add(match[1]);
    }
  }
  return [...observed].sort();
}

export function analyzeWorkflow(text, workflow = 'fixture.yml') {
  const active = activeWorkflowText(text);
  const triggerClasses = workflowTriggerClasses(active);
  const workflowDispatch = triggerClasses.includes('workflow_dispatch');
  const jobsStart = active.search(/^jobs\s*:\s*$/m);
  const workflowScope = jobsStart >= 0 ? active.slice(0, jobsStart) : active;
  const workflowSecrets = secretMetadata(workflowScope);
  const workflowTokenPermissionSet = workflowTokenPermissions(workflowScope);
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
    const parsedSteps = jobSteps(block);
    const jobPreamble = parsedSteps.steps_index >= 0
      ? block.split(/\r?\n/).slice(0, parsedSteps.steps_index).join('\n')
      : block;
    const jobScopeSecrets = secretMetadata(jobPreamble);
    const jobPermissionsOverride = /^ {4}permissions\s*:/m.test(jobPreamble);
    const providerSecretSteps = parsedSteps.steps.filter((step) => step.secret_bearing);
    const liveMainGuardSteps = parsedSteps.steps.filter((step) => step.name === LIVE_MAIN_GUARD_STEP_NAME);
    const liveMainGuard = liveMainGuardSteps.length === 1 ? liveMainGuardSteps[0] : null;
    const secretNames = uniqueSorted([...workflowSecrets.secret_names, ...jobSecrets.secret_names]);
    const dynamicSecretContext = workflowSecrets.dynamic_secret_context || jobSecrets.dynamic_secret_context;
    const inheritedReusableSecrets = workflowSecrets.inherited_reusable_secrets || jobSecrets.inherited_reusable_secrets;
    const secretBearing = workflowSecrets.secret_bearing || jobSecrets.secret_bearing;
    const environment = jobEnvironment(block);
    const explicitMainRefGuard = /github\.ref\s*==\s*['"]refs\/heads\/main['"]/.test(block)
      || /GITHUB_REF[^\n]*refs\/heads\/main/.test(block);
    const activationGuardVariables = uniqueSorted(
      [...block.matchAll(/vars\.([A-Z][A-Z0-9_]*)\s*==\s*['"]true['"]/g)].map((match) => match[1])
    );
    const standingDisabledVariables = uniqueSorted(
      [...block.matchAll(/vars\.([A-Z][A-Z0-9_]*)\s*==\s*['"]false['"]/g)].map((match) => match[1])
    );
    const activationReceiptSteps = parsedSteps.steps.filter((step) => step.name === ACTIVATION_RECEIPT_STEP_NAME);
    const activationReceipt = activationReceiptSteps.length === 1 ? activationReceiptSteps[0] : null;
    const oneShotAuthorizationSteps = parsedSteps.steps.filter((step) => step.name === ONE_SHOT_AUTHORIZATION_STEP_NAME);
    const oneShotAuthorization = oneShotAuthorizationSteps.length === 1 ? oneShotAuthorizationSteps[0] : null;
    return {
      job: header.id,
      secret_bearing: secretBearing,
      secret_names: secretNames,
      dynamic_secret_context: dynamicSecretContext,
      inherited_reusable_secrets: inheritedReusableSecrets,
      environment,
      explicit_main_ref_guard: explicitMainRefGuard,
      workflow_token_permissions: workflowTokenPermissionSet,
      job_permissions_override: jobPermissionsOverride,
      workflow_scope_secret_names: workflowSecrets.secret_names,
      job_scope_secret_names: jobScopeSecrets.secret_names,
      step_secret_bindings: providerSecretSteps.map((step) => ({
        step: step.name,
        index: step.index,
        secret_names: step.secret_names
      })),
      provider_secrets_step_scoped: workflowSecrets.secret_bearing === false
        && jobScopeSecrets.secret_bearing === false
        && providerSecretSteps.length > 0
        && JSON.stringify(uniqueSorted(providerSecretSteps.flatMap((step) => step.secret_names))) === JSON.stringify(secretNames),
      activation_guard_variables: activationGuardVariables,
      standing_disabled_variables: standingDisabledVariables,
      upstream_one_shot_authorized_guard: block.includes("needs.activation-readiness-receipt.outputs.authorized == 'true'"),
      step_names: parsedSteps.steps.map((step) => step.name).filter(Boolean),
      activation_receipt: {
        count: activationReceiptSteps.length,
        step_index: activationReceipt?.index ?? null,
        contract_valid: activationReceiptContract(
          activationReceipt,
          activationGuardVariables.length === 1 ? activationGuardVariables[0] : null,
          triggerClasses
        ),
        before_live_main_guard: Boolean(
          activationReceipt
          && liveMainGuard
          && activationReceipt.index < liveMainGuard.index
        ),
        before_all_provider_secret_steps: Boolean(
          activationReceipt
          && providerSecretSteps.length > 0
          && providerSecretSteps.every((step) => activationReceipt.index < step.index)
        )
      },
      one_shot_authorization: {
        count: oneShotAuthorizationSteps.length,
        step_index: oneShotAuthorization?.index ?? null,
        contract_valid: oneShotAuthorizationContract(oneShotAuthorization),
        before_live_main_guard: Boolean(oneShotAuthorization && liveMainGuard && oneShotAuthorization.index < liveMainGuard.index),
        before_all_provider_secret_steps: Boolean(
          oneShotAuthorization
          && providerSecretSteps.length > 0
          && providerSecretSteps.every((step) => oneShotAuthorization.index < step.index)
        )
      },
      live_main_guard: {
        count: liveMainGuardSteps.length,
        step_index: liveMainGuard?.index ?? null,
        contract_valid: liveMainGuardContract(liveMainGuard),
        github_token_step_count: parsedSteps.steps.filter((step) => step.github_token_context).length,
        github_token_step_names: parsedSteps.steps
          .filter((step) => step.github_token_context)
          .map((step) => step.name || step.uses)
          .filter(Boolean),
        before_all_provider_secret_steps: Boolean(
          liveMainGuard
          && providerSecretSteps.length > 0
          && providerSecretSteps.every((step) => liveMainGuard.index < step.index)
        )
      }
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
      explicit_main_ref_guard: false,
      workflow_token_permissions: workflowTokenPermissionSet,
      job_permissions_override: false,
      workflow_scope_secret_names: workflowSecrets.secret_names,
      job_scope_secret_names: [],
      step_secret_bindings: [],
      provider_secrets_step_scoped: false,
      activation_guard_variables: [],
      step_names: [],
      live_main_guard: {
        count: 0,
        step_index: null,
        contract_valid: false,
        github_token_step_count: 0,
        github_token_step_names: [],
        before_all_provider_secret_steps: false
      }
    });
  }

  const secretBearingJobs = jobs.filter((job) => job.secret_bearing);
  return {
    workflow,
    trigger_classes: triggerClasses,
    workflow_dispatch: workflowDispatch,
    secret_bearing_lane: secretBearingJobs.length > 0,
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
    if (!analysis.secret_bearing_lane) throw new Error(`REGISTERED_WORKFLOW_NOT_SECRET_BEARING_LANE:${workflow}`);
    lanes.push(analysis);
  }
  return {
    registry_id: currentRegistry.id,
    registered_lane_count: lanes.length,
    secret_bearing_job_count: lanes.reduce((sum, lane) => sum + lane.secret_bearing_jobs.length, 0),
    lanes
  };
}

const bindingKey = (workflow, job) => `${workflow}#${job}`;

export function validateRequiredEnvironmentBindings(inventory, registry) {
  const failures = [];
  const require = (condition, id) => { if (!condition) failures.push(id); };
  const bindings = Array.isArray(registry?.required_environment_bindings)
    ? registry.required_environment_bindings
    : [];
  const expectedByKey = new Map();
  const privilegedPolicy = registry?.repository_privileged_execution_policy || {};

  require(bindings.length === registry?.registered_count, 'REQUIRED_BINDING_COUNT');
  require(privilegedPolicy.required_live_main_guard_step_name === LIVE_MAIN_GUARD_STEP_NAME, 'LIVE_MAIN_GUARD_POLICY_NAME');
  require(privilegedPolicy.required_branch_endpoint === '$GITHUB_API_URL/repos/$GITHUB_REPOSITORY/branches/main', 'LIVE_MAIN_BRANCH_ENDPOINT_POLICY');
  require(privilegedPolicy.guard_token_context === '${{ github.token }}', 'LIVE_MAIN_GUARD_TOKEN_CONTEXT_POLICY');
  require(privilegedPolicy.guard_token_permission === 'contents:read', 'LIVE_MAIN_GUARD_TOKEN_PERMISSION_POLICY');
  require(privilegedPolicy.workflow_token_permissions_are_exact_per_binding === true, 'WORKFLOW_TOKEN_PERMISSION_BINDING_POLICY');
  require(privilegedPolicy.actions_read_is_allowed_only_for_registered_production_artifact_or_exact_run_environment_review_readback === true, 'ACTIONS_READ_EXCEPTION_POLICY');
  require(privilegedPolicy.provider_secret_scope === 'STEP_ONLY_AFTER_LIVE_MAIN_GUARD', 'PROVIDER_SECRET_SCOPE_POLICY');
  require(privilegedPolicy.api_unreadable === 'FAIL_CLOSED', 'LIVE_MAIN_API_UNREADABLE_POLICY');
  require(privilegedPolicy.stale_main_sha === 'FAIL_CLOSED', 'STALE_MAIN_SHA_POLICY');
  require(privilegedPolicy.non_main_ref === 'FAIL_CLOSED', 'NON_MAIN_REF_POLICY');
  for (const binding of bindings) {
    const key = bindingKey(binding?.workflow, binding?.job);
    require(!expectedByKey.has(key), `DUPLICATE_REQUIRED_BINDING:${key}`);
    expectedByKey.set(key, binding);
    require((registry?.registered_workflows || []).includes(binding?.workflow), `UNREGISTERED_BINDING_WORKFLOW:${key}`);
    require(
      Array.isArray(binding?.allowed_trigger_classes)
      && binding.allowed_trigger_classes.length > 0
      && binding.allowed_trigger_classes.every((trigger) => ['push','pull_request','pull_request_target','workflow_dispatch','workflow_run','workflow_call','schedule','repository_dispatch'].includes(trigger))
      && new Set(binding.allowed_trigger_classes).size === binding.allowed_trigger_classes.length,
      `INVALID_ALLOWED_TRIGGER_CLASSES:${key}`
    );
    require(
      ['READ_ONLY_CONTROL_PLANE','PROVIDER_BOUNDED_READ','REMOTE_STAGING_MUTATION','PRODUCTION_MUTATION'].includes(binding?.remote_mutation_class),
      `INVALID_REMOTE_MUTATION_CLASS:${key}`
    );
    const requiredTokenPermissions = binding?.required_github_token_permissions || ['contents:read'];
    require(
      Array.isArray(requiredTokenPermissions)
      && requiredTokenPermissions.length > 0
      && new Set(requiredTokenPermissions).size === requiredTokenPermissions.length
      && requiredTokenPermissions.every((permission) => /^(actions|contents):read$/.test(permission)),
      `INVALID_GITHUB_TOKEN_PERMISSION_SET:${key}`
    );
    require(
      !requiredTokenPermissions.includes('actions:read') || (
        (binding?.workflow === '.github/workflows/production-release.yml'
          && binding?.job === 'certify'
          && binding?.remote_mutation_class === 'PRODUCTION_MUTATION')
        || (binding?.workflow === '.github/workflows/p0-remote-postgres-persistence-pitr.yml'
          && binding?.job === 'remote-persistence-pitr-fixture'
          && binding?.remote_mutation_class === 'REMOTE_STAGING_MUTATION'
          && Boolean(binding?.required_one_shot_authorization))
      ),
      `ACTIONS_READ_OUTSIDE_REGISTERED_EXACT_RUN_REVIEW:${key}`
    );
    const requiredTokenStepNames = binding?.required_github_token_step_names || [LIVE_MAIN_GUARD_STEP_NAME];
    require(
      Array.isArray(requiredTokenStepNames)
      && requiredTokenStepNames.length > 0
      && new Set(requiredTokenStepNames).size === requiredTokenStepNames.length
      && requiredTokenStepNames.every((name) => typeof name === 'string' && name.length > 0),
      `INVALID_GITHUB_TOKEN_STEP_SET:${key}`
    );
    require(/^[a-z0-9][a-z0-9-]{2,62}$/.test(String(binding?.environment || '')), `INVALID_REQUIRED_ENVIRONMENT:${key}`);
    require(/^sha256:[0-9a-f]{64}$/.test(String(binding?.required_secret_name_digest || '')), `INVALID_REQUIRED_SECRET_DIGEST:${key}`);
    require(
      Array.isArray(binding?.required_secret_step_names)
      && binding.required_secret_step_names.length > 0
      && binding.required_secret_step_names.every((name) => typeof name === 'string' && name.length > 0)
      && new Set(binding.required_secret_step_names).size === binding.required_secret_step_names.length,
      `INVALID_REQUIRED_SECRET_STEP_NAMES:${key}`
    );
  }

  const observedKeys = [];
  const observedEnvironments = new Set();
  for (const lane of inventory?.lanes || []) {
    for (const job of lane.secret_bearing_jobs || []) {
      const key = bindingKey(lane.workflow, job.job);
      const expected = expectedByKey.get(key);
      observedKeys.push(key);
      require(Boolean(expected), `MISSING_REQUIRED_BINDING:${key}`);
      if (!expected) continue;
      require(job.environment.declared, `ENVIRONMENT_NOT_DECLARED:${key}`);
      require(job.environment.static, `ENVIRONMENT_NOT_STATIC:${key}`);
      require(job.environment.name === expected.environment, `ENVIRONMENT_NAME_MISMATCH:${key}`);
      require(
        JSON.stringify([...(lane.trigger_classes || [])].sort()) === JSON.stringify([...(expected.allowed_trigger_classes || [])].sort()),
        `TRIGGER_CLASS_MISMATCH:${key}`
      );
      if (expected.required_activation_guard) {
        require(
          job.activation_guard_variables.includes(expected.required_activation_guard),
          `ACTIVATION_GUARD_MISSING:${key}`
        );
        require(job.activation_receipt?.count === 1, `ACTIVATION_RECEIPT_STEP_MISSING:${key}`);
        require(job.activation_receipt?.step_index === 0, `ACTIVATION_RECEIPT_STEP_ORDER:${key}`);
        require(job.activation_receipt?.contract_valid === true, `ACTIVATION_RECEIPT_STEP_CONTRACT:${key}`);
        require(job.activation_receipt?.before_live_main_guard === true, `ACTIVATION_RECEIPT_BEFORE_LIVE_MAIN:${key}`);
        require(job.activation_receipt?.before_all_provider_secret_steps === true, `ACTIVATION_RECEIPT_BEFORE_PROVIDER_SECRET:${key}`);
      }
      if (expected.required_one_shot_authorization) {
        const oneShot = expected.required_one_shot_authorization;
        require(
          job.standing_disabled_variables.includes(oneShot.standing_guard_variable),
          `ONE_SHOT_STANDING_GUARD_MISSING:${key}`
        );
        require(job.upstream_one_shot_authorized_guard === true, `ONE_SHOT_UPSTREAM_GUARD_MISSING:${key}`);
        require(job.one_shot_authorization?.count === 1, `ONE_SHOT_AUTHORIZATION_STEP_MISSING:${key}`);
        require(job.one_shot_authorization?.contract_valid === true, `ONE_SHOT_AUTHORIZATION_STEP_CONTRACT:${key}`);
        require(job.one_shot_authorization?.before_live_main_guard === true, `ONE_SHOT_AUTHORIZATION_BEFORE_LIVE_MAIN:${key}`);
        require(job.one_shot_authorization?.before_all_provider_secret_steps === true, `ONE_SHOT_AUTHORIZATION_BEFORE_PROVIDER_SECRET:${key}`);
      }
      require(job.explicit_main_ref_guard, `EXACT_MAIN_GUARD_MISSING:${key}`);
      const requiredTokenPermissions = uniqueSorted(
        expected.required_github_token_permissions || ['contents:read']
      );
      const requiredTokenStepNames = uniqueSorted(
        expected.required_github_token_step_names || [LIVE_MAIN_GUARD_STEP_NAME]
      );
      require(
        JSON.stringify(job.workflow_token_permissions || []) === JSON.stringify(requiredTokenPermissions),
        `GITHUB_TOKEN_PERMISSION_SET_MISMATCH:${key}`
      );
      require(job.job_permissions_override === false, `GITHUB_TOKEN_JOB_PERMISSION_OVERRIDE:${key}`);
      require(job.live_main_guard?.count === 1, `LIVE_MAIN_GUARD_COUNT:${key}`);
      require(job.live_main_guard?.contract_valid === true, `LIVE_MAIN_GUARD_CONTRACT:${key}`);
      require(
        JSON.stringify(uniqueSorted(job.live_main_guard?.github_token_step_names || []))
          === JSON.stringify(requiredTokenStepNames),
        `GITHUB_TOKEN_STEP_SET_MISMATCH:${key}`
      );
      require(job.live_main_guard?.before_all_provider_secret_steps === true, `LIVE_MAIN_GUARD_ORDER:${key}`);
      require(job.workflow_scope_secret_names.length === 0, `WORKFLOW_SCOPE_PROVIDER_SECRET:${key}`);
      require(job.job_scope_secret_names.length === 0, `JOB_SCOPE_PROVIDER_SECRET:${key}`);
      require(job.provider_secrets_step_scoped === true, `PROVIDER_SECRET_NOT_STEP_SCOPED:${key}`);
      require(
        JSON.stringify(job.step_secret_bindings.map((item) => item.step).sort())
          === JSON.stringify([...expected.required_secret_step_names].sort()),
        `REQUIRED_SECRET_STEP_MISMATCH:${key}`
      );
      require(!job.dynamic_secret_context, `DYNAMIC_SECRET_CONTEXT:${key}`);
      require(!job.inherited_reusable_secrets, `INHERITED_SECRET_CONTEXT:${key}`);
      require(digest(uniqueSorted(job.secret_names).join('\n')) === expected.required_secret_name_digest, `REQUIRED_SECRET_DIGEST_MISMATCH:${key}`);
      observedEnvironments.add(job.environment.name);
    }
  }

  const actualKeys = [...new Set(observedKeys)].sort();
  const requiredKeys = [...expectedByKey.keys()].sort();
  require(JSON.stringify(actualKeys) === JSON.stringify(requiredKeys), 'REQUIRED_BINDING_PARTITION');
  require(observedEnvironments.size === registry?.required_environment_count, 'REQUIRED_ENVIRONMENT_COUNT');
  require(registry?.repository_binding_state?.environment_bound_secret_bearing_jobs === actualKeys.length, 'REGISTRY_ENVIRONMENT_BOUND_COUNT');
  require(registry?.repository_binding_state?.exact_main_guarded_secret_bearing_jobs === actualKeys.length, 'REGISTRY_EXACT_MAIN_GUARD_COUNT');
  require(registry?.repository_binding_state?.live_main_sha_guarded_secret_bearing_jobs === actualKeys.length, 'REGISTRY_LIVE_MAIN_SHA_GUARD_COUNT');
  require(registry?.repository_binding_state?.step_scoped_secret_bearing_jobs === actualKeys.length, 'REGISTRY_STEP_SCOPED_SECRET_JOB_COUNT');
  require(
    registry?.repository_binding_state?.privileged_secret_steps
      === (inventory?.lanes || []).reduce(
        (count, lane) => count + lane.secret_bearing_jobs.reduce(
          (jobCount, job) => jobCount + job.step_secret_bindings.length,
          0
        ),
        0
      ),
    'REGISTRY_PRIVILEGED_SECRET_STEP_COUNT'
  );
  require(registry?.repository_binding_state?.external_environment_policy_verified === false, 'EXTERNAL_ENVIRONMENT_POLICY_TRUTH');
  require(registry?.repository_binding_state?.environment_secret_scope_verified === false, 'ENVIRONMENT_SECRET_SCOPE_TRUTH');
  require(registry?.repository_binding_state?.trusted_execution_attestation_verified === false, 'TRUSTED_EXECUTION_ATTESTATION_TRUTH');
  return uniqueSorted(failures);
}

function endpoint(status, ok, complete = null) {
  return {
    http_status: Number(status || 0),
    readable: Boolean(ok),
    ...(complete === null ? {} : { complete: Boolean(complete) })
  };
}

function completeListReadback(result, listKey) {
  if (!result?.ok || result?.complete !== true || !Array.isArray(result.body?.[listKey])) return false;
  const totalCount = Number(result.body?.total_count);
  return Number.isSafeInteger(totalCount)
    && totalCount >= 0
    && totalCount === result.body[listKey].length;
}

function exactMainPolicy(environment, policyReadback) {
  const branchPolicyRule = (environment.protection_rules || []).some((rule) => rule?.type === 'branch_policy');
  const deployment = environment.deployment_branch_policy;
  const policies = policyReadback?.body?.branch_policies || [];
  const exactMainOnly = policies.length === 1 && policies[0]?.type === 'branch' && policies[0]?.name === DEFAULT_BRANCH;
  return Boolean(
    environment.can_admins_bypass === false
      && branchPolicyRule
      && deployment?.protected_branches === false
      && deployment?.custom_branch_policies === true
      && policyReadback?.ok
      && policyReadback?.complete === true
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
  const environmentsComplete = completeListReadback(snapshot.environments, 'environments');
  const repositorySecretsComplete = completeListReadback(snapshot.repositorySecrets, 'secrets');
  const organizationSecretsComplete = completeListReadback(snapshot.organizationSecrets, 'secrets');
  const environmentItems = environmentsComplete
    ? snapshot.environments.body.environments
    : [];
  const environmentsByName = new Map(environmentItems.map((environment) => [environment.name, environment]));
  const repositorySecretNames = repositorySecretsComplete
    ? uniqueSorted(snapshot.repositorySecrets.body.secrets.map((item) => item?.name).filter(Boolean))
    : [];
  const organizationSecretNames = organizationSecretsComplete
    ? uniqueSorted(snapshot.organizationSecrets.body.secrets.map((item) => item?.name).filter(Boolean))
    : [];
  const bindingResults = [];
  const requiredBindings = new Map((registry.required_environment_bindings || []).map((binding) => [
    bindingKey(binding.workflow, binding.job),
    binding
  ]));

  for (const lane of inventory.lanes) {
    for (const job of lane.secret_bearing_jobs) {
      const requiredBinding = requiredBindings.get(bindingKey(lane.workflow, job.job));
      const environmentName = job.environment.name;
      const environment = environmentName ? environmentsByName.get(environmentName) : null;
      const policyReadback = environmentName ? snapshot.environmentPolicies?.[environmentName] : null;
      const secretReadback = environmentName ? snapshot.environmentSecrets?.[environmentName] : null;
      const policyReadbackComplete = completeListReadback(policyReadback, 'branch_policies');
      const secretReadbackComplete = completeListReadback(secretReadback, 'secrets');
      const observedSecretNames = secretReadbackComplete
        ? uniqueSorted(secretReadback.body.secrets.map((item) => item?.name).filter(Boolean))
        : [];
      const requiredNames = uniqueSorted(job.secret_names);
      const matchedSecretCount = requiredNames.filter((name) => observedSecretNames.includes(name)).length;
      const repositoryScopedMatchCount = requiredNames.filter((name) => repositorySecretNames.includes(name)).length;
      const organizationScopedMatchCount = requiredNames.filter((name) => organizationSecretNames.includes(name)).length;
      const blockers = [];
      if (!requiredBinding) blockers.push('REGISTRY_ENVIRONMENT_BINDING_NOT_DECLARED');
      if (requiredBinding && environmentName !== requiredBinding.environment) blockers.push('REGISTRY_ENVIRONMENT_NAME_MISMATCH');
      if (requiredBinding && digest(requiredNames.join('\n')) !== requiredBinding.required_secret_name_digest) blockers.push('REGISTRY_REQUIRED_SECRET_DIGEST_MISMATCH');
      if (!job.explicit_main_ref_guard) blockers.push('REPOSITORY_EXACT_MAIN_GUARD_NOT_PRESENT');
      if (!job.environment.declared) blockers.push('JOB_ENVIRONMENT_NOT_DECLARED');
      else if (!job.environment.static) blockers.push('JOB_ENVIRONMENT_NAME_NOT_STATIC');
      if (job.dynamic_secret_context) blockers.push('DYNAMIC_OR_WHOLE_SECRET_CONTEXT_NOT_PROVABLE');
      if (job.inherited_reusable_secrets) blockers.push('INHERITED_SECRET_SET_NOT_PROVABLE');
      if (!environment) blockers.push('DECLARED_ENVIRONMENT_NOT_OBSERVED');
      if (environment && !exactMainPolicy(environment, policyReadback)) blockers.push('EXACT_MAIN_DEPLOYMENT_POLICY_NOT_PROVEN');
      if (environment && !policyReadbackComplete) blockers.push('DEPLOYMENT_BRANCH_POLICY_READBACK_INCOMPLETE');
      if (environment && !secretReadbackComplete) blockers.push('ENVIRONMENT_SECRET_METADATA_INCOMPLETE');
      if (environment && secretReadbackComplete && matchedSecretCount !== requiredNames.length) blockers.push('ENVIRONMENT_SECRET_NAME_COVERAGE_INCOMPLETE');
      if (!repositorySecretsComplete) blockers.push('REPOSITORY_SECRET_METADATA_INCOMPLETE');
      if (!organizationSecretsComplete) blockers.push('ORGANIZATION_SECRET_METADATA_INCOMPLETE');
      if (repositoryScopedMatchCount > 0) blockers.push('REQUIRED_SECRET_STILL_REPOSITORY_SCOPED');
      if (organizationScopedMatchCount > 0) blockers.push('REQUIRED_SECRET_STILL_ORGANIZATION_SCOPED');
      if (requiredNames.length === 0) blockers.push('STATIC_SECRET_NAME_SET_EMPTY_OR_DYNAMIC');

      bindingResults.push({
        workflow: lane.workflow,
        job: job.job,
        required_secret_count: requiredNames.length,
        required_secret_name_digest: digest(requiredNames.join('\n')),
        dynamic_secret_context: job.dynamic_secret_context,
        inherited_reusable_secrets: job.inherited_reusable_secrets,
        repository_main_guard_present: job.explicit_main_ref_guard,
        registry_environment_binding_declared: Boolean(requiredBinding),
        registry_environment_name: requiredBinding?.environment || null,
        registry_required_secret_name_digest: requiredBinding?.required_secret_name_digest || null,
        environment_declared: job.environment.declared,
        environment_binding_static: job.environment.static,
        environment_name: environmentName,
        environment_observed: Boolean(environment),
        exact_main_deployment_policy_verified: Boolean(environment && exactMainPolicy(environment, policyReadback)),
        environment_secret_metadata_readable: Boolean(secretReadback?.ok),
        environment_secret_metadata_complete: secretReadbackComplete,
        observed_environment_secret_count: observedSecretNames.length,
        observed_environment_secret_name_digest: secretReadbackComplete ? digest(observedSecretNames.join('\n')) : null,
        matched_required_secret_count: matchedSecretCount,
        environment_secret_name_coverage_complete: Boolean(secretReadbackComplete && requiredNames.length > 0 && matchedSecretCount === requiredNames.length),
        repository_secret_metadata_readable: Boolean(snapshot.repositorySecrets?.ok),
        repository_secret_metadata_complete: repositorySecretsComplete,
        organization_secret_metadata_readable: Boolean(snapshot.organizationSecrets?.ok),
        organization_secret_metadata_complete: organizationSecretsComplete,
        repository_scoped_required_secret_count: repositoryScopedMatchCount,
        organization_scoped_required_secret_count: organizationScopedMatchCount,
        credential_environment_exclusive: Boolean(
          repositorySecretsComplete
          && organizationSecretsComplete
          && repositoryScopedMatchCount === 0
          && organizationScopedMatchCount === 0
        ),
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
  if (!environmentsComplete) globalBlockers.push('ENVIRONMENT_LIST_INCOMPLETE');
  if (!snapshot.rulesets?.ok || snapshot.rulesets?.complete !== true) globalBlockers.push('RULESET_METADATA_INCOMPLETE');
  if (!repositorySecretsComplete) globalBlockers.push('REPOSITORY_SECRET_METADATA_INCOMPLETE');
  if (!organizationSecretsComplete) globalBlockers.push('ORGANIZATION_SECRET_METADATA_INCOMPLETE');
  if (sourceContext.ref !== `refs/heads/${contract.scope.default_branch}`) globalBlockers.push('READBACK_SOURCE_REF_NOT_DEFAULT_BRANCH');
  if (!/^[0-9a-f]{40}$/.test(String(sourceContext.sha || ''))) globalBlockers.push('EXACT_SOURCE_SHA_MISSING_OR_INVALID');
  if (sourceContext.ref === `refs/heads/${contract.scope.default_branch}` && sourceContext.sha !== observedBranchSha) {
    globalBlockers.push('EXACT_SOURCE_SHA_NOT_OBSERVED_DEFAULT_BRANCH_HEAD');
  }
  if (bindingResults.length === 0) globalBlockers.push('NO_SECRET_BEARING_JOB_BINDINGS_FOUND');
  if (bindingResults.some((result) => result.state !== 'VERIFIED_PASS')) globalBlockers.push('ONE_OR_MORE_PRIVILEGED_JOBS_UNVERIFIED');
  const negativeExecutionProof = sanitizeNegativeExecutionProof(snapshot);
  if (negativeExecutionProof.selected_non_main_ref.state !== 'VERIFIED_REJECTED') {
    globalBlockers.push('SELECTED_NON_MAIN_REF_NEGATIVE_EXECUTION_NOT_PROVEN');
  }
  if (negativeExecutionProof.branch_controlled_workflow_replacement.state !== 'VERIFIED_REJECTED') {
    globalBlockers.push('BRANCH_CONTROLLED_WORKFLOW_REPLACEMENT_NEGATIVE_EXECUTION_NOT_PROVEN');
  }

  const environmentSummary = environmentItems.map((environment) => {
    const policyReadback = snapshot.environmentPolicies?.[environment.name];
    const secretReadback = snapshot.environmentSecrets?.[environment.name];
    const policyReadbackComplete = completeListReadback(policyReadback, 'branch_policies');
    const secretReadbackComplete = completeListReadback(secretReadback, 'secrets');
    const secretNames = secretReadbackComplete
      ? uniqueSorted(secretReadback.body.secrets.map((item) => item?.name).filter(Boolean))
      : [];
    return {
      name: environment.name,
      can_admins_bypass: environment.can_admins_bypass,
      protection_rule_types: uniqueSorted((environment.protection_rules || []).map((rule) => rule?.type).filter(Boolean)),
      deployment_branch_policy: environment.deployment_branch_policy || null,
      deployment_branch_policy_readback: endpoint(policyReadback?.status, policyReadback?.ok, policyReadbackComplete),
      exact_main_only: exactMainPolicy(environment, policyReadback),
      environment_secret_metadata_readback: endpoint(secretReadback?.status, secretReadback?.ok, secretReadbackComplete),
      environment_secret_count: secretNames.length,
      environment_secret_name_digest: secretReadbackComplete ? digest(secretNames.join('\n')) : null
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const endpointStatuses = {
    repository: endpoint(snapshot.repository?.status, snapshot.repository?.ok),
    default_branch: endpoint(snapshot.branch?.status, snapshot.branch?.ok),
    environments: endpoint(snapshot.environments?.status, snapshot.environments?.ok, environmentsComplete),
    rulesets: endpoint(snapshot.rulesets?.status, snapshot.rulesets?.ok, snapshot.rulesets?.complete === true),
    repository_secrets: endpoint(snapshot.repositorySecrets?.status, snapshot.repositorySecrets?.ok, repositorySecretsComplete),
    organization_secrets: endpoint(snapshot.organizationSecrets?.status, snapshot.organizationSecrets?.ok, organizationSecretsComplete)
  };
  const uniqueGlobalBlockers = uniqueSorted(globalBlockers);
  const proofComplete = uniqueGlobalBlockers.length === 0
    && bindingResults.every((result) => result.state === 'VERIFIED_PASS');

  const credentialActivation = authorizationMode === 'GITHUB_APP_ENVIRONMENTS_AND_SECRETS_READ'
    ? 'EPHEMERAL_GITHUB_APP_INSTALLATION_TOKEN_ENVIRONMENTS_AND_SECRETS_READ'
    : (authorizationMode === 'GITHUB_TOKEN_METADATA_READ' ? 'EPHEMERAL_GITHUB_TOKEN_METADATA_READ' : 'NONE');
  const proofScope = authorizationMode === 'GITHUB_APP_ENVIRONMENTS_AND_SECRETS_READ'
    ? 'AUTHORIZED_ENVIRONMENT_AND_SECRET_SCOPE_METADATA_READBACK'
    : (authorizationMode === 'GITHUB_TOKEN_METADATA_READ'
        ? 'LIMITED_GITHUB_TOKEN_METADATA_READBACK'
        : (authorizationMode === 'TEST_FIXTURE' ? 'SYNTHETIC_TEST_CONTROL' : 'PUBLIC_METADATA_OBSERVATION'));
  const externalClosureEligible = false;

  const receipt = {
    id: 'kidults-github-trusted-ref-environment-readback-receipt-v1',
    version: '1.4.0',
    issue: 974,
    parent_gate_issue: 881,
    observed_at: observedAt,
    state: proofComplete ? 'VERIFIED_PASS' : 'BLOCKED',
    control_truth: proofComplete
      ? (authorizationMode === 'TEST_FIXTURE'
          ? 'SYNTHETIC_POSITIVE_CONTROL_ONLY_NOT_EXTERNAL_PROOF'
          : 'CONTROL_PLANE_READBACK_COMPLETE_EXTERNAL_TRUSTED_EXECUTION_NOT_PROVEN')
      : 'EXTERNAL_CONTROL_PLANE_PROOF_INCOMPLETE',
    repository: contract.scope.repository,
    authorization_mode: authorizationMode,
    proof_scope: proofScope,
    source_ref: sourceContext.ref,
    exact_source_sha: sourceContext.sha,
    observed_default_branch: repositoryBody.default_branch || null,
    observed_default_branch_sha: observedBranchSha,
    observed_default_branch_protected: branchBody.protected === true,
    endpoint_http_statuses: endpointStatuses,
    credential_scope_summary: {
      repository_secret_metadata_readback: endpoint(snapshot.repositorySecrets?.status, snapshot.repositorySecrets?.ok, repositorySecretsComplete),
      organization_secret_metadata_readback: endpoint(snapshot.organizationSecrets?.status, snapshot.organizationSecrets?.ok, organizationSecretsComplete),
      repository_secret_count: repositorySecretNames.length,
      repository_secret_name_digest: repositorySecretsComplete ? digest(repositorySecretNames.join('\n')) : null,
      organization_secret_count: organizationSecretNames.length,
      organization_secret_name_digest: organizationSecretsComplete ? digest(organizationSecretNames.join('\n')) : null,
      secret_names_emitted: false
    },
    registered_secret_bearing_lanes: inventory.registered_lane_count,
    registered_privileged_manual_lanes: inventory.registered_lane_count,
    secret_bearing_jobs: inventory.secret_bearing_job_count,
    verified_secret_bearing_jobs: bindingResults.filter((result) => result.state === 'VERIFIED_PASS').length,
    binding_results: bindingResults,
    environment_summary: environmentSummary,
    ruleset_context: sanitizedRulesets(snapshot),
    negative_execution_proof: negativeExecutionProof,
    trusted_execution_attestation: {
      state: 'NOT_IMPLEMENTED',
      provenance_type: 'NONE',
      subject_digest: null,
      workflow_run_id: null,
      verified_by: null
    },
    external_proof_state: 'BLOCKED',
    external_proof_blockers: [
      'TRUSTED_POST_RUN_ATTESTOR_NOT_IMPLEMENTED',
      'CRYPTOGRAPHIC_ARTIFACT_PROVENANCE_NOT_VERIFIED'
    ],
    ruleset_context_only: true,
    effective_ruleset_readback_issue_936_closed: false,
    issue_974_closure_eligible: externalClosureEligible,
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
  receipt.readback_digest = computeReadbackDigest(receipt);
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

export async function githubGetCompleteList(repository, suffix, token, {
  listKey = null,
  arrayBody = false,
  identityFields = []
} = {}) {
  const pageSize = 100;
  const maxPages = 100;
  const items = [];
  let totalCount = null;
  let lastStatus = 0;

  for (let page = 1; page <= maxPages; page += 1) {
    const separator = suffix.includes('?') ? '&' : '?';
    const result = await githubGet(repository, `${suffix}${separator}per_page=${pageSize}&page=${page}`, token);
    lastStatus = result.status;
    if (!result.ok) return { ...result, complete: false };

    const pageItems = arrayBody ? result.body : result.body?.[listKey];
    if (!Array.isArray(pageItems)) {
      return { ok: false, status: result.status, body: null, complete: false };
    }
    items.push(...pageItems);

    if (!arrayBody) {
      const reportedTotal = Number(result.body?.total_count);
      if (!Number.isSafeInteger(reportedTotal) || reportedTotal < 0) {
        return { ok: false, status: result.status, body: null, complete: false };
      }
      if (totalCount === null) totalCount = reportedTotal;
      if (totalCount !== reportedTotal) {
        return { ok: false, status: result.status, body: null, complete: false };
      }
    }

    if (pageItems.length < pageSize) {
      const identities = identityFields.length > 0
        ? items.map((item) => identityFields.map((field) => String(item?.[field] ?? '')).join('\u0000'))
        : [];
      const identitiesCompleteAndUnique = identityFields.length === 0 || (
        items.every((item) => identityFields.every((field) => String(item?.[field] ?? '').length > 0))
        && new Set(identities).size === identities.length
      );
      const complete = (arrayBody || items.length === totalCount) && identitiesCompleteAndUnique;
      return {
        ok: complete,
        status: result.status,
        complete,
        body: arrayBody ? items : { total_count: totalCount, [listKey]: items }
      };
    }
  }

  return { ok: false, status: lastStatus, body: null, complete: false };
}

export async function collectLiveSnapshot(repository, token = '') {
  const [repositoryResult, branchResult, environmentsResult, rulesetsResult, repositorySecretsResult, organizationSecretsResult] = await Promise.all([
    githubGet(repository, '', token),
    githubGet(repository, `/branches/${DEFAULT_BRANCH}`, token),
    githubGetCompleteList(repository, '/environments', token, { listKey: 'environments', identityFields: ['name'] }),
    githubGetCompleteList(repository, '/rulesets', token, { arrayBody: true, identityFields: ['id'] }),
    githubGetCompleteList(repository, '/actions/secrets', token, { listKey: 'secrets', identityFields: ['name'] }),
    githubGetCompleteList(repository, '/actions/organization-secrets', token, { listKey: 'secrets', identityFields: ['name'] })
  ]);

  const environments = environmentsResult.ok && Array.isArray(environmentsResult.body?.environments)
    ? environmentsResult.body.environments
    : [];
  const environmentPolicies = {};
  const environmentSecrets = {};
  await Promise.all(environments.map(async (environment) => {
    const encoded = encodeURIComponent(environment.name);
    const [policy, secrets] = await Promise.all([
      githubGetCompleteList(repository, `/environments/${encoded}/deployment-branch-policies`, token, { listKey: 'branch_policies', identityFields: ['type', 'name'] }),
      githubGetCompleteList(repository, `/environments/${encoded}/secrets`, token, { listKey: 'secrets', identityFields: ['name'] })
    ]);
    environmentPolicies[environment.name] = policy;
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
    repositorySecrets: repositorySecretsResult,
    organizationSecrets: organizationSecretsResult,
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
