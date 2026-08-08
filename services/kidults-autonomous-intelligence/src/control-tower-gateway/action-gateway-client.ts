/**
 * A31 — Executive Control Tower Live Integration & Governed Action Gateway
 * Module: action-gateway-client.ts
 *
 * UI-side client for submitting governed executive actions.
 * Enforces idempotency key, required fields, and confirmation metadata.
 * Does not bypass server-side authority or governance checks.
 */

import type {
  ExecutiveActionRequest,
  ExecutiveActionResponse,
  ExecutiveActionKind,
  ActorContext,
  AuthorityContext,
  ClientContext,
} from './gateway-types.js';

// ---------------------------------------------------------------------------
// Action Submission Input
// ---------------------------------------------------------------------------

export interface ActionSubmissionInput {
  readonly decisionId: string;
  readonly requestedAction: ExecutiveActionKind;
  readonly requestedScope: string[];
  readonly actorContext: ActorContext;
  /** Advisory only — server policy is authoritative */
  readonly authorityContext: AuthorityContext;
  readonly clientContext: ClientContext;
  readonly evidenceRefs: string[];
  /** Must be provided by caller — no auto-generation silently skipped */
  readonly idempotencyKey: string;
  /** Required: confirmation metadata from UI confirmation step */
  readonly confirmationToken: string;
}

// ---------------------------------------------------------------------------
// Action Result
// ---------------------------------------------------------------------------

export interface ActionSubmissionResult {
  readonly ok: boolean;
  readonly response: ExecutiveActionResponse | null;
  readonly errorMessage: string | null;
}

// ---------------------------------------------------------------------------
// Submit Executive Action
// ---------------------------------------------------------------------------

export async function submitExecutiveAction(
  baseUrl: string,
  input: ActionSubmissionInput,
): Promise<ActionSubmissionResult> {
  // Enforce confirmation token — must not be empty (spec §20)
  if (!input.confirmationToken || input.confirmationToken.trim().length === 0) {
    return {
      ok: false,
      response: null,
      errorMessage: 'Action confirmation is required before submission.',
    };
  }

  if (!input.idempotencyKey || input.idempotencyKey.trim().length < 8) {
    return {
      ok: false,
      response: null,
      errorMessage: 'A valid idempotency key is required.',
    };
  }

  const requestId = crypto.randomUUID();
  const body: ExecutiveActionRequest & { confirmationToken: string } = {
    requestId,
    decisionId:      input.decisionId,
    requestedAction: input.requestedAction,
    requestedScope:  input.requestedScope,
    actorContext:    input.actorContext,
    authorityContext: input.authorityContext,
    clientContext:   input.clientContext,
    evidenceRefs:    input.evidenceRefs,
    submittedAt:     new Date().toISOString(),
    idempotencyKey:  input.idempotencyKey,
    confirmationToken: input.confirmationToken,
  };

  try {
    const res = await fetch(
      `${baseUrl}/control-tower/decisions/${encodeURIComponent(input.decisionId)}/action`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body),
      },
    );

    const data = await res.json().catch(() => ({})) as { message?: string } & Partial<ExecutiveActionResponse>;

    if (!res.ok) {
      return { ok: false, response: null, errorMessage: data.message ?? 'The action could not be submitted.' };
    }

    return { ok: true, response: data as ExecutiveActionResponse, errorMessage: null };
  } catch {
    return { ok: false, response: null, errorMessage: 'The governance service is temporarily unavailable.' };
  }
}
