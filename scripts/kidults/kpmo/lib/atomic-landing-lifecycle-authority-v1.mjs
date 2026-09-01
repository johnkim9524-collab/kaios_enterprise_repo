const SHA40 = /^[0-9a-f]{40}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const WORKFLOW_FILE = 'kpmo-pr-lifecycle-integrity-v1.yml';

const fail = code => { throw new Error(code); };
const ms = (value, code) => {
  const parsed = Date.parse(String(value || ''));
  if (!Number.isFinite(parsed)) fail(code);
  return parsed;
};

function exactRunBinding(run, prNumber, headSha, baseSha) {
  if (!Array.isArray(run?.pull_requests)) return false;
  return run.pull_requests.some(pr => Number(pr?.number) === Number(prNumber)
    && pr?.head?.sha === headSha
    && pr?.base?.sha === baseSha);
}

export function selectAtomicLandingLifecycleAuthority({
  runs,
  artifactsByRunId,
  prNumber,
  headSha,
  baseSha,
  nativeStatuses,
  lastReadyAt,
}) {
  if (!/^\d+$/.test(String(prNumber || ''))) fail('LIFECYCLE_PR_NUMBER_INVALID');
  if (!SHA40.test(headSha || '') || !SHA40.test(baseSha || '')) fail('LIFECYCLE_SHA_BINDING_INVALID');
  if (!Array.isArray(runs)) fail('LIFECYCLE_RUN_SET_INVALID');
  if (!Array.isArray(nativeStatuses) || nativeStatuses.length === 0) fail('LIFECYCLE_NATIVE_STATUS_SET_EMPTY');

  const seenContexts = new Set();
  let nativeFloor = 0;
  const boundNative = nativeStatuses.map(status => {
    const context = String(status?.context || '');
    if (!context || seenContexts.has(context)) fail('LIFECYCLE_NATIVE_STATUS_CONTEXT_INVALID');
    seenContexts.add(context);
    if (status?.state !== 'success') fail(`LIFECYCLE_NATIVE_STATUS_NOT_SUCCESS:${context}`);
    const updatedAt = status.updated_at || status.created_at;
    nativeFloor = Math.max(nativeFloor, ms(updatedAt, `LIFECYCLE_NATIVE_STATUS_TIME_INVALID:${context}`));
    return {
      context,
      status_id: status.id ?? null,
      created_at: status.created_at || null,
      updated_at: updatedAt || null,
    };
  });

  const exactRuns = runs
    .filter(run => exactRunBinding(run, prNumber, headSha, baseSha))
    .sort((a, b) => {
      const timeDelta = ms(b.created_at, 'LIFECYCLE_RUN_TIME_INVALID') - ms(a.created_at, 'LIFECYCLE_RUN_TIME_INVALID');
      return timeDelta || Number(b.id || 0) - Number(a.id || 0);
    });
  if (!exactRuns.length) fail('LIFECYCLE_EXACT_GENERATION_MISSING');

  const latest = exactRuns[0];
  if (latest.status !== 'completed') fail(`LIFECYCLE_LATEST_NOT_TERMINAL:${latest.status || 'missing'}`);
  if (latest.conclusion !== 'success') fail(`LIFECYCLE_LATEST_UNSUPERSEDED_RED:${latest.conclusion || 'missing'}`);

  const lifecycleTime = ms(latest.updated_at || latest.created_at, 'LIFECYCLE_LATEST_TIME_INVALID');
  if (lifecycleTime < nativeFloor) fail('LIFECYCLE_SUCCESS_PRECEDES_NATIVE_SUCCESS');
  if (lastReadyAt && lifecycleTime < ms(lastReadyAt, 'LIFECYCLE_READY_EVENT_TIME_INVALID')) {
    fail('LIFECYCLE_SUCCESS_PRECEDES_LATEST_READY_EVENT');
  }

  const artifacts = artifactsByRunId?.[String(latest.id)];
  if (!Array.isArray(artifacts)) fail('LIFECYCLE_ARTIFACT_SET_MISSING');
  const expectedName = `kpmo-pr-lifecycle-integrity-${prNumber}-${headSha}-${latest.id}-${latest.run_attempt}`;
  const exactArtifacts = artifacts.filter(artifact => artifact?.name === expectedName);
  if (exactArtifacts.length !== 1) fail(`LIFECYCLE_RECEIPT_ARTIFACT_CARDINALITY:${exactArtifacts.length}`);
  const artifact = exactArtifacts[0];
  if (artifact.expired !== false) fail('LIFECYCLE_RECEIPT_ARTIFACT_EXPIRED_OR_AMBIGUOUS');
  if (!Number.isInteger(artifact.size_in_bytes) || artifact.size_in_bytes <= 0) fail('LIFECYCLE_RECEIPT_ARTIFACT_EMPTY');
  if (!DIGEST.test(String(artifact.digest || ''))) fail('LIFECYCLE_RECEIPT_DIGEST_INVALID');

  return {
    state: 'READY_GOVERNED_LIFECYCLE_AUTHORITY_BOUND',
    pull_request: Number(prNumber),
    exact_head_sha: headSha,
    exact_base_sha: baseSha,
    lifecycle_run_id: Number(latest.id),
    lifecycle_run_attempt: Number(latest.run_attempt),
    lifecycle_conclusion: latest.conclusion,
    lifecycle_updated_at: latest.updated_at || latest.created_at,
    lifecycle_artifact_id: Number(artifact.id),
    lifecycle_artifact_name: artifact.name,
    lifecycle_artifact_digest: artifact.digest,
    native_status_evidence: boundNative,
  };
}

export async function resolveAtomicLandingLifecycleAuthority({
  request,
  prNumber,
  headSha,
  baseSha,
  nativeStatuses,
  lastReadyAt,
}) {
  if (typeof request !== 'function') fail('LIFECYCLE_REQUEST_FUNCTION_REQUIRED');
  const runs = [];
  for (let page = 1; page <= 10; page += 1) {
    const payload = await request(`/actions/workflows/${WORKFLOW_FILE}/runs?event=pull_request_target&head_sha=${encodeURIComponent(baseSha)}&per_page=100&page=${page}`);
    if (!Array.isArray(payload?.workflow_runs)) fail('LIFECYCLE_RUNS_API_SHAPE_INVALID');
    runs.push(...payload.workflow_runs);
    if (payload.workflow_runs.length < 100) break;
    if (page === 10) fail('LIFECYCLE_RUNS_PAGINATION_BOUND_EXCEEDED');
  }

  const exactRuns = runs.filter(run => exactRunBinding(run, prNumber, headSha, baseSha));
  if (!exactRuns.length) fail('LIFECYCLE_EXACT_GENERATION_MISSING');
  const artifactsByRunId = {};
  for (const run of exactRuns) {
    const payload = await request(`/actions/runs/${run.id}/artifacts?per_page=100`);
    if (!Array.isArray(payload?.artifacts)) fail(`LIFECYCLE_ARTIFACTS_API_SHAPE_INVALID:${run.id}`);
    if (Number(payload.total_count || 0) > payload.artifacts.length) fail(`LIFECYCLE_ARTIFACTS_PAGINATION_REQUIRED:${run.id}`);
    artifactsByRunId[String(run.id)] = payload.artifacts;
  }

  return selectAtomicLandingLifecycleAuthority({
    runs,
    artifactsByRunId,
    prNumber,
    headSha,
    baseSha,
    nativeStatuses,
    lastReadyAt,
  });
}
