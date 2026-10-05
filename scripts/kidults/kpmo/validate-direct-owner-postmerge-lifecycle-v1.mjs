#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {verifyDirectOwnerPostmergeLifecycle} from './lib/direct-owner-postmerge-lifecycle-v1.mjs';

const sha = value => value.repeat(40);
const owner = 'owner';
const createdAt = '2026-09-25T12:00:00Z';
const approvedAt = '2026-09-25T12:10:00Z';
const mergedAt = '2026-09-25T12:20:00Z';
const body = 'approval-body';
const receipt = {
  id: 'kidults-direct-owner-landing-handoff-receipt-v1',
  state: 'CONSUMED_BY_DIRECT_OWNER_MERGE',
  exact_head_sha: sha('a'),
  merge_commit_sha: sha('b'),
  merged_by: owner,
  latest_ready_event_id: 101,
  latest_ready_event: 'created_ready_or_never_drafted',
  latest_ready_event_at: createdAt,
  approval_comment_id: 201,
  approval_comment_created_at: approvedAt,
  approval_comment_body_sha256: `sha256:${crypto.createHash('sha256').update(body).digest('hex')}`,
};
const pullRequest = {
  id: 101,
  state: 'closed',
  draft: false,
  created_at: createdAt,
  user: {login: owner},
  merged: true,
  head: {sha: receipt.exact_head_sha},
  merge_commit_sha: receipt.merge_commit_sha,
  merged_by: {login: owner},
};
const timeline = [
  {id: 301, event: 'merged', created_at: mergedAt, actor: {login: owner}, performed_via_github_app: null, commit_id: receipt.merge_commit_sha},
  {id: 302, event: 'closed', created_at: mergedAt, actor: {login: owner}, performed_via_github_app: null},
];
const comments = [{
  id: 201, body, created_at: approvedAt, updated_at: approvedAt,
  user: {login: owner, type: 'User'}, author_association: 'OWNER', performed_via_github_app: null,
}];

const proof = verifyDirectOwnerPostmergeLifecycle({receipt, pullRequest, timeline, comments, repositoryOwner: owner});
assert.equal(proof.state, 'VERIFIED_EXACT_LANDED_POSTMERGE_LIFECYCLE');
assert.equal(proof.synthetic_lifecycle_boundary, true);

assert.throws(() => verifyDirectOwnerPostmergeLifecycle({
  receipt, pullRequest, timeline: timeline.filter(value => value.event !== 'merged'), comments, repositoryOwner: owner,
}), /LIFECYCLE_READY_GENERATION_INVALIDATED:closed/);
assert.throws(() => verifyDirectOwnerPostmergeLifecycle({
  receipt, pullRequest, timeline, comments: [{...comments[0], body: 'mutated'}], repositoryOwner: owner,
}), /DIRECT_OWNER_POSTMERGE_APPROVAL_BODY_DRIFT/);
assert.throws(() => verifyDirectOwnerPostmergeLifecycle({
  receipt, pullRequest: {...pullRequest, merged_by: {login: 'other'}}, timeline, comments, repositoryOwner: owner,
}), /DIRECT_OWNER_POSTMERGE_PR_BINDING_INVALID/);
assert.throws(() => verifyDirectOwnerPostmergeLifecycle({
  receipt, pullRequest, timeline: [...timeline, {id: 303, event: 'reopened', created_at: '2026-09-25T12:21:00Z', actor: {login: owner}}], comments, repositoryOwner: owner,
}), /LIFECYCLE_READY_GENERATION_INVALIDATED:reopened/);

console.log('Direct Owner exact-landed post-merge lifecycle regression: PASS');
