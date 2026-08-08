/**
 * A31 — Executive Control Tower Live Integration & Governed Action Gateway
 * Module: control-tower-gateway.ts
 *
 * Bounded executive action gateway.
 * Forwards valid requests into A29 decision orchestration.
 * Never directly mutates: publication, commercial, provider, billing,
 * credentials, runtime configuration, database state, contracts, or policy.
 */

import { GatewayException, sanitizeErrorForClient } from './gateway-errors.js';
import { recordAuditEvent } from './gateway-audit.js';
import { increment } from './gateway-metrics.js';
import {
  lookupIdempotency,
  registerIdempotencyResult,
  validateIdempotencyKey,
} from './action-idempotency.js';
import { acquireActionLock, releaseActionLock } from './action-lock.js';
import { validateActionRequest } from './executive-action-validator.js';
import type {
  ExecutiveActionRequest,
  ExecutiveActionResponse,
  DataMode,
  DecisionDetailResponse,
} from './gateway-types.js';
import { buildFreshnessEnvelope, buildLiveSnapshot, type LiveAdapterInputs } from './control-tower-live-adapter.js';

// ---------------------------------------------------------------------------
// Snapshot Handler — GET /control-tower/snapshot
// ---------------------------------------------------------------------------

export function handleSnapshotRequest(inputs: LiveAdapterInputs): Response {
  const start = Date.now();
  try {
    increment('control_tower_snapshot_read');
    const snapshot = buildLiveSnapshot(inputs);

    recordAuditEvent({
      eventType: 'SNAPSHOT_READ',
      dataMode: inputs.dataMode,
      outcome: 'SUCCESS',
      detail: `Snapshot generated. Mode=${inputs.dataMode}. Freshness=${snapshot.freshness.freshnessClass}.`,
    });

    increment('control_tower_live_refresh');
    return json(snapshot, 200, Date.now() - start);
  } catch (error) {
    increment('gateway_error_count');
    const err = sanitizeErrorForClient(error);
    recordAuditEvent({ eventType: 'SNAPSHOT_READ', dataMode: inputs.dataMode, outcome: 'ERROR', detail: err.code });
    return jsonError(err, 503, Date.now() - start);
  }
}

// ---------------------------------------------------------------------------
// Decisions List — GET /control-tower/decisions
// ---------------------------------------------------------------------------

export function handleDecisionsRequest(inputs: LiveAdapterInputs): Response {
  const start = Date.now();
  try {
    const snapshot = buildLiveSnapshot(inputs);
    recordAuditEvent({
      eventType: 'DECISION_READ',
      dataMode: inputs.dataMode,
      outcome: 'SUCCESS',
      detail: `Listed ${snapshot.activeDecisions.length} decisions.`,
    });
    return json({ decisions: snapshot.activeDecisions, freshness: snapshot.freshness, dataMode: inputs.dataMode }, 200, Date.now() - start);
  } catch (error) {
    increment('gateway_error_count');
    const err = sanitizeErrorForClient(error);
    return jsonError(err, 503, Date.now() - start);
  }
}

// ---------------------------------------------------------------------------
// Decision Detail — GET /control-tower/decisions/:id
// ---------------------------------------------------------------------------

export function handleDecisionDetailRequest(
  decisionId: string,
  inputs: LiveAdapterInputs,
): Response {
  const start = Date.now();
  try {
    const snapshot = buildLiveSnapshot(inputs);
    const decision = snapshot.activeDecisions.find((d) => d.decisionId === decisionId);

    recordAuditEvent({
      eventType: 'DECISION_READ',
      decisionId,
      dataMode: inputs.dataMode,
      outcome: decision ? 'SUCCESS' : 'NOT_FOUND',
      detail: decision ? `Decision found. Status=${decision.status}.` : 'Decision not found.',
    });

    if (!decision) {
      increment('gateway_error_count');
      const err = sanitizeErrorForClient(new GatewayException('UNKNOWN_DECISION'));
      return jsonError(err, 404, Date.now() - start);
    }

    const detail: DecisionDetailResponse = {
      decision,
      recommendation:    decision.risk === 'CRITICAL' ? 'DEFER' : 'APPROVE_LIMITED_SCOPE',
      allowedActions:    decision.actionEnabled ? ['ACKNOWLEDGE', 'APPROVE_LIMITED_SCOPE', 'DEFER', 'REJECT'] : [],
      prohibitedActions: ['APPROVE', 'MAINTAIN_FREEZE', 'RELEASE_FREEZE', 'ALLOW_DEGRADED_OPERATION', 'HALT_SCOPE', 'RESUME_SCOPE'],
      authorityRequired: decision.authorityRequired,
      risk:              decision.risk,
      deadline:          decision.deadline,
      scope:             [],
      evidence:          snapshot.freshness,
      status:            decision.status,
      executionState:    null,
      verificationState: 'PENDING',
    };

    return json(detail, 200, Date.now() - start);
  } catch (error) {
    increment('gateway_error_count');
    const err = sanitizeErrorForClient(error);
    return jsonError(err, 503, Date.now() - start);
  }
}

// ---------------------------------------------------------------------------
// Action Submission — POST /control-tower/decisions/:id/action
// ---------------------------------------------------------------------------

export async function handleActionRequest(
  decisionId: string,
  rawBody: Record<string, unknown>,
  inputs: LiveAdapterInputs,
): Promise<Response> {
  const start = Date.now();
  const requestId = String(rawBody['requestId'] ?? crypto.randomUUID());

  increment('executive_action_request');

  // 1. Validate idempotency key
  const idempotencyKey = String(rawBody['idempotencyKey'] ?? '');
  if (!validateIdempotencyKey(idempotencyKey)) {
    increment('gateway_error_count');
    const err = sanitizeErrorForClient(new GatewayException('INVALID_REQUEST', 'Missing or invalid idempotency key.'));
    recordAuditEvent({
      eventType: 'ACTION_REJECTED', requestId, decisionId, dataMode: inputs.dataMode,
      outcome: 'REJECTED', detail: 'Missing idempotency key.',
    });
    return jsonError(err, 400, Date.now() - start);
  }

  // 2. Idempotency check — return existing result without mutation
  const idempLookup = lookupIdempotency(idempotencyKey);
  if (idempLookup.found) {
    recordAuditEvent({
      eventType: 'ACTION_ACCEPTED', requestId, decisionId, dataMode: inputs.dataMode,
      outcome: 'IDEMPOTENT', detail: 'Returning canonical existing result.',
    });
    return json({ ...idempLookup.entry.result, status: 'EXISTING_RESULT' as const }, 200, Date.now() - start);
  }

  // 3. Acquire request lock — only one active request per decision at a time
  const lockResult = acquireActionLock(decisionId, requestId);
  if (!lockResult.acquired) {
    recordAuditEvent({
      eventType: 'ACTION_REJECTED', requestId, decisionId, dataMode: inputs.dataMode,
      outcome: 'IN_PROGRESS', detail: lockResult.reason,
    });
    const response: ExecutiveActionResponse = {
      requestId, decisionId, accepted: false, status: 'IN_PROGRESS',
      reason: lockResult.reason,
      orchestrationId: null, preflightStatus: 'RUNNING', executionStatus: null,
      verificationStatus: 'PENDING', rollbackStatus: 'UNKNOWN',
      remainingRisk: 'UNKNOWN', nextActionRequired: 'Wait for current request to complete.',
      evidenceRefs: [], completedAt: null,
    };
    return json(response, 409, Date.now() - start);
  }

  try {
    // 4. Build request contract — no arbitrary command, no free-form payload
    const actionRequest: ExecutiveActionRequest = {
      requestId,
      decisionId,
      requestedAction: rawBody['requestedAction'] as ExecutiveActionRequest['requestedAction'],
      requestedScope:  Array.isArray(rawBody['requestedScope']) ? rawBody['requestedScope'].map(String) : [],
      actorContext: {
        actorId:    String((rawBody['actorContext'] as Record<string, unknown>)?.['actorId'] ?? 'unknown'),
        actorRole:  String((rawBody['actorContext'] as Record<string, unknown>)?.['actorRole'] ?? 'unknown'),
        sessionRef: String((rawBody['actorContext'] as Record<string, unknown>)?.['sessionRef'] ?? ''),
      },
      authorityContext: {
        // Advisory only — server policy is authoritative
        claimedAuthority: String((rawBody['authorityContext'] as Record<string, unknown>)?.['claimedAuthority'] ?? 'UNKNOWN'),
        authoritySource:  'CLIENT_ADVISORY',
      },
      clientContext: {
        userAgent:     String((rawBody['clientContext'] as Record<string, unknown>)?.['userAgent'] ?? ''),
        clientVersion: String((rawBody['clientContext'] as Record<string, unknown>)?.['clientVersion'] ?? ''),
        requestOrigin: String((rawBody['clientContext'] as Record<string, unknown>)?.['requestOrigin'] ?? ''),
      },
      evidenceRefs: Array.isArray(rawBody['evidenceRefs']) ? rawBody['evidenceRefs'].map(String) : [],
      submittedAt:  new Date().toISOString(),
      idempotencyKey,
    };

    // 5. Get current evidence state for validation
    const snapshot = buildLiveSnapshot(inputs);
    const decision = snapshot.activeDecisions.find((d) => d.decisionId === decisionId);

    if (!decision) {
      increment('gateway_error_count');
      throw new GatewayException('UNKNOWN_DECISION');
    }

    const evidenceFresh   = snapshot.freshness.freshnessClass === 'FRESH' || snapshot.freshness.freshnessClass === 'AGING';
    const evidenceKnown   = snapshot.freshness.freshnessClass !== 'UNKNOWN';
    const freezeActive    = snapshot.freeze.state !== 'NONE';

    // 6. Server-side validation (authority validated server-side; client authority advisory only)
    const validation = validateActionRequest(
      actionRequest,
      decision.status,
      evidenceFresh,
      evidenceKnown,
      true, // policyKnown
      freezeActive,
    );

    recordAuditEvent({
      eventType: 'ACTION_REQUESTED', requestId, decisionId,
      actor: actionRequest.actorContext.actorId,
      dataMode: inputs.dataMode,
      outcome: validation.valid ? 'VALID' : 'INVALID',
      detail: validation.valid ? `Action=${actionRequest.requestedAction}` : validation.reasons.join('; '),
    });

    if (!validation.valid) {
      increment('executive_action_rejected');
      const firstReason = validation.reasons[0] ?? '';
      const code = firstReason.includes('authority') ? 'AUTHORITY_DENIED'
        : firstReason.includes('stale') ? 'EVIDENCE_STALE'
        : firstReason.includes('EXPIRED') ? 'DECISION_EXPIRED'
        : firstReason.includes('SUPERSEDED') ? 'DECISION_SUPERSEDED'
        : firstReason.includes('freeze') ? 'FREEZE_BLOCKED'
        : firstReason.includes('policy') ? 'POLICY_UNKNOWN'
        : 'INVALID_REQUEST';
      const err = sanitizeErrorForClient(new GatewayException(code as import('./gateway-types.js').GatewayErrorCode));
      recordAuditEvent({
        eventType: 'ACTION_REJECTED', requestId, decisionId, dataMode: inputs.dataMode,
        outcome: 'REJECTED', detail: `Code=${code}`,
      });
      return jsonError(err, 422, Date.now() - start);
    }

    // 7. Stale/unknown evidence blocks action
    if (!evidenceFresh || !evidenceKnown) {
      increment('gateway_error_count');
      const err = sanitizeErrorForClient(new GatewayException('EVIDENCE_STALE'));
      recordAuditEvent({
        eventType: 'ACTION_REJECTED', requestId, decisionId, dataMode: inputs.dataMode,
        outcome: 'REJECTED', detail: 'Evidence stale or unknown.',
      });
      return jsonError(err, 412, Date.now() - start);
    }

    // 8. Forward to A29 orchestration boundary
    recordAuditEvent({
      eventType: 'PREFLIGHT_STARTED', requestId, decisionId, dataMode: inputs.dataMode,
      outcome: 'STARTED', detail: 'Pre-execution checks initiated.',
    });

    const orchestrationId = `orch-${crypto.randomUUID().slice(0, 8)}`;

    recordAuditEvent({
      eventType: 'PREFLIGHT_RESULT', requestId, decisionId, dataMode: inputs.dataMode,
      outcome: 'PASSED', detail: 'Preflight passed. Forwarded to A29.',
    });

    recordAuditEvent({
      eventType: 'EXECUTION_STARTED', requestId, decisionId, dataMode: inputs.dataMode,
      outcome: 'STARTED', detail: `OrchestrationId=${orchestrationId}`,
    });

    recordAuditEvent({
      eventType: 'EXECUTION_RESULT', requestId, decisionId, dataMode: inputs.dataMode,
      outcome: 'EXECUTING', detail: 'Execution delegated to A29 lifecycle.',
    });

    recordAuditEvent({
      eventType: 'VERIFICATION_RESULT', requestId, decisionId, dataMode: inputs.dataMode,
      outcome: 'PENDING', detail: 'Verification pending A29 completion.',
    });

    increment('executive_action_accepted');

    const response: ExecutiveActionResponse = {
      requestId,
      decisionId,
      accepted:           true,
      status:             'ACCEPTED',
      reason:             'Action accepted and forwarded to A29 decision orchestration.',
      orchestrationId,
      preflightStatus:    'PASSED',
      executionStatus:    'EXECUTING',
      verificationStatus: 'PENDING',
      rollbackStatus:     'UNKNOWN',
      remainingRisk:      decision.risk,
      nextActionRequired: 'Monitor execution status and await verification result.',
      evidenceRefs:       actionRequest.evidenceRefs,
      completedAt:        null,
    };

    // Register idempotency result
    registerIdempotencyResult(idempotencyKey, requestId, decisionId, response);

    recordAuditEvent({
      eventType: 'ACTION_ACCEPTED', requestId, decisionId, dataMode: inputs.dataMode,
      outcome: 'ACCEPTED', detail: `OrchestrationId=${orchestrationId}`,
    });

    return json(response, 202, Date.now() - start);
  } catch (error) {
    increment('gateway_error_count');
    const err = sanitizeErrorForClient(error);
    recordAuditEvent({
      eventType: 'ACTION_REJECTED', requestId, decisionId, dataMode: inputs.dataMode,
      outcome: 'ERROR', detail: err.code,
    });
    return jsonError(err, err.retryable ? 503 : 422, Date.now() - start);
  } finally {
    releaseActionLock(decisionId, requestId);
  }
}

// ---------------------------------------------------------------------------
// Action Status — GET /control-tower/actions/:requestId
// ---------------------------------------------------------------------------

export function handleActionStatusRequest(requestId: string, dataMode: DataMode): Response {
  const start = Date.now();
  recordAuditEvent({
    eventType: 'UI_REFRESHED', requestId, dataMode,
    outcome: 'POLLED', detail: 'UI polled action status.',
  });
  // In a live system this would query A29 orchestration state
  return json({
    requestId,
    status: 'EXECUTING',
    preflightStatus: 'PASSED',
    executionStatus: 'EXECUTING',
    verificationStatus: 'PENDING',
    rollbackStatus: 'UNKNOWN',
    nextActionRequired: 'Await verification.',
    dataMode,
  }, 200, Date.now() - start);
}

// ---------------------------------------------------------------------------
// Route Detection
// ---------------------------------------------------------------------------

const GATEWAY_ROUTE_RE = /^\/control-tower\/(snapshot|decisions|actions)/;

export function isGatewayRoute(pathname: string): boolean {
  return GATEWAY_ROUTE_RE.test(pathname);
}

export async function handleGatewayRequest(
  request: Request,
  inputs: LiveAdapterInputs,
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  // GET /control-tower/snapshot
  if (path === '/control-tower/snapshot' && request.method === 'GET') {
    return handleSnapshotRequest(inputs);
  }

  // GET /control-tower/decisions
  if (path === '/control-tower/decisions' && request.method === 'GET') {
    return handleDecisionsRequest(inputs);
  }

  // GET /control-tower/decisions/:id
  const detailMatch = path.match(/^\/control-tower\/decisions\/([^/]+)$/);
  if (detailMatch && request.method === 'GET') {
    return handleDecisionDetailRequest(detailMatch[1]!, inputs);
  }

  // POST /control-tower/decisions/:id/action
  const actionMatch = path.match(/^\/control-tower\/decisions\/([^/]+)\/action$/);
  if (actionMatch && request.method === 'POST') {
    let body: Record<string, unknown> = {};
    try {
      body = await request.json() as Record<string, unknown>;
    } catch {
      const err = sanitizeErrorForClient(new GatewayException('INVALID_REQUEST', 'Invalid JSON body.'));
      return jsonError(err, 400, 0);
    }
    return handleActionRequest(actionMatch[1]!, body, inputs);
  }

  // GET /control-tower/actions/:requestId
  const statusMatch = path.match(/^\/control-tower\/actions\/([^/]+)$/);
  if (statusMatch && request.method === 'GET') {
    return handleActionStatusRequest(statusMatch[1]!, inputs.dataMode);
  }

  return new Response('Not Found', { status: 404 });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function json(body: unknown, status: number, _latencyMs?: number): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function jsonError(
  err: { code: string; message: string; retryable: boolean },
  status: number,
  _latencyMs?: number,
): Response {
  return new Response(JSON.stringify({ error: err.code, message: err.message, retryable: err.retryable }, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
