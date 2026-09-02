const fail = code => { throw new Error(code); };
const READY_EVENTS = new Set(['ready_for_review', 'convert_to_draft']);

const eventTime = value => {
  const parsed = Date.parse(String(value || ''));
  if (!Number.isFinite(parsed)) fail('LIFECYCLE_READY_EVENT_TIME_INVALID');
  return parsed;
};

export function selectLatestDirectOwnerReadyEvent({timeline, repositoryOwner} = {}) {
  if (!Array.isArray(timeline)) fail('LIFECYCLE_READY_TIMELINE_INVALID');
  if (typeof repositoryOwner !== 'string' || repositoryOwner.length === 0) {
    fail('LIFECYCLE_REPOSITORY_OWNER_INVALID');
  }

  const readinessEvents = timeline
    .filter(item => READY_EVENTS.has(item?.event))
    .map(item => {
      const id = Number(item?.id);
      if (!Number.isSafeInteger(id) || id <= 0) fail('LIFECYCLE_READY_EVENT_ID_INVALID');
      const createdAt = String(item?.created_at || '');
      return {item, id, createdAt, time: eventTime(createdAt)};
    })
    .sort((left, right) => left.time - right.time || left.id - right.id);

  const latest = readinessEvents.at(-1);
  if (!latest || latest.item?.event !== 'ready_for_review') {
    fail('LIFECYCLE_LATEST_READY_EVENT_REQUIRED');
  }

  const actor = String(latest.item?.actor?.login || '');
  if (actor !== repositoryOwner) {
    fail('LIFECYCLE_READY_EVENT_ACTOR_NOT_REPOSITORY_OWNER');
  }
  if (latest.item?.performed_via_github_app !== null) {
    fail('LIFECYCLE_READY_EVENT_APP_MEDIATED');
  }

  return Object.freeze({
    id: latest.id,
    event: 'ready_for_review',
    created_at: latest.createdAt,
    actor,
    performed_via_github_app: null,
    direct_repository_owner: true,
  });
}
