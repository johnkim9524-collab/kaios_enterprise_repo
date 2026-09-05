const fail = code => { throw new Error(code); };
const SHA40 = /^[0-9a-f]{40}$/;
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

const isBoundNaturalMergedClose = ({timeline, closeEntry, repositoryOwner}) => {
  if (closeEntry?.item?.event !== 'closed') return false;
  if (closeEntry.item?.actor?.login !== repositoryOwner) return false;
  if (closeEntry.item?.performed_via_github_app !== null) return false;

  const matchingMergedEvents = timeline
    .filter(item => item?.event === 'merged')
    .map(normalizeLifecycleEvent)
    .filter(entry =>
      entry.id < closeEntry.id
      && entry.createdAt === closeEntry.createdAt
      && entry.item?.actor?.login === repositoryOwner
      && entry.item?.performed_via_github_app === null
      && SHA40.test(String(entry.item?.commit_id || '')));

  return matchingMergedEvents.length === 1;
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

  const invalidatingEvents = lifecycleEvents.filter(entry =>
    GENERATION_INVALIDATING_EVENTS.has(entry.item?.event)
    && !isBoundNaturalMergedClose({timeline, closeEntry: entry, repositoryOwner}));

  const laterInvalidatingEvent = invalidatingEvents.find(entry =>
    entry.time > latestReady.time
    || (entry.time === latestReady.time && entry.id > latestReady.id));
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

  const latestInvalidatingEvent = invalidatingEvents.at(-1);

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
