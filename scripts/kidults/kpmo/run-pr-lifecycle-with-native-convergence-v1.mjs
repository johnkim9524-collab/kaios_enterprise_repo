#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {
  isAtomicLandingNativeStatusReady,
} from './lib/atomic-landing-lifecycle-authority-v1.mjs';

const DEFAULT_MAX_ATTEMPTS = 60;
const DEFAULT_DELAY_MS = 3000;
const VALIDATOR = 'scripts/kidults/kpmo/validate-pr-lifecycle-integrity-v1.mjs';

const assert = (condition, code) => {
  if (!condition) throw new Error(code);
};
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

export function nativeGovernanceConverged(statuses, requiredContexts) {
  if (!Array.isArray(statuses) || !Array.isArray(requiredContexts) || !requiredContexts.length) {
    return false;
  }
  return requiredContexts.every(context => {
    const matches = statuses.filter(status => status?.context === context);
    if (matches.length !== 1) return false;
    const status = matches[0];
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

function runSelfTest() {
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
  console.log('PR lifecycle native convergence self-test: PASS');
}

async function main() {
  if (process.argv.includes('--self-test')) {
    runSelfTest();
    return;
  }

  const token = process.env.GH_TOKEN;
  const repository = process.env.GH_REPOSITORY;
  const prNumber = process.env.PR_NUMBER;
  const expectedHeadSha = process.env.EXPECTED_HEAD_SHA;
  const expectedBaseSha = process.env.EXPECTED_BASE_SHA;
  assert(token, 'LIFECYCLE_CONVERGENCE_GH_TOKEN_MISSING');
  assert(repository && /^[^/]+\/[^/]+$/.test(repository),
    'LIFECYCLE_CONVERGENCE_REPOSITORY_INVALID');
  assert(/^\d+$/.test(prNumber || ''), 'LIFECYCLE_CONVERGENCE_PR_INVALID');
  assert(/^[0-9a-f]{40}$/.test(expectedHeadSha || ''),
    'LIFECYCLE_CONVERGENCE_HEAD_INVALID');
  assert(/^[0-9a-f]{40}$/.test(expectedBaseSha || ''),
    'LIFECYCLE_CONVERGENCE_BASE_INVALID');

  const policy = JSON.parse(fs.readFileSync(
    'coordination/kidults/kpmo/scope-aware-required-status-policy-v1.json',
    'utf8',
  ));
  const required = [...new Set(policy.native_required_status_contexts || [])];
  assert(required.length > 0, 'LIFECYCLE_CONVERGENCE_CONTEXT_SET_EMPTY');

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'kpmo-pr-lifecycle-native-convergence-v1',
  };
  const request = async endpoint => {
    const url = `https://api.github.com/repos/${repository}${endpoint}`;
    let lastError;
    for (let attempt = 0; attempt <= 3; attempt += 1) {
      let response;
      try {
        response = await fetch(url, {headers, redirect: 'error'});
        if (response.status === 403) {
          response = await fetch(url, {
            headers: {
              Accept: headers.Accept,
              'X-GitHub-Api-Version': headers['X-GitHub-Api-Version'],
              'User-Agent': headers['User-Agent'],
            },
            redirect: 'error',
          });
        }
      } catch (error) {
        lastError = error;
        if (attempt === 3) break;
        await sleep(Math.min(5000, 250 * (2 ** attempt)));
        continue;
      }
      if (response.ok) return response.json();
      lastError = new Error(`LIFECYCLE_CONVERGENCE_GITHUB_API_${response.status}:${endpoint}`);
      const retryable = response.status === 429
        || [500, 502, 503, 504].includes(response.status);
      if (!retryable || attempt === 3) break;
      const retryAfter = Number(response.headers.get('retry-after'));
      const retryAfterMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : 250 * (2 ** attempt);
      await sleep(Math.min(5000, Math.max(250, retryAfterMs)));
    }
    throw lastError instanceof Error
      ? lastError
      : new Error(`LIFECYCLE_CONVERGENCE_GITHUB_API_FAILED:${endpoint}`);
  };

  const maxAttempts = Number(process.env.LIFECYCLE_CONVERGENCE_MAX_ATTEMPTS
    || DEFAULT_MAX_ATTEMPTS);
  const delayMs = Number(process.env.LIFECYCLE_CONVERGENCE_DELAY_MS
    || DEFAULT_DELAY_MS);
  assert(Number.isInteger(maxAttempts) && maxAttempts >= 1 && maxAttempts <= 60,
    'LIFECYCLE_CONVERGENCE_MAX_ATTEMPTS_INVALID');
  assert(Number.isInteger(delayMs) && delayMs >= 250 && delayMs <= 5000,
    'LIFECYCLE_CONVERGENCE_DELAY_INVALID');

  let converged = false;
  let attempts = 0;
  let convergenceError = null;
  for (attempts = 1; attempts <= maxAttempts; attempts += 1) {
    try {
      const [pr, main, status] = await Promise.all([
        request(`/pulls/${prNumber}`),
        request('/branches/main'),
        request(`/commits/${expectedHeadSha}/status`),
      ]);
      const stableReadyCandidate = pr?.state === 'open'
        && pr?.merged !== true
        && pr?.draft === false
        && pr?.head?.sha === expectedHeadSha
        && pr?.base?.ref === 'main'
        && pr?.base?.sha === expectedBaseSha
        && main?.commit?.sha === expectedBaseSha;
      if (!stableReadyCandidate) break;
      const statuses = Array.isArray(status?.statuses) ? status.statuses : [];
      if (nativeGovernanceConverged(statuses, required)) {
        converged = true;
        break;
      }
      if (attempts < maxAttempts) await sleep(delayMs);
    } catch (error) {
      convergenceError = String(error?.message || error);
      break;
    }
  }

  console.log(JSON.stringify({
    id: 'kpmo-pr-lifecycle-native-convergence-receipt-v1',
    state: converged ? 'CONVERGED'
      : convergenceError ? 'CONVERGENCE_API_ERROR_DELEGATED_TO_VALIDATOR'
        : 'DELEGATE_FAIL_CLOSED_CLASSIFICATION',
    attempts,
    max_attempts: maxAttempts,
    delay_ms: delayMs,
    error: convergenceError,
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
