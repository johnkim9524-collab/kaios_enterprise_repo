#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {
  isAtomicLandingNativeStatusReady,
} from './lib/atomic-landing-lifecycle-authority-v1.mjs';

const DEFAULT_MAX_ATTEMPTS = 30;
const DEFAULT_DELAY_MS = 1000;
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
    return matches.length === 1 && isAtomicLandingNativeStatusReady(matches[0]);
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
    const response = await fetch(
      `https://api.github.com/repos/${repository}${endpoint}`,
      {headers, redirect: 'error'},
    );
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(`LIFECYCLE_CONVERGENCE_GITHUB_API_${response.status}:${endpoint}`);
    }
    return payload;
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
  for (attempts = 1; attempts <= maxAttempts; attempts += 1) {
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
  }

  console.log(JSON.stringify({
    id: 'kpmo-pr-lifecycle-native-convergence-receipt-v1',
    state: converged ? 'CONVERGED' : 'DELEGATE_FAIL_CLOSED_CLASSIFICATION',
    attempts,
    max_attempts: maxAttempts,
    delay_ms: delayMs,
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
