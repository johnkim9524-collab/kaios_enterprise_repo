/**
 * A31 — Executive Control Tower Live Integration & Governed Action Gateway
 * Module: gateway-audit.ts
 *
 * Every gateway event is auditable.
 * No secrets, credentials, or sensitive payloads are logged.
 */

// ---------------------------------------------------------------------------
// Audit Event Types (spec §21)
// ---------------------------------------------------------------------------

export type GatewayAuditEventType =
  | 'SNAPSHOT_READ'
  | 'DECISION_READ'
  | 'ACTION_REQUESTED'
  | 'ACTION_ACCEPTED'
  | 'ACTION_REJECTED'
  | 'AUTHORITY_DENIED'
  | 'PREFLIGHT_STARTED'
  | 'PREFLIGHT_RESULT'
  | 'EXECUTION_STARTED'
  | 'EXECUTION_RESULT'
  | 'VERIFICATION_RESULT'
  | 'ROLLBACK_RESULT'
  | 'UI_REFRESHED';

export interface GatewayAuditEvent {
  readonly eventId: string;
  readonly eventType: GatewayAuditEventType;
  readonly requestId: string | null;
  readonly decisionId: string | null;
  readonly actor: string | null;
  readonly dataMode: string;
  readonly outcome: string;
  readonly detail: string;
  readonly timestamp: string;
}

// ---------------------------------------------------------------------------
// In-memory audit log (bounded to 500 most recent events per runtime instance)
// ---------------------------------------------------------------------------

const MAX_AUDIT_ENTRIES = 500;
const auditLog: GatewayAuditEvent[] = [];

let eventCounter = 0;
function newEventId(): string {
  eventCounter += 1;
  return `a31-audit-${Date.now()}-${String(eventCounter).padStart(6, '0')}`;
}

export function recordAuditEvent(params: {
  eventType: GatewayAuditEventType;
  requestId?: string;
  decisionId?: string;
  actor?: string;
  dataMode: string;
  outcome: string;
  detail: string;
}): GatewayAuditEvent {
  const event: GatewayAuditEvent = {
    eventId: newEventId(),
    eventType: params.eventType,
    requestId: params.requestId ?? null,
    decisionId: params.decisionId ?? null,
    actor: params.actor ?? null,
    dataMode: params.dataMode,
    outcome: params.outcome,
    detail: params.detail,
    timestamp: new Date().toISOString(),
  };

  auditLog.push(event);
  // Bounded ring buffer
  if (auditLog.length > MAX_AUDIT_ENTRIES) {
    auditLog.splice(0, auditLog.length - MAX_AUDIT_ENTRIES);
  }

  return event;
}

export function getAuditLog(limit = 100): readonly GatewayAuditEvent[] {
  return auditLog.slice(-limit);
}
