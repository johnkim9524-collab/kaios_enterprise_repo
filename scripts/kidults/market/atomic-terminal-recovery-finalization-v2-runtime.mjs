import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {
  SHA40,
  SHA256,
  MAX_PAGES,
  assert,
  fail,
  sha256,
  normalizeSha256,
  validateManifest,
  buildFinalizationRunName,
  selectApproval,
  evaluateRunSet,
  writeJsonSecure,
} from './atomic-terminal-recovery-finalization-v2-policy.mjs';

function parseLinkNext(header) {
  for (const part of String(header || '').split(',')) {
    const match = /<([^>]+)>;\s*rel="next"/.exec(part);
    if (match) return match[1];
  }
  return null;
}

function normalizeApiPath(repository, value) {
  const text = String(value || '');
  if (/^https:\/\/api\.github\.com\//.test(text)) return text;
  assert(text.startsWith('/'), 'ATOMIC_FINALIZATION_V2_API_PATH_INVALID');
  return `https://api.github.com/repos/${repository}${text}`;
}

async function parseResponse(response, code) {
  const text = await response.text();
  if (!response.ok) fail(code, `${response.status}:${text.slice(0, 240)}`);
  if (!text) return null;
  try { return JSON.parse(text); }
  catch { fail(`${code}_JSON_INVALID`); }
}

export function makeGitHubClient(repository, token) {
  assert(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository || ''),
    'ATOMIC_FINALIZATION_V2_REPOSITORY_ENV_INVALID');
  assert(typeof token === 'string' && token.length >= 20,
    'ATOMIC_FINALIZATION_V2_TOKEN_MISSING');
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'kidults-atomic-finalization-v2',
  };
  const request = async (value, options = {}) => {
    const response = await fetch(normalizeApiPath(repository, value), {
      ...options,
      headers: {...headers, ...(options.headers || {})},
    });
    return parseResponse(response, 'ATOMIC_FINALIZATION_V2_GITHUB_API_FAILED');
  };
  const pages = async (value, key = null) => {
    let url = normalizeApiPath(repository, value);
    const output = [];
    for (let page = 0; page < MAX_PAGES && url; page += 1) {
      const response = await fetch(url, {headers});
      const payload = await parseResponse(response,
        'ATOMIC_FINALIZATION_V2_GITHUB_PAGINATION_FAILED');
      const values = key ? payload?.[key] : payload;
      assert(Array.isArray(values),
        'ATOMIC_FINALIZATION_V2_GITHUB_PAGE_SHAPE_INVALID');
      output.push(...values);
      url = parseLinkNext(response.headers.get('link'));
    }
    assert(!url, 'ATOMIC_FINALIZATION_V2_GITHUB_PAGE_LIMIT_EXCEEDED');
    return output;
  };
  return {api: request, pages, headers};
}

function allowedArtifactRedirect(value) {
  let url;
  try { url = new URL(value); } catch { return false; }
  if (url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  return host === 'github.com'
    || host === 'api.github.com'
    || host.endsWith('.githubusercontent.com')
    || host.endsWith('.actions.githubusercontent.com')
    || host.endsWith('.blob.core.windows.net');
}

function safeArtifactEntry(entry) {
  const text = String(entry || '');
  return text.length > 0
    && text.length <= 160
    && !text.startsWith('/')
    && !text.includes('\\')
    && !text.split('/').includes('..')
    && /^[A-Za-z0-9._/-]+$/.test(text);
}

export async function downloadArtifactEntry(authority, expected, entry) {
  assert(safeArtifactEntry(entry),
    'ATOMIC_FINALIZATION_V2_ARTIFACT_ENTRY_INVALID');
  const artifactUrl =
    `https://api.github.com/repos/${authority.repository}/actions/artifacts/${Number(expected.id)}/zip`;
  const first = await fetch(artifactUrl, {
    headers: authority.client.headers,
    redirect: 'manual',
  });
  assert(first.status >= 300 && first.status < 400,
    'ATOMIC_FINALIZATION_V2_ARTIFACT_REDIRECT_INVALID', String(first.status));
  const location = first.headers.get('location');
  assert(allowedArtifactRedirect(location),
    'ATOMIC_FINALIZATION_V2_ARTIFACT_REDIRECT_HOST_INVALID');
  const second = await fetch(location, {redirect: 'error'});
  assert(second.ok, 'ATOMIC_FINALIZATION_V2_ARTIFACT_DOWNLOAD_FAILED',
    String(second.status));
  const bytes = Buffer.from(await second.arrayBuffer());
  assert(bytes.length > 0 && bytes.length <= 5 * 1024 * 1024,
    'ATOMIC_FINALIZATION_V2_ARTIFACT_SIZE_INVALID', String(bytes.length));
  assert(sha256(bytes) === normalizeSha256(expected.digest),
    'ATOMIC_FINALIZATION_V2_ARTIFACT_ARCHIVE_DIGEST_MISMATCH');

  const temporary = path.join(os.tmpdir(),
    `kidults-finalization-v2-${process.pid}-${crypto.randomBytes(6).toString('hex')}.zip`);
  fs.writeFileSync(temporary, bytes, {mode: 0o600, flag: 'wx'});
  try {
    const listing = spawnSync('unzip', ['-Z1', temporary], {
      encoding: 'utf8', maxBuffer: 1024 * 1024,
    });
    assert(listing.status === 0,
      'ATOMIC_FINALIZATION_V2_ARTIFACT_LIST_FAILED');
    const names = String(listing.stdout || '').split(/\r?\n/).filter(Boolean);
    assert(names.length > 0 && names.length <= 16
      && names.every(safeArtifactEntry),
    'ATOMIC_FINALIZATION_V2_ARTIFACT_NAME_SET_INVALID');
    assert(names.filter(name => name === entry).length === 1,
      'ATOMIC_FINALIZATION_V2_ARTIFACT_ENTRY_CARDINALITY_INVALID');
    const extracted = spawnSync('unzip', ['-p', temporary, entry], {
      encoding: null, maxBuffer: 1024 * 1024,
    });
    assert(extracted.status === 0
      && Buffer.isBuffer(extracted.stdout)
      && extracted.stdout.length > 0
      && extracted.stdout.length <= 512 * 1024,
    'ATOMIC_FINALIZATION_V2_ARTIFACT_ENTRY_READ_FAILED');
    let receipt;
    try { receipt = JSON.parse(extracted.stdout.toString('utf8')); }
    catch { fail('ATOMIC_FINALIZATION_V2_ARTIFACT_ENTRY_JSON_INVALID'); }
    return {bytes: extracted.stdout, receipt, names};
  } finally {
    try { fs.unlinkSync(temporary); } catch {}
  }
}

export function baseReceipt({id, state, failureCode = null, manifest,
  manifestDigest, currentMainSha, runId, runAttempt, authorizationId} = {}) {
  const safeManifest = manifest || {};
  return {
    id,
    version: '2.0.0',
    state,
    failure_code: failureCode,
    repository: safeManifest.repository || process.env.GITHUB_REPOSITORY || null,
    predecessor_pull_request:
      safeManifest.predecessor_pull_request?.number || 1865,
    predecessor_atomic_run:
      safeManifest.predecessor_atomic_run?.id || 33603816578,
    predecessor_merge_sha:
      safeManifest.predecessor_pull_request?.merge_commit_sha || null,
    exact_current_main_sha: currentMainSha || null,
    finalization_manifest_sha256: manifestDigest || null,
    finalization_workflow_run_id: Number(runId || 0) || null,
    finalization_workflow_run_attempt: Number(runAttempt || 0) || null,
    authorization_id_sha256: authorizationId ? sha256(authorizationId) : null,
    historical_terminal_context:
      safeManifest.historical_terminal_status?.context
      || 'KIDULTS Atomic Landing Terminal V2',
    recovery_context: safeManifest.recovery_context
      || 'KIDULTS Atomic Landing Recovery V1',
    historical_terminal_context_mutated: false,
    prior_recovery_failure_status_mutated: false,
    merge_reexecuted: false,
    prior_authorization_reused: false,
    prior_run_rerun_performed: false,
    provider_calls: 0,
    postgres_rows_written: 0,
    deployment: false,
    empirical_authority_created: false,
    public: 'HOLD',
    production: 'HOLD',
    g5: 'HOLD',
  };
}

export async function establishFinalizationAuthority(manifestFile) {
  const repository = process.env.GITHUB_REPOSITORY || '';
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
  const currentMainInput = process.env.EXPECTED_CURRENT_MAIN_SHA || '';
  const authorizationId = process.env.FINALIZATION_AUTHORIZATION_ID || '';
  const runId = Number(process.env.GITHUB_RUN_ID || 0);
  const runAttempt = Number(process.env.GITHUB_RUN_ATTEMPT || 0);
  assert(SHA40.test(currentMainInput),
    'ATOMIC_FINALIZATION_V2_EXPECTED_MAIN_INPUT_INVALID');
  assert(runId > 0 && runAttempt === 1,
    'ATOMIC_FINALIZATION_V2_CURRENT_RUN_ENV_INVALID');
  const manifestBytes = fs.readFileSync(manifestFile);
  let manifest;
  try { manifest = validateManifest(JSON.parse(manifestBytes.toString('utf8'))); }
  catch (error) {
    if (error?.code) throw error;
    fail('ATOMIC_FINALIZATION_V2_MANIFEST_JSON_INVALID');
  }
  assert(manifest.repository === repository,
    'ATOMIC_FINALIZATION_V2_REPOSITORY_MANIFEST_MISMATCH');
  const manifestDigest = sha256(manifestBytes);
  const expectedRunName = buildFinalizationRunName({
    predecessorRunId: manifest.predecessor_atomic_run.id,
    currentMainSha: currentMainInput,
    authorizationId,
  });
  const client = makeGitHubClient(repository, token);
  const [repo, main, currentRun, issue, comments] = await Promise.all([
    client.api('https://api.github.com/repos/' + repository),
    client.api('/branches/main'),
    client.api(`/actions/runs/${runId}`),
    client.api(`/issues/${manifest.approval_issue}`),
    client.pages(`/issues/${manifest.approval_issue}/comments?per_page=100`),
  ]);
  const repositoryOwner = repo?.owner?.login;
  assert(repositoryOwner && issue?.state === 'open',
    'ATOMIC_FINALIZATION_V2_APPROVAL_ISSUE_NOT_OPEN');
  assert(main?.commit?.sha === currentMainInput,
    'ATOMIC_FINALIZATION_V2_CURRENT_MAIN_DRIFT');
  assert(currentRun?.path === manifest.authorized_workflow_path,
    'ATOMIC_FINALIZATION_V2_CURRENT_WORKFLOW_PATH_INVALID');
  assert(currentRun?.head_sha === currentMainInput,
    'ATOMIC_FINALIZATION_V2_CURRENT_RUN_HEAD_INVALID');
  const mainCommit = await client.api(`/commits/${currentMainInput}`);
  const evaluationTime = new Date().toISOString();
  const approval = selectApproval(comments, {
    manifest,
    repositoryOwner,
    currentMainSha: currentMainInput,
    currentMainCommittedAt: mainCommit?.commit?.committer?.date,
    manifestDigest,
    authorizationId,
    evaluationTime,
  });
  const runs = await client.pages(
    `/actions/workflows/${Number(currentRun.workflow_id)}/runs?event=workflow_dispatch&branch=main&per_page=100`,
    'workflow_runs');
  const oneUse = evaluateRunSet(runs, {
    currentRunId: runId,
    currentRunAttempt: runAttempt,
    workflowId: currentRun.workflow_id,
    workflowPath: manifest.authorized_workflow_path,
    predecessorRunId: manifest.predecessor_atomic_run.id,
    expectedRunName,
    currentMainSha: currentMainInput,
    repositoryOwner,
    approval,
  });
  return {
    repository,
    repositoryOwner,
    client,
    manifest,
    manifestBytes,
    manifestDigest,
    currentMainInput,
    authorizationId,
    runId,
    runAttempt,
    expectedRunName,
    currentRun,
    approval,
    oneUse,
    evaluatedAt: evaluationTime,
  };
}

export function writeReceiptOrFail(file, receipt) {
  try { writeJsonSecure(file, receipt); }
  catch (error) {
    console.error(String(error?.code || error?.message || error));
    process.exit(1);
  }
}
