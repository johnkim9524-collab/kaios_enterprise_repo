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
expectReject('LIFECYCLE_READY_TIMELINE_INVALID', () =>
  selectLatestDirectOwnerReadyEvent({repositoryOwner: owner, timeline: null}));
expectReject('LIFECYCLE_REPOSITORY_OWNER_INVALID', () =>
  selectLatestDirectOwnerReadyEvent({repositoryOwner: '', timeline: []}));

console.log('Direct repository-owner Ready event regression: PASS');
