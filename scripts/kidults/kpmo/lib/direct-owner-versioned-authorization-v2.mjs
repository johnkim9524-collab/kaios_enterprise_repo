import {createHash} from 'node:crypto';

const SHA40 = /^[0-9a-f]{40}$/;
const POSITIVE_INTEGER = /^[1-9][0-9]*$/;
const UI_MARKER = 'KIDULTS_DIRECT_OWNER_UI_SESSION_ATTESTATION_V1';
const UI_TRANSPORT = 'DIRECT_OWNER_GITHUB_UI';
const UI_STATE = 'AUTHENTICATED_OWNER_UI_READY';
const MAX_UI_ATTESTATION_LIFETIME_MS = 30 * 60 * 1000;
const READY_STATE_EVENTS = new Set(['ready_for_review', 'convert_to_draft']);

const fail = code => {
  const error = new Error(code);
  error.code = code;
  throw error;
};
const digest = value => `sha256:${createHash('sha256').update(String(value)).digest('hex')}`;
const parseTime = (value, code) => {
  const parsed = Date.parse(String(value || ''));
  if (!Number.isFinite(parsed)) fail(code);
  return parsed;
};

export function parseDirectOwnerAuthorizationId({authorizationId, prNumber, headSha} = {}) {
  if (!/^\d+$/.test(String(prNumber || '')) || !SHA40.test(String(headSha || ''))) {
    fail('DIRECT_OWNER_HANDOFF_AUTHORIZATION_BINDING_INVALID');
  }
  const match = /^DIRECT-PR-(\d+)-([0-9a-f]{12})(?:-R(.+))?$/.exec(String(authorizationId || ''));
  if (!match) fail('DIRECT_OWNER_HANDOFF_AUTHORIZATION_ID_INVALID');
  if (match[1] !== String(prNumber)) fail('DIRECT_OWNER_HANDOFF_AUTHORIZATION_PR_MISMATCH');
  if (match[2] !== headSha.slice(0, 12)) fail('DIRECT_OWNER_HANDOFF_AUTHORIZATION_HEAD_MISMATCH');

  if (match[3] == null) {
    return Object.freeze({
      authorization_id: authorizationId,
      scheme: 'LEGACY_INITIAL',
      generation: null,
      generation_key: 'LEGACY',
    });
  }
  if (!POSITIVE_INTEGER.test(match[3])) fail('DIRECT_OWNER_HANDOFF_AUTHORIZATION_GENERATION_INVALID');
  const generation = Number(match[3]);
  if (!Number.isSafeInteger(generation) || generation <= 0) {
    fail('DIRECT_OWNER_HANDOFF_AUTHORIZATION_GENERATION_INVALID');
  }
  return Object.freeze({
    authorization_id: authorizationId,
    scheme: 'VERSIONED_RETRY',
    generation,
    generation_key: `R${generation}`,
  });
}

export function directOwnerConsumptionContext({prNumber, headSha, generationKey} = {}) {
  if (!/^\d+$/.test(String(prNumber || '')) || !SHA40.test(String(headSha || ''))
      || !/^(?:LEGACY|R[1-9][0-9]*)$/.test(String(generationKey || ''))) {
    fail('DIRECT_OWNER_HANDOFF_CONSUMPTION_CONTEXT_BINDING_INVALID');
  }
  return `KIDULTS Direct Owner Use PR ${prNumber} ${headSha.slice(0, 12)} ${generationKey}`;
}

export function assertDirectOwnerGenerationUnused({
  authorizationId,
  consumptionContext,
  statuses,
  workflowRuns,
  currentRunId,
} = {}) {
  if (!Array.isArray(statuses) || !Array.isArray(workflowRuns) || !/^\d+$/.test(String(currentRunId || ''))) {
    fail('DIRECT_OWNER_HANDOFF_CONSUMPTION_EVIDENCE_INVALID');
  }
  if (statuses.some(status => status?.context === consumptionContext)) {
    fail('DIRECT_OWNER_HANDOFF_AUTHORIZATION_REPLAY_STATUS');
  }
  const expectedSuffix = ` / ${authorizationId}`;
  if (workflowRuns.some(run => String(run?.id) !== String(currentRunId)
      && String(run?.display_title || '').endsWith(expectedSuffix))) {
    fail('DIRECT_OWNER_HANDOFF_AUTHORIZATION_REPLAY_RUN');
  }
  return Object.freeze({unused: true, prior_status_count: 0, prior_run_count: 0});
}

const uiKeys = [
  'repository', 'pull_request', 'exact_head_sha', 'authorization_id', 'ready_event_id',
  'transport', 'session_state', 'expires_at',
];
function parseUiAttestation(body) {
  const lines = String(body || '').trim().split(/\r?\n/);
  if (lines[0] !== UI_MARKER) return null;
  if (lines.length !== uiKeys.length + 1) fail('DIRECT_OWNER_UI_ATTESTATION_SHAPE_INVALID');
  const fields = {};
  for (const line of lines.slice(1)) {
    const match = /^([a-z0-9_]+)=(.+)$/.exec(line);
    if (!match || !uiKeys.includes(match[1]) || Object.hasOwn(fields, match[1])) {
      fail('DIRECT_OWNER_UI_ATTESTATION_FIELD_INVALID');
    }
    fields[match[1]] = match[2];
  }
  if (Object.keys(fields).length !== uiKeys.length) fail('DIRECT_OWNER_UI_ATTESTATION_FIELD_SET_INVALID');
  return fields;
}

export function selectDirectOwnerUiAttestation(comments, {
  evidenceCommentId,
  repository,
  repositoryOwner,
  prNumber,
  headSha,
  authorizationId,
  readyEvent,
  evaluationTime,
  handoffWindowSeconds,
  phase = 'pre_window',
} = {}) {
  if (!['pre_window', 'post_window'].includes(phase)) fail('DIRECT_OWNER_UI_ATTESTATION_PHASE_INVALID');
  if (!Array.isArray(comments) || !Number.isSafeInteger(Number(evidenceCommentId))
      || Number(evidenceCommentId) <= 0) fail('DIRECT_OWNER_UI_ATTESTATION_COMMENT_ID_INVALID');
  const comment = comments.find(value => Number(value?.id) === Number(evidenceCommentId));
  if (!comment) fail('DIRECT_OWNER_UI_ATTESTATION_MISSING');
  const fields = parseUiAttestation(comment?.body);
  if (!fields) fail('DIRECT_OWNER_UI_ATTESTATION_MARKER_INVALID');
  if (comment?.user?.login !== repositoryOwner || comment?.author_association !== 'OWNER'
      || comment?.user?.type !== 'User') fail('DIRECT_OWNER_UI_ATTESTATION_ACTOR_INVALID');
  if (comment?.performed_via_github_app != null) fail('DIRECT_OWNER_UI_ATTESTATION_APP_MEDIATED');
  if (comment.updated_at !== comment.created_at) fail('DIRECT_OWNER_UI_ATTESTATION_EDITED');
  if (fields.repository !== repository || fields.pull_request !== String(prNumber)
      || fields.exact_head_sha !== headSha || fields.authorization_id !== authorizationId) {
    fail('DIRECT_OWNER_UI_ATTESTATION_BINDING_INVALID');
  }
  if (fields.ready_event_id !== String(readyEvent?.id)) fail('DIRECT_OWNER_UI_ATTESTATION_READY_EVENT_MISMATCH');
  if (fields.transport !== UI_TRANSPORT || fields.session_state !== UI_STATE) {
    fail('DIRECT_OWNER_UI_ATTESTATION_STATE_INVALID');
  }

  const createdAt = parseTime(comment.created_at, 'DIRECT_OWNER_UI_ATTESTATION_TIME_INVALID');
  const readyAt = parseTime(readyEvent?.created_at, 'DIRECT_OWNER_UI_ATTESTATION_READY_TIME_INVALID');
  const evaluatedAt = parseTime(evaluationTime, 'DIRECT_OWNER_UI_ATTESTATION_EVALUATION_TIME_INVALID');
  const expiresAt = parseTime(fields.expires_at, 'DIRECT_OWNER_UI_ATTESTATION_EXPIRY_INVALID');
  if (createdAt < readyAt) fail('DIRECT_OWNER_UI_ATTESTATION_PRECEDES_READY');
  if (evaluatedAt < createdAt) fail('DIRECT_OWNER_UI_ATTESTATION_NOT_YET_VALID');
  if (expiresAt <= createdAt || expiresAt - createdAt > MAX_UI_ATTESTATION_LIFETIME_MS) {
    fail('DIRECT_OWNER_UI_ATTESTATION_EXPIRY_WINDOW_INVALID');
  }
  if (phase === 'pre_window') {
    if (evaluatedAt > expiresAt) fail('DIRECT_OWNER_UI_ATTESTATION_EXPIRED');
    if (!Number.isInteger(handoffWindowSeconds) || handoffWindowSeconds <= 0
        || expiresAt - evaluatedAt < handoffWindowSeconds * 1000) {
      fail('DIRECT_OWNER_UI_ATTESTATION_EXPIRES_BEFORE_WINDOW');
    }
  }
  return Object.freeze({
    comment_id: Number(comment.id),
    comment_created_at: comment.created_at,
    comment_body_sha256: digest(comment.body),
    actor: comment.user.login,
    ready_event_id: Number(readyEvent.id),
    expires_at: fields.expires_at,
    transport: UI_TRANSPORT,
    session_state: UI_STATE,
    proof_boundary: 'OWNER_AUTHORED_NON_APP_GITHUB_COMMENT_SELF_ATTESTATION',
  });
}

export function collectDirectOwnerReadyStateMutations(timeline, readyEvent) {
  if (!Array.isArray(timeline) || !Number.isSafeInteger(Number(readyEvent?.id))
      || Number(readyEvent.id) <= 0) fail('DIRECT_OWNER_HANDOFF_MUTATION_EVIDENCE_INVALID');
  const readyAt = parseTime(readyEvent.created_at, 'DIRECT_OWNER_HANDOFF_MUTATION_READY_TIME_INVALID');
  return timeline
    .filter(item => READY_STATE_EVENTS.has(item?.event))
    .map(item => ({
      event_id: Number(item?.id),
      event: item?.event,
      timestamp: String(item?.created_at || ''),
      actor: String(item?.actor?.login || ''),
      performed_via_github_app: item?.performed_via_github_app ?? null,
    }))
    .filter(item => {
      if (!Number.isSafeInteger(item.event_id) || item.event_id <= 0) fail('DIRECT_OWNER_HANDOFF_MUTATION_EVENT_ID_INVALID');
      const itemAt = parseTime(item.timestamp, 'DIRECT_OWNER_HANDOFF_MUTATION_EVENT_TIME_INVALID');
      return itemAt > readyAt || (itemAt === readyAt && item.event_id > Number(readyEvent.id));
    })
    .sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp) || left.event_id - right.event_id);
}
