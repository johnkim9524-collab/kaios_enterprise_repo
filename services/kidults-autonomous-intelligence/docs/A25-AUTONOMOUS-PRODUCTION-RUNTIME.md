# A25 — Autonomous Production Runtime & Continuous Operations

## Overview

A25 converts the approved A24 production activation state into a continuously operating autonomous runtime bounded by policy governance, fail-closed behavior, non-interactive execution, rollback safety, evidence generation, and controlled recovery.

**This is NOT an unrestricted production release stage.**
A25 does not bypass A24 activation policy, enable uncontrolled external mutation, or weaken any existing safety invariant.

---

## Prerequisites

| Stage | Establishes |
|-------|-------------|
| A15 | Global Autonomous Policy Foundation |
| A16 | Autonomous Execution Control Plane |
| A17 | Bounded-live adapter readiness |
| A18 | Autonomous data acquisition scale |
| A19 | Data Coverage & Productization Gap Matrix |
| A20 | Intelligence Product Readiness & Monetization Gate |
| A21 | Autonomous Intelligence Product Pipeline |
| A22 | Productization & Publication Control Plane |
| A23 | Autonomous Commercial Delivery & Channel Control |
| A24 | Autonomous Production Activation Gate (**required**) |

Valid A24 activation evidence must exist before A25 may execute any runtime cycle.

---

## Control Loop

```
POLICY
→ PREFLIGHT
→ ACTIVATION_CHECK
→ EXECUTE
→ VERIFY
→ EVIDENCE
→ OBSERVE
→ HEALTH_ASSESSMENT
→ RETRY / DEGRADE / ROLLBACK / HALT
→ NEXT CYCLE
```

---

## Runtime State Machine

### States

| State | Description |
|-------|-------------|
| `IDLE` | Awaiting next cycle trigger |
| `PREFLIGHT` | Validating policy, configuration, and environment |
| `ACTIVATION_CHECK` | Consuming and enforcing A24 activation gate |
| `READY` | All pre-execution gates passed |
| `EXECUTING` | Bounded operations in progress |
| `VERIFYING` | Validating execution outcomes |
| `OBSERVING` | Collecting runtime health observations |
| `HEALTHY` | Cycle completed successfully |
| `DEGRADED` | Partial success — isolated failure contained |
| `RETRY_WAIT` | Waiting before bounded retry |
| `ROLLING_BACK` | Rolling back mutation state |
| `HALTED` | Runtime suspended pending remediation |
| `FAILED_CLOSED` | Terminal fail-closed — no production continuation |

### Transition Invariants

- No implicit transitions.
- No direct `IDLE → EXECUTING` path.
- Unknown, malformed, unsupported, incomplete, or contradictory state → `FAILED_CLOSED`.
- No execution without successful policy, preflight, and A24 activation validation.

---

## Policy-First Execution Contract

Every runtime cycle evaluates the following in strict order before any execution:

1. `policyCheck`
2. `preflightCheck`
3. `activationCheck`
4. `execution`
5. `verification`
6. `evidence`
7. `observation`

Missing or invalid prerequisites fail closed.
Interactive prompts are forbidden and will not block the autonomous runtime.

---

## A24 Activation Gate Enforcement

A25 consumes A24 activation evidence for each cycle.

| Classification | Behavior |
|----------------|----------|
| `SELF-FIRST` | May enter bounded production runtime when all A24 gates pass |
| `HYBRID` | Remains capped per provider evidence and activation policy. No unsupported promotion |
| `PROVIDER-REQUIRED` | Remains blocked unless valid provider evidence and policy explicitly permit |
| Unknown | Fail closed |

A25 must not reclassify products. Classification is authoritative from A24.

---

## Bounded Execution

All bounds are defined in `contracts/a25-runtime-policy.json` and included in evidence output.

| Bound | Policy Default |
|-------|---------------|
| Max operations per cycle | 50 |
| Max records per batch | 500 |
| Max retry attempts | 3 |
| Max execution duration | 300 s |
| Max remote calls | 0 (internal only) |
| Max concurrency | 5 |
| Max mutation scope | 1,000 records |
| Max failure budget | 10 failures |

No unbounded loops. No recursive retry without limit. No unlimited fan-out.

---

## Scheduler Contract

| Property | Value |
|----------|-------|
| Mode | Repeatable bounded cycles |
| Cycle period | 3,600 s (1 hour) |
| Backoff base | 30 s |
| Backoff max | 1,800 s |
| Jitter max | 60 s |
| Failure cooldown | 300 s |
| Max consecutive failures before halt | 5 |
| Degraded cycle period | 7,200 s |
| Halt mode supported | Yes |

Each cycle evidence record includes:

```json
{
  "cycleId": "a25-runtime-YYYY-MM-DD-<hex>",
  "startedAt": "ISO8601",
  "completedAt": "ISO8601",
  "policyVersion": "a25-runtime-policy.v1",
  "runtimeVersion": "1.0.0",
  "activationEvidenceRef": "<a24-evidence-filename>",
  "status": "PASS | FAIL | DEGRADED | HALTED",
  "attempt": 1,
  "nextEligibleRunAt": "ISO8601"
}
```

---

## Health Model

### Dimensions

`policy_health` · `preflight_health` · `activation_health` · `execution_health` · `data_freshness` · `provider_dependency_health` · `publication_control_health` · `commercial_delivery_health` · `latency` · `error_rate` · `retry_pressure` · `evidence_completeness` · `rollback_availability`

### Health Classes

| Class | Mutation Permitted |
|-------|--------------------|
| `HEALTHY` | Yes (within bounds) |
| `DEGRADED` | Isolated scopes only |
| `UNHEALTHY` | No |
| `HALTED` | No |
| `UNKNOWN` | No — fail closed |

---

## Failure Classification & Actions

| Class | Action |
|-------|--------|
| `TRANSIENT` | Bounded retry |
| `DEPENDENCY` | Degrade or halt affected workload only |
| `POLICY` | Fail closed |
| `AUTH` | Halt affected provider path |
| `RATE_LIMIT` | Backoff |
| `DATA_QUALITY` | Quarantine affected payload |
| `STALE_DATA` | Block product update |
| `EXECUTION` | Verify partial mutation → decide rollback |
| `VERIFICATION` | Rollback or fail closed |
| `PUBLICATION_BLOCK` | Never bypass A22 |
| `ROLLBACK_REQUIRED` | Rollback |
| `UNKNOWN` | Fail closed |

---

## Retry Policy

- Maximum 3 attempts (configurable via policy).
- Each retry records: `attempt`, `reason`, `delayMs`, `policyDecision`, `previousEvidenceRef`.
- Retries are idempotent wherever possible.
- No retry may widen mutation scope.
- No retry may bypass preflight.
- No retry may bypass A24.

---

## Rollback Contract

| Property | Value |
|----------|-------|
| Eligibility check required | Yes |
| Evidence required | Yes |
| Outcome verification required | Yes |
| Idempotent | Yes |
| Max rollback attempts | 2 |
| Fail closed on unknown result | Yes |

### Rollback Statuses

`NOT_REQUIRED` · `AVAILABLE` · `STARTED` · `SUCCEEDED` · `FAILED` · `UNKNOWN`

Production continuation after `FAILED` or `UNKNOWN` rollback is blocked.

---

## Degraded Mode

- A single provider failure does not automatically stop unrelated `SELF-FIRST` workloads.
- Failure isolation is applied where possible.
- A19–A24 dependency propagation remains authoritative.

---

## Observability Metrics

| Metric | Description |
|--------|-------------|
| `cycle_count` | Total runtime cycles executed |
| `success_count` | Cycles completed HEALTHY |
| `failure_count` | Cycles that failed |
| `retry_count` | Total retry attempts |
| `rollback_count` | Total rollbacks executed |
| `halt_count` | Total halt transitions |
| `degraded_count` | Cycles completed DEGRADED |
| `execution_latency_ms` | Aggregate execution latency |
| `verification_latency_ms` | Aggregate verification latency |
| `remote_call_count` | Remote calls executed (bounded to 0 for internal-only) |
| `records_processed` | Records evaluated this cycle |
| `records_mutated` | Records mutated this cycle |
| `records_quarantined` | Records quarantined (data quality) |
| `provider_failures` | Provider-level failures |
| `policy_denials` | Policy check denials |
| `activation_denials` | Activation check denials |

No secrets. No provider credentials in evidence or logs.

---

## Evidence Model

- **Immutable**, machine-readable JSON.
- **Canonical path**: `services/kidults-autonomous-intelligence/reports/runtime/`
- **Filename prefix**: `a25-runtime-`

Evidence includes all cycle fields, health dimensions, target results, rollback record, retry records, failure classification, and applied bounds.

---

## Global Safety Invariants

1. Policy before execution.
2. Preflight before mutation.
3. Activation check (A24 gate) before execution.
4. Non-interactive by default.
5. Fail closed on unknown, malformed, or contradictory state.
6. No implicit `IDLE → EXECUTING` path.
7. No execution without successful policy, preflight, and A24 validation.
8. No unbounded loops, recursive retry without limit, or unlimited fan-out.
9. All bounds represented in policy and included in evidence output.
10. Evidence produced for every cycle.
11. Rollback path certified before execution.
12. No provider credentials in evidence.
13. No secrets in logs.
14. No A24 policy bypass.
15. No activation class reclassification.

---

## Artifacts

| Artifact | Path |
|----------|------|
| Runtime policy contract | `contracts/a25-runtime-policy.json` |
| Runtime library | `scripts/lib/autonomous-production-runtime.mjs` |
| Runtime entrypoint | `scripts/a25-autonomous-production-runtime.mjs` |
| Cycle evidence | `reports/runtime/a25-runtime-<timestamp>.json` |

## npm Scripts

```bash
npm run a25:runtime    # Execute one bounded runtime cycle
npm run a25:certify    # typecheck + runtime cycle
npm run a25:finalize   # certify + stage finalize
```
