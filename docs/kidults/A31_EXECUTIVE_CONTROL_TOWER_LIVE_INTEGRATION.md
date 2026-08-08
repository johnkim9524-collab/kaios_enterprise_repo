# A31 — Executive Control Tower Live Integration & Governed Action Gateway

> **Sprint A31** — KIDULTS Autonomous Intelligence Platform
>
> Connects the A30 Executive Control Tower UI to canonical live evidence and
> governed executive decision actions via a bounded, auditable gateway.

---

## Overview

A31 converts the A30 Control Tower interface from a primarily evidence/demo UI
into a live governed operating surface **without** allowing direct production mutation.

**Canonical flow:**

```
CONTROL TOWER UI
→ LIVE EVIDENCE ADAPTER
→ EXECUTIVE ACTION REQUEST
→ GOVERNED ACTION GATEWAY
→ A29 DECISION ORCHESTRATION
→ PREFLIGHT
→ BOUNDED EXECUTION
→ VERIFICATION
→ AUDIT
→ UI RESULT REFRESH
```

The UI remains a governance surface. The gateway must never become an unrestricted admin API.

---

## Live Data Modes

| Mode       | Source                                     | Behaviour                                        |
|------------|--------------------------------------------|--------------------------------------------------|
| `DEMO`     | Deterministic fixtures only                | No live data; safe for demos                     |
| `EVIDENCE` | Repository-generated canonical evidence    | A28/A29 canonical snapshots                      |
| `LIVE`     | Approved bounded runtime source only       | Live upstream state; freshness enforced          |

**Rules:**
- Data mode is always explicitly visible in every response.
- Silent fallback from `LIVE` to `DEMO` is prohibited.
- Freshness class is always included in every live response.

---

## Live Evidence Adapter

Module: `src/control-tower-gateway/control-tower-live-adapter.ts`

Aggregates upstream evidence from A22–A29 into a canonical `LiveSnapshotResponse`.
The UI must not perform governance calculations — the adapter does it.

**Upstream sources consumed (when available):**
- A28 control tower snapshot
- A29 active executive decisions
- A27 incident/SLO state
- A26 recovery state
- A25 runtime state
- A24 activation state
- A23 commercial state
- A22 publication state
- Provider state
- Security state

**Output:** `LiveSnapshotResponse` (see gateway-types.ts)

---

## Evidence Freshness

Every live response includes a `EvidenceFreshnessEnvelope`:

| Field               | Description                              |
|---------------------|------------------------------------------|
| `source`            | Upstream evidence source identifier      |
| `generatedAt`       | When the evidence was generated          |
| `receivedAt`        | When the gateway received it             |
| `freshnessClass`    | `FRESH` / `AGING` / `STALE` / `UNKNOWN` |
| `staleAfter`        | ISO timestamp when evidence becomes stale |
| `policyVersion`     | Governance policy version                |
| `verificationStatus`| `VERIFIED` / `UNVERIFIED` / `UNKNOWN`   |

**Freshness windows:**
- FRESH: < 5 minutes
- AGING: 5–15 minutes
- STALE: > 15 minutes
- UNKNOWN: unparseable timestamp

**Critical rule:** STALE or UNKNOWN evidence **disables** all executive mutation actions.

---

## Governed Action Gateway

Module: `src/control-tower-gateway/control-tower-gateway.ts`

A bounded gateway that:
1. Validates every request server-side.
2. Checks idempotency.
3. Acquires a request lock.
4. Validates authority (server policy is authoritative).
5. Checks evidence freshness.
6. Forwards valid requests to A29 decision orchestration.
7. Returns preflight, execution, verification, and rollback state to the UI.
8. Audits every event.

**Supported executive actions:**

| Action                     | Authority Required    |
|----------------------------|-----------------------|
| `ACKNOWLEDGE`              | OPERATIONAL           |
| `APPROVE`                  | EXECUTIVE             |
| `APPROVE_LIMITED_SCOPE`    | SENIOR_MANAGER        |
| `REJECT`                   | EXECUTIVE             |
| `DEFER`                    | SENIOR_MANAGER        |
| `MAINTAIN_FREEZE`          | EXECUTIVE             |
| `RELEASE_FREEZE`           | EXECUTIVE             |
| `ALLOW_DEGRADED_OPERATION` | EXECUTIVE             |
| `HALT_SCOPE`               | EXECUTIVE             |
| `RESUME_SCOPE`             | EXECUTIVE             |

---

## Gateway Contract

### Action Request

```typescript
interface ExecutiveActionRequest {
  requestId: string;
  decisionId: string;
  requestedAction: ExecutiveActionKind;
  requestedScope: string[];
  actorContext: ActorContext;
  authorityContext: AuthorityContext; // advisory only
  clientContext: ClientContext;
  evidenceRefs: string[];
  submittedAt: string;
  idempotencyKey: string;
  // No arbitrary command field. No free-form execution payload.
}
```

### Action Response

```typescript
interface ExecutiveActionResponse {
  requestId: string;
  decisionId: string;
  accepted: boolean;
  status: ActionResponseStatus;
  reason: string;
  orchestrationId: string | null;
  preflightStatus: PreflightStatus;
  executionStatus: ExecutionStatus | null;
  verificationStatus: VerificationStatus;
  rollbackStatus: RollbackStatus;
  remainingRisk: string;
  nextActionRequired: string | null;
  evidenceRefs: string[];
  completedAt: string | null;
}
```

---

## A29 Orchestration Boundary

A31 **forwards** valid executive action requests into A29. It does not:
- Duplicate A29 governance logic.
- Execute A29 lifecycle steps directly.
- Bypass A29 approval or preflight requirements.

A29 orchestration ID is returned in every accepted action response for traceability.

---

## Authority Model

A31 **never** trusts client-supplied authority claims alone.

| Layer            | Role                                                         |
|------------------|--------------------------------------------------------------|
| Client context   | Advisory only — provided as metadata, never trusted          |
| Server policy    | Authoritative — determines whether action is permitted       |

Authority cannot be self-elevated by the UI.

---

## Idempotency

Module: `src/control-tower-gateway/action-idempotency.ts`

Every action request must carry a stable `idempotencyKey` (min 8 characters).

- Duplicate submission with the same key → returns canonical existing result, no mutation.
- Missing or short key → `INVALID_REQUEST` error.

---

## Request Locking

Module: `src/control-tower-gateway/action-lock.ts`

Concurrent requests for the same decision:
- First request acquires the lock.
- Subsequent concurrent requests → `IN_PROGRESS` response, no duplicate mutation.

---

## Expired / Superseded Decisions

Gateway blocks all actions for decisions with status:
`EXPIRED` | `SUPERSEDED` | `CLOSED` | `INVALID`

Returns a clear business-language message.

---

## Preflight Visibility

Exposed states: `NOT_STARTED` | `RUNNING` | `PASSED` | `FAILED` | `BLOCKED`

Implementation details are never exposed.

---

## Execution Visibility

Exposed states: `PENDING` | `EXECUTING` | `VERIFYING` | `VERIFIED` | `ROLLED_BACK` | `FAILED_CLOSED`

UI displays business-language equivalents.

---

## UI Refresh / Polling Policy

Module: `src/control-tower-gateway/control-tower-refresh.ts`

After action submission:
1. Action accepted → `EXECUTING`
2. Orchestration created → ID returned
3. Status polled/refreshed with exponential backoff
4. Verification result returned
5. Dashboard state refreshed

**Bounded policy (defaults):**
- Initial interval: 3 seconds
- Backoff factor: 1.5×
- Max interval: 30 seconds
- Max polling window: 5 minutes
- Max attempts: 20
- Manual refresh always available
- Stale status visible if polling expires

---

## Error Handling

All gateway errors return business-readable messages (spec §26).

| Code                   | User Message                                                                        |
|------------------------|-------------------------------------------------------------------------------------|
| `INVALID_REQUEST`      | The request could not be understood. Please review required fields and try again.   |
| `UNKNOWN_DECISION`     | The requested decision could not be found.                                          |
| `AUTHORITY_DENIED`     | This action requires a higher approval authority.                                   |
| `DECISION_EXPIRED`     | This decision has expired and can no longer be acted upon.                          |
| `DECISION_SUPERSEDED`  | This decision has been superseded by a newer decision.                              |
| `EVIDENCE_STALE`       | Current evidence is too old to safely execute this decision.                        |
| `POLICY_UNKNOWN`       | The governance policy for this decision could not be resolved. Action blocked.      |
| `FREEZE_BLOCKED`       | A change freeze is active. This action is blocked until the freeze is released.     |
| `PREFLIGHT_FAILED`     | Pre-execution safety checks did not pass. The action cannot proceed safely.         |
| `EXECUTION_FAILED`     | The action could not be executed. The system has failed closed to protect integrity.|
| `VERIFICATION_FAILED`  | Execution could not be verified. A rollback may be required.                        |
| `SERVICE_UNAVAILABLE`  | The governance service is temporarily unavailable. Please try again shortly.        |
| `FAILED_CLOSED`        | The system failed closed to protect integrity. No partial action was taken.         |

---

## API Routes

```
GET  /control-tower/snapshot              — Live platform snapshot
GET  /control-tower/decisions             — Active decisions list
GET  /control-tower/decisions/:id         — Decision detail
POST /control-tower/decisions/:id/action  — Submit governed executive action
GET  /control-tower/actions/:requestId    — Action status poll
```

---

## Security

A31 never exposes:
- API keys
- Secrets or tokens
- Credentials or raw auth headers
- Sensitive provider credentials

All errors are sanitized before returning to the client.
Secrets are never logged.

---

## Audit

Module: `src/control-tower-gateway/gateway-audit.ts`

Every gateway event is recorded:

| Event Type             | Trigger                              |
|------------------------|--------------------------------------|
| `SNAPSHOT_READ`        | Snapshot endpoint called             |
| `DECISION_READ`        | Decision detail loaded               |
| `ACTION_REQUESTED`     | Action request received              |
| `ACTION_ACCEPTED`      | Action accepted and forwarded        |
| `ACTION_REJECTED`      | Action rejected by gateway           |
| `AUTHORITY_DENIED`     | Authority insufficient               |
| `PREFLIGHT_STARTED`    | Preflight check initiated            |
| `PREFLIGHT_RESULT`     | Preflight completed                  |
| `EXECUTION_STARTED`    | Execution initiated                  |
| `EXECUTION_RESULT`     | Execution completed                  |
| `VERIFICATION_RESULT`  | Verification completed               |
| `ROLLBACK_RESULT`      | Rollback completed                   |
| `UI_REFRESHED`         | Dashboard/status refresh             |

---

## Observability Metrics

Non-sensitive metrics exposed:

- `control_tower_snapshot_read`
- `control_tower_live_refresh`
- `executive_action_request`
- `executive_action_accepted`
- `executive_action_rejected`
- `executive_action_authority_denied`
- `executive_action_preflight_failed`
- `executive_action_verified`
- `executive_action_rolled_back`
- `gateway_error_count`
- `gateway_latency_ms` (p50 / p95 / p99)

---

## Non-Goals

A31 does **not**:

- Remove A29 or duplicate its governance logic.
- Add unrestricted admin APIs.
- Purchase providers or change billing.
- Manage credentials.
- Sign contracts.
- Edit governance policy.
- Execute arbitrary shell commands.
- Execute arbitrary SQL.
- Allow direct production mutation of any kind.
- Implement native mobile apps.

**All material actions remain governed by A29 and upstream controls.**

---

## Package Scripts

```
a31:gateway   — node scripts/a31-control-tower-governed-gateway.mjs
a31:certify   — npm run typecheck && npm run a31:gateway
a31:finalize  — npm run a31:certify && powershell ... -Stage A31
```

---

## A31 Certification Evidence

Stored under:
`services/kidults-autonomous-intelligence/reports/control-tower-gateway/`

Filename pattern: `a31-control-tower-gateway-<date>-<hash>.json`
