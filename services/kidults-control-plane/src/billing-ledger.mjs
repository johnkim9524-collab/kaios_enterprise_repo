import { createHash } from 'node:crypto';
import { executeCanonicalCommand } from './command-ledger.mjs';

const sha256 = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const required = (value, name) => {
  if (value === undefined || value === null || value === '') throw new Error(`${name}_REQUIRED`);
  return value;
};

export async function ingestBillingWebhook({
  client,
  rawBody,
  headers,
  verifier,
  providerCode,
  requestId,
  traceId,
  policyVersion = 'control-plane-v1',
  now,
  id,
}) {
  if (typeof verifier?.verify !== 'function') throw new Error('BILLING_SIGNATURE_VERIFIER_REQUIRED');
  required(rawBody, 'BILLING_RAW_BODY');
  required(providerCode, 'BILLING_PROVIDER_CODE');
  const verified = await verifier.verify({ rawBody, headers, providerCode });
  if (verified?.signatureVerified !== true) throw new Error('BILLING_SIGNATURE_NOT_VERIFIED');
  const event = verified.event || {};
  const organizationId = required(event.organizationId, 'BILLING_ORGANIZATION_ID');
  const providerEventId = required(event.providerEventId, 'BILLING_PROVIDER_EVENT_ID');
  const subscriptionId = required(event.subscriptionId, 'BILLING_SUBSCRIPTION_ID');
  const stateVersion = Number(required(event.stateVersion, 'BILLING_STATE_VERSION'));
  if (!Number.isSafeInteger(stateVersion) || stateVersion < 1) throw new Error('BILLING_STATE_VERSION_INVALID');

  return executeCanonicalCommand({
    client,
    organizationId,
    actorSubject: `billing:${providerCode}`,
    commandType: 'billing.subscription.transition',
    idempotencyKey: `${providerCode}:${providerEventId}`,
    requestId: required(requestId, 'REQUEST_ID'),
    traceId: required(traceId, 'TRACE_ID'),
    policyVersion,
    payload: { providerCode, providerEventId, subscriptionId, stateVersion },
    aggregateType: 'subscription',
    aggregateId: subscriptionId,
    eventType: 'subscription.entitlement.changed',
    eventPayload: {
      organization_id: organizationId,
      entitlement_code: required(event.entitlementCode, 'BILLING_ENTITLEMENT_CODE'),
      subscription_state: required(event.subscriptionState, 'BILLING_SUBSCRIPTION_STATE'),
      entitlement_state: required(event.entitlementState, 'BILLING_ENTITLEMENT_STATE'),
      effective_from: required(event.effectiveFrom, 'BILLING_EFFECTIVE_FROM'),
      effective_until: event.effectiveUntil || null,
      policy_version: policyVersion,
    },
    writerId: 'kpmo-command-service-v1',
    now,
    id,
    apply: async (db, context) => {
      await db.query(`
        INSERT INTO kidults_control.billing_events (
          billing_event_id,organization_id,provider_code,provider_event_id,event_type,
          signature_verified,payload_digest,provider_created_at,ordering_key,writer_id
        ) VALUES ($1,$2,$3,$4,$5,true,$6,$7,$8,$9)
        ON CONFLICT (provider_code,provider_event_id) DO NOTHING
      `, [context.commandId, organizationId, providerCode, providerEventId,
        required(event.eventType, 'BILLING_EVENT_TYPE'), sha256(rawBody),
        required(event.providerCreatedAt, 'BILLING_PROVIDER_CREATED_AT'),
        required(event.orderingKey, 'BILLING_ORDERING_KEY'), context.writerId]);
      const update = await db.query(`
        UPDATE kidults_control.subscriptions SET state=$1,state_version=$2,
          period_start=$3,period_end=$4,cancel_at_period_end=$5,updated_at=$6,writer_id=$7
        WHERE subscription_id=$8 AND organization_id=$9 AND state_version<$2
        RETURNING subscription_id,state_version
      `, [event.subscriptionState, stateVersion, event.periodStart || null,
        event.periodEnd || null, Boolean(event.cancelAtPeriodEnd), context.occurredAt,
        context.writerId, subscriptionId, organizationId]);
      if (!update.rows?.length) throw new Error('BILLING_STALE_OR_UNKNOWN_SUBSCRIPTION_TRANSITION');
      await db.query(`
        INSERT INTO kidults_control.entitlements (
          entitlement_id,organization_id,subscription_id,entitlement_code,state,
          effective_from,effective_until,policy_version,source_transition_id,writer_id
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      `, [context.commandId, organizationId, subscriptionId,
        required(event.entitlementCode, 'BILLING_ENTITLEMENT_CODE'),
        required(event.entitlementState, 'BILLING_ENTITLEMENT_STATE'),
        required(event.effectiveFrom, 'BILLING_EFFECTIVE_FROM'), event.effectiveUntil || null,
        policyVersion, context.commandId, context.writerId]);
      return { providerEventId, subscriptionId, stateVersion };
    },
  });
}
