const fail = code => { throw new Error(code); };
const READY_EVENTS = new Set(['ready_for_review', 'convert_to_draft']);
const GENERATION_INVALIDATING_EVENTS = new Set(['convert_to_draft', 'closed', 'reopened']);
const LIFECYCLE_EVENTS = new Set([
  'ready_for_review',
  ...GENERATION_INVALIDATING_EVENTS,
]);

const eventTime = value => {
  const parsed = Date.parse(String(value || ''));
  if (!Number.isFinite(parsed)) fail('LIFECYCLE_READY_EVENT_TIME_INVALID');
  return parsed;
};

const normalizeLifecycleEvent = item => {
  const id = Number(item?.id);
  if (!Number.isSafeInteger(id) || id <= 0) fail('LIFECYCLE_READY_EVENT_ID_INVALID');
  const createdAt = String(item?.created_at || '');
  return {
    item,
    id,
    createdAt,
    time: eventTime(createdAt),
  };
};

export function selectLatestDirectOwnerReadyEvent({timeline, repositoryOwner} = {}) {
  if (!Array.isArray(timeline)) fail('LIFECYCLE_READY_TIMELINE_INVALID');
  if (typeof repositoryOwner !== 'string' || repositoryOwner.length === 0) {
    fail('LIFECYCLE_REPOSITORY_OWNER_INVALID');
  }

  const lifecycleEvents = timeline
    .filter(item => LIFECYCLE_EVENTS.has(item?.event))
    .map(normalizeLifecycleEvent)
    .sort((left, right) => left.time - right.time || left.id - right.id);

  const latestReady = lifecycleEvents
    .filter(entry => READY_EVENTS.has(entry.item?.event))
    .at(-1);
  if (!latestReady || latestReady.item?.event !== 'ready_for_review') {
    fail('LIFECYCLE_LATEST_READY_EVENT_REQUIRED');
  }

  const laterInvalidatingEvent = lifecycleEvents.find(entry =>
    GENERATION_INVALIDATING_EVENTS.has(entry.item?.event)
    && (entry.time > latestReady.time
      || (entry.time === latestReady.time && entry.id > latestReady.id)));
  if (laterInvalidatingEvent) {
    fail(`LIFECYCLE_READY_GENERATION_INVALIDATED:${laterInvalidatingEvent.item.event}`);
  }

  const actor = String(latestReady.item?.actor?.login || '');
  if (actor !== repositoryOwner) {
    fail('LIFECYCLE_READY_EVENT_ACTOR_NOT_REPOSITORY_OWNER');
  }
  if (latestReady.item?.performed_via_github_app !== null) {
    fail('LIFECYCLE_READY_EVENT_APP_MEDIATED');
  }

  const latestInvalidatingEvent = lifecycleEvents
    .filter(entry => GENERATION_INVALIDATING_EVENTS.has(entry.item?.event))
    .at(-1);

  return Object.freeze({
    id: latestReady.id,
    event: 'ready_for_review',
    created_at: latestReady.createdAt,
    actor,
    performed_via_github_app: null,
    direct_repository_owner: true,
    latest_invalidating_event: latestInvalidatingEvent
      ? Object.freeze({
          id: latestInvalidatingEvent.id,
          event: latestInvalidatingEvent.item.event,
          created_at: latestInvalidatingEvent.createdAt,
        })
      : null,
  });
}
