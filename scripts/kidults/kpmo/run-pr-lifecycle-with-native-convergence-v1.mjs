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

const assert = (condition, code) => {
  if (!condition) throw new Error(code);
};
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const boundedInteger = (value, fallback, minimum, maximum, code) => {
  const parsed = value == null || value === '' ? fallback : Number(value);
  assert(Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum, code);
  return parsed;
};

export function nativeGovernanceConverged(statuses, requiredContexts, minimumStatusTime = null) {
  if (!Array.isArray(statuses) || !Array.isArray(requiredContexts) || !requiredContexts.length) {
    return false;
  }
  return requiredContexts.every(context => {
    const matches = statuses.filter(status => status?.context === context);
    if (matches.length !== 1) return false;
    const status = matches[0];
    if (minimumStatusTime != null) {
      const statusTime = Date.parse(String(status.updated_at || status.created_at || ''));
      if (!Number.isFinite(statusTime) || statusTime < minimumStatusTime
        || (context === LANDING_READINESS_CONTEXT && statusTime === minimumStatusTime)) return false;
    }
    const githubActionsIdentity = status.creator?.login === 'github-actions[bot]'
      || /^https:\/\/avatars\.githubusercontent\.com\/in\/15368(?:\?|$)/.test(String(status.avatar_url || ''));
    const normalReadyControl = context === 'KIDULTS Governed Landing Authorization V1'
      && status.state === 'pending'
      && status.description === 'Ready lifecycle verified; operation-specific landing authority required'
      && githubActionsIdentity;
    const nonGovernedProtectedMainControl = context === 'KIDULTS Governed Landing Authorization V1'
      && status.state === 'success'
      && status.description === 'Ready lifecycle verified; non-governed scope uses protected-main status path'
      && githubActionsIdentity;
    return normalReadyControl || nonGovernedProtectedMainControl
      || isAtomicLandingNativeStatusReady(status);
  });
}

export async function waitForNativeGovernance({
  readStatuses,
  requiredContexts,
  maxAttempts,
  delayMs,
  minimumStatusTime = null,
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
    if (nativeGovernanceConverged(statuses, requiredContexts, minimumStatusTime)) {
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
  const requiredContexts = Array.from(new Set(policy?.native_readiness_status_contexts || policy?.native_required_status_contexts || []));
  assert(requiredContexts.length > 0, 'LIFECYCLE_CONVERGENCE_REQUIRED_CONTEXTS_EMPTY');
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'kpmo-pr-lifecycle-native-convergence-v1',
  };
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
  });
  console.log(JSON.stringify({
    id: 'kpmo-pr-lifecycle-native-convergence-receipt-v1',
    state: convergence.state,
    attempts: convergence.attempts,
    minimum_status_time: new Date(minimumStatusTime).toISOString(),
    required_contexts: requiredContexts,
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
