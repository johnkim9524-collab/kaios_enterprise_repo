#!/usr/bin/env node
import {
  selectLatestDirectOwnerReadyEvent,
} from './lib/direct-owner-ready-event-v1.mjs';

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

const owner = 'repository-owner';
const ready = ({
  id,
  at,
  actor = owner,
  app = null,
  event = 'ready_for_review',
}) => ({
  id,
  event,
  created_at: at,
  actor: {login: actor},
  performed_via_github_app: app,
});
const transition = ({id, at, event, actor = owner, app = null}) => ({
  id,
  event,
  created_at: at,
  actor: {login: actor},
  performed_via_github_app: app,
});
const merged = ({
  id,
  at,
  actor = owner,
  app = null,
  commit = 'a'.repeat(40),
}) => ({
  id,
  event: 'merged',
  created_at: at,
  actor: {login: actor},
  performed_via_github_app: app,
  commit_id: commit,
});

const selected = selectLatestDirectOwnerReadyEvent({
  repositoryOwner: owner,
  timeline: [
    ready({id: 102, at: '2026-09-02T00:02:00Z', event: 'convert_to_draft'}),
    ready({id: 103, at: '2026-09-02T00:03:00Z'}),
    ready({id: 101, at: '2026-09-02T00:01:00Z'}),
  ],
});
assert(selected.id === 103, 'LATEST_READY_EVENT_SELECTION');
assert(selected.actor === owner, 'DIRECT_OWNER_ACTOR_BINDING');
assert(selected.performed_via_github_app === null, 'DIRECT_OWNER_APP_NULL_BINDING');
assert(selected.direct_repository_owner === true, 'DIRECT_OWNER_BOOLEAN_BINDING');
assert(selected.latest_invalidating_event?.id === 102, 'LATEST_INVALIDATING_EVENT_BINDING');

const tieBrokenByEventId = selectLatestDirectOwnerReadyEvent({
  repositoryOwner: owner,
  timeline: [
    ready({id: 200, at: '2026-09-02T00:04:00Z'}),
    ready({id: 201, at: '2026-09-02T00:04:00Z'}),
  ],
});
assert(tieBrokenByEventId.id === 201, 'READY_EVENT_ID_TIE_BREAK');

expectReject('LIFECYCLE_LATEST_READY_EVENT_REQUIRED', () =>
  selectLatestDirectOwnerReadyEvent({
    repositoryOwner: owner,
    timeline: [
      ready({id: 300, at: '2026-09-02T00:05:00Z'}),
      ready({id: 301, at: '2026-09-02T00:06:00Z', event: 'convert_to_draft'}),
    ],
  }));
expectReject('LIFECYCLE_READY_EVENT_ACTOR_NOT_REPOSITORY_OWNER', () =>
  selectLatestDirectOwnerReadyEvent({
    repositoryOwner: owner,
    timeline: [ready({id: 400, at: '2026-09-02T00:07:00Z', actor: 'collaborator'})],
  }));
expectReject('LIFECYCLE_READY_EVENT_APP_MEDIATED', () =>
  selectLatestDirectOwnerReadyEvent({
    repositoryOwner: owner,
    timeline: [ready({id: 500, at: '2026-09-02T00:08:00Z', app: {id: 1144995}})],
  }));
expectReject('LIFECYCLE_READY_EVENT_APP_MEDIATED', () =>
  selectLatestDirectOwnerReadyEvent({
    repositoryOwner: owner,
    timeline: [{
      id: 501,
      event: 'ready_for_review',
      created_at: '2026-09-02T00:08:01Z',
      actor: {login: owner},
    }],
  }));
expectReject('LIFECYCLE_READY_EVENT_ID_INVALID', () =>
  selectLatestDirectOwnerReadyEvent({
    repositoryOwner: owner,
    timeline: [ready({id: 0, at: '2026-09-02T00:09:00Z'})],
  }));
expectReject('LIFECYCLE_READY_EVENT_TIME_INVALID', () =>
  selectLatestDirectOwnerReadyEvent({
    repositoryOwner: owner,
    timeline: [ready({id: 600, at: 'not-a-time'})],
  }));
expectReject('LIFECYCLE_READY_GENERATION_INVALIDATED', () =>
  selectLatestDirectOwnerReadyEvent({
    repositoryOwner: owner,
    timeline: [
      ready({id: 700, at: '2026-09-02T00:10:00Z'}),
      transition({id: 701, at: '2026-09-02T00:11:00Z', event: 'closed'}),
      transition({id: 702, at: '2026-09-02T00:12:00Z', event: 'reopened'}),
    ],
  }));

const naturalMergedClose = selectLatestDirectOwnerReadyEvent({
  repositoryOwner: owner,
  timeline: [
    ready({id: 710, at: '2026-09-02T00:20:00Z'}),
    merged({id: 711, at: '2026-09-02T00:21:00Z'}),
    transition({id: 712, at: '2026-09-02T00:21:00Z', event: 'closed'}),
  ],
});
assert(naturalMergedClose.id === 710, 'NATURAL_MERGED_CLOSE_PRESERVES_READY_GENERATION');
assert(naturalMergedClose.latest_invalidating_event === null, 'NATURAL_MERGED_CLOSE_NOT_INVALIDATING');

expectReject('LIFECYCLE_READY_GENERATION_INVALIDATED:closed', () =>
  selectLatestDirectOwnerReadyEvent({
    repositoryOwner: owner,
    timeline: [
      ready({id: 720, at: '2026-09-02T00:22:00Z'}),
      transition({id: 721, at: '2026-09-02T00:23:00Z', event: 'closed'}),
    ],
  }));
expectReject('LIFECYCLE_READY_GENERATION_INVALIDATED:closed', () =>
  selectLatestDirectOwnerReadyEvent({
    repositoryOwner: owner,
    timeline: [
      ready({id: 730, at: '2026-09-02T00:24:00Z'}),
      merged({id: 731, at: '2026-09-02T00:25:00Z', actor: 'collaborator'}),
      transition({id: 732, at: '2026-09-02T00:25:00Z', event: 'closed'}),
    ],
  }));
expectReject('LIFECYCLE_READY_GENERATION_INVALIDATED:closed', () =>
  selectLatestDirectOwnerReadyEvent({
    repositoryOwner: owner,
    timeline: [
      ready({id: 740, at: '2026-09-02T00:26:00Z'}),
      merged({id: 741, at: '2026-09-02T00:27:00Z', app: {id: 1144995}}),
      transition({id: 742, at: '2026-09-02T00:27:00Z', event: 'closed'}),
    ],
  }));
expectReject('LIFECYCLE_READY_GENERATION_INVALIDATED:closed', () =>
  selectLatestDirectOwnerReadyEvent({
    repositoryOwner: owner,
    timeline: [
      ready({id: 750, at: '2026-09-02T00:28:00Z'}),
      merged({id: 751, at: '2026-09-02T00:29:00Z'}),
      transition({id: 752, at: '2026-09-02T00:29:01Z', event: 'closed'}),
    ],
  }));
expectReject('LIFECYCLE_READY_GENERATION_INVALIDATED:reopened', () =>
  selectLatestDirectOwnerReadyEvent({
    repositoryOwner: owner,
    timeline: [
      ready({id: 760, at: '2026-09-02T00:30:00Z'}),
      merged({id: 761, at: '2026-09-02T00:31:00Z'}),
      transition({id: 762, at: '2026-09-02T00:31:00Z', event: 'closed'}),
      transition({id: 763, at: '2026-09-02T00:32:00Z', event: 'reopened'}),
    ],
  }));

const reopenedThenFreshReady = selectLatestDirectOwnerReadyEvent({
  repositoryOwner: owner,
  timeline: [
    ready({id: 800, at: '2026-09-02T00:13:00Z'}),
    transition({id: 801, at: '2026-09-02T00:14:00Z', event: 'closed'}),
    transition({id: 802, at: '2026-09-02T00:15:00Z', event: 'reopened'}),
    ready({id: 803, at: '2026-09-02T00:16:00Z'}),
  ],
});
assert(reopenedThenFreshReady.id === 803, 'REOPEN_REQUIRES_FRESH_READY');
assert(reopenedThenFreshReady.latest_invalidating_event?.id === 802, 'REOPEN_EVENT_BOUND');
assert(reopenedThenFreshReady.latest_invalidating_event?.event === 'reopened', 'REOPEN_EVENT_TYPE_BOUND');

expectReject('LIFECYCLE_READY_TIMELINE_INVALID', () =>
  selectLatestDirectOwnerReadyEvent({repositoryOwner: owner, timeline: null}));
expectReject('LIFECYCLE_REPOSITORY_OWNER_INVALID', () =>
  selectLatestDirectOwnerReadyEvent({repositoryOwner: '', timeline: []}));

console.log('Direct repository-owner Ready event regression: PASS');
