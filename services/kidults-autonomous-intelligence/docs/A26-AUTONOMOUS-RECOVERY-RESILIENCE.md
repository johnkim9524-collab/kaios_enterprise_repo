# A26 — Autonomous Recovery, Self-Healing & Operational Resilience

**Sprint:** KIDULTS A26  
**Stage:** Autonomous Recovery, Self-Healing & Operational Resilience  
**Prerequisite:** A25 — Autonomous Production Runtime & Continuous Operations  
**Policy:** `contracts/a26-recovery-policy.json` (`a26-recovery-policy.v1`)  
**Library:** `scripts/lib/autonomous-recovery-engine.mjs`  
**Runner:** `scripts/a26-autonomous-recovery.mjs`  
**Evidence:** `reports/recovery/a26-recovery-<date>-<id>.json`

---

## Purpose

A26 adds deterministic, policy-governed, bounded recovery and resilience
capabilities on top of A25 without weakening any upstream governance or
safety control (A15–A25).

A26 enables the runtime to:

```
DETECT FAILURE
→ CLASSIFY FAILURE
→ ISOLATE FAILURE DOMAIN
→ CHECK RECOVERY POLICY
→ SELECT RECOVERY ACTION
→ EXECUTE BOUNDED RECOVERY
→ VERIFY RECOVERY
→ PRODUCE EVIDENCE
→ DECIDE SAFE RE-ENTRY / DEGRADED CONTINUATION / HALT
```

Recovery always remains: policy-governed · bounded · fail-closed ·
observable · auditable · idempotent where possible · non-interactive by
default.

---

## Safety Invariants

All must hold at all times:

1. Recovery is always policy-governed.
2. Recovery is always bounded.
3. Recovery is fail-closed by default.
4. Recovery is observable and auditable.
5. Recovery is idempotent where possible.
6. Recovery is non-interactive by default.
7. No direct `FAILURE_DETECTED → RECOVERED` transition.
8. No recovery without classification.
9. No recovery without policy evaluation.
10. No re-entry without recovery verification.
11. Unknown or contradictory state → `FAILED_CLOSED`.
12. No uncontrolled auto-healing or silent safety control override.
13. No recovery action may bypass A15–A25 controls.
14. No action may expand mutation scope.
15. No secrets in evidence or logs.

---

## 1. Recovery State Machine

### States

| State | Description |
|---|---|
| `MONITORING` | Normal observation — watching for failures |
| `FAILURE_DETECTED` | A failure signal has been received |
| `CLASSIFYING` | Determining failure class and domain |
| `ISOLATING` | Identifying smallest safe failure domain |
| `RECOVERY_POLICY_CHECK` | Evaluating recovery policy and budgets |
| `RECOVERY_READY` | Policy approved — ready to recover |
| `RECOVERING` | Bounded recovery action executing |
| `VERIFYING_RECOVERY` | Verifying recovery result |
| `RECOVERED` | Recovery completed successfully |
| `DEGRADED` | Scope degraded — healthy scopes continue |
| `ROLLBACK_REQUIRED` | Rollback required before any re-entry |
| `ROLLING_BACK` | Bounded rollback executing |
| `REENTRY_CHECK` | Certifying safe re-entry after recovery |
| `REENTRY_ALLOWED` | Re-entry certified |
| `HALTED` | Affected scope halted |
| `FAILED_CLOSED` | Terminal fail-closed — no transition out |

### Transition rules

- `FAILURE_DETECTED` may only transition to `CLASSIFYING` or `FAILED_CLOSED`.
- No direct `FAILURE_DETECTED → RECOVERED`.
- `FAILED_CLOSED` has no outgoing transitions.
- Any unsupported transition returns `FAILED_CLOSED`.

---

## 2. Failure-Domain Isolation

Domains: `workload` · `product` · `dimension` · `provider` · `channel` ·
`publication` · `commercial-delivery` · `database` · `cache` · `queue` ·
`network` · `runtime` · `policy` · `authentication` · `rate-limit` ·
`evidence` · `dependency` · `unknown`

Isolation rules:
- One provider failure must not stop unrelated `SELF-FIRST` workloads.
- One stale product must not halt all healthy products.
- One publication channel failure must not bypass A22.
- One commercial delivery failure must not bypass A23.
- Provider-required dependency failure remains dependency-blocked.
- Policy failure may halt the affected scope immediately.
- Unknown domain always fails closed.

---

## 3. Failure Classification

Classes: `TRANSIENT` · `DEPENDENCY` · `AUTH` · `RATE_LIMIT` · `NETWORK` ·
`TIMEOUT` · `DATA_QUALITY` · `STALE_DATA` · `POLICY` · `ACTIVATION` ·
`EXECUTION` · `VERIFICATION` · `PUBLICATION` · `COMMERCIAL_DELIVERY` ·
`DATABASE` · `QUEUE` · `RESOURCE_EXHAUSTION` · `PARTIAL_MUTATION` ·
`ROLLBACK` · `EVIDENCE` · `UNKNOWN`

Severities: `INFO` · `WARN` · `ERROR` · `CRITICAL`

`UNKNOWN` classification or severity fails closed for mutation.

Every failure record includes: `failureId` · `cycleId` · `detectedAt` ·
`domain` · `classification` · `severity` · `scope` · `source` ·
`retryable` · `rollbackRequired` · `policyDecision` · `evidenceRef`

---

## 4. Recovery Policy Engine

Recovery actions: `NO_ACTION` · `RETRY` · `BACKOFF` · `RESTART_SCOPE` ·
`RESET_CONNECTION` · `RELOAD_STATE` · `REPLAY_SAFE_OPERATION` ·
`QUARANTINE` · `DEGRADE` · `ISOLATE_PROVIDER` · `ISOLATE_PRODUCT` ·
`CIRCUIT_BREAK` · `ROLLBACK` · `HALT_SCOPE` · `HALT_RUNTIME` ·
`FAIL_CLOSED`

Policy considers: failure classification · severity · affected scope ·
retry budget · recovery budget · rollback availability · provider
dependency · A24 activation eligibility · A25 runtime health · publication
controls · commercial controls · prior failure history · circuit breaker
state.

No action may expand mutation scope. No recovery action may bypass
A15–A25 controls.

---

## 5. Recovery Budgets

| Limit | Default |
|---|---|
| `maxRecoveryAttemptsPerCycle` | 5 |
| `maxRecoveryAttemptsPerFailure` | 3 |
| `maxRecoveryDurationMs` | 120,000 ms |
| `maxRollbackAttempts` | 2 |
| `maxRestartAttempts` | 2 |
| `maxProviderReconnectAttempts` | 3 |
| `maxReplayAttempts` | 2 |
| `maxDegradedCycles` | 5 |
| `maxConsecutiveFailures` | 5 |

Budget exceeded → `HALT_SCOPE` or `FAIL_CLOSED` per policy. No unlimited
recovery loops.

---

## 6. Retry and Backoff

- Exponential or policy-defined bounded backoff with jitter.
- Max delay: 120,000 ms.
- Deterministic attempt counting.
- No retry after permanent policy denial.
- No retry after auth failure unless credential state changes.
- No retry that bypasses preflight.
- No retry that bypasses A24 activation.
- No retry that bypasses dependency rules.

---

## 7. Circuit Breaker

States: `CLOSED` · `OPEN` · `HALF_OPEN`

Inputs: consecutive failures · rolling error rate · provider failures ·
timeout rate · auth failures · rate-limit pressure · verification failures

Thresholds (configurable): 5 consecutive failures or 50% error rate → `OPEN`.

`HALF_OPEN`: limited probe only. Successful probe → `CLOSED`. Failed
probe → `OPEN`.

Circuit breaker decisions produce evidence and are policy-governed.
Unrelated workloads are not globally halted unless required by dependency
propagation.

---

## 8. Self-Healing Actions

### Permitted

- Recreate in-memory state
- Reload configuration
- Refresh non-secret metadata
- Reset bounded worker state
- Reopen database connection
- Restart isolated internal processing scope
- Replay idempotent internal work
- Rebuild derived cache
- Resume from durable checkpoint

### Explicitly prohibited

- Silently changing provider credentials
- Creating new paid provider subscriptions
- Modifying billing
- Bypassing provider limits
- Creating unsupported infrastructure
- Modifying security policy
- Modifying production activation rules
- Mutating external systems beyond approved A25 scope

---

## 9. Checkpoint and Resume

Checkpoint fields: `checkpointId` · `cycleId` · `workloadId` · `product` ·
`runtimeState` · `lastVerifiedOperation` · `processedCount` ·
`mutationCount` · `evidenceRef` · `createdAt`

Resume is permitted only when: checkpoint is valid · provenance is valid ·
policy version is compatible · A24 activation remains valid · preflight
passes · no conflicting newer state exists.

Unknown checkpoint integrity → fail closed.

---

## 10. Partial Mutation Handling

Sequence: detect → identify scope → verify persisted state →
compare expected vs observed → decide (complete safely / rollback /
quarantine / halt).

Never assume partial success. Evidence includes: `expected` · `observed` ·
`delta` · `decision` · `rollbackRequired`.

---

## 11. Rollback Hardening

Phases: `ROLLBACK_PREFLIGHT` → `ROLLBACK_EXECUTION` →
`ROLLBACK_VERIFICATION` → `ROLLBACK_EVIDENCE`

Outcomes: `NOT_REQUIRED` · `AVAILABLE` · `STARTED` · `SUCCEEDED` ·
`PARTIAL` · `FAILED` · `UNKNOWN`

- `PARTIAL` → no production re-entry
- `FAILED` → halt affected scope
- `UNKNOWN` → fail closed

Rollback is bounded and idempotent.

---

## 12. Degraded Operation

Degraded mode isolates affected scope while continuing independent eligible
workloads. Preserves A19 dependency propagation, A22 publication
restrictions, A23 delivery restrictions, A24 activation restrictions.

Tracked fields: `degradedSince` · `affectedScopes` · `degradedReason` ·
`remainingHealthyScopes` · `maxDegradedCycles`

Exceeded degraded budget → halt or fail closed.

---

## 13. Safe Re-Entry

Required checks: policy valid · preflight PASS · A24 activation still valid ·
A25 runtime health acceptable · failure cleared · circuit breaker permits ·
verification PASS · rollback state clean · evidence complete ·
dependency graph healthy.

Decisions: `ALLOW` · `DEGRADED_ALLOW` · `DENY` · `HALT`

No automatic full re-entry after recovery without this gate.

---

## 14. Resilience Health Model

Dimensions: `recovery_readiness` · `rollback_readiness` ·
`circuit_breaker_health` · `checkpoint_health` ·
`dependency_isolation_health` · `degraded_mode_pressure` ·
`consecutive_failure_pressure` · `evidence_integrity` ·
`recovery_latency` · `recovery_success_rate`

Classes: `RESILIENT` · `DEGRADED` · `UNSTABLE` · `HALTED` · `UNKNOWN`

`UNKNOWN` blocks mutation.

---

## 15. Recovery Observability

Metrics emitted per session:

`failure_detected_count` · `failure_classification_count` ·
`recovery_attempt_count` · `recovery_success_count` ·
`recovery_failure_count` · `rollback_attempt_count` ·
`rollback_success_count` · `rollback_failure_count` ·
`circuit_open_count` · `circuit_half_open_count` ·
`circuit_close_count` · `checkpoint_created_count` ·
`checkpoint_resume_count` · `degraded_cycle_count` ·
`scope_halt_count` · `runtime_halt_count` ·
`partial_mutation_count` · `reentry_allow_count` ·
`reentry_deny_count` · `mean_recovery_time_ms` ·
`max_recovery_time_ms`

No secret values in metrics or logs.

---

## 16. Recovery Evidence

Every recovery session produces immutable machine-readable evidence.

**Canonical path:** `services/kidults-autonomous-intelligence/reports/recovery/`  
**File prefix:** `a26-recovery-`  
**Format:** JSON, one file per session

Evidence fields include: `stage` (`A26`) · `mode` · `recoveryId` ·
`cycleId` · `a25EvidenceRef` · `startedAt` · `completedAt` · `status` ·
`recoveryState` · `failureRecord` · `recoveryAction` · `rollback` ·
`checkpoint` · `partialMutation` · `degradedState` · `reentry` ·
`resilienceHealth` · `metrics` · `budgetState` · `circuitBreakers` ·
`retryRecords` · `scenarioResults` · `scenarioSummary` · `invariants`

---

## Running A26

```bash
node scripts/a26-autonomous-recovery.mjs
```

Requires: `contracts/a26-recovery-policy.json` ·
`contracts/a25-runtime-policy.json` ·
`contracts/a24-production-activation-policy.json`

Exit 0 = PASS. Exit 1 = FAIL.

---

## Relationship to upstream sprints

| Sprint | Role in A26 |
|---|---|
| A15 | Global autonomous policy — never bypassed |
| A16 | Execution control plane — never bypassed |
| A17 | Bounded live adapters — recovery respects adapter bounds |
| A18 | Data acquisition scale — recovery preserves acquisition policy |
| A19 | Dependency/gap matrix — dependency propagation preserved in degraded mode |
| A20 | Product readiness gate — product isolation in recovery respects this |
| A21 | Intelligence product pipeline — pipeline degradation is isolated |
| A22 | Publication control plane — publication domain never bypassed in recovery |
| A23 | Commercial delivery control — commercial domain never bypassed in recovery |
| A24 | Production activation gate — A24 re-checked at every re-entry |
| A25 | Production runtime — A26 sits on top; A25 controls are never weakened |
