import { createGovernedD1RestBinding } from './d1-rest-binding.mjs';
import { deliverNextOutboxEvent } from './outbox-delivery.mjs';

export async function runStagingD1ProjectorOnce({
  client,
  organizationId,
  workerId,
  cloudflare,
  fetchImpl,
  now,
  id,
}) {
  if (cloudflare?.environment !== 'STAGING') {
    throw new Error('D1_PROJECTOR_STAGING_ENVIRONMENT_REQUIRED');
  }
  const db = createGovernedD1RestBinding({
    accountId: cloudflare.accountId,
    databaseId: cloudflare.databaseId,
    apiToken: cloudflare.apiToken,
    projectorId: cloudflare.projectorId,
    fetchImpl,
  });
  return deliverNextOutboxEvent({
    client,
    db,
    organizationId,
    workerId,
    now,
    id,
  });
}
