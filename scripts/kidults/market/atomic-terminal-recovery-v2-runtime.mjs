import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {
  SHA40,
  HISTORICAL_CONTEXT,
  RECOVERY_CONTEXT,
  EXPECTED_BRANCH,
  EXPECTED_EVENT,
  assert,
  fail,
  sha256,
  normalizeSha256,
  validateManifest,
  buildRecoveryRunName,
  selectRecoveryApproval,
  evaluateRecoveryRunSet,
} from './atomic-terminal-recovery-v2-policy.mjs';

export * from './atomic-terminal-recovery-v2-policy.mjs';

export function exactArtifact(artifacts, expected, label) {
  const matches = (Array.isArray(artifacts) ? artifacts : [])
    .filter(item => Number(item?.id) === Number(expected.id));
  assert(matches.length === 1, `${label}_CARDINALITY_INVALID`, String(matches.length));
  const artifact = matches[0];
  assert(artifact?.name === expected.name
    && normalizeSha256(artifact?.digest) === normalizeSha256(expected.digest)
    && artifact?.expired === false,
  `${label}_BINDING_INVALID`);
  return artifact;
}

export function allowedArtifactRedirect(location) {
  const url = new URL(location);
  const host = url.hostname.toLowerCase();
  assert(url.protocol === 'https:', 'ATOMIC_RECOVERY_ARTIFACT_REDIRECT_PROTOCOL_INVALID');
  assert(host.endsWith('.blob.core.windows.net')
    || host.endsWith('.githubusercontent.com')
    || host.endsWith('.github.com'),
  'ATOMIC_RECOVERY_ARTIFACT_REDIRECT_HOST_INVALID', host);
  return url.toString();
}

export async function downloadArtifactReceipt({repository, token, expected}) {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'kidults-atomic-terminal-recovery-v2',
  };
  const first = await fetch(
    `https://api.github.com/repos/${repository}/actions/artifacts/${expected.id}/zip`,
    {headers, redirect: 'manual'},
  );
  let response = first;
  if (first.status >= 300 && first.status < 400) {
    response = await fetch(allowedArtifactRedirect(first.headers.get('location') || ''),
      {redirect: 'error'});
  }
  assert(response.ok, `ATOMIC_RECOVERY_ARTIFACT_DOWNLOAD_${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert(sha256(bytes) === normalizeSha256(expected.digest),
    'ATOMIC_RECOVERY_ARTIFACT_ARCHIVE_DIGEST_MISMATCH');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-recovery-v2-'));
  try {
    const zip = path.join(directory, 'artifact.zip');
    fs.writeFileSync(zip, bytes, {mode: 0o600, flag: 'wx'});
    const unzip = spawnSync('unzip', ['-p', zip, 'receipt.json'], {
      encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
    });
    assert(!unzip.error && unzip.status === 0,
      'ATOMIC_RECOVERY_ARTIFACT_EXTRACTION_FAILED');
    try {
      return JSON.parse(unzip.stdout);
    } catch {
      fail('ATOMIC_RECOVERY_ARTIFACT_RECEIPT_INVALID');
    }
  } finally {
    fs.rmSync(directory, {recursive: true, force: true});
  }
}

export function makeGitHubClient({repository, token}) {
  assert(/^[^/]+\/[^/]+$/.test(repository || '') && token,
    'ATOMIC_RECOVERY_RUNTIME_BINDING_INVALID');
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'kidults-atomic-terminal-recovery-v2',
  };
  const api = async (route, options = {}) => {
    const response = await fetch(`https://api.github.com/repos/${repository}${route}`, {
      ...options,
      headers: {...headers, ...(options.headers || {})},
      redirect: 'error',
    });
    const payload = response.status === 204 ? null : await response.json().catch(() => null);
    assert(response.ok, `ATOMIC_RECOVERY_GITHUB_API_${response.status}`, route);
    return payload;
  };
  const pages = async route => {
    const output = [];
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const separator = route.includes('?') ? '&' : '?';
      const values = await api(`${route}${separator}per_page=100&page=${page}`);
      assert(Array.isArray(values), 'ATOMIC_RECOVERY_PAGINATION_SHAPE_INVALID');
      output.push(...values);
      if (values.length < 100) return output;
    }
    fail('ATOMIC_RECOVERY_PAGINATION_BOUND_EXCEEDED', route);
  };
  const loadWorkflowRuns = async (workflowId, currentRunId) => {
    for (let visibilityAttempt = 1; visibilityAttempt <= 4; visibilityAttempt += 1) {
      const runs = [];
      for (let page = 1; page <= MAX_PAGES; page += 1) {
        const payload = await api(
          `/actions/workflows/${workflowId}/runs?event=${EXPECTED_EVENT}&branch=${EXPECTED_BRANCH}&per_page=100&page=${page}`,
        );
        assert(Array.isArray(payload?.workflow_runs), 'ATOMIC_RECOVERY_WORKFLOW_RUNS_SHAPE_INVALID');
        runs.push(...payload.workflow_runs);
        if (payload.workflow_runs.length < 100) break;
        if (page === MAX_PAGES) fail('ATOMIC_RECOVERY_WORKFLOW_RUNS_PAGINATION_BOUND_EXCEEDED');
      }
      if (runs.some(run => Number(run?.id) === Number(currentRunId))) return runs;
      await new Promise(resolve => setTimeout(resolve, 250 * visibilityAttempt));
    }
    fail('ATOMIC_RECOVERY_CURRENT_RUN_NOT_DISCOVERABLE');
  };
  return {api, pages, loadWorkflowRuns, headers};
}

export function baseReceipt({id, state, manifest, manifestDigest, currentMainSha,
  runId, runAttempt, authorizationId, failureCode = null} = {}) {
  return {
    id,
    version: '2.0.0',
    state,
    failure_code: failureCode,
    repository: manifest?.repository || null,
    predecessor_pull_request: manifest?.predecessor_pull_request?.number || null,
    predecessor_atomic_run: manifest?.atomic_run?.id || null,
    predecessor_merge_sha: manifest?.predecessor_pull_request?.merge_commit_sha || null,
    exact_current_main_sha: currentMainSha || null,
    recovery_manifest_sha256: manifestDigest || null,
    recovery_workflow_run_id: Number(runId) || null,
    recovery_workflow_run_attempt: Number(runAttempt) || null,
    authorization_id_sha256: authorizationId ? sha256(authorizationId) : null,
    historical_terminal_context: HISTORICAL_CONTEXT,
    recovery_context: RECOVERY_CONTEXT,
    historical_terminal_context_mutated: false,
    merge_reexecuted: false,
    landing_authorization_reused: false,
    provider_calls: 0,
    postgres_rows_written: 0,
    deployment: false,
    empirical_authority_created: false,
    public: 'HOLD',
    production: 'HOLD',
    g5: 'HOLD',
  };
}

export async function establishRecoveryAuthority(manifestFile) {
  const repository = process.env.GH_REPOSITORY || process.env.GITHUB_REPOSITORY || '';
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
  const currentMainInput = process.env.EXPECTED_CURRENT_MAIN_SHA || '';
  const authorizationId = process.env.RECOVERY_AUTHORIZATION_ID || '';
  const runId = process.env.GITHUB_RUN_ID || '';
  const runAttempt = process.env.GITHUB_RUN_ATTEMPT || '';
  assert(repository && token && SHA40.test(currentMainInput),
    'ATOMIC_RECOVERY_RUNTIME_BINDING_INVALID');
  assert(/^\d+$/.test(runId) && Number(runAttempt) === 1,
    'ATOMIC_RECOVERY_EXECUTOR_IDENTITY_INVALID');
  assert(process.env.GITHUB_REF === 'refs/heads/main', 'ATOMIC_RECOVERY_MAIN_REF_REQUIRED');

  const manifestBytes = fs.readFileSync(manifestFile);
  const manifest = validateManifest(JSON.parse(manifestBytes.toString('utf8')));
  const manifestDigest = sha256(manifestBytes);
  assert(repository === manifest.repository, 'ATOMIC_RECOVERY_RUNTIME_REPOSITORY_MISMATCH');
  const expectedRunName = buildRecoveryRunName({
    predecessorRunId: manifest.atomic_run.id,
    currentMainSha: currentMainInput,
    authorizationId,
  });
  const client = makeGitHubClient({repository, token});
  const [repo, main, mainCommit, currentRun, approvalIssue, comments] = await Promise.all([
    client.api(''),
    client.api('/branches/main'),
    client.api(`/commits/${currentMainInput}`),
    client.api(`/actions/runs/${runId}`),
    client.api(`/issues/${manifest.approval_issue}`),
    client.pages(`/issues/${manifest.approval_issue}/comments`),
  ]);
  assert(main?.commit?.sha === currentMainInput, 'ATOMIC_RECOVERY_CURRENT_MAIN_DRIFT');
  assert(mainCommit?.sha === currentMainInput, 'ATOMIC_RECOVERY_CURRENT_MAIN_COMMIT_INVALID');
  assert(approvalIssue?.state === 'open' && Number(approvalIssue?.number) === manifest.approval_issue,
    'ATOMIC_RECOVERY_APPROVAL_ISSUE_NOT_OPEN');
  const repositoryOwner = repo?.owner?.login;
  assert(repositoryOwner, 'ATOMIC_RECOVERY_REPOSITORY_OWNER_INVALID');
  const approval = selectRecoveryApproval(comments, {
    manifest,
    repositoryOwner,
    currentMainSha: currentMainInput,
    currentMainCommittedAt: mainCommit?.commit?.committer?.date
      || mainCommit?.commit?.author?.date,
    manifestDigest,
    authorizationId,
    evaluationTime: new Date().toISOString(),
  });
  const runs = await client.loadWorkflowRuns(currentRun?.workflow_id, runId);
  const oneUse = evaluateRecoveryRunSet(runs, {
    currentRunId: runId,
    currentRunAttempt: runAttempt,
    workflowId: currentRun?.workflow_id,
    predecessorRunId: manifest.atomic_run.id,
    expectedRunName,
    currentMainSha: currentMainInput,
    repositoryOwner,
    approval,
  });
  return {
    repository,
    token,
    currentMainInput,
    authorizationId,
    runId,
    runAttempt,
    manifest,
    manifestDigest,
    expectedRunName,
    client,
    repositoryOwner,
    currentRun,
    approval,
    oneUse,
  };
}
