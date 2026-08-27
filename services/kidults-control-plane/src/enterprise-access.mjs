import { createHash } from 'node:crypto';
import { appendObservabilityEvent } from './observability-ledger.mjs';

function required(value, name) {
  if (value === undefined || value === null || value === '') throw new Error(`${name}_REQUIRED`);
  return value;
}

function asDate(value, name) {
  const parsed = new Date(required(value, name));
  if (Number.isNaN(parsed.valueOf())) throw new Error(`${name}_INVALID`);
  return parsed;
}

function numericDate(value, name) {
  const seconds = Number(required(value, name));
  if (!Number.isSafeInteger(seconds) || seconds < 0) throw new Error(`${name}_INVALID`);
  return new Date(seconds * 1000);
}

export async function authorizeEnterpriseRequest({
  client,
  auditClient,
  token,
  verifier,
  organizationId,
  permissionCode,
  resourceType,
  resourceId,
  entitlementCode,
  audience,
  allowedIssuers,
  requestId,
  traceId,
  policyVersion = 'control-plane-v1',
  now = () => new Date(),
  maximumTokenAgeSeconds = 900,
}) {
  if (!client?.query) throw new Error('POSTGRES_CLIENT_REQUIRED');
  if (!auditClient?.query) throw new Error('POSTGRES_AUDIT_CLIENT_REQUIRED');
  if (typeof verifier?.verify !== 'function') throw new Error('IDENTITY_VERIFIER_REQUIRED');
  required(token, 'BEARER_TOKEN');
  required(organizationId, 'ORGANIZATION_ID');
  required(permissionCode, 'PERMISSION_CODE');
  required(resourceType, 'RESOURCE_TYPE');
  required(resourceId, 'RESOURCE_ID');
  required(entitlementCode, 'ENTITLEMENT_CODE');
  required(audience, 'AUDIENCE');
  required(requestId, 'REQUEST_ID');
  required(traceId, 'TRACE_ID');
  if (!Array.isArray(allowedIssuers) || allowedIssuers.length === 0) throw new Error('ALLOWED_ISSUERS_REQUIRED');

  let subject = null;
  let identityProvider = null;
  let transactionStarted = false;
  const audit = async (outcome, reason) => appendObservabilityEvent({
    client: auditClient,
    organizationId,
    signalType: 'LOG',
    serviceName: 'kidults-control-plane',
    eventName: 'enterprise_access_decision',
    requestId,
    traceId,
    payload: {
      outcome,
      reason,
      subject_digest: subject ? `sha256:${createHash('sha256').update(subject).digest('hex')}` : null,
      identity_provider: identityProvider,
      resource_type: resourceType,
      resource_id: resourceId,
      permission_code: permissionCode,
      entitlement_code: entitlementCode,
      policy_version: policyVersion,
    },
    occurredAt: now(),
  });

  let receipt;
  try {
    const identity = await verifier.verify(token, { audience, allowedIssuers });
    if (identity?.verified !== true) throw new Error('IDENTITY_SIGNATURE_NOT_VERIFIED');
    const claims = identity.claims || {};
    if (!allowedIssuers.includes(required(claims.iss, 'IDENTITY_ISSUER'))) throw new Error('IDENTITY_ISSUER_DENIED');
    if (claims.aud !== audience && !(Array.isArray(claims.aud) && claims.aud.includes(audience))) throw new Error('IDENTITY_AUDIENCE_DENIED');
    subject = required(claims.sub, 'IDENTITY_SUBJECT');
    identityProvider = required(identity.provider, 'IDENTITY_PROVIDER');
    const current = now();
    const expires = numericDate(claims.exp, 'IDENTITY_EXPIRY');
    const issued = numericDate(claims.iat, 'IDENTITY_ISSUED_AT');
    if (expires <= current) throw new Error('IDENTITY_TOKEN_EXPIRED');
    if (issued > current || (current - issued) / 1000 > maximumTokenAgeSeconds) throw new Error('IDENTITY_TOKEN_STALE_OR_FUTURE');

    await client.query('BEGIN');
    transactionStarted = true;
    await client.query('SET TRANSACTION READ ONLY');
    await client.query("SELECT set_config('kidults.organization_id', $1, true)", [organizationId]);
    const result = await client.query(`
      SELECT u.user_id,u.state AS user_state,o.state AS organization_state,
        m.membership_id,m.state AS membership_state,m.role_code,m.expires_at,
        EXISTS (
          SELECT 1 FROM kidults_control.resource_grants rg
          WHERE rg.membership_id=m.membership_id AND rg.organization_id=m.organization_id
            AND rg.resource_type=$4 AND rg.resource_id=$5 AND rg.permission_code=$6
            AND rg.revoked_at IS NULL AND (rg.expires_at IS NULL OR rg.expires_at>$8)
        ) AS permission_granted,
        entitlement.state AS entitlement_state,
        entitlement.effective_from AS entitlement_effective_from,
        entitlement.effective_until AS entitlement_effective_until,
        entitlement.subscription_state
      FROM kidults_control.users u
      JOIN kidults_control.memberships m ON m.user_id=u.user_id
      JOIN kidults_control.organizations o ON o.organization_id=m.organization_id
      LEFT JOIN LATERAL (
        SELECT e.state,e.effective_from,e.effective_until,s.state AS subscription_state
        FROM kidults_control.entitlements e
        JOIN kidults_control.subscriptions s ON s.subscription_id=e.subscription_id
          AND s.organization_id=e.organization_id
        WHERE e.organization_id=m.organization_id AND e.entitlement_code=$7
        ORDER BY e.effective_from DESC,e.created_at DESC,e.entitlement_id DESC
        LIMIT 1
      ) entitlement ON true
      WHERE u.external_subject=$1 AND u.identity_provider=$2 AND m.organization_id=$3
    `, [subject, identityProvider, organizationId, resourceType, resourceId,
      permissionCode, entitlementCode, current.toISOString()]);
    const row = result.rows?.[0];
    if (!row) throw new Error('ENTERPRISE_MEMBERSHIP_NOT_FOUND');
    if (row.user_state !== 'ACTIVE' || row.organization_state !== 'ACTIVE' || row.membership_state !== 'ACTIVE') {
      throw new Error('ENTERPRISE_PRINCIPAL_NOT_ACTIVE');
    }
    if (row.expires_at && asDate(row.expires_at, 'MEMBERSHIP_EXPIRY') <= current) throw new Error('ENTERPRISE_MEMBERSHIP_EXPIRED');
    if (row.permission_granted !== true) throw new Error('ENTERPRISE_PERMISSION_DENIED');
    if (row.entitlement_state !== 'ACTIVE' || !['ACTIVE', 'TRIALING'].includes(row.subscription_state)) {
      throw new Error('ENTERPRISE_ENTITLEMENT_DENIED');
    }
    if (asDate(row.entitlement_effective_from, 'ENTITLEMENT_EFFECTIVE_FROM') > current) {
      throw new Error('ENTERPRISE_ENTITLEMENT_NOT_YET_EFFECTIVE');
    }
    if (row.entitlement_effective_until && asDate(row.entitlement_effective_until, 'ENTITLEMENT_EFFECTIVE_UNTIL') <= current) {
      throw new Error('ENTERPRISE_ENTITLEMENT_EXPIRED');
    }
    await client.query('COMMIT');
    transactionStarted = false;
    receipt = {
      state: 'AUTHORIZED',
      subject,
      provider: identityProvider,
      userId: row.user_id,
      organizationId,
      membershipId: row.membership_id,
      roleCode: row.role_code,
      permissionCode,
      resourceType,
      resourceId,
      entitlementCode,
      tokenId: claims.jti || null,
      authenticationMethods: Array.isArray(claims.amr) ? claims.amr : [],
    };
  } catch (error) {
    if (transactionStarted) await client.query('ROLLBACK');
    try {
      await audit('DENY', String(error.message || error).split(':', 1)[0].slice(0, 160));
    } catch (auditError) {
      throw new Error('ENTERPRISE_ACCESS_AUDIT_FAILED', { cause: { authorizationError: error, auditError } });
    }
    throw error;
  }
  try {
    await audit('ALLOW', 'RBAC_AND_ENTITLEMENT_VERIFIED');
  } catch (auditError) {
    throw new Error('ENTERPRISE_ACCESS_AUDIT_FAILED', { cause: auditError });
  }
  return receipt;
}
