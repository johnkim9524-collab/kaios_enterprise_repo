const SHA40 = /^[0-9a-f]{40}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const WORKFLOW_FILE = 'kpmo-pr-lifecycle-integrity-v1.yml';

export const SCOPE_AWARE_CONTEXT = 'KIDULTS Scope-Aware Authoritative Status V1';
export const LANDING_READINESS_CONTEXT = 'KIDULTS Landing Readiness V1';
export const GOVERNED_LANDING_CONTEXT = 'KIDULTS Governed Landing Authorization V1';
export const GOVERNED_LANDING_PENDING_DESCRIPTION = 'Ready; operation-specific atomic landing is required';
export const GOVERNED_LANDING_NORMAL_READY_DESCRIPTION = 'Ready lifecycle verified; operation-specific landing authority required';
export const READY_GOVERNED_REASON = 'NATIVE_SCOPE_SUCCESS_AND_OPERATION_SPECIFIC_ATOMIC_LANDING_PENDING';
export const OWNER_RESERVED_OPERATION_AUTHORITY_PENDING_STATE = 'READY_VERIFIED_NON_PROMOTABLE';
export const OWNER_RESERVED_OPERATION_AUTHORITY_PENDING_REASON = 'NATIVE_SCOPE_SUCCESS_OPERATION_AUTHORITY_PENDING';

export function isAtomicLandingNativeStatusReady(status) {
  const context = String(status?.context || '');
  const state = String(status?.state || 'missing');
  if (context === LANDING_READINESS_CONTEXT) {
    return state === 'success' && (status?.creator === 'github-actions[bot]' || status?.creator?.login === 'github-actions[bot]'
        || (!status?.creator && /^https:\/\/avatars\.githubusercontent\.com\/in\/15368(?:\?|$)/.test(String(status.avatar_url || ''))))
      && ['Ready lifecycle verified; operation-specific landing authority required',
        'Ready lifecycle verified; non-governed scope uses protected-main status path'].includes(status.description);
  }
  if (context === GOVERNED_LANDING_CONTEXT) {
    if (state !== 'pending') return false;
    const description = String(status?.description || '');
    if (description === GOVERNED_LANDING_PENDING_DESCRIPTION) return true;
    return description === GOVERNED_LANDING_NORMAL_READY_DESCRIPTION
      && status?.creator?.login === 'github-actions[bot]';
  }
  if (context === SCOPE_AWARE_CONTEXT) return state === 'success';
  return state === 'success';
}

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

function runMatchesGeneration(run, headSha, prNumber) {
  if (!runMatchesHead(run, headSha)) return false;
  if (!Array.isArray(run.pull_requests)) return false;
  return run.pull_requests.some(pr => Number(pr?.number) === Number(prNumber));
}

function exactReceiptArtifact(run, artifactsByRunId, prNumber, headSha) {
  const artifacts = artifactsByRunId?.[String(run.id)];
  if (!Array.isArray(artifacts)) return { artifacts: null, matches: [] };
  const expected = artifactName(prNumber, headSha, run);
  return { artifacts, matches: artifacts.filter(artifact => artifact?.name === expected), expected };
}

// GitHub timestamps have second precision: equality cannot prove this Ready cycle.
// A Ready cycle is a lifecycle boundary even when the Git head is unchanged.
export function isLandingReadinessCurrent(status, readyAt, evaluatedAt) {
  const readyTime = Date.parse(String(readyAt || ''));
  const statusTime = Date.parse(String(status?.updated_at || status?.created_at || ''));
  const evaluatedTime = Date.parse(String(evaluatedAt || ''));
  return status?.context === LANDING_READINESS_CONTEXT
    && isAtomicLandingNativeStatusReady(status)
    && Number.isSafeInteger(Number(status.id ?? status.status_id)) && Number(status.id ?? status.status_id) > 0
    && Number.isFinite(readyTime) && Number.isFinite(statusTime) && Number.isFinite(evaluatedTime)
    && statusTime > readyTime && statusTime <= evaluatedTime;
}

function validateReceiptContent(receipt, run, prNumber, headSha, baseSha, boundNative, lastReadyAt, lastReadyEventId, lastReadyEventActor) {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) fail('LIFECYCLE_RECEIPT_CONTENT_INVALID');
  if (receipt.id !== 'kpmo-pr-lifecycle-integrity-receipt-v1') fail('LIFECYCLE_RECEIPT_ID_INVALID');
  if (Number(receipt.pull_request) !== Number(prNumber)) fail('LIFECYCLE_RECEIPT_PR_MISMATCH');
  if (receipt.exact_head_sha !== headSha) fail('LIFECYCLE_RECEIPT_HEAD_MISMATCH');
  if (receipt.exact_base_sha !== baseSha) fail('LIFECYCLE_RECEIPT_BASE_MISMATCH');
  if (String(receipt.workflow_run_id) !== String(run.id)) fail('LIFECYCLE_RECEIPT_RUN_ID_MISMATCH');
  if (String(receipt.workflow_run_attempt) !== String(run.run_attempt)) fail('LIFECYCLE_RECEIPT_RUN_ATTEMPT_MISMATCH');
  if (receipt.event_name !== 'pull_request_target') fail('LIFECYCLE_RECEIPT_EVENT_MISMATCH');
  if (receipt.final_live_reread !== true) fail('LIFECYCLE_RECEIPT_FINAL_REREAD_REQUIRED');
  ms(receipt.lifecycle_evaluated_at, 'LIFECYCLE_RECEIPT_EVALUATED_AT_INVALID');
  if (!Number.isInteger(receipt.latest_ready_event_id) || receipt.latest_ready_event_id <= 0) fail('LIFECYCLE_RECEIPT_READY_EVENT_ID_INVALID');
  if (Number(receipt.latest_ready_event_id) !== Number(lastReadyEventId)
    || receipt.latest_ready_event_at !== lastReadyAt
    || receipt.latest_ready_event_actor !== lastReadyEventActor) {
    fail('LIFECYCLE_RECEIPT_READY_EVENT_MISMATCH');
  }
  if (receipt.state === 'READY_GOVERNED' && receipt.reason !== READY_GOVERNED_REASON) {
    fail(`LIFECYCLE_RECEIPT_REASON_INVALID:${receipt.reason || 'missing'}`);
  }
  if (receipt.state === OWNER_RESERVED_OPERATION_AUTHORITY_PENDING_STATE
    && receipt.reason !== OWNER_RESERVED_OPERATION_AUTHORITY_PENDING_REASON) {
    fail(`LIFECYCLE_RECEIPT_REASON_INVALID:${receipt.reason || 'missing'}`);
  }
  const readyGovernedReceipt = receipt.state === 'READY_GOVERNED'
    && receipt.reason === READY_GOVERNED_REASON;
  const ownerReservedPendingReceipt = receipt.state === OWNER_RESERVED_OPERATION_AUTHORITY_PENDING_STATE
    && receipt.reason === OWNER_RESERVED_OPERATION_AUTHORITY_PENDING_REASON
    && receipt.manual_merge_authority === false
    && receipt.atomic_landing_only === false;
  if (!readyGovernedReceipt && !ownerReservedPendingReceipt) {
    fail(`LIFECYCLE_RECEIPT_NOT_ATOMIC_LANDING_CONSUMABLE:${receipt.state || 'missing'}`);
  }
  if (receipt.promotion_eligible !== false) fail('LIFECYCLE_RECEIPT_DIRECT_PROMOTION_FORBIDDEN');
  if (receipt.validator_authority !== 'CONTROL_ONLY') fail('LIFECYCLE_RECEIPT_AUTHORITY_INVALID');
  if (!Array.isArray(receipt.native_status_evidence)) fail('LIFECYCLE_RECEIPT_NATIVE_STATUS_EVIDENCE_MISSING');
  if (receipt.native_status_evidence.length < boundNative.length) fail('LIFECYCLE_RECEIPT_NATIVE_STATUS_CARDINALITY');
  const boundNativeContexts = new Set(boundNative.map(status => status.context));
  const allowedReceiptOnlyContexts = new Set([GOVERNED_LANDING_CONTEXT, LANDING_READINESS_CONTEXT]);
  for (const item of receipt.native_status_evidence) {
    const context = String(item?.context || '');
    if (!boundNativeContexts.has(context) && !allowedReceiptOnlyContexts.has(context)) {
      fail(`LIFECYCLE_RECEIPT_NATIVE_CONTEXT_UNEXPECTED:${context || 'missing'}`);
    }
  }
  const receiptOnlyGoverned = receipt.native_status_evidence
    .filter(item => item?.context === GOVERNED_LANDING_CONTEXT && !boundNativeContexts.has(GOVERNED_LANDING_CONTEXT));
  if (receiptOnlyGoverned.length > 1) {
    fail(`LIFECYCLE_RECEIPT_NATIVE_CONTEXT_CARDINALITY:${GOVERNED_LANDING_CONTEXT}:${receiptOnlyGoverned.length}`);
  }
  if (receiptOnlyGoverned.length === 1) {
    const governedState = String(receiptOnlyGoverned[0]?.state || 'missing');
    const governedDescription = String(receiptOnlyGoverned[0]?.description || '');
    const governedReady = governedState === 'pending'
      && (governedDescription === GOVERNED_LANDING_PENDING_DESCRIPTION
        || governedDescription === GOVERNED_LANDING_NORMAL_READY_DESCRIPTION);
    if (!governedReady) {
      fail(`LIFECYCLE_RECEIPT_GOVERNED_STATUS_NOT_LANDING_READY:${governedState}`);
    }
  }

  const receiptOnlyReadiness = receipt.native_status_evidence.filter(item => item?.context === LANDING_READINESS_CONTEXT && !boundNativeContexts.has(LANDING_READINESS_CONTEXT));
  if (receiptOnlyReadiness.length > 1 || receiptOnlyReadiness.some(item => !isAtomicLandingNativeStatusReady(item))) {
    fail('LIFECYCLE_RECEIPT_READINESS_STATUS_INVALID');
  }

  let receiptNativeFloor = 0;
  for (const item of receiptOnlyReadiness) {
    const updatedTime = ms(item.updated_at || item.created_at, 'LIFECYCLE_RECEIPT_READINESS_TIME_INVALID');
    if (updatedTime <= ms(lastReadyAt, 'LIFECYCLE_READY_EVENT_TIME_INVALID')) {
      fail('LIFECYCLE_RECEIPT_READINESS_PRECEDES_READY_EVENT');
    }
    if (!Number.isInteger(Number(item.status_id)) || Number(item.status_id) <= 0) {
      fail('LIFECYCLE_RECEIPT_READINESS_STATUS_ID_INVALID');
    }
    receiptNativeFloor = Math.max(receiptNativeFloor, updatedTime);
  }
  let exactStatusIdentity = true;
  for (const expected of boundNative) {
    const matches = receipt.native_status_evidence.filter(item => item?.context === expected.context);
    if (matches.length !== 1) fail(`LIFECYCLE_RECEIPT_NATIVE_CONTEXT_CARDINALITY:${expected.context}:${matches.length}`);
    const actual = matches[0];
    if (String(actual.state || '') !== expected.state
      || String(actual.description || '') !== String(expected.description || '')) {
      fail(`LIFECYCLE_RECEIPT_NATIVE_STATUS_MISMATCH:${expected.context}`);
    }
    if (!Number.isInteger(Number(actual.status_id)) || Number(actual.status_id) <= 0) {
      fail(`LIFECYCLE_RECEIPT_NATIVE_STATUS_ID_INVALID:${expected.context}`);
    }
    if (!Number.isInteger(Number(expected.status_id)) || Number(expected.status_id) <= 0) {
      fail(`LIFECYCLE_NATIVE_STATUS_ID_INVALID:${expected.context}`);
    }
    const actualUpdatedAt = actual.updated_at || actual.created_at;
    const expectedUpdatedAt = expected.updated_at || expected.created_at;
    const actualUpdatedTime = ms(actualUpdatedAt, `LIFECYCLE_RECEIPT_NATIVE_STATUS_TIME_INVALID:${expected.context}`);
    const expectedUpdatedTime = ms(expectedUpdatedAt, `LIFECYCLE_NATIVE_STATUS_TIME_INVALID:${expected.context}`);
    if (expectedUpdatedTime < actualUpdatedTime) {
      fail(`LIFECYCLE_NATIVE_STATUS_REGRESSED_BEHIND_RECEIPT:${expected.context}`);
    }
    // GitHub commit statuses are mutable context projections. A later workflow
    // may republish the same landing-ready semantic state after the lifecycle
    // receipt is sealed. Preserve the receipt identity as evidence, accept only
    // a time-monotonic semantic alias, and continue to reject every state or
    // description change fail-closed.
    const sameStatusIdentity = String(actual.status_id) === String(expected.status_id);
    if (sameStatusIdentity && String(actualUpdatedAt) !== String(expectedUpdatedAt)) {
      fail(`LIFECYCLE_NATIVE_STATUS_IDENTITY_MUTATED:${expected.context}`);
    }
    exactStatusIdentity = exactStatusIdentity && sameStatusIdentity;
    receiptNativeFloor = Math.max(receiptNativeFloor, actualUpdatedTime);
  }
  return {
    receiptNativeFloor,
    exactStatusIdentity,
    lifecycleContractMode: readyGovernedReceipt
      ? 'READY_GOVERNED_NATIVE_ATOMIC_SIGNAL'
      : 'OWNER_RESERVED_EXACT_APPROVAL_REQUIRED_SIGNAL',
  };
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
  lastReadyEventId,
  lastReadyEventActor,
}) {
  if (!/^\d+$/.test(String(prNumber || ''))) fail('LIFECYCLE_PR_NUMBER_INVALID');
  if (!SHA40.test(headSha || '') || !SHA40.test(baseSha || '')) fail('LIFECYCLE_SHA_BINDING_INVALID');
  if (!Array.isArray(runs)) fail('LIFECYCLE_RUN_SET_INVALID');
  const prCreationTime = ms(prCreatedAt, 'LIFECYCLE_PR_CREATED_AT_INVALID');
  const readyEventTime = ms(lastReadyAt, 'LIFECYCLE_READY_EVENT_TIME_INVALID');
  if (!Number.isInteger(lastReadyEventId) || lastReadyEventId <= 0) fail('LIFECYCLE_READY_EVENT_ID_INVALID');
  if (typeof lastReadyEventActor !== 'string' || lastReadyEventActor.length === 0) fail('LIFECYCLE_READY_EVENT_ACTOR_INVALID');
  if (!Array.isArray(nativeStatuses) || nativeStatuses.length === 0) fail('LIFECYCLE_NATIVE_STATUS_SET_EMPTY');

  const seenContexts = new Set();
  const boundNative = nativeStatuses.map(status => {
    const context = String(status?.context || '');
    if (!context || seenContexts.has(context)) fail('LIFECYCLE_NATIVE_STATUS_CONTEXT_INVALID');
    seenContexts.add(context);
    if (!isAtomicLandingNativeStatusReady(status)) {
      fail(`LIFECYCLE_NATIVE_STATUS_NOT_LANDING_READY:${context}:${String(status?.state || 'missing')}`);
    }
    const updatedAt = status.updated_at || status.created_at;
    const updatedTime = ms(updatedAt, `LIFECYCLE_NATIVE_STATUS_TIME_INVALID:${context}`);
    if (context === LANDING_READINESS_CONTEXT && updatedTime <= readyEventTime) fail('LIFECYCLE_NATIVE_READINESS_PRECEDES_READY_EVENT');
    return {
      context,
      state: String(status.state),
      description: status.description || null,
      status_id: status.id ?? null,
      created_at: status.created_at || null,
      updated_at: updatedAt || null,
    };
  });

  const ambiguousPostCreationRuns = runs.filter(run =>
    runMatchesHead(run, headSha)
    && ms(run.created_at, 'LIFECYCLE_RUN_TIME_INVALID') >= prCreationTime
    && (!Array.isArray(run.pull_requests) || run.pull_requests.length === 0));
  if (ambiguousPostCreationRuns.length) fail('LIFECYCLE_RUN_PR_ASSOCIATION_INVALID');

  const exactRuns = runs
    .filter(run => runMatchesGeneration(run, headSha, prNumber))
    .filter(run => ms(run.created_at, 'LIFECYCLE_RUN_TIME_INVALID') >= prCreationTime)
    .sort((a, b) => {
      const timeDelta = ms(b.created_at, 'LIFECYCLE_RUN_TIME_INVALID') - ms(a.created_at, 'LIFECYCLE_RUN_TIME_INVALID');
      return timeDelta || Number(b.id || 0) - Number(a.id || 0);
    });
  if (!exactRuns.length) {
    const preCreationAlias = runs.some(run =>
      runMatchesGeneration(run, headSha, prNumber)
      && ms(run.created_at, 'LIFECYCLE_RUN_TIME_INVALID') < prCreationTime);
    if (preCreationAlias) fail('LIFECYCLE_PRECREATION_RUN_ALIAS_REJECTED');
    fail('LIFECYCLE_EXACT_GENERATION_MISSING');
  }

  // The newest exact PR/head generation is authoritative even when its artifact
  // has not been uploaded. Filtering by artifact before selecting the newest run
  // would allow an older green to mask a newer pending, failed, or artifactless run.
  const latest = exactRuns[0];
  if (latest.status !== 'completed') fail(`LIFECYCLE_LATEST_NOT_TERMINAL:${latest.status || 'missing'}`);
  if (latest.conclusion !== 'success') fail(`LIFECYCLE_LATEST_UNSUPERSEDED_RED:${latest.conclusion || 'missing'}`);

  const { matches: exactArtifacts } = exactReceiptArtifact(latest, artifactsByRunId, prNumber, headSha);
  if (exactArtifacts.length !== 1) fail(`LIFECYCLE_RECEIPT_ARTIFACT_CARDINALITY:${exactArtifacts.length}`);
  const artifact = exactArtifacts[0];
  if (artifact.expired !== false) fail('LIFECYCLE_RECEIPT_ARTIFACT_EXPIRED_OR_AMBIGUOUS');
  if (!Number.isInteger(artifact.size_in_bytes) || artifact.size_in_bytes <= 0) fail('LIFECYCLE_RECEIPT_ARTIFACT_EMPTY');
  if (!DIGEST.test(String(artifact.digest || ''))) fail('LIFECYCLE_RECEIPT_DIGEST_INVALID');

  const receipt = receiptsByRunId?.[String(latest.id)];
  const nativeBinding = validateReceiptContent(
    receipt,
    latest,
    prNumber,
    headSha,
    baseSha,
    boundNative,
    lastReadyAt,
    lastReadyEventId,
    lastReadyEventActor,
  );
  const lifecycleEvaluatedTime = ms(receipt.lifecycle_evaluated_at, 'LIFECYCLE_RECEIPT_EVALUATED_AT_INVALID');
  if (lifecycleEvaluatedTime < nativeBinding.receiptNativeFloor) fail('LIFECYCLE_SUCCESS_PRECEDES_NATIVE_READY_SIGNAL');
  if (lifecycleEvaluatedTime < readyEventTime) fail('LIFECYCLE_SUCCESS_PRECEDES_LATEST_READY_EVENT');

  return {
    state: nativeBinding.lifecycleContractMode === 'READY_GOVERNED_NATIVE_ATOMIC_SIGNAL'
      ? 'READY_GOVERNED_LIFECYCLE_AUTHORITY_BOUND'
      : 'OWNER_RESERVED_LIFECYCLE_CONTROL_BOUND_EXACT_APPROVAL_REQUIRED',
    lifecycle_contract_mode: nativeBinding.lifecycleContractMode,
    owner_exact_head_approval_required: nativeBinding.lifecycleContractMode !== 'READY_GOVERNED_NATIVE_ATOMIC_SIGNAL',
    pull_request: Number(prNumber),
    exact_head_sha: headSha,
    exact_base_sha: baseSha,
    pull_request_created_at: prCreatedAt,
    lifecycle_run_id: Number(latest.id),
    lifecycle_run_attempt: Number(latest.run_attempt),
    lifecycle_conclusion: latest.conclusion,
    lifecycle_updated_at: latest.updated_at || latest.created_at,
    lifecycle_evaluated_at: receipt.lifecycle_evaluated_at,
    latest_ready_event_id: receipt.latest_ready_event_id,
    latest_ready_event_at: receipt.latest_ready_event_at,
    latest_ready_event_actor: receipt.latest_ready_event_actor,
    lifecycle_artifact_id: Number(artifact.id),
    lifecycle_artifact_name: artifact.name,
    lifecycle_artifact_digest: artifact.digest,
    lifecycle_receipt_state: receipt.state,
    lifecycle_receipt_reason: receipt.reason,
    native_status_binding_mode: nativeBinding.exactStatusIdentity
      ? 'EXACT_STATUS_IDENTITY'
      : 'SEMANTICALLY_EQUIVALENT_MONOTONIC_NATIVE_ALIAS',
    lifecycle_receipt_native_status_evidence: receipt.native_status_evidence,
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
  lastReadyEventId,
  lastReadyEventActor,
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
  const allGenerationRuns = runs.filter(run => runMatchesGeneration(run, headSha, prNumber));
  const ambiguousPostCreationRuns = runs.filter(run =>
    runMatchesHead(run, headSha)
    && ms(run.created_at, 'LIFECYCLE_RUN_TIME_INVALID') >= prCreationTime
    && (!Array.isArray(run.pull_requests) || run.pull_requests.length === 0));
  if (ambiguousPostCreationRuns.length) fail('LIFECYCLE_RUN_PR_ASSOCIATION_INVALID');
  const generationRuns = allGenerationRuns.filter(run =>
    ms(run.created_at, 'LIFECYCLE_RUN_TIME_INVALID') >= prCreationTime);
  if (!generationRuns.length) {
    if (allGenerationRuns.length) fail('LIFECYCLE_ONLY_PRECREATION_RUNS_FOUND');
    fail('LIFECYCLE_HEAD_GENERATION_MISSING');
  }
  const artifactsByRunId = {};
  const receiptsByRunId = {};
  for (const run of generationRuns) {
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
    lastReadyEventId,
    lastReadyEventActor,
  });
}
