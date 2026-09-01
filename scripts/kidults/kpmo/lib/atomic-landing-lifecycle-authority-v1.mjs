const SHA40 = /^[0-9a-f]{40}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const WORKFLOW_FILE = 'kpmo-pr-lifecycle-integrity-v1.yml';

const fail = code => { throw new Error(code); };
const ms = (value, code) => {
  const parsed = Date.parse(String(value || ''));
  if (!Number.isFinite(parsed)) fail(code);
  return parsed;
};
const artifactName = (prNumber, headSha, run) =>
  `kpmo-pr-lifecycle-integrity-${prNumber}-${headSha}-${run.id}-${run.run_attempt}`;

function runMatchesHead(run, headSha) {
  return run?.event === 'pull_request_target'
    && run?.head_sha === headSha
    && run?.status != null;
}

function exactReceiptArtifact(run, artifactsByRunId, prNumber, headSha) {
  const artifacts = artifactsByRunId?.[String(run.id)];
  if (!Array.isArray(artifacts)) return { artifacts: null, matches: [] };
  const expected = artifactName(prNumber, headSha, run);
  return { artifacts, matches: artifacts.filter(artifact => artifact?.name === expected), expected };
}

function validateReceiptContent(receipt, run, prNumber, headSha, baseSha) {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) fail('LIFECYCLE_RECEIPT_CONTENT_INVALID');
  if (receipt.id !== 'kpmo-pr-lifecycle-integrity-receipt-v1') fail('LIFECYCLE_RECEIPT_ID_INVALID');
  if (Number(receipt.pull_request) !== Number(prNumber)) fail('LIFECYCLE_RECEIPT_PR_MISMATCH');
  if (receipt.exact_head_sha !== headSha) fail('LIFECYCLE_RECEIPT_HEAD_MISMATCH');
  if (receipt.exact_base_sha !== baseSha) fail('LIFECYCLE_RECEIPT_BASE_MISMATCH');
  if (String(receipt.workflow_run_id) !== String(run.id)) fail('LIFECYCLE_RECEIPT_RUN_ID_MISMATCH');
  if (String(receipt.workflow_run_attempt) !== String(run.run_attempt)) fail('LIFECYCLE_RECEIPT_RUN_ATTEMPT_MISMATCH');
  if (receipt.event_name !== 'pull_request_target') fail('LIFECYCLE_RECEIPT_EVENT_MISMATCH');
  if (receipt.final_live_reread !== true) fail('LIFECYCLE_RECEIPT_FINAL_REREAD_REQUIRED');
  if (receipt.state !== 'READY_GOVERNED') fail(`LIFECYCLE_RECEIPT_NOT_READY_GOVERNED:${receipt.state || 'missing'}`);
}

export function selectAtomicLandingLifecycleAuthority({
  runs,
  artifactsByRunId,
  receiptsByRunId,
  prNumber,
  headSha,
  baseSha,
  prCreatedAt,
  nativeStatuses,
  lastReadyAt,
}) {
  if (!/^\d+$/.test(String(prNumber || ''))) fail('LIFECYCLE_PR_NUMBER_INVALID');
  if (!SHA40.test(headSha || '') || !SHA40.test(baseSha || '')) fail('LIFECYCLE_SHA_BINDING_INVALID');
  if (!Array.isArray(runs)) fail('LIFECYCLE_RUN_SET_INVALID');
  const prCreationTime = ms(prCreatedAt, 'LIFECYCLE_PR_CREATED_AT_INVALID');
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
    .filter(run => {
      if (!runMatchesHead(run, headSha)) return false;
      if (ms(run.created_at, 'LIFECYCLE_RUN_TIME_INVALID') < prCreationTime) return false;
      const { matches } = exactReceiptArtifact(run, artifactsByRunId, prNumber, headSha);
      return matches.length > 0;
    })
    .sort((a, b) => {
      const timeDelta = ms(b.created_at, 'LIFECYCLE_RUN_TIME_INVALID') - ms(a.created_at, 'LIFECYCLE_RUN_TIME_INVALID');
      return timeDelta || Number(b.id || 0) - Number(a.id || 0);
    });
  if (!exactRuns.length) {
    const preCreationAlias = runs.some(run =>
      runMatchesHead(run, headSha)
      && ms(run.created_at, 'LIFECYCLE_RUN_TIME_INVALID') < prCreationTime
      && exactReceiptArtifact(run, artifactsByRunId, prNumber, headSha).matches.length > 0);
    if (preCreationAlias) fail('LIFECYCLE_PRECREATION_RUN_ALIAS_REJECTED');
    fail('LIFECYCLE_EXACT_GENERATION_MISSING');
  }

  const latest = exactRuns[0];
  if (latest.status !== 'completed') fail(`LIFECYCLE_LATEST_NOT_TERMINAL:${latest.status || 'missing'}`);
  if (latest.conclusion !== 'success') fail(`LIFECYCLE_LATEST_UNSUPERSEDED_RED:${latest.conclusion || 'missing'}`);

  const lifecycleTime = ms(latest.updated_at || latest.created_at, 'LIFECYCLE_LATEST_TIME_INVALID');
  if (lifecycleTime < nativeFloor) fail('LIFECYCLE_SUCCESS_PRECEDES_NATIVE_SUCCESS');
  if (lastReadyAt && lifecycleTime < ms(lastReadyAt, 'LIFECYCLE_READY_EVENT_TIME_INVALID')) {
    fail('LIFECYCLE_SUCCESS_PRECEDES_LATEST_READY_EVENT');
  }

  const { matches: exactArtifacts } = exactReceiptArtifact(latest, artifactsByRunId, prNumber, headSha);
  if (exactArtifacts.length !== 1) fail(`LIFECYCLE_RECEIPT_ARTIFACT_CARDINALITY:${exactArtifacts.length}`);
  const artifact = exactArtifacts[0];
  if (artifact.expired !== false) fail('LIFECYCLE_RECEIPT_ARTIFACT_EXPIRED_OR_AMBIGUOUS');
  if (!Number.isInteger(artifact.size_in_bytes) || artifact.size_in_bytes <= 0) fail('LIFECYCLE_RECEIPT_ARTIFACT_EMPTY');
  if (!DIGEST.test(String(artifact.digest || ''))) fail('LIFECYCLE_RECEIPT_DIGEST_INVALID');

  const receipt = receiptsByRunId?.[String(latest.id)];
  validateReceiptContent(receipt, latest, prNumber, headSha, baseSha);

  return {
    state: 'READY_GOVERNED_LIFECYCLE_AUTHORITY_BOUND',
    pull_request: Number(prNumber),
    exact_head_sha: headSha,
    exact_base_sha: baseSha,
    pull_request_created_at: prCreatedAt,
    lifecycle_run_id: Number(latest.id),
    lifecycle_run_attempt: Number(latest.run_attempt),
    lifecycle_conclusion: latest.conclusion,
    lifecycle_updated_at: latest.updated_at || latest.created_at,
    lifecycle_artifact_id: Number(artifact.id),
    lifecycle_artifact_name: artifact.name,
    lifecycle_artifact_digest: artifact.digest,
    lifecycle_receipt_state: receipt.state,
    native_status_evidence: boundNative,
  };
}

export async function resolveAtomicLandingLifecycleAuthority({
  request,
  readArtifactReceipt,
  prNumber,
  headSha,
  baseSha,
  prCreatedAt,
  nativeStatuses,
  lastReadyAt,
}) {
  if (typeof request !== 'function') fail('LIFECYCLE_REQUEST_FUNCTION_REQUIRED');
  if (typeof readArtifactReceipt !== 'function') fail('LIFECYCLE_ARTIFACT_READER_REQUIRED');
  const runs = [];
  for (let page = 1; page <= 10; page += 1) {
    const payload = await request(`/actions/workflows/${WORKFLOW_FILE}/runs?event=pull_request_target&head_sha=${encodeURIComponent(headSha)}&per_page=100&page=${page}`);
    if (!Array.isArray(payload?.workflow_runs)) fail('LIFECYCLE_RUNS_API_SHAPE_INVALID');
    runs.push(...payload.workflow_runs);
    if (payload.workflow_runs.length < 100) break;
    if (page === 10) fail('LIFECYCLE_RUNS_PAGINATION_BOUND_EXCEEDED');
  }

  const prCreationTime = ms(prCreatedAt, 'LIFECYCLE_PR_CREATED_AT_INVALID');
  const allHeadRuns = runs.filter(run => runMatchesHead(run, headSha));
  const headRuns = allHeadRuns.filter(run =>
    ms(run.created_at, 'LIFECYCLE_RUN_TIME_INVALID') >= prCreationTime);
  if (!headRuns.length) {
    if (allHeadRuns.length) fail('LIFECYCLE_ONLY_PRECREATION_RUNS_FOUND');
    fail('LIFECYCLE_HEAD_GENERATION_MISSING');
  }
  const artifactsByRunId = {};
  const receiptsByRunId = {};
  for (const run of headRuns) {
    const payload = await request(`/actions/runs/${run.id}/artifacts?per_page=100`);
    if (!Array.isArray(payload?.artifacts)) fail(`LIFECYCLE_ARTIFACTS_API_SHAPE_INVALID:${run.id}`);
    if (Number(payload.total_count || 0) > payload.artifacts.length) fail(`LIFECYCLE_ARTIFACTS_PAGINATION_REQUIRED:${run.id}`);
    artifactsByRunId[String(run.id)] = payload.artifacts;
    const { matches } = exactReceiptArtifact(run, artifactsByRunId, prNumber, headSha);
    if (matches.length === 1) receiptsByRunId[String(run.id)] = await readArtifactReceipt(matches[0]);
  }

  return selectAtomicLandingLifecycleAuthority({
    runs,
    artifactsByRunId,
    receiptsByRunId,
    prNumber,
    headSha,
    baseSha,
    prCreatedAt,
    nativeStatuses,
    lastReadyAt,
  });
}
