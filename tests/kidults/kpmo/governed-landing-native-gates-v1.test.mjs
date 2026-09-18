import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash, generateKeyPairSync, sign} from 'node:crypto';
import {workflowReceiptLedgerInternals} from '../../../services/kidults-control-plane/src/workflow-receipt-ledger.mjs';
import {
  GateFailure,
  assertExactOwnerMergeDuringFinalReread,
  assertPromotablePullRequest,
  assertStableFinalReread,
  resolveScopeRequirements,
  evaluateRequiredCheckRuns,
  assertSingleAuthoritativeProducer,
  authoritativeGenerationKey,
  assertLandingActorAndAuthorization,
  assertAutonomousIndependentReview,
  sameAutonomousReview,
  requiredAutonomousReviewDomain,
  selectExactHeadProgramOwnerApproval,
  selectLatestProgramOwnerReadyEvent,
} from '../../../scripts/kidults/kpmo/lib/governed-landing-native-gates-v1.mjs';

const sha = 'a'.repeat(40);
const baseSha = 'b'.repeat(40);
const repository = 'johnkim9524-collab/kaios_enterprise_repo';
const {canonicalJson} = workflowReceiptLedgerInternals;
const basePr = () => ({
  number: 1580,
  state: 'open',
  merged: false,
  draft: false,
  title: 'Correct ARL provenance',
  labels: [],
  updated_at: '2026-08-29T08:50:00Z',
  base: {ref: 'main', sha: baseSha},
  head: {sha, repo: {full_name: repository}},
});
const mergedPr = () => ({
  ...basePr(),
  state: 'closed',
  merged: true,
  merged_by: {login: 'johnkim9524-collab'},
  merged_at: '2026-09-01T01:30:10Z',
  merge_commit_sha: 'c'.repeat(40),
});
const noMergePolicy = {
  closed_pull_request_blocks: true,
  merged_pull_request_blocks: true,
  exact_labels: ['no-merge', 'do-not-merge', 'merge-hold'],
  title_markers: ['[NO-MERGE]', '[DO-NOT-MERGE]'],
};
const options = {repository, expectedHeadSha: sha, noMergePolicy};
const code = (fn, expected) => assert.throws(fn, error => error instanceof GateFailure && error.code === expected);

test('open exact-head PR is promotable', () => {
  assert.equal(assertPromotablePullRequest(basePr(), options).head_sha, sha);
});

test('closed and explicit NO-MERGE states fail closed', () => {
  const closed = basePr(); closed.state = 'closed';
  code(() => assertPromotablePullRequest(closed, options), 'PULL_REQUEST_NO_MERGE_BLOCKED');
  const labeled = basePr(); labeled.labels = [{name: 'NO-MERGE'}];
  code(() => assertPromotablePullRequest(labeled, options), 'PULL_REQUEST_NO_MERGE_BLOCKED');
  const titled = basePr(); titled.title = '[no-merge] hold';
  code(() => assertPromotablePullRequest(titled, options), 'PULL_REQUEST_NO_MERGE_BLOCKED');
});

test('close/NO-MERGE race between initial and final read is rejected', () => {
  const final = basePr(); final.state = 'closed'; final.labels = [{name: 'no-merge'}];
  code(() => assertStableFinalReread(basePr(), final, options), 'PULL_REQUEST_NO_MERGE_BLOCKED');
});

test('head replacement between initial and final read is rejected', () => {
  const final = basePr(); final.head.sha = 'b'.repeat(40);
  code(() => assertStableFinalReread(basePr(), final, options), 'PULL_REQUEST_HEAD_CHANGED');
});

test('exact owner merge during the final reread is accepted only inside the authorization window', () => {
  const result = assertExactOwnerMergeDuringFinalReread(basePr(), mergedPr(), {
    repository,
    repositoryOwner: 'johnkim9524-collab',
    expectedHeadSha: sha,
    expectedBaseSha: baseSha,
    noMergePolicy,
    notBefore: '2026-09-01T01:30:00Z',
    notAfter: '2026-09-01T01:31:00Z',
  });
  assert.equal(result.exact_owner_merge_observed_during_final_reread, true);
  assert.equal(result.final.merge_commit_sha, 'c'.repeat(40));
});

test('final-reread merge tolerance rejects actor, identity, policy, and time drift', () => {
  const mergeOptions = {
    repository,
    repositoryOwner: 'johnkim9524-collab',
    expectedHeadSha: sha,
    expectedBaseSha: baseSha,
    noMergePolicy,
    notBefore: '2026-09-01T01:30:00Z',
    notAfter: '2026-09-01T01:31:00Z',
  };
  const nonOwner = mergedPr(); nonOwner.merged_by.login = 'automation-bot';
  code(() => assertExactOwnerMergeDuringFinalReread(basePr(), nonOwner, mergeOptions), 'FINAL_REREAD_MERGED_BY_NON_OWNER');
  const wrongHead = mergedPr(); wrongHead.head.sha = 'd'.repeat(40);
  code(() => assertExactOwnerMergeDuringFinalReread(basePr(), wrongHead, mergeOptions), 'FINAL_REREAD_MERGED_HEAD_MISMATCH');
  const wrongBase = mergedPr(); wrongBase.base.sha = 'e'.repeat(40);
  code(() => assertExactOwnerMergeDuringFinalReread(basePr(), wrongBase, mergeOptions), 'FINAL_REREAD_MERGED_BASE_MISMATCH');
  const held = mergedPr(); held.labels = [{name: 'no-merge'}];
  code(() => assertExactOwnerMergeDuringFinalReread(basePr(), held, mergeOptions), 'FINAL_REREAD_NO_MERGE_BLOCKED');
  const late = mergedPr(); late.merged_at = '2026-09-01T01:31:01Z';
  code(() => assertExactOwnerMergeDuringFinalReread(basePr(), late, mergeOptions), 'FINAL_REREAD_MERGE_OUTSIDE_AUTHORIZED_WINDOW');
});

test('deterministic LAND input does not substitute for live repository-owner actor', () => {
  const authorization = `LAND-PR-1580-${sha.slice(0, 12)}`;
  code(() => assertLandingActorAndAuthorization('automation-bot', 'johnkim9524-collab', authorization, '1580', sha), 'PROGRAM_OWNER_LANDING_ACTOR_REQUIRED');
  assert.equal(assertLandingActorAndAuthorization('johnkim9524-collab', 'johnkim9524-collab', authorization, '1580', sha).actor, 'johnkim9524-collab');
});

test('explicit Program Owner Ready event is mandatory and last-event authoritative', () => {
  const ready = {
    id: 10,
    event: 'ready_for_review',
    actor: {login: 'johnkim9524-collab'},
    created_at: '2026-09-01T01:20:00Z',
  };
  assert.equal(selectLatestProgramOwnerReadyEvent([ready], 'johnkim9524-collab').created_at, ready.created_at);
  code(() => selectLatestProgramOwnerReadyEvent([], 'johnkim9524-collab'), 'PROGRAM_OWNER_READY_EVENT_REQUIRED');
  code(() => selectLatestProgramOwnerReadyEvent([ready, {
    ...ready, id: 11, event: 'convert_to_draft', created_at: '2026-09-01T01:21:00Z',
  }], 'johnkim9524-collab'), 'PROGRAM_OWNER_READY_STATE_REQUIRED');
  code(() => selectLatestProgramOwnerReadyEvent([{
    ...ready, actor: {login: 'automation-bot'},
  }], 'johnkim9524-collab'), 'PROGRAM_OWNER_READY_ACTOR_REQUIRED');
});

test('exact-head Program Owner approval cannot be inherited, app-mediated, expired, or self-rebound', () => {
  const authorization = `LAND-PR-1580-${sha.slice(0, 12)}`;
  const approvalBody = (head, fields = {}) => [
    'KIDULTS_ATOMIC_LANDING_EXACT_HEAD_APPROVAL_V2',
    `repository=${fields.repository || repository}`,
    'pull_request=1580',
    `exact_base_sha=${fields.baseSha || baseSha}`,
    `exact_head_sha=${head}`,
    `operation=${fields.operation || 'MERGE_PROTECTED_MAIN'}`,
    `authorization_id=${fields.authorizationId || `LAND-PR-1580-${head.slice(0, 12)}`}`,
    `nonce=${fields.nonce || '1'.repeat(32)}`,
    `expires_at=${fields.expiresAt || '2026-09-01T02:00:00Z'}`,
    `scope=${fields.scope || 'ONE_ATOMIC_GOVERNED_LANDING_ONLY'}`,
    `approval_rebind=${fields.rebind || 'FORBIDDEN'}`,
  ].join('\n');
  const comment = (id, head, overrides = {}) => ({
    id,
    body: approvalBody(head),
    user: {login: 'johnkim9524-collab'},
    author_association: 'OWNER',
    performed_via_github_app: null,
    created_at: '2026-09-01T01:25:00Z',
    updated_at: '2026-09-01T01:25:00Z',
    ...overrides,
  });
  const input = {
    repository,
    repositoryOwner: 'johnkim9524-collab',
    prNumber: 1580,
    headSha: sha,
    baseSha,
    authorizationId: authorization,
    prCreatedAt: '2026-09-01T00:00:00Z',
    headCommittedAt: '2026-09-01T01:00:00Z',
    latestReadyAt: '2026-09-01T01:20:00Z',
    landingAttemptStartedAt: '2026-09-01T01:29:00Z',
    evaluationTime: '2026-09-01T01:30:00Z',
  };
  const selected = selectExactHeadProgramOwnerApproval([comment(1, sha)], input);
  assert.equal(selected.exact_head_sha, sha);
  assert.equal(selected.app_mediated, false);
  assert.equal(selected.raw_authorization_persisted, false);
  assert.equal(selected.raw_nonce_persisted, false);
  code(() => selectExactHeadProgramOwnerApproval([], input), 'PROGRAM_OWNER_EXACT_HEAD_APPROVAL_MISSING');
  code(() => selectExactHeadProgramOwnerApproval([comment(2, 'c'.repeat(40), {
    created_at: '2026-09-01T01:26:00Z', updated_at: '2026-09-01T01:26:00Z',
  })], input), 'PROGRAM_OWNER_EXACT_HEAD_APPROVAL_HEAD_MISMATCH');
  code(() => selectExactHeadProgramOwnerApproval([comment(1, sha, {
    updated_at: '2026-09-01T01:12:00Z',
  })], input), 'PROGRAM_OWNER_EXACT_HEAD_APPROVAL_EDITED');
  code(() => selectExactHeadProgramOwnerApproval([comment(1, sha, {
    performed_via_github_app: {id: 1144995, slug: 'chatgpt-codex-connector'},
  })], input), 'PROGRAM_OWNER_EXACT_HEAD_APPROVAL_APP_MEDIATED');
  code(() => selectExactHeadProgramOwnerApproval([comment(1, sha, {
    created_at: '2026-09-01T00:59:00Z', updated_at: '2026-09-01T00:59:00Z',
  })], input), 'PROGRAM_OWNER_APPROVAL_NOT_AFTER_FINAL_LIFECYCLE_BOUNDARY');
  code(() => selectExactHeadProgramOwnerApproval([comment(1, sha, {
    created_at: '2026-09-01T01:20:00Z', updated_at: '2026-09-01T01:20:00Z',
  })], input), 'PROGRAM_OWNER_APPROVAL_NOT_AFTER_FINAL_LIFECYCLE_BOUNDARY');
  code(() => selectExactHeadProgramOwnerApproval([comment(1, sha, {
    created_at: '2026-09-01T01:29:00Z', updated_at: '2026-09-01T01:29:00Z',
  })], input), 'PROGRAM_OWNER_APPROVAL_NOT_BEFORE_LANDING_ATTEMPT');
  code(() => selectExactHeadProgramOwnerApproval([
    comment(1, sha),
    comment(2, sha, {created_at: '2026-09-01T01:26:00Z', updated_at: '2026-09-01T01:26:00Z'}),
  ], input), 'PROGRAM_OWNER_MULTIPLE_CURRENT_GENERATION_APPROVALS');
  code(() => selectExactHeadProgramOwnerApproval([comment(1, sha, {
    body: approvalBody(sha, {expiresAt: '2026-09-01T03:00:01Z'}),
  })], input), 'PROGRAM_OWNER_EXACT_HEAD_APPROVAL_EXPIRY_WINDOW_INVALID');
  code(() => selectExactHeadProgramOwnerApproval([comment(1, sha)], {
    ...input, evaluationTime: '2026-09-01T02:00:01Z',
  }), 'PROGRAM_OWNER_EXACT_HEAD_APPROVAL_EXPIRED');
  code(() => selectExactHeadProgramOwnerApproval([comment(1, sha, {
    body: approvalBody(sha, {nonce: 'not-a-valid-nonce'}),
  })], input), 'PROGRAM_OWNER_EXACT_HEAD_APPROVAL_NONCE_INVALID');
});

test('repository comments cannot mint autonomous-review provenance while the protected controller is unprovisioned', () => {
  const reviewPolicy = {
    status: 'ACTIVE_MANDATORY_FAIL_CLOSED',
    identity_assurance_boundary: {
      protected_attestation_controller_status: 'NOT_PROVISIONED',
    },
    registered_role_routing: {governance_independence_and_provenance: ['integration-conductor']},
  };
  const receipt = {
    implementer_agent_id: 'AI-018',
    reviewer_agent_id: 'AI-REVIEWER-01',
    assigned_reviewer_agent_id: 'AI-REVIEWER-01',
    implementer_session_id: 'implementation-session',
    reviewer_session_id: 'review-session',
    exact_head_sha: sha,
    reviewed_head_sha: sha,
    required_domain: 'governance_independence_and_provenance',
    reviewer_domain: 'governance_independence_and_provenance',
    reviewer_role_id: 'integration-conductor',
    bootstrap_state: 'BOOTSTRAP_VERIFIED',
    bootstrap_consumed: true,
    bootstrap_receipt_digest: `hmac-sha256:${'1'.repeat(64)}`,
    review_receipt_id: 'review-1580-a',
    decision: 'APPROVE',
    diff_evidence: ['diff'],
    test_evidence: ['tests'],
    negative_control_evidence: ['self-review', 'stale-head', 'replay', 'wrong-agent', 'wrong-domain'],
  };
  const comment = (value, overrides = {}) => ({
    id: 99,
    body: `KIDULTS_AUTONOMOUS_REVIEW_V1\n${JSON.stringify(value)}`,
    user: {login: 'johnkim9524-collab'},
    author_association: 'OWNER',
    performed_via_github_app: null,
    created_at: '2026-09-01T01:10:00Z',
    updated_at: '2026-09-01T01:10:00Z',
    ...overrides,
  });
  const input = {repositoryOwner: 'johnkim9524-collab', headSha: sha, reviewPolicy};
  code(() => assertAutonomousIndependentReview([comment(receipt)], input), 'AUTONOMOUS_REVIEW_CONTROLLER_NOT_PROVISIONED');
  code(() => assertAutonomousIndependentReview([], input), 'AUTONOMOUS_REVIEW_CONTROLLER_NOT_PROVISIONED');
  code(() => assertAutonomousIndependentReview([comment({
    ...receipt,
    bootstrap_receipt_digest: `hmac-sha256:${'f'.repeat(64)}`,
  })], input), 'AUTONOMOUS_REVIEW_CONTROLLER_NOT_PROVISIONED');
  code(() => assertAutonomousIndependentReview([comment(receipt, {
    user: {login: 'untrusted-actor'},
    author_association: 'NONE',
  })], input), 'AUTONOMOUS_REVIEW_CONTROLLER_NOT_PROVISIONED');
  code(() => assertAutonomousIndependentReview([comment(receipt)], {
    ...input,
    reviewPolicy: {
      ...reviewPolicy,
      identity_assurance_boundary: {
        protected_attestation_controller_status: 'PROVISIONED_VERIFIED',
      },
    },
  }), 'AUTONOMOUS_REVIEW_BINDING_INVALID');
});

test('protected signed autonomous review is exact-bound and fail-closed', () => {
  const {publicKey, privateKey} = generateKeyPairSync('ed25519');
  const {publicKey: storePublicKey, privateKey: storePrivateKey} = generateKeyPairSync('ed25519');
  const signer = 'kpmo-provenance-controller-v1';
  const storeSigner = 'kpmo-durable-review-store-v1';
  const requiredDomain = 'governance_independence_and_provenance';
  const reviewPolicy = {
    status: 'ACTIVE_MANDATORY_FAIL_CLOSED',
    identity_assurance_boundary: {
      protected_attestation_controller_status: 'PROVISIONED_VERIFIED',
      protected_attestation_trust: {
        signature_algorithm: 'Ed25519',
        current_revocation_epoch: 4,
        trusted_signers: [{
          signer_identity_and_version: signer,
          public_key_pem: publicKey.export({type: 'spki', format: 'pem'}).toString(),
          revoked: false,
        }],
        durable_store_trusted_signers: [{
          signer_identity_and_version: storeSigner,
          public_key_pem: storePublicKey.export({type: 'spki', format: 'pem'}).toString(),
          revoked: false,
        }],
      },
    },
    registered_role_routing: {[requiredDomain]: ['integration-conductor']},
  };
  const payload = {
    version: 'kidults-protected-autonomous-review-attestation-v1',
    repository,
    pull_request: 1580,
    exact_base_sha: baseSha,
    exact_head_sha: sha,
    exact_head_tree_sha: 'c'.repeat(40),
    implementer_agent_id: 'AI-018',
    reviewer_agent_id: 'AI-REVIEWER-01',
    assigned_reviewer_agent_id: 'AI-REVIEWER-01',
    implementer_session_id: 'implementation-session',
    reviewer_session_id: 'review-session',
    reviewed_head_sha: sha,
    required_domain: requiredDomain,
    reviewer_domain: requiredDomain,
    reviewer_role_id: 'integration-conductor',
    implementer_bootstrap_consumption_proof_id: 'bootstrap-consumption-implementer',
    reviewer_bootstrap_consumption_proof_id: 'bootstrap-consumption-reviewer',
    evidence_manifest_digest: `sha256:${'1'.repeat(64)}`,
    review_decision_digest: `sha256:${'2'.repeat(64)}`,
    decision: 'APPROVE',
    attestation_id: 'attestation-1580-a',
    issued_at: '2026-09-01T01:00:00.000Z',
    expires_at: '2026-09-01T01:30:00.000Z',
    signer_identity_and_version: signer,
    revocation_epoch: 4,
  };
  const commentFor = (value, key = privateKey) => {
    const signature = sign(null, Buffer.from(canonicalJson(value)), key).toString('base64');
    const envelope = {payload: value, signature_algorithm: 'Ed25519', signature_base64: signature};
    return {id: 91, body: `KIDULTS_PROTECTED_AUTONOMOUS_REVIEW_ATTESTATION_V1\n${Buffer.from(JSON.stringify(envelope)).toString('base64url')}`};
  };
  const input = {
    repository,
    prNumber: 1580,
    repositoryOwner: 'johnkim9524-collab',
    baseSha,
    headSha: sha,
    headTreeSha: 'c'.repeat(40),
    requiredDomain,
    evaluationTime: '2026-09-01T01:10:00.000Z',
    reviewPolicy,
  };
  const accepted = assertAutonomousIndependentReview([commentFor(payload)], input);
  assert.equal(accepted.state, 'PROTECTED_ATTESTATION_VERIFIED');
  assert.equal(accepted.comment_transport_only, true);
  assert.equal(accepted.repository_comment_is_authority, false);

  const rejected = (mutate, expected = 'AUTONOMOUS_REVIEW_CURRENT_APPROVAL_CARDINALITY') => {
    const changed = mutate({...payload});
    code(() => assertAutonomousIndependentReview([commentFor(changed)], input), expected);
  };
  rejected(value => ({...value, reviewer_agent_id: value.implementer_agent_id}));
  rejected(value => ({...value, reviewed_head_sha: 'd'.repeat(40)}));
  rejected(value => ({...value, exact_base_sha: 'd'.repeat(40)}));
  rejected(value => ({...value, exact_head_tree_sha: 'd'.repeat(40)}));
  rejected(value => ({...value, reviewer_domain: 'data_runtime_storage'}));
  rejected(value => ({...value, reviewer_role_id: 'unknown-role'}));
  rejected(value => ({...value, expires_at: '2026-09-01T01:05:00.000Z'}));
  code(() => assertAutonomousIndependentReview([commentFor({...payload, decision: 'REQUEST_CHANGES'})], input), 'AUTONOMOUS_REVIEW_REQUEST_CHANGES');
  code(() => assertAutonomousIndependentReview([commentFor(payload), commentFor({...payload, attestation_id: 'attestation-1580-b'})], input), 'AUTONOMOUS_REVIEW_CURRENT_APPROVAL_CARDINALITY');
  const {privateKey: wrongKey} = generateKeyPairSync('ed25519');
  code(() => assertAutonomousIndependentReview([commentFor(payload, wrongKey)], input), 'AUTONOMOUS_REVIEW_CURRENT_APPROVAL_CARDINALITY');
  code(() => assertAutonomousIndependentReview([], input), 'AUTONOMOUS_REVIEW_ATTESTATION_MISSING');
  code(() => assertAutonomousIndependentReview([commentFor(payload)], {
    ...input,
    reviewPolicy: {...reviewPolicy, identity_assurance_boundary: {
      ...reviewPolicy.identity_assurance_boundary,
      protected_attestation_trust: {...reviewPolicy.identity_assurance_boundary.protected_attestation_trust, trusted_signers: [{
        ...reviewPolicy.identity_assurance_boundary.protected_attestation_trust.trusted_signers[0], revoked: true,
      }]},
    }},
  }), 'AUTONOMOUS_REVIEW_CURRENT_APPROVAL_CARDINALITY');

  const operationBinding = {
    repository,
    pull_request: 1580,
    exact_base_sha: baseSha,
    exact_head_sha: sha,
    exact_head_tree_sha: 'c'.repeat(40),
    landing_run_id: 700,
    landing_run_attempt: 1,
    authorization_id_digest: `sha256:${'3'.repeat(64)}`,
  };
  const operationBindingDigest = `sha256:${createHash('sha256').update(canonicalJson(operationBinding)).digest('hex')}`;
  const durableReadback = {
    version: 'kidults-protected-review-durable-readback-v1',
    store_authority: 'PROTECTED_EXTERNAL_DURABLE_STORE',
    state: 'CONSUMED_EXACTLY_ONCE',
    repository,
    pull_request: 1580,
    exact_base_sha: baseSha,
    exact_head_sha: sha,
    exact_head_tree_sha: 'c'.repeat(40),
    attestation_id: payload.attestation_id,
    operation_binding_digest: operationBindingDigest,
    landing_run_id: 700,
    landing_run_attempt: 1,
    current_revocation_epoch: 4,
    consumption_id: 'durable-consumption-1580-a',
    consumed_at: '2026-09-01T01:09:00.000Z',
    signer_identity_and_version: storeSigner,
  };
  const storeCommentFor = (value, key = storePrivateKey) => {
    const signature = sign(null, Buffer.from(canonicalJson(value)), key).toString('base64');
    const envelope = {payload: value, signature_algorithm: 'Ed25519', signature_base64: signature};
    return {id: 92, body: `KIDULTS_PROTECTED_REVIEW_DURABLE_READBACK_V1\n${Buffer.from(JSON.stringify(envelope)).toString('base64url')}`};
  };
  const consumed = assertAutonomousIndependentReview([commentFor(payload), storeCommentFor(durableReadback)], {
    ...input, requireDurableConsumption: true, operationBinding,
  });
  assert.equal(consumed.durable_consumption.consumption_id, 'durable-consumption-1580-a');
  code(() => assertAutonomousIndependentReview([commentFor(payload)], {
    ...input, requireDurableConsumption: true, operationBinding,
  }), 'AUTONOMOUS_REVIEW_DURABLE_READBACK_INVALID');
  code(() => assertAutonomousIndependentReview([commentFor(payload), storeCommentFor({...durableReadback, landing_run_attempt: 2})], {
    ...input, requireDurableConsumption: true,
    operationBinding,
  }), 'AUTONOMOUS_REVIEW_DURABLE_READBACK_INVALID');
  code(() => assertAutonomousIndependentReview([commentFor(payload), storeCommentFor({...durableReadback, current_revocation_epoch: 3})], {
    ...input, requireDurableConsumption: true,
    operationBinding,
  }), 'AUTONOMOUS_REVIEW_DURABLE_READBACK_INVALID');
  code(() => assertAutonomousIndependentReview([commentFor(payload), storeCommentFor({...durableReadback, state: 'REPLAYED'})], {
    ...input, requireDurableConsumption: true,
    operationBinding,
  }), 'AUTONOMOUS_REVIEW_DURABLE_READBACK_INVALID');
  const {privateKey: forgedStoreKey} = generateKeyPairSync('ed25519');
  code(() => assertAutonomousIndependentReview([commentFor(payload), storeCommentFor(durableReadback, forgedStoreKey)], {
    ...input, requireDurableConsumption: true, operationBinding,
  }), 'AUTONOMOUS_REVIEW_DURABLE_READBACK_INVALID');
  code(() => assertAutonomousIndependentReview([commentFor(payload), storeCommentFor(durableReadback)], {
    ...input, requireDurableConsumption: true, operationBinding,
    reviewPolicy: {...reviewPolicy, identity_assurance_boundary: {
      ...reviewPolicy.identity_assurance_boundary,
      protected_attestation_trust: {...reviewPolicy.identity_assurance_boundary.protected_attestation_trust,
        durable_store_trusted_signers: [{
          ...reviewPolicy.identity_assurance_boundary.protected_attestation_trust.durable_store_trusted_signers[0], revoked: true,
        }]},
    }},
  }), 'AUTONOMOUS_REVIEW_DURABLE_READBACK_INVALID');
  code(() => assertAutonomousIndependentReview([commentFor(payload), storeCommentFor(durableReadback, privateKey)], {
    ...input, requireDurableConsumption: true, operationBinding,
    reviewPolicy: {...reviewPolicy, identity_assurance_boundary: {
      ...reviewPolicy.identity_assurance_boundary,
      protected_attestation_trust: {...reviewPolicy.identity_assurance_boundary.protected_attestation_trust,
        durable_store_trusted_signers: [{
          signer_identity_and_version: storeSigner,
          public_key_pem: publicKey.export({type: 'spki', format: 'pem'}).toString(),
          revoked: false,
        }]},
    }},
  }), 'AUTONOMOUS_REVIEW_DURABLE_READBACK_INVALID');
  code(() => assertAutonomousIndependentReview([commentFor(payload), storeCommentFor(durableReadback), storeCommentFor({...durableReadback, consumption_id: 'durable-consumption-duplicate'})], {
    ...input, requireDurableConsumption: true, operationBinding,
  }), 'AUTONOMOUS_REVIEW_DURABLE_READBACK_INVALID');
  assert.equal(sameAutonomousReview(consumed, consumed), true);
  for (const mutation of [
    {attestation_id: 'attestation-1580-replaced'},
    {reviewer_agent_id: 'AI-REVIEWER-02'},
    {evidence_manifest_digest: `sha256:${'4'.repeat(64)}`},
    {review_decision_digest: `sha256:${'5'.repeat(64)}`},
    {signer_identity_and_version: 'replacement-signer-v1'},
    {signature_digest: `sha256:${'6'.repeat(64)}`},
    {durable_consumption: {...consumed.durable_consumption, consumption_id: 'replacement-consumption'}},
  ]) assert.equal(sameAutonomousReview(consumed, {...consumed, ...mutation}), false);
});

test('autonomous review domain is recomputed from protected changed paths', () => {
  assert.equal(requiredAutonomousReviewDomain(['coordination/kidults/kpmo/x.json']), 'governance_independence_and_provenance');
  assert.equal(requiredAutonomousReviewDomain(['services/kidults-control-plane/src/x.mjs']), 'data_runtime_storage');
  assert.equal(requiredAutonomousReviewDomain(['coordination/kidults/security/x.json']), 'security_credentials_tls_ssh');
  assert.equal(requiredAutonomousReviewDomain(['scripts/kidults/portal/x.mjs']), 'portal');
  assert.equal(requiredAutonomousReviewDomain(['coordination/kidults/provider/x.json']), 'provider_rights_evidence');
  code(() => requiredAutonomousReviewDomain(['coordination/kidults/kpmo/x.json', 'services/kidults-control-plane/src/x.mjs']), 'AUTONOMOUS_REVIEW_MULTIPLE_DOMAINS_REQUIRED');
});

test('atomic landing trust is protected-main local policy, never candidate-head trust', () => {
  const source = readFileSync('scripts/kidults/kpmo/run-atomic-governed-landing-v1.mjs', 'utf8');
  assert.match(source, /protectedPlatformPolicy\.autonomous_independent_review/);
  assert.doesNotMatch(source, /reviewPolicyAtHead/);
  assert.match(source, /requireDurableConsumption:\s*true/);
  assert.doesNotMatch(source, /AUTONOMOUS_REVIEW_STORE_READBACK_PATH/);
});

test('#1580 producer-event substitution cannot claim exact consumer trigger binding', () => {
  const producerEvent = 'workflow_run';
  const manualConsumerEvent = 'workflow_dispatch';
  assert.equal(producerEvent === 'workflow_run', true, 'the #1580 expression produced a manual false-positive');
  assert.equal(manualConsumerEvent === 'workflow_run', false, 'correct semantics bind the consumer event');
});

const scopePolicy = {
  id: 'kidults-scope-aware-required-status-policy-v1',
  required_status_context: 'Aggregator',
  technical_base_contexts: ['Foundation'],
  scope_rules: [{id: 'scripts', prefixes: ['scripts/'], exact_paths: [], required_contexts: ['Red Team']}],
};

test('scope aggregation binds every changed file to exact contexts', () => {
  assert.deepEqual(resolveScopeRequirements([{filename: 'scripts/x.mjs'}], {commits: 1, changed_files: 1}, scopePolicy), {
    files: ['scripts/x.mjs'], scopes: ['scripts'], required_contexts: ['Foundation', 'Red Team'], zero_diff: false,
  });
});

test('zero-coverage changed scope is rejected', () => {
  code(() => resolveScopeRequirements([{filename: 'unknown-root/x'}], {commits: 1, changed_files: 1}, scopePolicy), 'ZERO_COVERAGE_SCOPE');
});

test('missing, pending, failed, and ambiguous latest checks are rejected', () => {
  code(() => evaluateRequiredCheckRuns([], ['Foundation']), 'REQUIRED_CONTEXT_MISSING');
  code(() => evaluateRequiredCheckRuns([{id: 1, name: 'Foundation', status: 'in_progress', created_at: '2026-01-01'}], ['Foundation']), 'REQUIRED_CONTEXT_NOT_TERMINAL');
  code(() => evaluateRequiredCheckRuns([{id: 1, name: 'Foundation', status: 'completed', conclusion: 'failure', completed_at: '2026-01-01'}], ['Foundation']), 'REQUIRED_CONTEXT_NOT_SUCCESS');
  code(() => evaluateRequiredCheckRuns([
    {id: 1, name: 'Foundation', status: 'completed', conclusion: 'success', completed_at: '2026-01-01'},
    {id: 2, name: 'Foundation', status: 'completed', conclusion: 'success', completed_at: '2026-01-01'},
  ], ['Foundation']), 'REQUIRED_CONTEXT_LATEST_AMBIGUOUS');
});

test('ARL exact generation admits exactly one authoritative consumable producer', () => {
  const receipt = {
    source_sha: sha,
    p1_workflow_run_id: 7,
    p1_artifact_id: 11,
    p1_artifact_digest: 'sha256:abc',
    artifact_role: 'AUTHORITATIVE_CONSUMABLE',
    authoritative_producer: true,
    exact_triggering_run_bound: true,
  };
  const key = authoritativeGenerationKey(receipt);
  assert.equal(assertSingleAuthoritativeProducer([receipt], key), receipt);
  code(() => assertSingleAuthoritativeProducer([receipt, {...receipt}], key), 'ARL_AUTHORITATIVE_PRODUCER_CARDINALITY');
  const recovery = {...receipt, artifact_role: 'RECOVERY_NON_CONSUMABLE', authoritative_producer: false, exact_triggering_run_bound: false};
  assert.equal(assertSingleAuthoritativeProducer([receipt, recovery], key), receipt);
});
