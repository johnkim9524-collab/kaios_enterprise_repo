import crypto from 'node:crypto';
import {selectLatestLifecycleReadyEvent} from './direct-owner-ready-event-v1.mjs';

const SHA40 = /^[0-9a-f]{40}$/;
const fail = code => { throw new Error(code); };

export function verifyDirectOwnerPostmergeLifecycle({
  receipt,
  pullRequest,
  timeline,
  comments,
  repositoryOwner,
} = {}) {
  if (receipt?.id !== 'kidults-direct-owner-landing-handoff-receipt-v1'
    || receipt?.state !== 'CONSUMED_BY_DIRECT_OWNER_MERGE') {
    fail('DIRECT_OWNER_POSTMERGE_RECEIPT_STATE_INVALID');
  }
  if (!SHA40.test(receipt?.exact_head_sha || '') || !SHA40.test(receipt?.merge_commit_sha || '')) {
    fail('DIRECT_OWNER_POSTMERGE_RECEIPT_SHA_INVALID');
  }
  if (!Array.isArray(timeline) || !Array.isArray(comments) || !repositoryOwner) {
    fail('DIRECT_OWNER_POSTMERGE_INPUT_INVALID');
  }
  if (pullRequest?.merged !== true || pullRequest?.state !== 'closed') {
    fail('DIRECT_OWNER_POSTMERGE_PR_NOT_MERGED');
  }
  if (pullRequest?.head?.sha !== receipt.exact_head_sha
    || pullRequest?.merge_commit_sha !== receipt.merge_commit_sha
    || pullRequest?.merged_by?.login !== repositoryOwner
    || receipt?.merged_by !== repositoryOwner) {
    fail('DIRECT_OWNER_POSTMERGE_PR_BINDING_INVALID');
  }

  const ready = selectLatestLifecycleReadyEvent({timeline, repositoryOwner, pullRequest});
  if (ready.id !== receipt.latest_ready_event_id
    || ready.event !== receipt.latest_ready_event
    || ready.created_at !== receipt.latest_ready_event_at) {
    fail('DIRECT_OWNER_POSTMERGE_READY_BOUNDARY_DRIFT');
  }

  const approval = comments.find(value => Number(value?.id) === receipt.approval_comment_id);
  if (!approval) fail('DIRECT_OWNER_POSTMERGE_APPROVAL_MISSING');
  if (approval?.user?.login !== repositoryOwner
    || approval?.user?.type !== 'User'
    || approval?.author_association !== 'OWNER'
    || approval?.performed_via_github_app != null
    || approval?.updated_at !== approval?.created_at
    || approval?.created_at !== receipt.approval_comment_created_at) {
    fail('DIRECT_OWNER_POSTMERGE_APPROVAL_BINDING_INVALID');
  }
  const bodySha256 = `sha256:${crypto.createHash('sha256').update(String(approval.body || '')).digest('hex')}`;
  if (bodySha256 !== receipt.approval_comment_body_sha256) {
    fail('DIRECT_OWNER_POSTMERGE_APPROVAL_BODY_DRIFT');
  }

  const matchingMerged = timeline.filter(value => value?.event === 'merged'
    && value?.actor?.login === repositoryOwner
    && value?.performed_via_github_app === null
    && value?.commit_id === receipt.merge_commit_sha);
  if (matchingMerged.length !== 1) fail('DIRECT_OWNER_POSTMERGE_NATURAL_MERGE_EVENT_INVALID');

  return Object.freeze({
    state: 'VERIFIED_EXACT_LANDED_POSTMERGE_LIFECYCLE',
    exact_head_sha: receipt.exact_head_sha,
    merge_commit_sha: receipt.merge_commit_sha,
    ready_event_id: ready.id,
    ready_event: ready.event,
    synthetic_lifecycle_boundary: ready.synthetic_lifecycle_boundary === true,
    approval_comment_id: receipt.approval_comment_id,
    merged_event_id: Number(matchingMerged[0].id),
    authority_granted: false,
    promotion_eligible: false,
    production: 'HOLD',
    public: 'HOLD',
    g5: 'HOLD',
  });
}
