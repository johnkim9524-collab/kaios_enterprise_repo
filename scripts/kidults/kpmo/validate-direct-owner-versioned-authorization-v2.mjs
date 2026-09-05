#!/usr/bin/env node
import fs from 'node:fs';
import {
  assertDirectOwnerGenerationUnused,
  collectDirectOwnerReadyStateMutations,
  directOwnerConsumptionContext,
  parseDirectOwnerAuthorizationId,
  selectDirectOwnerUiAttestation,
} from './lib/direct-owner-versioned-authorization-v2.mjs';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const expectReject = (code, fn) => {
  let rejected = false;
  try {
    fn();
  } catch (error) {
    rejected = String(error?.message || error).includes(code);
  }
  assert(rejected, `EXPECTED_REJECTION_MISSING:${code}`);
};

const prNumber = '2027';
const headSha = 'bcaf1f003cb5c8ae9760a8d82bece26df5babe8c';
const legacyId = 'DIRECT-PR-2027-bcaf1f003cb5';
const retryId = 'DIRECT-PR-2027-bcaf1f003cb5-R2';

const legacy = parseDirectOwnerAuthorizationId({authorizationId: legacyId, prNumber, headSha});
assert(legacy.scheme === 'LEGACY_INITIAL' && legacy.generation === null
  && legacy.generation_key === 'LEGACY', 'LEGACY_ID_COMPATIBILITY');
for (const generation of [1, 2, 19]) {
  const parsed = parseDirectOwnerAuthorizationId({
    authorizationId: `${legacyId}-R${generation}`,
    prNumber,
    headSha,
  });
  assert(parsed.scheme === 'VERSIONED_RETRY' && parsed.generation === generation
    && parsed.generation_key === `R${generation}`, `VERSIONED_ID_R${generation}`);
}

for (const invalid of [
  `${legacyId}-R0`, `${legacyId}-R-1`, `${legacyId}-R01`, `${legacyId}-R`,
  `${legacyId}-retry2`, `${legacyId}-R1-extra`, `${legacyId}-R9007199254740992`,
]) {
  expectReject('DIRECT_OWNER_HANDOFF_AUTHORIZATION_', () =>
    parseDirectOwnerAuthorizationId({authorizationId: invalid, prNumber, headSha}));
}
expectReject('DIRECT_OWNER_HANDOFF_AUTHORIZATION_PR_MISMATCH', () =>
  parseDirectOwnerAuthorizationId({authorizationId: retryId, prNumber: '2028', headSha}));
expectReject('DIRECT_OWNER_HANDOFF_AUTHORIZATION_HEAD_MISMATCH', () =>
  parseDirectOwnerAuthorizationId({authorizationId: retryId, prNumber, headSha: `a${headSha.slice(1)}`}));

const legacyContext = directOwnerConsumptionContext({prNumber, headSha, generationKey: 'LEGACY'});
const retryContext = directOwnerConsumptionContext({prNumber, headSha, generationKey: 'R2'});
assert(legacyContext !== retryContext, 'GENERATION_CONTEXTS_MUST_DIFFER');

assertDirectOwnerGenerationUnused({
  authorizationId: retryId,
  consumptionContext: retryContext,
  statuses: [{context: legacyContext}],
  workflowRuns: [{id: 91, display_title: `KIDULTS Direct Owner Handoff PR #2027 / ${legacyId}`}],
  currentRunId: '92',
});
expectReject('DIRECT_OWNER_HANDOFF_AUTHORIZATION_REPLAY_STATUS', () =>
  assertDirectOwnerGenerationUnused({
    authorizationId: retryId,
    consumptionContext: retryContext,
    statuses: [{context: retryContext}],
    workflowRuns: [],
    currentRunId: '92',
  }));
expectReject('DIRECT_OWNER_HANDOFF_AUTHORIZATION_REPLAY_RUN', () =>
  assertDirectOwnerGenerationUnused({
    authorizationId: retryId,
    consumptionContext: retryContext,
    statuses: [],
    workflowRuns: [
      {id: 91, display_title: `KIDULTS Direct Owner Handoff PR #2027 / ${retryId}`},
      {id: 92, display_title: `KIDULTS Direct Owner Handoff PR #2027 / ${retryId}`},
    ],
    currentRunId: '92',
  }));
assertDirectOwnerGenerationUnused({
  authorizationId: retryId,
  consumptionContext: retryContext,
  statuses: [],
  workflowRuns: [{id: 92, display_title: `KIDULTS Direct Owner Handoff PR #2027 / ${retryId}`}],
  currentRunId: '92',
});

const owner = 'johnkim9524-collab';
const repository = `${owner}/kaios_enterprise_repo`;
const readyEvent = {id: 700, created_at: '2026-09-05T17:04:09Z'};
const uiBody = ({
  repo = repository,
  pr = prNumber,
  head = headSha,
  auth = retryId,
  ready = '700',
  transport = 'DIRECT_OWNER_GITHUB_UI',
  state = 'AUTHENTICATED_OWNER_UI_READY',
  expires = '2026-09-05T17:25:00Z',
} = {}) => [
  'KIDULTS_DIRECT_OWNER_UI_SESSION_ATTESTATION_V1',
  `repository=${repo}`,
  `pull_request=${pr}`,
  `exact_head_sha=${head}`,
  `authorization_id=${auth}`,
  `ready_event_id=${ready}`,
  `transport=${transport}`,
  `session_state=${state}`,
  `expires_at=${expires}`,
].join('\n');
const uiComment = ({
  id = 800,
  body = uiBody(),
  login = owner,
  association = 'OWNER',
  type = 'User',
  app = null,
  created = '2026-09-05T17:05:00Z',
  updated = created,
} = {}) => ({
  id, body, user: {login, type}, author_association: association,
  performed_via_github_app: app, created_at: created, updated_at: updated,
});
const uiOptions = {
  evidenceCommentId: 800,
  repository,
  repositoryOwner: owner,
  prNumber,
  headSha,
  authorizationId: retryId,
  readyEvent,
  evaluationTime: '2026-09-05T17:06:00Z',
  handoffWindowSeconds: 300,
};
const uiEvidence = selectDirectOwnerUiAttestation([uiComment()], uiOptions);
assert(uiEvidence.comment_id === 800 && uiEvidence.ready_event_id === 700
  && uiEvidence.actor === owner, 'OWNER_UI_ATTESTATION_POSITIVE');

expectReject('DIRECT_OWNER_UI_ATTESTATION_MISSING', () =>
  selectDirectOwnerUiAttestation([], uiOptions));
expectReject('DIRECT_OWNER_UI_ATTESTATION_ACTOR_INVALID', () =>
  selectDirectOwnerUiAttestation([uiComment({login: 'collaborator'})], uiOptions));
expectReject('DIRECT_OWNER_UI_ATTESTATION_APP_MEDIATED', () =>
  selectDirectOwnerUiAttestation([uiComment({app: {slug: 'automation'}})], uiOptions));
expectReject('DIRECT_OWNER_UI_ATTESTATION_EDITED', () =>
  selectDirectOwnerUiAttestation([uiComment({updated: '2026-09-05T17:05:01Z'})], uiOptions));
expectReject('DIRECT_OWNER_UI_ATTESTATION_READY_EVENT_MISMATCH', () =>
  selectDirectOwnerUiAttestation([uiComment({body: uiBody({ready: '699'})})], uiOptions));
expectReject('DIRECT_OWNER_UI_ATTESTATION_BINDING_INVALID', () =>
  selectDirectOwnerUiAttestation([uiComment({body: uiBody({auth: `${legacyId}-R3`})})], uiOptions));
expectReject('DIRECT_OWNER_UI_ATTESTATION_PRECEDES_READY', () =>
  selectDirectOwnerUiAttestation([uiComment({created: '2026-09-05T17:04:00Z'})], uiOptions));
expectReject('DIRECT_OWNER_UI_ATTESTATION_EXPIRED', () =>
  selectDirectOwnerUiAttestation([uiComment({body: uiBody({expires: '2026-09-05T17:05:30Z'})})], uiOptions));
expectReject('DIRECT_OWNER_UI_ATTESTATION_EXPIRES_BEFORE_WINDOW', () =>
  selectDirectOwnerUiAttestation([uiComment({body: uiBody({expires: '2026-09-05T17:09:00Z'})})], uiOptions));

const mutations = collectDirectOwnerReadyStateMutations([
  {id: 700, event: 'ready_for_review', created_at: readyEvent.created_at, actor: {login: owner}, performed_via_github_app: null},
  {id: 701, event: 'convert_to_draft', created_at: '2026-09-05T17:07:00Z', actor: {login: owner}, performed_via_github_app: null},
  {id: 702, event: 'ready_for_review', created_at: '2026-09-05T17:08:00Z', actor: {login: owner}, performed_via_github_app: {slug: 'automation'}},
  {id: 703, event: 'commented', created_at: '2026-09-05T17:09:00Z', actor: {login: owner}},
], readyEvent);
assert(mutations.length === 2, 'WINDOW_MUTATION_COUNT');
assert(mutations[0].event_id === 701 && mutations[0].event === 'convert_to_draft'
  && mutations[0].actor === owner && mutations[0].timestamp === '2026-09-05T17:07:00Z',
  'WINDOW_DRAFT_MUTATION_RECEIPT');
assert(mutations[1].event_id === 702 && mutations[1].performed_via_github_app?.slug === 'automation',
  'WINDOW_READY_MUTATION_APP_RECEIPT');

const workflow = fs.readFileSync('.github/workflows/kidults-direct-owner-landing-handoff-v1.yml', 'utf8');
const runner = fs.readFileSync('scripts/kidults/kpmo/run-direct-owner-landing-handoff-v1.mjs', 'utf8');
const policy = JSON.parse(fs.readFileSync('coordination/kidults/kpmo/governed-landing-authorization-policy-v1.json', 'utf8'));
assert(workflow.includes('description: Legacy DIRECT-PR-<number>-<head12> or retry DIRECT-PR-<number>-<head12>-R<positive_integer>'),
  'WORKFLOW_VERSIONED_ID_CONTRACT');
assert(workflow.includes('owner_ui_evidence_comment_id:'), 'WORKFLOW_UI_EVIDENCE_INPUT');
assert(/concurrency:\n[\s\S]*?group: kidults-direct-owner-landing-handoff-v1-\$\{\{ github\.event_name == 'workflow_dispatch' && 'handoff' \|\| 'revocation' \}\}\n  cancel-in-progress: false/.test(workflow),
  'WORKFLOW_GLOBAL_SERIAL_CONCURRENCY');
assert(workflow.includes("startsWith(github.event.comment.body, 'KIDULTS_DIRECT_OWNER_UI_SESSION_ATTESTATION_V1')"),
  'WORKFLOW_UI_MUTATION_REVOCATION');
const claimIndex = runner.indexOf('await publishConsumption(');
const approvalIndex = runner.indexOf('const approval = selectApproval(');
const uiIndex = runner.indexOf('const ownerUiEvidence = selectDirectOwnerUiAttestation(');
const openIndex = runner.indexOf("await publish('success', `Direct Owner UI merge authorized");
const mutationReceiptIndex = runner.indexOf('window_ready_state_mutations: windowReadyStateMutations');
const mutationFailureIndex = runner.indexOf("fail('DIRECT_OWNER_HANDOFF_READY_STATE_MUTATED_DURING_WINDOW')");
assert(claimIndex > 0 && claimIndex < approvalIndex, 'FIRST_ATTEMPT_CONSUMED_BEFORE_APPROVAL_FAILURE');
assert(approvalIndex < uiIndex && uiIndex < openIndex, 'APPROVAL_UI_READY_BEFORE_WINDOW_OPEN');
assert(mutationReceiptIndex > 0 && mutationReceiptIndex < mutationFailureIndex,
  'WINDOW_MUTATION_RECEIPTED_BEFORE_FAILURE');
assert(runner.includes('assertDirectOwnerGenerationUnused') && runner.includes('handoffWorkflowRuns()')
  && runner.includes('statusHistory(expectedHeadSha)'), 'GLOBAL_REPLAY_EVIDENCE_BOUND');
const directPolicy = policy.direct_owner_handoff_policy;
assert(policy.version === '1.5.0' && directPolicy?.one_shot_scope === 'REPOSITORY_GLOBAL_PR_EXACT_HEAD_GENERATION',
  'POLICY_GLOBAL_ONE_SHOT');
assert(directPolicy?.prior_generation_consumption_blocks_new_explicit_generation === false
  && directPolicy?.same_generation_replay_allowed === false, 'POLICY_GENERATION_ISOLATION');
assert(directPolicy?.owner_ui_attestation?.must_bind_latest_ready_event_id === true
  && directPolicy?.window_lifecycle_receipt?.ready_and_draft_mutations_recorded_before_failure === true,
  'POLICY_UI_AND_MUTATION_RECEIPT');

console.log(JSON.stringify({
  state: 'VERIFIED_PASS',
  suite: 'DIRECT_OWNER_VERSIONED_AUTHORIZATION_V2',
  legacy_compatibility: true,
  versioned_generations_verified: [1, 2, 19],
  negative_id_cases: 9,
  replay_status_rejected: true,
  replay_run_rejected: true,
  prior_generation_does_not_block_new_generation: true,
  global_concurrency_serialized: true,
  owner_ui_attestation_negative_cases: 9,
  window_mutation_receipt_verified: true,
  production: 'HOLD', public: 'HOLD', g5: 'HOLD',
}, null, 2));
