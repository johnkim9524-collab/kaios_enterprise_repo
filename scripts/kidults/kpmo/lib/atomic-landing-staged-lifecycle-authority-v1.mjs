const SHA40 = /^[0-9a-f]{40}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const REPOSITORY = /^[^/]+\/[^/]+$/;
const AUTHORITY_ID = 'kidults-atomic-landing-lifecycle-authority-receipt-v1';
const AUTHORITY_VERSION = '1.1.0';
const AUTHORITY_STATE = 'READY_GOVERNED_LIFECYCLE_AUTHORITY_BOUND';
const LIFECYCLE_RECEIPT_STATE = 'READY_GOVERNED';
const LIFECYCLE_RECEIPT_REASON = 'NATIVE_SCOPE_SUCCESS_AND_OPERATION_SPECIFIC_ATOMIC_LANDING_PENDING';

const fail = code => {
  const error = new Error(code);
  error.code = code;
  throw error;
};

const timestamp = (value, code) => {
  const parsed = Date.parse(String(value || ''));
  if (!Number.isFinite(parsed)) fail(code);
  return parsed;
};

const positiveInteger = (value, code) => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) fail(code);
  return parsed;
};

export function assertAtomicLandingStagedLifecycleAuthority(receipt, {
  repository,
  prNumber,
  headSha,
  baseSha,
  readyEvent,
} = {}) {
  if (!REPOSITORY.test(String(repository || ''))
    || !/^\d+$/.test(String(prNumber || ''))
    || !SHA40.test(String(headSha || ''))
    || !SHA40.test(String(baseSha || ''))) {
    fail('ATOMIC_STAGED_LIFECYCLE_BINDING_INVALID');
  }
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    fail('ATOMIC_STAGED_LIFECYCLE_RECEIPT_INVALID');
  }
  if (!readyEvent || typeof readyEvent !== 'object' || Array.isArray(readyEvent)) {
    fail('ATOMIC_STAGED_LIFECYCLE_READY_EVENT_INVALID');
  }

  const readyEventId = positiveInteger(
    readyEvent.id,
    'ATOMIC_STAGED_LIFECYCLE_READY_EVENT_ID_INVALID',
  );
  if (readyEvent.event !== 'ready_for_review') {
    fail('ATOMIC_STAGED_LIFECYCLE_READY_EVENT_TYPE_INVALID');
  }
  if (typeof readyEvent.actor !== 'string' || readyEvent.actor.length === 0) {
    fail('ATOMIC_STAGED_LIFECYCLE_READY_EVENT_ACTOR_INVALID');
  }
  if (readyEvent.direct_repository_owner !== true) {
    fail('ATOMIC_STAGED_LIFECYCLE_READY_EVENT_NOT_DIRECT_OWNER');
  }
  if (readyEvent.performed_via_github_app !== null) {
    fail('ATOMIC_STAGED_LIFECYCLE_READY_EVENT_APP_MEDIATED');
  }
  const readyEventTime = timestamp(
    readyEvent.created_at,
    'ATOMIC_STAGED_LIFECYCLE_READY_EVENT_TIME_INVALID',
  );

  if (receipt.id !== AUTHORITY_ID) fail('ATOMIC_STAGED_LIFECYCLE_RECEIPT_ID_INVALID');
  if (receipt.version !== AUTHORITY_VERSION) fail('ATOMIC_STAGED_LIFECYCLE_RECEIPT_VERSION_INVALID');
  if (receipt.repository !== repository) fail('ATOMIC_STAGED_LIFECYCLE_REPOSITORY_MISMATCH');
  if (Number(receipt.pull_request) !== Number(prNumber)) fail('ATOMIC_STAGED_LIFECYCLE_PR_MISMATCH');
  if (receipt.exact_head_sha !== headSha) fail('ATOMIC_STAGED_LIFECYCLE_HEAD_MISMATCH');
  if (receipt.exact_base_sha !== baseSha) fail('ATOMIC_STAGED_LIFECYCLE_BASE_MISMATCH');
  if (receipt.state !== AUTHORITY_STATE) fail('ATOMIC_STAGED_LIFECYCLE_STATE_INVALID');

  const checkedAt = timestamp(
    receipt.checked_at,
    'ATOMIC_STAGED_LIFECYCLE_CHECKED_AT_INVALID',
  );
  timestamp(
    receipt.pull_request_created_at,
    'ATOMIC_STAGED_LIFECYCLE_PR_CREATED_AT_INVALID',
  );
  timestamp(
    receipt.lifecycle_updated_at,
    'ATOMIC_STAGED_LIFECYCLE_UPDATED_AT_INVALID',
  );
  const lifecycleEvaluatedAt = timestamp(
    receipt.lifecycle_evaluated_at,
    'ATOMIC_STAGED_LIFECYCLE_EVALUATED_AT_INVALID',
  );
  if (lifecycleEvaluatedAt < readyEventTime) {
    fail('ATOMIC_STAGED_LIFECYCLE_EVALUATION_PRECEDES_READY');
  }
  if (checkedAt < lifecycleEvaluatedAt) {
    fail('ATOMIC_STAGED_LIFECYCLE_CHECK_PRECEDES_EVALUATION');
  }

  const lifecycleRunId = positiveInteger(
    receipt.lifecycle_run_id,
    'ATOMIC_STAGED_LIFECYCLE_RUN_ID_INVALID',
  );
  const lifecycleRunAttempt = positiveInteger(
    receipt.lifecycle_run_attempt,
    'ATOMIC_STAGED_LIFECYCLE_RUN_ATTEMPT_INVALID',
  );
  if (receipt.lifecycle_conclusion !== 'success') {
    fail('ATOMIC_STAGED_LIFECYCLE_CONCLUSION_INVALID');
  }
  const lifecycleArtifactId = positiveInteger(
    receipt.lifecycle_artifact_id,
    'ATOMIC_STAGED_LIFECYCLE_ARTIFACT_ID_INVALID',
  );
  const expectedArtifactName = `kpmo-pr-lifecycle-integrity-${prNumber}-${headSha}-${lifecycleRunId}-${lifecycleRunAttempt}`;
  if (receipt.lifecycle_artifact_name !== expectedArtifactName) {
    fail('ATOMIC_STAGED_LIFECYCLE_ARTIFACT_NAME_MISMATCH');
  }
  if (!DIGEST.test(String(receipt.lifecycle_artifact_digest || ''))) {
    fail('ATOMIC_STAGED_LIFECYCLE_ARTIFACT_DIGEST_INVALID');
  }
  if (receipt.lifecycle_receipt_state !== LIFECYCLE_RECEIPT_STATE) {
    fail('ATOMIC_STAGED_LIFECYCLE_INNER_STATE_INVALID');
  }
  if (receipt.lifecycle_receipt_reason !== LIFECYCLE_RECEIPT_REASON) {
    fail('ATOMIC_STAGED_LIFECYCLE_INNER_REASON_INVALID');
  }

  const receiptReadyEventId = positiveInteger(
    receipt.latest_ready_event_id,
    'ATOMIC_STAGED_LIFECYCLE_RECEIPT_READY_EVENT_ID_INVALID',
  );
  if (receiptReadyEventId !== readyEventId
    || receipt.latest_ready_event_at !== readyEvent.created_at
    || receipt.latest_ready_event_actor !== readyEvent.actor) {
    fail('ATOMIC_STAGED_LIFECYCLE_READY_TUPLE_MISMATCH');
  }
  if (receipt.latest_ready_event_direct_repository_owner !== true) {
    fail('ATOMIC_STAGED_LIFECYCLE_RECEIPT_READY_NOT_DIRECT_OWNER');
  }
  if (receipt.latest_ready_event_performed_via_github_app !== null) {
    fail('ATOMIC_STAGED_LIFECYCLE_RECEIPT_READY_APP_MEDIATED');
  }

  if (!Array.isArray(receipt.native_status_evidence)
    || receipt.native_status_evidence.length === 0) {
    fail('ATOMIC_STAGED_LIFECYCLE_NATIVE_EVIDENCE_INVALID');
  }
  const contexts = new Set();
  for (const item of receipt.native_status_evidence) {
    const context = String(item?.context || '');
    if (!context || contexts.has(context)) {
      fail('ATOMIC_STAGED_LIFECYCLE_NATIVE_CONTEXT_INVALID');
    }
    contexts.add(context);
    if (typeof item?.state !== 'string' || item.state.length === 0) {
      fail('ATOMIC_STAGED_LIFECYCLE_NATIVE_STATE_INVALID');
    }
    timestamp(
      item.updated_at || item.created_at,
      'ATOMIC_STAGED_LIFECYCLE_NATIVE_TIME_INVALID',
    );
  }

  if (receipt.final_live_reread !== true) fail('ATOMIC_STAGED_LIFECYCLE_FINAL_REREAD_REQUIRED');
  if (receipt.manual_merge_authority !== false) fail('ATOMIC_STAGED_LIFECYCLE_MANUAL_MERGE_FORBIDDEN');
  if (receipt.atomic_landing_only !== true) fail('ATOMIC_STAGED_LIFECYCLE_ATOMIC_ONLY_REQUIRED');
  if (receipt.mutation_authority_created !== false) fail('ATOMIC_STAGED_LIFECYCLE_MUTATION_AUTHORITY_FORBIDDEN');
  if (receipt.public_release !== 'HOLD'
    || receipt.production !== 'HOLD'
    || receipt.g5 !== 'HOLD') {
    fail('ATOMIC_STAGED_LIFECYCLE_RELEASE_BOUNDARY_INVALID');
  }

  return Object.freeze({
    state: AUTHORITY_STATE,
    repository,
    pull_request: Number(prNumber),
    exact_head_sha: headSha,
    exact_base_sha: baseSha,
    lifecycle_run_id: lifecycleRunId,
    lifecycle_run_attempt: lifecycleRunAttempt,
    lifecycle_evaluated_at: receipt.lifecycle_evaluated_at,
    lifecycle_artifact_id: lifecycleArtifactId,
    lifecycle_artifact_name: receipt.lifecycle_artifact_name,
    lifecycle_artifact_digest: receipt.lifecycle_artifact_digest,
    latest_ready_event_id: readyEventId,
    latest_ready_event_at: readyEvent.created_at,
    latest_ready_event_actor: readyEvent.actor,
    direct_repository_owner_ready: true,
    app_mediated_ready: false,
    public_release: 'HOLD',
    production: 'HOLD',
    g5: 'HOLD',
  });
}
