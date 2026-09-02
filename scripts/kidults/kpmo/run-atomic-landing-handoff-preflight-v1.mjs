#!/usr/bin/env node
import fs from 'node:fs';
import {
  assertAtomicLandingHandoffCompatibility,
} from './lib/atomic-landing-handoff-compatibility-v1.mjs';

const token = process.env.GH_TOKEN;
const repository = process.env.GH_REPOSITORY;
const expectedHeadSha = process.env.EXPECTED_HEAD_SHA;
if (!token || !/^[^/]+\/[^/]+$/.test(repository || '') || !/^[0-9a-f]{40}$/.test(expectedHeadSha || '')) {
  throw new Error('ATOMIC_HANDOFF_PREFLIGHT_ENVIRONMENT_INVALID');
}
if (process.env.GITHUB_REF !== 'refs/heads/main') {
  throw new Error('ATOMIC_HANDOFF_PREFLIGHT_MAIN_REF_REQUIRED');
}
if (String(process.env.GITHUB_RUN_ATTEMPT || '') !== '1') {
  throw new Error('ATOMIC_HANDOFF_PREFLIGHT_RERUN_FORBIDDEN');
}

const candidatePath = 'scripts/kidults/kpmo/reconcile-atomic-landing-terminal-v1.mjs';
const encoded = candidatePath.split('/').map(encodeURIComponent).join('/');
const response = await fetch(
  `https://api.github.com/repos/${repository}/contents/${encoded}?ref=${expectedHeadSha}`,
  {
    redirect: 'error',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'kidults-atomic-landing-handoff-preflight-v1',
    },
  },
);
const payload = await response.json().catch(() => null);
if (!response.ok) {
  throw new Error(`ATOMIC_HANDOFF_CANDIDATE_READ_FAILED:${response.status}:${payload?.message || 'request_failed'}`);
}
if (payload?.type !== 'file' || payload?.encoding !== 'base64' || typeof payload?.content !== 'string') {
  throw new Error('ATOMIC_HANDOFF_CANDIDATE_CONTENT_SHAPE_INVALID');
}
const candidateTerminalReconciler = Buffer.from(
  payload.content.replace(/\s/g, ''),
  'base64',
).toString('utf8');
const receipt = assertAtomicLandingHandoffCompatibility({
  baseWorkflow: fs.readFileSync('.github/workflows/kidults-atomic-governed-landing-v1.yml', 'utf8'),
  candidateTerminalReconciler,
});
console.log(JSON.stringify({
  id: 'kidults-atomic-landing-handoff-preflight-receipt-v1',
  version: '1.0.0',
  exact_candidate_head_sha: expectedHeadSha,
  ...receipt,
}, null, 2));
