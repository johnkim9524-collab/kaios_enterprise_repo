#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { openGovernedProjectorClient } from '../src/postgres-client-adapter.mjs';
import { runStagingD1ProjectorOnce } from '../src/staging-d1-projector-runtime.mjs';

const PROJECTOR_ID = 'kpmo-d1-projector-v1';
const required = name => {
  const value = process.env[name];
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
};

if (process.env.KIDULTS_ENVIRONMENT !== 'STAGING') {
  throw new Error('STAGING_ENVIRONMENT_REQUIRED');
}
const organizationId = required('KIDULTS_ORGANIZATION_ID');
const workerId = process.env.KIDULTS_PROJECTOR_WORKER_ID || `ih-staging-01-${process.pid}`;
const client = await openGovernedProjectorClient({
  connectionString: required('POSTGRES_DSN'),
});

try {
  const result = await runStagingD1ProjectorOnce({
    client,
    organizationId,
    workerId,
    cloudflare: {
      environment: 'STAGING',
      accountId: required('CLOUDFLARE_ACCOUNT_ID'),
      databaseId: required('CLOUDFLARE_D1_DATABASE_ID'),
      apiToken: required('CLOUDFLARE_API_TOKEN'),
      projectorId: PROJECTOR_ID,
    },
    id: randomUUID,
  });
  const receipt = {
    id: 'kidults-staging-d1-projector-once-receipt-v1',
    state: result.state,
    environment: 'STAGING',
    projector_id: PROJECTOR_ID,
    organization_id: organizationId,
    worker_id: workerId,
    source_event_id: result.sourceEventId || null,
    attempt_no: result.attemptNo || null,
    d1_result_digest: result.d1ResultDigest || null,
    secrets_logged: false,
    production: 'HOLD',
    public_release: 'HOLD',
    g5: 'HOLD',
    observed_at: new Date().toISOString(),
  };
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
} finally {
  await client.end();
}