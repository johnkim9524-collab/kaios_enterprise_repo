#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {
  isAtomicLandingNativeStatusReady,
  LANDING_READINESS_CONTEXT,
} from './lib/atomic-landing-lifecycle-authority-v1.mjs';

const DEFAULT_MAX_ATTEMPTS = 60;
const DEFAULT_DELAY_MS = 3000;
const VALIDATOR = 'scripts/kidults/kpmo/validate-pr-lifecycle-integrity-v1.mjs';
const POLICY = 'coordination/kidults/kpmo/scope-aware-required-status-policy-v1.json';
const SCOPE_AWARE_CONTEXT = 'KIDULTS Scope-Aware Authoritative Status V1';
const DRAFT_DEVELOPMENT_CONTEXT = 'KIDULTS Draft Development Validation V1';
const DRAFT_DEVELOPMENT_DESCRIPTION = '3 exact-head contexts verified; Draft non-promotable';
const DRAFT_LANDING_PENDING_DESCRIPTION = 'Draft development validated; landing remains non-promotable';
const GITHUB_ACTIONS_AVATAR = /^https:\/\/avatars\.githubusercontent\.com\/in\/15368(?:\?|$)/;

const assert = (condition, code) => {
  if (!condition) throw new Error(code);
};
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const boundedInteger = (value, fallback, minimum, maximum, code) => {
  const parsed = value == null || value === '' ? fallback : Number(value);
  assert(Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum, code);
  return parsed;
};

export function nativeReadinessContexts(policy, {draft = false} = {}) {
  const contexts = Array.from(new Set(policy?.native_readiness_status_contexts || policy?.native_required_status_contexts || []));
  if (draft && contexts.includes(SCOPE_AWARE_CONTEXT)) {
    if (typeof policy?.draft_development_status_context !== 'string' || !policy.draft_development_status_context) {
      throw new Error('LIFECYCLE_CONVERGENCE_DRAFT_CONTEXT_MISSING');
    }
    return contexts.map(context => context === SCOPE_AWARE_CONTEXT ? policy.draft_development_status_context : context);
  }
  return contexts;
}

export function nativeGovernanceConverged(statuses, requiredContexts, minimumStatusTime = null, {draft = false} = {}) {
  if (!Array.isArray(statuses) || !Array.isArray(requiredContexts) || !requiredContexts.length) {
    return false;
  }
  return requiredContexts.every(context => {
    const matches = statuses.filter(status => status?.context === context);
    if (!matches.length) return false;
    let status = matches[0];
    if (matches.length > 1) {
      const ordered = matches.map(candidate => ({
        candidate,
        time: Date.parse(String(candidate?.updated_at || candidate?.created_at || '')),
        id: Number(candidate?.id),
      }));
      if (ordered.some(item => !Number.isFinite(item.time) || !Number.isSafeInteger(item.id))) return false;
      ordered.sort((left, right) => left.time - right.time || left.id - right.id);
      status = ordered[ordered.length - 1].candidate;
    }
    const githubActionsIdentity = status.creator?.login === 'github-actions[bot]'
      || /^https:\/\/avatars\.githubusercontent\.com\/in\/15368(?:\?|$)/.test(String(status.avatar_url || ''));
    if (minimumStatusTime != null) {
      const statusTime = Date.parse(String(status.updated_at || status.created_at || ''));
      const exactDraftLandingPending = draft
        && context === LANDING_READINESS_CONTEXT
        && status.state === 'pending'
        && status.description === DRAFT_LANDING_PENDING_DESCRIPTION
        && githubActionsIdentity;
      if (!Number.isFinite(statusTime) || statusTime < minimumStatusTime
        || (context === LANDING_READINESS_CONTEXT && statusTime === minimumStatusTime
          && !exactDraftLandingPending)) return false;
    }
    const normalReadyControl = context === 'KIDULTS Governed Landing Authorization V1'
      && status.state === 'pending'
      && status.description === 'Ready lifecycle verified; operation-specific landing authority required'
      && githubActionsIdentity;
    const nonGovernedProtectedMainControl = context === 'KIDULTS Governed Landing Authorization V1'
      && status.state === 'success'
      && status.description === 'Ready lifecycle verified; non-governed scope uses protected-main status path'
      && githubActionsIdentity;
    const draftDevelopmentControl = draft
      && context === DRAFT_DEVELOPMENT_CONTEXT
      && status.state === 'success'
      && status.description === DRAFT_DEVELOPMENT_DESCRIPTION
      && githubActionsIdentity;
    const draftLandingControl = draft
      && context === LANDING_READINESS_CONTEXT
      && status.state === 'pending'
      && status.description === DRAFT_LANDING_PENDING_DESCRIPTION
      && githubActionsIdentity;
    const nativeReadyControl = context === DRAFT_DEVELOPMENT_CONTEXT
      ? draftDevelopmentControl
      : context === LANDING_READINESS_CONTEXT && status.state === 'pending'
        ? draftLandingControl
        : isAtomicLandingNativeStatusReady(status);
    return normalReadyControl || nonGovernedProtectedMainControl || nativeReadyControl;
  });
}

export async function waitForNativeGovernance({
  readStatuses,
  requiredContexts,
  maxAttempts,
  delayMs,
  minimumStatusTime = null,
  draft = false,
  wait = sleep,
}) {
  assert(typeof readStatuses === 'function', 'LIFECYCLE_CONVERGENCE_READER_INVALID');
  assert(typeof wait === 'function', 'LIFECYCLE_CONVERGENCE_WAITER_INVALID');
  assert(Number.isSafeInteger(maxAttempts) && maxAttempts >= 1 && maxAttempts <= DEFAULT_MAX_ATTEMPTS,
    'LIFECYCLE_CONVERGENCE_MAX_ATTEMPTS_INVALID');
  assert(Number.isSafeInteger(delayMs) && delayMs >= 0 && delayMs <= DEFAULT_DELAY_MS,
    'LIFECYCLE_CONVERGENCE_DELAY_INVALID');
  let statuses = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    statuses = await readStatuses();
    assert(Array.isArray(statuses), 'LIFECYCLE_CONVERGENCE_STATUSES_INVALID');
    if (nativeGovernanceConverged(statuses, requiredContexts, minimumStatusTime, {draft})) {
      return {state: 'NATIVE_GOVERNANCE_CONVERGED', attempts: attempt, statuses};
    }
    if (attempt < maxAttempts) await wait(delayMs);
  }
  return {state: 'NATIVE_GOVERNANCE_NOT_CONVERGED', attempts: maxAttempts, statuses};
}

async function runSelfTest() {
  const required = [
    'KIDULTS Scope-Aware Authoritative Status V1',
    'KIDULTS Governed Landing Authorization V1',
  ];
  const scope = {
    context: required[0],
    state: 'success',
    description: 'verified',
  };
  const governed = {
    context: required[1],
    state: 'pending',
    description: 'Ready; operation-specific atomic landing is required',
  };
  assert(nativeGovernanceConverged([scope, governed], required),
    'LIFECYCLE_CONVERGENCE_SELFTEST_READY_REJECTED');
  const normalReady = {
    ...governed,
    description: 'Ready lifecycle verified; operation-specific landing authority required',
    creator: {login: 'github-actions[bot]'},
  };
  assert(nativeGovernanceConverged([scope, normalReady], required),
    'LIFECYCLE_CONVERGENCE_SELFTEST_NORMAL_READY_REJECTED');
  const normalReadyApiShape={...normalReady,creator:undefined,avatar_url:'https://avatars.githubusercontent.com/in/15368?v=4'};
  assert(nativeGovernanceConverged([scope, normalReadyApiShape], required),
    'LIFECYCLE_CONVERGENCE_SELFTEST_GITHUB_ACTIONS_AVATAR_REJECTED');
  const nonGovernedProtectedMain = {
    context: required[1],
    state: 'success',
    description: 'Ready lifecycle verified; non-governed scope uses protected-main status path',
    creator: {login: 'github-actions[bot]'},
  };
  assert(nativeGovernanceConverged([scope, nonGovernedProtectedMain], required),
    'LIFECYCLE_CONVERGENCE_SELFTEST_NON_GOVERNED_PROTECTED_MAIN_REJECTED');
  assert(!nativeGovernanceConverged([scope, {...nonGovernedProtectedMain, description: 'generic success'}], required),
    'LIFECYCLE_CONVERGENCE_SELFTEST_NON_GOVERNED_DESCRIPTION_REQUIRED');
  assert(!nativeGovernanceConverged([scope, {...nonGovernedProtectedMain, creator: {login: 'untrusted'}}], required),
    'LIFECYCLE_CONVERGENCE_SELFTEST_NON_GOVERNED_TRUSTED_CREATOR_REQUIRED');
  assert(!nativeGovernanceConverged([scope, {...normalReady, creator:undefined,avatar_url:'https://avatars.githubusercontent.com/in/99999?v=4'}], required),
    'LIFECYCLE_CONVERGENCE_SELFTEST_UNTRUSTED_AVATAR_ACCEPTED');
  assert(!nativeGovernanceConverged([scope, {...normalReady, creator: {login: 'untrusted'},avatar_url:'https://avatars.githubusercontent.com/in/99999?v=4'}], required),
    'LIFECYCLE_CONVERGENCE_SELFTEST_UNTRUSTED_READY_ACCEPTED');
  assert(!nativeGovernanceConverged([{...scope, state: 'pending'}, normalReady], required),
    'LIFECYCLE_CONVERGENCE_SELFTEST_SCOPE_PENDING_ACCEPTED');
  assert(!nativeGovernanceConverged([scope, {...normalReady, state: 'success'}], required),
    'LIFECYCLE_CONVERGENCE_SELFTEST_DIRECT_OWNER_SUCCESS_ACCEPTED');
  assert(!nativeGovernanceConverged([
    {...scope, state: 'pending'}, governed,
  ], required), 'LIFECYCLE_CONVERGENCE_SELFTEST_SCOPE_PENDING_ACCEPTED');
  assert(!nativeGovernanceConverged([
    scope, {...governed, description: 'generic pending'},
  ], required), 'LIFECYCLE_CONVERGENCE_SELFTEST_GENERIC_PENDING_ACCEPTED');
  assert(!nativeGovernanceConverged([scope], required),
    'LIFECYCLE_CONVERGENCE_SELFTEST_MISSING_CONTEXT_ACCEPTED');
  const eventTime = Date.parse('2026-10-08T03:04:00Z');
  const freshScope = {...scope, updated_at: '2026-10-08T03:04:01Z'};
  const freshReady = {...normalReady, updated_at: '2026-10-08T03:04:02Z'};
  assert(nativeGovernanceConverged([freshScope, freshReady], required, eventTime),
    'LIFECYCLE_CONVERGENCE_SELFTEST_FRESH_GENERATION_REJECTED');
  assert(!nativeGovernanceConverged([
    {...freshScope, updated_at: '2026-10-08T03:03:59Z'}, freshReady,
  ], required, eventTime), 'LIFECYCLE_CONVERGENCE_SELFTEST_STALE_GENERATION_ACCEPTED');
  assert(!nativeGovernanceConverged([scope, freshReady], required, eventTime),
    'LIFECYCLE_CONVERGENCE_SELFTEST_UNTIMED_GENERATION_ACCEPTED');
  const draftRequired = [DRAFT_DEVELOPMENT_CONTEXT, LANDING_READINESS_CONTEXT];
  const priorDraftPending = {
    id: 10,
    context: DRAFT_DEVELOPMENT_CONTEXT,
    state: 'pending',
    description: 'Draft development validation in progress; landing remains blocked',
    creator: {login: 'github-actions[bot]'},
    updated_at: '2026-10-08T03:04:01Z',
  };
  const currentDraftSuccess = {
    id: 11,
    context: DRAFT_DEVELOPMENT_CONTEXT,
    state: 'success',
    description: DRAFT_DEVELOPMENT_DESCRIPTION,
    creator: {login: 'github-actions[bot]'},
    updated_at: '2026-10-08T03:04:02Z',
  };
  const draftLandingPending = {
    id: 12,
    context: LANDING_READINESS_CONTEXT,
    state: 'pending',
    description: DRAFT_LANDING_PENDING_DESCRIPTION,
    creator: {login: 'github-actions[bot]'},
    updated_at: '2026-10-08T03:04:03Z',
  };
  assert(nativeGovernanceConverged(
    [priorDraftPending, currentDraftSuccess, draftLandingPending],
    draftRequired,
    eventTime,
    {draft: true},
  ), 'LIFECYCLE_CONVERGENCE_SELFTEST_LATEST_DRAFT_STATUS_NOT_SELECTED');
  const sameSecondDraftLandingPending = {
    ...draftLandingPending,
    updated_at: new Date(eventTime).toISOString(),
  };
  assert(nativeGovernanceConverged(
    [freshScope, currentDraftSuccess, sameSecondDraftLandingPending],
    draftRequired,
    eventTime,
    {draft: true},
  ), 'LIFECYCLE_CONVERGENCE_SELFTEST_SAME_SECOND_DRAFT_LANDING_PENDING_REJECTED');
  assert(!nativeGovernanceConverged(
    [freshScope, currentDraftSuccess, {...sameSecondDraftLandingPending,
      updated_at: new Date(eventTime - 1).toISOString()}],
    draftRequired,
    eventTime,
    {draft: true},
  ), 'LIFECYCLE_CONVERGENCE_SELFTEST_STALE_DRAFT_LANDING_PENDING_ACCEPTED');
  assert(!nativeGovernanceConverged(
    [currentDraftSuccess, {...currentDraftSuccess, id: 13, state: 'pending',
      description: 'Draft development validation in progress; landing remains blocked',
      updated_at: '2026-10-08T03:04:03Z'}, draftLandingPending],
    draftRequired,
    eventTime,
    {draft: true},
  ), 'LIFECYCLE_CONVERGENCE_SELFTEST_NEWER_PENDING_STATUS_IGNORED');

  let reads = 0;
  let waits = 0;
  const converged = await waitForNativeGovernance({
    readStatuses: async () => ++reads === 1 ? [freshScope] : [freshScope, freshReady],
    requiredContexts: required,
    maxAttempts: 3,
    delayMs: 0,
    minimumStatusTime: eventTime,
    wait: async () => { waits += 1; },
  });
  assert(converged.state === 'NATIVE_GOVERNANCE_CONVERGED'
    && converged.attempts === 2 && reads === 2 && waits === 1,
  'LIFECYCLE_CONVERGENCE_SELFTEST_BOUNDED_POLLING_REJECTED');
  reads = 0;
  waits = 0;
  const exhausted = await waitForNativeGovernance({
    readStatuses: async () => { reads += 1; return [freshScope]; },
    requiredContexts: required,
    maxAttempts: 3,
    delayMs: 0,
    minimumStatusTime: eventTime,
    wait: async () => { waits += 1; },
  });
  assert(exhausted.state === 'NATIVE_GOVERNANCE_NOT_CONVERGED'
    && exhausted.attempts === 3 && reads === 3 && waits === 2,
  'LIFECYCLE_CONVERGENCE_SELFTEST_EXHAUSTION_REJECTED');
  console.log('PR lifecycle native convergence self-test: PASS');
}

async function main() {
  if (process.argv.includes('--self-test')) {
    await runSelfTest();
    return;
  }

  const token = process.env.GH_TOKEN;
  const repository = process.env.GH_REPOSITORY;
  const prNumber = process.env.PR_NUMBER;
  const expectedHeadSha = process.env.EXPECTED_HEAD_SHA;
  const expectedBaseSha = process.env.EXPECTED_BASE_SHA;
  const eventUpdatedAt = process.env.LIFECYCLE_EVENT_UPDATED_AT;
  assert(token, 'LIFECYCLE_CONVERGENCE_GH_TOKEN_MISSING');
  assert(repository && /^[^/]+\/[^/]+$/.test(repository),
    'LIFECYCLE_CONVERGENCE_REPOSITORY_INVALID');
  assert(/^\d+$/.test(prNumber || ''), 'LIFECYCLE_CONVERGENCE_PR_INVALID');
  assert(/^[0-9a-f]{40}$/.test(expectedHeadSha || ''),
    'LIFECYCLE_CONVERGENCE_HEAD_INVALID');
  assert(/^[0-9a-f]{40}$/.test(expectedBaseSha || ''),
    'LIFECYCLE_CONVERGENCE_BASE_INVALID');
  const minimumStatusTime = Date.parse(String(eventUpdatedAt || ''));
  assert(Number.isFinite(minimumStatusTime), 'LIFECYCLE_CONVERGENCE_EVENT_TIME_INVALID');

  const maxAttempts = boundedInteger(process.env.LIFECYCLE_CONVERGENCE_MAX_ATTEMPTS,
    DEFAULT_MAX_ATTEMPTS, 1, DEFAULT_MAX_ATTEMPTS,
    'LIFECYCLE_CONVERGENCE_MAX_ATTEMPTS_INVALID');
  const delayMs = boundedInteger(process.env.LIFECYCLE_CONVERGENCE_DELAY_MS,
    DEFAULT_DELAY_MS, 0, DEFAULT_DELAY_MS,
    'LIFECYCLE_CONVERGENCE_DELAY_INVALID');
  const policy = JSON.parse(fs.readFileSync(POLICY, 'utf8'));
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'kpmo-pr-lifecycle-native-convergence-v1',
  };
  const prEndpoint = `/pulls/${prNumber}`;
  const prResponse = await fetch(`https://api.github.com/repos/${repository}${prEndpoint}`, {
    headers,
    redirect: 'error',
  });
  if (!prResponse.ok) throw new Error(`LIFECYCLE_CONVERGENCE_GITHUB_API_${prResponse.status}:${prEndpoint}`);
  const livePr = await prResponse.json();
  assert(Number(livePr?.number) === Number(prNumber)
    && livePr?.state === 'open' && livePr?.merged !== true
    && livePr?.base?.ref === 'main'
    && livePr?.head?.sha === expectedHeadSha
    && livePr?.base?.sha === expectedBaseSha
    && typeof livePr?.draft === 'boolean', 'LIFECYCLE_CONVERGENCE_PULL_REQUEST_BINDING_INVALID');
  const requiredContexts = nativeReadinessContexts(policy, {draft: livePr.draft});
  assert(requiredContexts.length > 0, 'LIFECYCLE_CONVERGENCE_REQUIRED_CONTEXTS_EMPTY');
  const readStatuses = async () => {
    const endpoint = `/commits/${expectedHeadSha}/status?per_page=100`;
    const response = await fetch(`https://api.github.com/repos/${repository}${endpoint}`, {
      headers,
      redirect: 'error',
    });
    if (!response.ok) throw new Error(`LIFECYCLE_CONVERGENCE_GITHUB_API_${response.status}:${endpoint}`);
    const payload = await response.json();
    assert(Array.isArray(payload?.statuses), 'LIFECYCLE_CONVERGENCE_API_SHAPE_INVALID');
    return payload.statuses;
  };
  const convergence = await waitForNativeGovernance({
    readStatuses,
    requiredContexts,
    maxAttempts,
    delayMs,
    minimumStatusTime,
    draft: livePr.draft,
  });
  console.log(JSON.stringify({
    id: 'kpmo-pr-lifecycle-native-convergence-receipt-v1',
    state: convergence.state,
    attempts: convergence.attempts,
    minimum_status_time: new Date(minimumStatusTime).toISOString(),
    required_contexts: requiredContexts,
    draft_non_promotable: livePr.draft,
    observed_contexts: convergence.statuses.map(status => ({
      context: status.context || null,
      state: status.state || null,
      description: status.description || null,
    })),
    status_write_authority: false,
    status_write_performed: false,
  }));

  const child = spawnSync(process.execPath, [VALIDATOR], {
    stdio: 'inherit',
    env: process.env,
  });
  if (child.error) throw child.error;
  process.exit(Number.isInteger(child.status) ? child.status : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
