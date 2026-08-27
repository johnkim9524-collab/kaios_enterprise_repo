/**
 * A31 — Executive Control Tower Live Integration & Governed Action Gateway
 * Module: gateway-audit.ts
 *
 * Audit evidence must be written to an injected durable sink. No module-level
 * ring buffer or process-local event counter is permitted. Legacy call shapes
 * fail closed until the governed gateway is connected to the control-plane
 * audit ledger.
 */

export type GatewayAuditEventType =
  | 'SNAPSHOT_READ' | 'DECISION_READ' | 'ACTION_REQUESTED' | 'ACTION_ACCEPTED'
  | 'ACTION_REJECTED' | 'AUTHORITY_DENIED' | 'PREFLIGHT_STARTED' | 'PREFLIGHT_RESULT'
  | 'EXECUTION_STARTED' | 'EXECUTION_RESULT' | 'VERIFICATION_RESULT' | 'ROLLBACK_RESULT'
  | 'UI_REFRESHED';

export interface GatewayAuditEvent {
  readonly eventId:string; readonly eventType:GatewayAuditEventType; readonly requestId:string|null;
  readonly decisionId:string|null; readonly actor:string|null; readonly dataMode:string;
  readonly outcome:string; readonly detail:string; readonly timestamp:string;
}
export interface GatewayAuditSink { append(event:GatewayAuditEvent):void; }
export interface GatewayAuditParams { eventType:GatewayAuditEventType; requestId?:string; decisionId?:string; actor?:string; dataMode:string; outcome:string; detail:string; }

function buildEvent(params:GatewayAuditParams):GatewayAuditEvent {
  return {eventId:crypto.randomUUID(),eventType:params.eventType,requestId:params.requestId??null,decisionId:params.decisionId??null,actor:params.actor??null,dataMode:params.dataMode,outcome:params.outcome,detail:params.detail,timestamp:new Date().toISOString()};
}

export function recordAuditEvent(sink:GatewayAuditSink,params:GatewayAuditParams):GatewayAuditEvent;
export function recordAuditEvent(params:GatewayAuditParams):GatewayAuditEvent;
export function recordAuditEvent(sinkOrParams:GatewayAuditSink|GatewayAuditParams,maybeParams?:GatewayAuditParams):GatewayAuditEvent {
  if (!maybeParams) throw new Error('DURABLE_GATEWAY_AUDIT_SINK_REQUIRED');
  const event=buildEvent(maybeParams);
  (sinkOrParams as GatewayAuditSink).append(event);
  return event;
}

export function getAuditLog(_limit=100):readonly GatewayAuditEvent[] { throw new Error('DURABLE_GATEWAY_AUDIT_SINK_REQUIRED'); }
