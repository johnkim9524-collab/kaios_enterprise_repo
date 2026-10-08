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

  // The validator owns one complete, exact-head snapshot and writes the fail-closed receipt.
  // A separate polling phase multiplied read requests (up to 180 per PR event) and could
  // fail before the validator had a chance to persist diagnostic evidence.
  console.log(JSON.stringify({
    id: 'kpmo-pr-lifecycle-native-convergence-receipt-v1',
    state: 'SINGLE_SNAPSHOT_DELEGATED_TO_VALIDATOR',
    attempts: 0,
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
