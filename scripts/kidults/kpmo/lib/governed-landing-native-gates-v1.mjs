import {createHash, verify} from 'node:crypto';
import {workflowReceiptLedgerInternals} from '../../../../services/kidults-control-plane/src/workflow-receipt-ledger.mjs';

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const NONCE_PATTERN = /^[0-9a-f]{32}$/;
const MAX_APPROVAL_LIFETIME_MS = 60 * 60 * 1000;
const AUTONOMOUS_REVIEW_MARKER = 'KIDULTS_PROTECTED_AUTONOMOUS_REVIEW_ATTESTATION_V1';
const DURABLE_READBACK_MARKER = 'KIDULTS_PROTECTED_REVIEW_DURABLE_READBACK_V1';
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@-]{2,127}$/;
const {canonicalJson} = workflowReceiptLedgerInternals;

const verifyProtectedEd25519Payload = (payload, signatureBase64, trustedPublicKey) => {
  try {
    return verify(null, Buffer.from(canonicalJson(payload)), trustedPublicKey, Buffer.from(signatureBase64, 'base64'));
  } catch {
    return false;
  }
};

export const sameAutonomousReview = (left, right) => {
  try { return canonicalJson(left) === canonicalJson(right); } catch { return false; }
};

export function requiredAutonomousReviewDomain(changedFilenames) {
  if (!Array.isArray(changedFilenames) || !changedFilenames.length
      || changedFilenames.some(value => typeof value !== 'string' || !value)) {
    fail('AUTONOMOUS_REVIEW_CHANGED_PATHS_INVALID');
  }
  const domains = new Set();
  for (const filename of changedFilenames) {
    if (filename.startsWith('coordination/kidults/provider/')
        || filename.startsWith('scripts/kidults/source-intelligence/')) domains.add('provider_rights_evidence');
    else if (filename.startsWith('coordination/kidults/security/') || filename.startsWith('infra/')) domains.add('security_credentials_tls_ssh');
    else if (filename.startsWith('scripts/kidults/portal/') || filename.startsWith('apps/portal/')) domains.add('portal');
    else if (filename.startsWith('services/kidults-control-plane/')
        || filename.startsWith('services/kidults-autonomous-intelligence/')) domains.add('data_runtime_storage');
    else domains.add('governance_independence_and_provenance');
  }
  if (domains.size !== 1) fail('AUTONOMOUS_REVIEW_MULTIPLE_DOMAINS_REQUIRED', [...domains].sort().join(','));
  return [...domains][0];
}

export class GateFailure extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'GateFailure';
    this.code = code;
    this.detail = detail;
  }
}

const fail = (code, detail = '') => { throw new GateFailure(code, detail); };
const normalized = value => String(value ?? '').trim().toLowerCase();
const requireExactArray = (actual, expected, code) => {
  if (!Array.isArray(actual) || actual.length !== expected.length
    || actual.some((value, index) => value !== expected[index])) fail(code);
};

const EXACT_HEAD_APPROVAL_MARKER = 'KIDULTS_ATOMIC_LANDING_EXACT_HEAD_APPROVAL_V2';
const EXACT_HEAD_APPROVAL_SCOPE = 'ONE_ATOMIC_GOVERNED_LANDING_ONLY';
const EXACT_HEAD_APPROVAL_OPERATION = 'MERGE_PROTECTED_MAIN';
const exactTime = (value, code) => {
  const parsed = Date.parse(String(value || ''));
  if (!Number.isFinite(parsed)) fail(code);
  return parsed;
};

function parseExactHeadApprovalBody(body) {
  const lines = String(body || '').trim().split(/\r?\n/);
  if (lines[0] !== EXACT_HEAD_APPROVAL_MARKER) return null;
  const expectedKeys = [
    'repository',
    'pull_request',
    'exact_base_sha',
    'exact_head_sha',
    'operation',
    'authorization_id',
    'nonce',
    'expires_at',
    'scope',
    'approval_rebind',
  ];
  if (lines.length !== expectedKeys.length + 1) fail('PROGRAM_OWNER_EXACT_HEAD_APPROVAL_SHAPE_INVALID');
  const values = {};
  for (const line of lines.slice(1)) {
    const match = /^([a-z_]+)=(.+)$/.exec(line);
    if (!match || !expectedKeys.includes(match[1]) || Object.hasOwn(values, match[1])) {
      fail('PROGRAM_OWNER_EXACT_HEAD_APPROVAL_FIELD_INVALID');
    }
    values[match[1]] = match[2];
  }
  if (Object.keys(values).length !== expectedKeys.length) fail('PROGRAM_OWNER_EXACT_HEAD_APPROVAL_FIELD_SET_INVALID');
  return values;
}

export function assertAutonomousIndependentReview(comments, {
  repository,
  prNumber,
  repositoryOwner,
  baseSha,
  headSha,
  headTreeSha,
  requiredDomain,
  evaluationTime = new Date().toISOString(),
  requireDurableConsumption = false,
  operationBinding = null,
  reviewPolicy,
} = {}) {
  if (!Array.isArray(comments)) fail('AUTONOMOUS_REVIEW_COMMENT_SET_INVALID');
  if (!repositoryOwner || !SHA_PATTERN.test(headSha || '')
    || reviewPolicy?.status !== 'ACTIVE_MANDATORY_FAIL_CLOSED') {
    fail('AUTONOMOUS_REVIEW_BINDING_INVALID');
  }
  if (reviewPolicy?.identity_assurance_boundary?.protected_attestation_controller_status !== 'PROVISIONED_VERIFIED') {
    fail('AUTONOMOUS_REVIEW_CONTROLLER_NOT_PROVISIONED');
  }
  if (!repository || !/^[-A-Za-z0-9_.]+\/[-A-Za-z0-9_.]+$/.test(repository)
    || !Number.isSafeInteger(Number(prNumber)) || Number(prNumber) < 1
    || !SHA_PATTERN.test(baseSha || '') || !SHA_PATTERN.test(headTreeSha || '')
    || !ID_PATTERN.test(requiredDomain || '')) fail('AUTONOMOUS_REVIEW_BINDING_INVALID');
  const trust = reviewPolicy.identity_assurance_boundary.protected_attestation_trust;
  if (!trust || trust.signature_algorithm !== 'Ed25519'
      || !Number.isSafeInteger(trust.current_revocation_epoch) || trust.current_revocation_epoch < 0
      || !Array.isArray(trust.trusted_signers) || !trust.trusted_signers.length) {
    fail('AUTONOMOUS_REVIEW_CONTROLLER_TRUST_NOT_PROVISIONED');
  }
  const marked = comments.filter(comment => String(comment?.body || '').split(/\r?\n/)[0] === AUTONOMOUS_REVIEW_MARKER);
  if (!marked.length) fail('AUTONOMOUS_REVIEW_ATTESTATION_MISSING');
  const valid = [];
  let requestChanges = false;
  for (const comment of marked) {
    const lines = String(comment.body).trim().split(/\r?\n/);
    if (lines.length !== 2) continue;
    let envelope;
    try { envelope = JSON.parse(Buffer.from(lines[1], 'base64url').toString('utf8')); } catch { continue; }
    if (!envelope || Object.keys(envelope).sort().join(',') !== ['payload', 'signature_algorithm', 'signature_base64'].sort().join(',')) continue;
    const payload = envelope.payload;
    const signer = trust.trusted_signers.find(value => value?.signer_identity_and_version === payload?.signer_identity_and_version);
    if (!signer || signer.revoked === true || envelope.signature_algorithm !== 'Ed25519'
        || !verifyProtectedEd25519Payload(payload, envelope.signature_base64, signer.public_key_pem)) continue;
    const exactKeys = [
      'version','repository','pull_request','exact_base_sha','exact_head_sha','exact_head_tree_sha',
      'implementer_agent_id','reviewer_agent_id','assigned_reviewer_agent_id',
      'implementer_session_id','reviewer_session_id','reviewed_head_sha','required_domain',
      'reviewer_domain','reviewer_role_id','implementer_bootstrap_consumption_proof_id',
      'reviewer_bootstrap_consumption_proof_id','evidence_manifest_digest','review_decision_digest',
      'decision','attestation_id','issued_at','expires_at','signer_identity_and_version',
      'revocation_epoch',
    ];
    if (!payload || Object.keys(payload).sort().join(',') !== exactKeys.sort().join(',')) continue;
    if (payload.version !== 'kidults-protected-autonomous-review-attestation-v1'
        || payload.repository !== repository || Number(payload.pull_request) !== Number(prNumber)
        || payload.exact_base_sha !== baseSha || payload.exact_head_sha !== headSha
        || payload.exact_head_tree_sha !== headTreeSha || payload.reviewed_head_sha !== headSha
        || payload.required_domain !== requiredDomain || payload.reviewer_domain !== requiredDomain
        || payload.assigned_reviewer_agent_id !== payload.reviewer_agent_id
        || payload.implementer_agent_id === payload.reviewer_agent_id
        || payload.implementer_session_id === payload.reviewer_session_id
        || !ID_PATTERN.test(payload.implementer_agent_id || '') || !ID_PATTERN.test(payload.reviewer_agent_id || '')
        || !ID_PATTERN.test(payload.implementer_session_id || '') || !ID_PATTERN.test(payload.reviewer_session_id || '')
        || !ID_PATTERN.test(payload.reviewer_role_id || '')
        || !ID_PATTERN.test(payload.implementer_bootstrap_consumption_proof_id || '')
        || !ID_PATTERN.test(payload.reviewer_bootstrap_consumption_proof_id || '')
        || !DIGEST_PATTERN.test(payload.evidence_manifest_digest || '')
        || !DIGEST_PATTERN.test(payload.review_decision_digest || '')
        || !ID_PATTERN.test(payload.attestation_id || '')
        || !Number.isSafeInteger(payload.revocation_epoch)
        || payload.revocation_epoch !== trust.current_revocation_epoch
        || !['APPROVE', 'REQUEST_CHANGES'].includes(payload.decision)) continue;
    const allowedRoles = reviewPolicy.registered_role_routing?.[requiredDomain];
    if (!Array.isArray(allowedRoles) || !allowedRoles.includes(payload.reviewer_role_id)) continue;
    const issuedAt = Date.parse(payload.issued_at);
    const expiresAt = Date.parse(payload.expires_at);
    const evaluatedAt = Date.parse(evaluationTime);
    if (![issuedAt, expiresAt, evaluatedAt].every(Number.isFinite)
        || evaluatedAt < issuedAt || evaluatedAt > expiresAt
        || expiresAt <= issuedAt || expiresAt - issuedAt > MAX_APPROVAL_LIFETIME_MS) continue;
    if (payload.decision === 'REQUEST_CHANGES') requestChanges = true;
    valid.push({payload, comment_id: Number(comment.id), signature_digest: `sha256:${createHash('sha256').update(envelope.signature_base64).digest('hex')}`});
  }
  if (requestChanges) fail('AUTONOMOUS_REVIEW_REQUEST_CHANGES');
  const approvals = valid.filter(value => value.payload.decision === 'APPROVE');
  if (approvals.length !== 1) fail('AUTONOMOUS_REVIEW_CURRENT_APPROVAL_CARDINALITY');
  const approved = approvals[0];
  let consumption = null;
  if (requireDurableConsumption) {
    const expectedOperationDigest = `sha256:${createHash('sha256').update(canonicalJson(operationBinding)).digest('hex')}`;
    const exactReadbackKeys = [
      'version','store_authority','state','repository','pull_request','exact_base_sha','exact_head_sha',
      'exact_head_tree_sha','attestation_id','operation_binding_digest','landing_run_id',
      'landing_run_attempt','current_revocation_epoch','consumption_id','consumed_at','signer_identity_and_version',
    ];
    const storeSigners = trust.durable_store_trusted_signers;
    if (!operationBinding || !Array.isArray(storeSigners) || !storeSigners.length) {
      fail('AUTONOMOUS_REVIEW_DURABLE_READBACK_INVALID');
    }
    const controllerSignerIdentities = new Set(trust.trusted_signers.map(value => value?.signer_identity_and_version));
    const controllerPublicKeys = new Set(trust.trusted_signers.map(value => value?.public_key_pem));
    if (storeSigners.some(value => controllerSignerIdentities.has(value?.signer_identity_and_version)
        || controllerPublicKeys.has(value?.public_key_pem))) {
      fail('AUTONOMOUS_REVIEW_DURABLE_TRUST_DOMAIN_OVERLAP');
    }
    const matchedReadbacks = [];
    for (const comment of comments.filter(value => String(value?.body || '').split(/\r?\n/)[0] === DURABLE_READBACK_MARKER)) {
      const lines = String(comment.body).trim().split(/\r?\n/);
      if (lines.length !== 2) continue;
      let envelope;
      try { envelope = JSON.parse(Buffer.from(lines[1], 'base64url').toString('utf8')); } catch { continue; }
      if (!envelope || Object.keys(envelope).sort().join(',') !== ['payload', 'signature_algorithm', 'signature_base64'].sort().join(',')) continue;
      const readback = envelope.payload;
      const storeSigner = storeSigners.find(value => value?.signer_identity_and_version === readback?.signer_identity_and_version);
      if (!storeSigner || storeSigner.revoked === true || envelope.signature_algorithm !== 'Ed25519'
          || !verifyProtectedEd25519Payload(readback, envelope.signature_base64, storeSigner.public_key_pem)) continue;
      if (Object.keys(readback).sort().join(',') !== exactReadbackKeys.sort().join(',')
          || readback.version !== 'kidults-protected-review-durable-readback-v1'
          || readback.store_authority !== 'PROTECTED_EXTERNAL_DURABLE_STORE') {
        fail('AUTONOMOUS_REVIEW_DURABLE_SIGNED_READBACK_SCHEMA_INVALID');
      }
      if (readback.attestation_id !== approved.payload.attestation_id) continue;
      if (readback.state !== 'CONSUMED_EXACTLY_ONCE'
          || readback.repository !== repository || Number(readback.pull_request) !== Number(prNumber)
          || readback.exact_base_sha !== baseSha || readback.exact_head_sha !== headSha
          || readback.exact_head_tree_sha !== headTreeSha
          || readback.operation_binding_digest !== expectedOperationDigest
          || String(readback.landing_run_id) !== String(operationBinding.landing_run_id)
          || String(readback.landing_run_attempt) !== String(operationBinding.landing_run_attempt)
          || readback.current_revocation_epoch !== trust.current_revocation_epoch
          || readback.current_revocation_epoch < approved.payload.revocation_epoch
          || !ID_PATTERN.test(readback.consumption_id || '')
          || !Number.isFinite(Date.parse(readback.consumed_at))) {
        fail('AUTONOMOUS_REVIEW_DURABLE_REPLAY_OR_BINDING_CONFLICT');
      }
      matchedReadbacks.push({readback, signature_digest: `sha256:${createHash('sha256').update(envelope.signature_base64).digest('hex')}`});
    }
    if (matchedReadbacks.length !== 1) fail('AUTONOMOUS_REVIEW_DURABLE_READBACK_INVALID');
    const durableReadback = matchedReadbacks[0].readback;
    consumption = {
      consumption_id: durableReadback.consumption_id,
      operation_binding_digest: expectedOperationDigest,
      current_revocation_epoch: durableReadback.current_revocation_epoch,
      consumed_at: durableReadback.consumed_at,
      signer_identity_and_version: durableReadback.signer_identity_and_version,
      signature_digest: matchedReadbacks[0].signature_digest,
    };
  }
  return {
    state: 'PROTECTED_ATTESTATION_VERIFIED',
    comment_id: approved.comment_id,
    attestation_id: approved.payload.attestation_id,
    durable_consumption: consumption,
    exact_head_sha: approved.payload.exact_head_sha,
    exact_head_tree_sha: approved.payload.exact_head_tree_sha,
    exact_base_sha: approved.payload.exact_base_sha,
    required_domain: approved.payload.required_domain,
    implementer_agent_id: approved.payload.implementer_agent_id,
    implementer_session_id: approved.payload.implementer_session_id,
    reviewer_session_id: approved.payload.reviewer_session_id,
    reviewer_agent_id: approved.payload.reviewer_agent_id,
    reviewer_role_id: approved.payload.reviewer_role_id,
    implementer_bootstrap_consumption_proof_id: approved.payload.implementer_bootstrap_consumption_proof_id,
    reviewer_bootstrap_consumption_proof_id: approved.payload.reviewer_bootstrap_consumption_proof_id,
    decision: approved.payload.decision,
    evidence_manifest_digest: approved.payload.evidence_manifest_digest,
    review_decision_digest: approved.payload.review_decision_digest,
    signer_identity_and_version: approved.payload.signer_identity_and_version,
    signature_digest: approved.signature_digest,
    issued_at: approved.payload.issued_at,
    expires_at: approved.payload.expires_at,
    revocation_epoch: approved.payload.revocation_epoch,
    comment_transport_only: true,
    repository_comment_is_authority: false,
  };
}

export function selectLatestProgramOwnerReadyEvent(timeline, repositoryOwner) {
  if (!Array.isArray(timeline)) fail('PROGRAM_OWNER_READY_TIMELINE_INVALID');
  if (!repositoryOwner) fail('PROGRAM_OWNER_READY_OWNER_INVALID');
  const readinessEvents = timeline
    .filter(value => value?.event === 'ready_for_review' || value?.event === 'convert_to_draft')
    .sort((a, b) => exactTime(a.created_at, 'PROGRAM_OWNER_READY_EVENT_TIME_INVALID')
      - exactTime(b.created_at, 'PROGRAM_OWNER_READY_EVENT_TIME_INVALID')
      || Number(a.id || 0) - Number(b.id || 0));
  if (!readinessEvents.length) fail('PROGRAM_OWNER_READY_EVENT_REQUIRED');
  const lastReadiness = readinessEvents.at(-1);
  if (lastReadiness.event !== 'ready_for_review') fail('PROGRAM_OWNER_READY_STATE_REQUIRED');
  if (lastReadiness?.actor?.login !== repositoryOwner) fail('PROGRAM_OWNER_READY_ACTOR_REQUIRED');
  return {
    event: lastReadiness.event,
    actor: lastReadiness.actor.login,
    created_at: lastReadiness.created_at,
    event_id: Number(lastReadiness.id || 0) || null,
  };
}

export function selectExactHeadProgramOwnerApproval(comments, {
  repository,
  repositoryOwner,
  prNumber,
  headSha,
  baseSha,
  authorizationId,
  prCreatedAt,
  headCommittedAt,
  latestReadyAt,
  landingAttemptStartedAt,
  evaluationTime,
} = {}) {
  if (!Array.isArray(comments)) fail('PROGRAM_OWNER_APPROVAL_COMMENT_SET_INVALID');
  if (!repository || !/^[^/]+\/[^/]+$/.test(repository)
    || !repositoryOwner || !/^\d+$/.test(String(prNumber || ''))
    || !SHA_PATTERN.test(headSha || '') || !SHA_PATTERN.test(baseSha || '')) {
    fail('PROGRAM_OWNER_APPROVAL_BINDING_INVALID');
  }
  const finalLifecycleBoundaryAt = exactTime(
    latestReadyAt,
    'PROGRAM_OWNER_APPROVAL_READY_TIME_INVALID',
  );
  const marked = comments
    .filter(comment => String(comment?.body || '').trim().split(/\r?\n/)[0] === EXACT_HEAD_APPROVAL_MARKER)
    .sort((a, b) => exactTime(b.created_at, 'PROGRAM_OWNER_APPROVAL_TIME_INVALID')
      - exactTime(a.created_at, 'PROGRAM_OWNER_APPROVAL_TIME_INVALID')
      || Number(b.id || 0) - Number(a.id || 0));
  if (!marked.length) fail('PROGRAM_OWNER_EXACT_HEAD_APPROVAL_MISSING');
  const currentGeneration = marked.filter(comment => exactTime(
    comment.created_at,
    'PROGRAM_OWNER_APPROVAL_TIME_INVALID',
  ) > finalLifecycleBoundaryAt);
  if (!currentGeneration.length) fail('PROGRAM_OWNER_APPROVAL_NOT_AFTER_FINAL_LIFECYCLE_BOUNDARY');
  if (currentGeneration.length !== 1) fail('PROGRAM_OWNER_MULTIPLE_CURRENT_GENERATION_APPROVALS');
  const comment = currentGeneration[0];
  const fields = parseExactHeadApprovalBody(comment?.body);
  if (comment?.user?.login !== repositoryOwner || comment?.author_association !== 'OWNER') {
    fail('PROGRAM_OWNER_EXACT_HEAD_APPROVAL_ACTOR_INVALID');
  }
  if (comment?.performed_via_github_app != null) fail('PROGRAM_OWNER_EXACT_HEAD_APPROVAL_APP_MEDIATED');
  if (comment.updated_at !== comment.created_at) fail('PROGRAM_OWNER_EXACT_HEAD_APPROVAL_EDITED');
  if (fields.repository !== repository) fail('PROGRAM_OWNER_EXACT_HEAD_APPROVAL_REPOSITORY_MISMATCH');
  if (fields.pull_request !== String(prNumber)) fail('PROGRAM_OWNER_EXACT_HEAD_APPROVAL_PR_MISMATCH');
  if (fields.exact_head_sha !== headSha) fail('PROGRAM_OWNER_EXACT_HEAD_APPROVAL_HEAD_MISMATCH');
  if (fields.exact_base_sha !== baseSha) fail('PROGRAM_OWNER_EXACT_HEAD_APPROVAL_BASE_MISMATCH');
  if (fields.operation !== EXACT_HEAD_APPROVAL_OPERATION) fail('PROGRAM_OWNER_EXACT_HEAD_APPROVAL_OPERATION_INVALID');
  if (fields.authorization_id !== authorizationId) fail('PROGRAM_OWNER_EXACT_HEAD_APPROVAL_ID_MISMATCH');
  if (!NONCE_PATTERN.test(fields.nonce || '')) fail('PROGRAM_OWNER_EXACT_HEAD_APPROVAL_NONCE_INVALID');
  if (fields.scope !== EXACT_HEAD_APPROVAL_SCOPE) fail('PROGRAM_OWNER_EXACT_HEAD_APPROVAL_SCOPE_INVALID');
  if (fields.approval_rebind !== 'FORBIDDEN') fail('PROGRAM_OWNER_EXACT_HEAD_APPROVAL_REBIND_INVALID');

  const approvedAt = exactTime(comment.created_at, 'PROGRAM_OWNER_APPROVAL_TIME_INVALID');
  const expiresAt = exactTime(fields.expires_at, 'PROGRAM_OWNER_APPROVAL_EXPIRY_INVALID');
  const evaluatedAt = exactTime(evaluationTime, 'PROGRAM_OWNER_APPROVAL_EVALUATION_TIME_INVALID');
  const attemptStartedAt = exactTime(
    landingAttemptStartedAt,
    'PROGRAM_OWNER_LANDING_ATTEMPT_TIME_INVALID',
  );
  if (approvedAt < exactTime(prCreatedAt, 'PROGRAM_OWNER_APPROVAL_PR_TIME_INVALID')) {
    fail('PROGRAM_OWNER_APPROVAL_PRECEDES_PR');
  }
  if (approvedAt < exactTime(headCommittedAt, 'PROGRAM_OWNER_APPROVAL_HEAD_TIME_INVALID')) {
    fail('PROGRAM_OWNER_APPROVAL_PRECEDES_EXACT_HEAD');
  }
  if (approvedAt >= attemptStartedAt) fail('PROGRAM_OWNER_APPROVAL_NOT_BEFORE_LANDING_ATTEMPT');
  if (expiresAt <= approvedAt || expiresAt - approvedAt > MAX_APPROVAL_LIFETIME_MS) {
    fail('PROGRAM_OWNER_EXACT_HEAD_APPROVAL_EXPIRY_WINDOW_INVALID');
  }
  if (evaluatedAt < approvedAt) fail('PROGRAM_OWNER_EXACT_HEAD_APPROVAL_NOT_YET_VALID');
  if (evaluatedAt > expiresAt) fail('PROGRAM_OWNER_EXACT_HEAD_APPROVAL_EXPIRED');

  return {
    comment_id: Number(comment.id),
    comment_created_at: comment.created_at,
    comment_body_digest: `sha256:${createHash('sha256').update(String(comment.body)).digest('hex')}`,
    actor: comment.user.login,
    repository,
    pull_request: Number(prNumber),
    exact_base_sha: baseSha,
    exact_head_sha: headSha,
    operation: fields.operation,
    authorization_id_sha256: `sha256:${createHash('sha256').update(authorizationId).digest('hex')}`,
    approval_nonce_sha256: `sha256:${createHash('sha256').update(fields.nonce).digest('hex')}`,
    expires_at: fields.expires_at,
    scope: fields.scope,
    approval_rebind: fields.approval_rebind,
    raw_authorization_persisted: false,
    raw_nonce_persisted: false,
    app_mediated: false,
    final_lifecycle_boundary_at: latestReadyAt,
    landing_attempt_started_at: landingAttemptStartedAt,
  };
}

export function noMergeBlockers(pr, policy) {
  const blockers = [];
  if (policy?.closed_pull_request_blocks === true && pr?.state !== 'open') blockers.push('PULL_REQUEST_NOT_OPEN');
  if (policy?.merged_pull_request_blocks === true && pr?.merged === true) blockers.push('PULL_REQUEST_ALREADY_MERGED');
  const labels = new Set((pr?.labels || []).map(label => normalized(label?.name ?? label)));
  for (const label of policy?.exact_labels || []) {
    if (labels.has(normalized(label))) blockers.push(`NO_MERGE_LABEL:${normalized(label)}`);
  }
  const title = String(pr?.title ?? '').toUpperCase();
  for (const marker of policy?.title_markers || []) {
    if (title.includes(String(marker).toUpperCase())) blockers.push(`NO_MERGE_TITLE_MARKER:${marker}`);
  }
  return [...new Set(blockers)].sort();
}

export function assertPromotablePullRequest(pr, {
  repository,
  expectedHeadSha,
  expectedBase = 'main',
  noMergePolicy,
} = {}) {
  if (!pr || typeof pr !== 'object') fail('PULL_REQUEST_SNAPSHOT_REQUIRED');
  if (!SHA_PATTERN.test(expectedHeadSha || '')) fail('EXPECTED_HEAD_SHA_REQUIRED');
  if (pr.base?.ref !== expectedBase) fail('PULL_REQUEST_BASE_MISMATCH', String(pr.base?.ref ?? 'missing'));
  if (pr.head?.sha !== expectedHeadSha) fail('PULL_REQUEST_HEAD_CHANGED', String(pr.head?.sha ?? 'missing'));
  if (repository && pr.head?.repo?.full_name !== repository) fail('PULL_REQUEST_HEAD_REPOSITORY_MISMATCH');
  if (pr.draft === true) fail('PULL_REQUEST_DRAFT');
  const blockers = noMergeBlockers(pr, noMergePolicy);
  if (blockers.length) fail('PULL_REQUEST_NO_MERGE_BLOCKED', blockers.join(','));
  return {
    number: Number(pr.number),
    head_sha: pr.head.sha,
    base_ref: pr.base.ref,
    state: pr.state,
    merged: pr.merged === true,
    draft: pr.draft === true,
    updated_at: pr.updated_at ?? null,
    blocker_count: 0,
  };
}

export function assertStableFinalReread(initial, final, options) {
  const before = assertPromotablePullRequest(initial, options);
  const after = assertPromotablePullRequest(final, options);
  if (before.number !== after.number) fail('PULL_REQUEST_NUMBER_CHANGED');
  if (before.head_sha !== after.head_sha) fail('PULL_REQUEST_HEAD_CHANGED_DURING_AUTHORIZATION');
  if (before.base_ref !== after.base_ref) fail('PULL_REQUEST_BASE_CHANGED_DURING_AUTHORIZATION');
  return {initial: before, final: after, stable_exact_head: true};
}

export function assertExactOwnerMergeDuringFinalReread(initial, merged, {
  repository,
  repositoryOwner,
  expectedHeadSha,
  expectedBaseSha,
  noMergePolicy,
  notBefore,
  notAfter,
} = {}) {
  const before = assertPromotablePullRequest(initial, {
    repository,
    expectedHeadSha,
    noMergePolicy,
  });
  if (!merged || typeof merged !== 'object') fail('FINAL_REREAD_MERGED_SNAPSHOT_REQUIRED');
  if (!repositoryOwner) fail('FINAL_REREAD_REPOSITORY_OWNER_REQUIRED');
  if (!SHA_PATTERN.test(expectedBaseSha || '')) fail('FINAL_REREAD_EXPECTED_BASE_SHA_REQUIRED');
  if (merged.number !== initial.number || Number(merged.number) !== before.number) {
    fail('FINAL_REREAD_PULL_REQUEST_NUMBER_CHANGED');
  }
  if (merged.base?.ref !== 'main' || merged.base?.sha !== expectedBaseSha) {
    fail('FINAL_REREAD_MERGED_BASE_MISMATCH');
  }
  if (merged.head?.sha !== expectedHeadSha) fail('FINAL_REREAD_MERGED_HEAD_MISMATCH');
  if (repository && merged.head?.repo?.full_name !== repository) {
    fail('FINAL_REREAD_MERGED_HEAD_REPOSITORY_MISMATCH');
  }
  if (merged.state !== 'closed' || merged.merged !== true || merged.draft === true) {
    fail('FINAL_REREAD_EXACT_MERGE_NOT_OBSERVED');
  }
  if (merged.merged_by?.login !== repositoryOwner) fail('FINAL_REREAD_MERGED_BY_NON_OWNER');
  if (!SHA_PATTERN.test(merged.merge_commit_sha || '')) fail('FINAL_REREAD_MERGE_SHA_INVALID');
  const policyWithoutTerminalState = {
    ...(noMergePolicy || {}),
    closed_pull_request_blocks: false,
    merged_pull_request_blocks: false,
  };
  const semanticBlockers = noMergeBlockers(merged, policyWithoutTerminalState);
  if (semanticBlockers.length) fail('FINAL_REREAD_NO_MERGE_BLOCKED', semanticBlockers.join(','));
  const mergedAt = Date.parse(String(merged.merged_at || ''));
  const lowerBound = Date.parse(String(notBefore || ''));
  const upperBound = Date.parse(String(notAfter || ''));
  if (!Number.isFinite(mergedAt) || !Number.isFinite(lowerBound) || !Number.isFinite(upperBound)) {
    fail('FINAL_REREAD_MERGE_TIME_INVALID');
  }
  if (mergedAt < lowerBound || mergedAt > upperBound) fail('FINAL_REREAD_MERGE_OUTSIDE_AUTHORIZED_WINDOW');
  return {
    initial: before,
    final: {
      number: Number(merged.number),
      head_sha: merged.head.sha,
      base_ref: merged.base.ref,
      base_sha: merged.base.sha,
      state: merged.state,
      merged: true,
      merged_by: repositoryOwner,
      merged_at: merged.merged_at,
      merge_commit_sha: merged.merge_commit_sha,
    },
    stable_exact_head: true,
    exact_owner_merge_observed_during_final_reread: true,
  };
}

function scopeMatches(filename, rule) {
  return (rule.exact_paths || []).includes(filename)
    || (rule.prefixes || []).some(prefix => filename.startsWith(prefix));
}

export function resolveScopeRequirements(files, metadata, policy) {
  if (!Array.isArray(files)) fail('PULL_REQUEST_FILES_REQUIRED');
  if (!policy || policy.id !== 'kidults-scope-aware-required-status-policy-v1') fail('SCOPE_POLICY_INVALID');
  const commitCount = Number(metadata?.commits ?? 0);
  const changedFileCount = Number(metadata?.changed_files ?? files.length);
  if (files.length === 0) {
    if (commitCount !== 0 || changedFileCount !== 0) fail('ZERO_DIFF_METADATA_CONTRADICTION');
    return {files: [], scopes: [], required_contexts: [...policy.technical_base_contexts].sort(), zero_diff: true};
  }
  if (changedFileCount !== files.length) fail('CHANGED_FILE_PAGINATION_INCOMPLETE', `${files.length}/${changedFileCount}`);
  const unmatched = [];
  const matchedScopes = new Set();
  const contexts = new Set(policy.technical_base_contexts || []);
  for (const entry of files) {
    const filename = typeof entry === 'string' ? entry : entry?.filename;
    if (!filename) fail('PULL_REQUEST_FILENAME_INVALID');
    const matches = (policy.scope_rules || []).filter(rule => scopeMatches(filename, rule));
    if (!matches.length) {
      unmatched.push(filename);
      continue;
    }
    for (const match of matches) {
      matchedScopes.add(match.id);
      for (const context of match.required_contexts || []) contexts.add(context);
    }
  }
  if (unmatched.length) fail('ZERO_COVERAGE_SCOPE', unmatched.sort().join(','));
  if (!contexts.size) fail('ZERO_REQUIRED_STATUS_CONTEXTS');
  if (contexts.has(policy.required_status_context)) fail('AGGREGATOR_SELF_DEPENDENCY');
  return {
    files: files.map(entry => typeof entry === 'string' ? entry : entry.filename).sort(),
    scopes: [...matchedScopes].sort(),
    required_contexts: [...contexts].sort(),
    zero_diff: false,
  };
}

const stamp = item => Date.parse(item?.completed_at || item?.updated_at || item?.started_at || item?.created_at || 0);

export function evaluateRequiredCheckRuns(checkRuns, requiredContexts) {
  if (!Array.isArray(checkRuns)) fail('CHECK_RUNS_REQUIRED');
  const expected = [...new Set(requiredContexts || [])].sort();
  if (!expected.length) fail('ZERO_REQUIRED_STATUS_CONTEXTS');
  const results = [];
  for (const context of expected) {
    const candidates = checkRuns.filter(run => run?.name === context).sort((a, b) => stamp(b) - stamp(a));
    if (!candidates.length) fail('REQUIRED_CONTEXT_MISSING', context);
    if (candidates.length > 1 && stamp(candidates[0]) === stamp(candidates[1])) fail('REQUIRED_CONTEXT_LATEST_AMBIGUOUS', context);
    const latest = candidates[0];
    if (latest.status !== 'completed') fail('REQUIRED_CONTEXT_NOT_TERMINAL', context);
    if (latest.conclusion !== 'success') fail('REQUIRED_CONTEXT_NOT_SUCCESS', `${context}:${latest.conclusion ?? 'null'}`);
    results.push({context, check_run_id: latest.id, status: latest.status, conclusion: latest.conclusion});
  }
  return results;
}

export function assertNativeRequiredContexts(rulesetContexts, expectedContexts) {
  const actual = new Set(rulesetContexts || []);
  const missing = (expectedContexts || []).filter(context => !actual.has(context));
  if (missing.length) fail('NATIVE_REQUIRED_STATUS_CONTEXT_MISSING', missing.sort().join(','));
  return [...expectedContexts].sort();
}

export function assertLandingActorAndAuthorization(actor, repositoryOwner, authorizationId, prNumber, expectedHeadSha) {
  if (!actor || actor !== repositoryOwner) fail('PROGRAM_OWNER_LANDING_ACTOR_REQUIRED');
  if (!/^\d+$/.test(String(prNumber)) || !SHA_PATTERN.test(expectedHeadSha || '')) fail('LANDING_OPERATION_BINDING_INVALID');
  const expected = `LAND-PR-${prNumber}-${expectedHeadSha.slice(0, 12)}`;
  if (authorizationId !== expected) fail('ATOMIC_LANDING_OPERATION_AUTHORIZATION_MISMATCH');
  return {actor, authorization_id: authorizationId, expected_head_sha: expectedHeadSha};
}

export function authoritativeGenerationKey(receipt) {
  const sourceSha = receipt?.source_sha;
  const runId = Number(receipt?.p1_workflow_run_id);
  const artifactId = Number(receipt?.p1_artifact_id);
  const digest = receipt?.p1_artifact_digest;
  if (!SHA_PATTERN.test(sourceSha || '') || !Number.isInteger(runId) || runId <= 0
    || !Number.isInteger(artifactId) || artifactId <= 0 || typeof digest !== 'string' || !digest.length) {
    fail('ARL_GENERATION_BINDING_INVALID');
  }
  return `${sourceSha}:${runId}:${artifactId}:${digest}`;
}

export function assertSingleAuthoritativeProducer(receipts, generationKey) {
  const leaders = (receipts || []).filter(receipt =>
    receipt?.artifact_role === 'AUTHORITATIVE_CONSUMABLE'
    && receipt?.authoritative_producer === true
    && receipt?.exact_triggering_run_bound === true
    && authoritativeGenerationKey(receipt) === generationKey);
  if (leaders.length !== 1) fail('ARL_AUTHORITATIVE_PRODUCER_CARDINALITY', String(leaders.length));
  return leaders[0];
}
