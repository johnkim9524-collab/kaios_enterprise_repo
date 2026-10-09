#!/usr/bin/env node
import fs from 'node:fs';
import {
  assertAtomicLandingHandoffCompatibility,
} from './lib/atomic-landing-handoff-compatibility-v1.mjs';

const token = process.env.GH_TOKEN;
const repository = process.env.GH_REPOSITORY;
const expectedHeadSha = process.env.EXPECTED_HEAD_SHA;
const expectedHeadTreeSha = process.env.EXPECTED_HEAD_TREE_SHA;
if (!token || !/^[^/]+\/[^/]+$/.test(repository || '') || !/^[0-9a-f]{40}$/.test(expectedHeadSha || '')
    || !/^[0-9a-f]{40}$/.test(expectedHeadTreeSha || '')) {
  throw new Error('ATOMIC_HANDOFF_PREFLIGHT_ENVIRONMENT_INVALID');
}
if (process.env.GITHUB_REF !== 'refs/heads/main') {
  throw new Error('ATOMIC_HANDOFF_PREFLIGHT_MAIN_REF_REQUIRED');
}
if (String(process.env.GITHUB_RUN_ATTEMPT || '') !== '1') {
  throw new Error('ATOMIC_HANDOFF_PREFLIGHT_RERUN_FORBIDDEN');
}

const candidatePath = 'scripts/kidults/kpmo/reconcile-atomic-landing-terminal-v1.mjs';
const apiHeaders = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'kidults-atomic-landing-handoff-preflight-v1',
};
const readTimeoutMs = 20_000;

async function readJson(url, options = {}) {
  const response = await fetch(url, {
    redirect: 'error',
    signal: options.signal || AbortSignal.timeout(readTimeoutMs),
    ...options,
  });
  const payload = await response.json().catch(() => null);
  return {response, payload};
}

async function readGraphql(query, variables) {
  const {response, payload} = await readJson('https://api.github.com/graphql', {
    method: 'POST',
    headers: {...apiHeaders, 'Content-Type': 'application/json'},
    body: JSON.stringify({query, variables}),
  });
  if (!response.ok || payload?.errors?.length || !payload?.data?.repository) {
    const codes = payload?.errors?.map(error => error?.type || error?.message).filter(Boolean).join(',') || response.status;
    throw new Error(`ATOMIC_HANDOFF_GRAPHQL_READ_FAILED:${codes}`);
  }
  return payload.data.repository.object;
}

async function readCommitObject() {
  const failures = [];
  for (const endpoint of [
    `https://api.github.com/repos/${repository}/git/commits/${expectedHeadSha}`,
    `https://api.github.com/repos/${repository}/commits/${expectedHeadSha}`,
  ]) {
    const {response, payload} = await readJson(endpoint, {headers: apiHeaders});
    if (response.ok && payload?.sha) {
      return {
        sha: payload.sha,
        treeSha: payload?.tree?.sha || payload?.commit?.tree?.sha,
        transport: 'REST',
      };
    }
    failures.push(
      response.status === 401 || response.status === 403
        ? `CAPABILITY_BLOCKED:${response.status}`
        : `${response.status}`,
    );
  }
  const [owner, name] = repository.split('/');
  try {
    const object = await readGraphql(
      `query($owner:String!,$name:String!,$oid:GitObjectID!){
        repository(owner:$owner,name:$name){object(oid:$oid){
          ... on Commit { oid tree { oid } }
        }}
      }`,
      {owner, name, oid: expectedHeadSha},
    );
    if (object?.oid && object?.tree?.oid) {
      return {sha: object.oid, treeSha: object.tree.oid, transport: 'GRAPHQL'};
    }
  } catch (error) {
    failures.push(error.message);
  }
  throw new Error(`ATOMIC_HANDOFF_HEAD_OBJECT_READ_FAILED:${failures.join('|')}`);
}

async function readCandidateFromGraphql() {
  const [owner, name] = repository.split('/');
  let oid = expectedHeadTreeSha;
  const parts = candidatePath.split('/');
  for (const part of parts) {
    const object = await readGraphql(
      `query($owner:String!,$name:String!,$oid:GitObjectID!){
        repository(owner:$owner,name:$name){object(oid:$oid){
          ... on Tree { entries { name type oid } }
          ... on Blob { text }
        }}
      }`,
      {owner, name, oid},
    );
    if (!Array.isArray(object?.entries)) {
      if (part === parts.at(-1) && typeof object?.text === 'string') return object.text;
      throw new Error('ATOMIC_HANDOFF_CANDIDATE_GRAPHQL_TREE_INVALID');
    }
    const entry = object.entries.find(value => value?.name === part);
    if (!entry?.oid || (part !== parts.at(-1) && entry.type !== 'tree')) {
      throw new Error('ATOMIC_HANDOFF_CANDIDATE_GRAPHQL_PATH_INVALID');
    }
    if (part === parts.at(-1) && entry.type === 'blob') {
      const blob = await readGraphql(
        `query($owner:String!,$name:String!,$oid:GitObjectID!){
          repository(owner:$owner,name:$name){object(oid:$oid){
            ... on Blob { text }
          }}
        }`,
        {owner, name, oid: entry.oid},
      );
      if (typeof blob?.text !== 'string') throw new Error('ATOMIC_HANDOFF_CANDIDATE_GRAPHQL_BLOB_INVALID');
      return blob.text;
    }
    oid = entry.oid;
  }
  throw new Error('ATOMIC_HANDOFF_CANDIDATE_GRAPHQL_BLOB_MISSING');
}

const commitObject = await readCommitObject();
if (commitObject.sha !== expectedHeadSha || commitObject.treeSha !== expectedHeadTreeSha) {
  throw new Error('ATOMIC_HANDOFF_HEAD_TREE_MISMATCH');
}
const headObjectReadTransport = commitObject.transport;
const encoded = candidatePath.split('/').map(encodeURIComponent).join('/');
const {response, payload} = await readJson(
  `https://api.github.com/repos/${repository}/contents/${encoded}?ref=${expectedHeadSha}`,
  {headers: apiHeaders},
);
let candidateTerminalReconciler;
let candidateReadTransport;
if (response.ok && payload?.type === 'file' && payload?.encoding === 'base64' && typeof payload?.content === 'string') {
  candidateTerminalReconciler = Buffer.from(payload.content.replace(/\s/g, ''), 'base64').toString('utf8');
  candidateReadTransport = 'REST_CONTENTS';
} else {
  try {
    candidateTerminalReconciler = await readCandidateFromGraphql();
    candidateReadTransport = 'GRAPHQL_TREE_BLOB';
  } catch (error) {
    throw new Error(`ATOMIC_HANDOFF_CANDIDATE_READ_FAILED:${response.status}:${error.message}`);
  }
}
const receipt = assertAtomicLandingHandoffCompatibility({
  baseWorkflow: fs.readFileSync('.github/workflows/kidults-atomic-governed-landing-v1.yml', 'utf8'),
  candidateTerminalReconciler,
});
console.log(JSON.stringify({
  id: 'kidults-atomic-landing-handoff-preflight-receipt-v1',
  version: '1.0.0',
  exact_candidate_head_sha: expectedHeadSha,
  exact_candidate_head_tree_sha: expectedHeadTreeSha,
  head_object_read_transport: headObjectReadTransport,
  candidate_read_transport: candidateReadTransport,
  ...receipt,
}, null, 2));
