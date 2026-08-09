# A34 — Autonomous Production Assurance & Continuous Verification

**Stage:** A34
**Sprint:** KIDULTS A34
**Status:** Certified

## Objective

Implement a bounded autonomous production assurance layer that continuously
verifies that the system remains healthy, policy-compliant, fresh, secure,
operationally safe, and reversible after deployment.

A34 detects production drift and decides whether to: CONTINUE, OBSERVE,
DEGRADE, CONTAIN, ROLLBACK, FREEZE, ESCALATE, or FAIL_CLOSED.

No A15–A33 control is weakened. No real production system is mutated during
certification (SIMULATION mode is default and enforced).

---

## Assurance State Model

```
UNVERIFIED
  ↓ (begin verification)
VERIFYING
  ↓
HEALTHY           → decision: CONTINUE
OBSERVING         → decision: OBSERVE
DEGRADED          → decision: DEGRADE
CONTAINED         → decision: CONTAIN
ROLLBACK_REQUIRED → decision: ROLLBACK
FROZEN            → decision: FREEZE
EXECUTIVE_REVIEW_REQUIRED → decision: EXECUTIVE_REVIEW_REQUIRED
FAILED_CLOSED     → decision: FAILED_CLOSED
```

Unknown state or invalid transition → **FAILED_CLOSED** immediately.

---

## Continuous Verification Dimensions

Each dimension emits: `PASS`, `WARN`, `FAIL`, or `UNKNOWN`.

`UNKNOWN` in any critical dimension → **FAIL_CLOSED** immediately.

| Dimension | Critical | Notes |
|---|---|---|
| `runtimeHealth` | ✓ | Derived from availability telemetry |
| `availability` | ✓ | Hard threshold at 95% |
| `latency` | — | P99; warn >400ms, fail >1000ms |
| `errorRate` | ✓ | Hard threshold at 5% |
| `saturation` | — | Warn >70%, fail >85% |
| `functionalVerification` | ✓ | Pass/warn/fail/unknown |
| `deploymentIdentity` | ✓ | Requires A33 approval |
| `artifactIdentity` | ✓ | Must match approved digest |
| `configurationDrift` | — | None/benign/suspicious/critical |
| `policyDrift` | ✓ | Stage-aware canonical source check |
| `schemaDrift` | — | Registry comparison |
| `evidenceFreshness` | ✓ | Stale evidence → FAIL_CLOSED |
| `dataFreshness` | — | Non-critical warn |
| `providerHealth` | — | External provider monitor |
| `securityPosture` | ✓ | CVE/regression check |
| `incidentState` | — | Active SEV1 → warn |
| `sloCompliance` | ✓ | Hard breach → rollback |
| `rollbackReadiness` | ✓ | Missing target → FAIL_CLOSED |
| `auditContinuity` | ✓ | A32 certification mandatory |

---

## Drift Types

| Drift Type | Severity | Recommended Action |
|---|---|---|
| `CONFIG_DRIFT` (critical) | CRITICAL | CONTAIN |
| `POLICY_DRIFT` (critical) | CRITICAL | FAIL_CLOSED |
| `SCHEMA_DRIFT` | HIGH | OBSERVE |
| `ARTIFACT_DRIFT` | CRITICAL | FREEZE |
| `DEPENDENCY_DRIFT` | HIGH | OBSERVE |
| `PROVIDER_DRIFT` | HIGH | DEGRADE |
| `DATA_FRESHNESS_DRIFT` | MEDIUM | OBSERVE |
| `EVIDENCE_FRESHNESS_DRIFT` | CRITICAL | FAIL_CLOSED |
| `SLO_DRIFT` (hard breach) | CRITICAL | ROLLBACK |
| `SECURITY_DRIFT` | CRITICAL | CONTAIN |
| `RUNTIME_BEHAVIOR_DRIFT` | HIGH | DEGRADE |

Drift records include: `driftType`, `expected`, `observed`, `severity`,
`source`, `detectedAt`, `firstSeenAt`, `persistence`, `confidence`,
`recommendedAction`.

---

## Decision Model

| Decision | Condition |
|---|---|
| `CONTINUE` | All critical dimensions PASS |
| `OBSERVE` | Bounded non-critical WARN states |
| `DEGRADE` | Persistent drift or provider degradation |
| `CONTAIN` | Unsafe scope can be isolated (security regression, critical config drift) |
| `ROLLBACK` | SLO hard breach or post-deployment verification failure |
| `FREEZE` | Unauthorized artifact mutation detected |
| `EXECUTIVE_REVIEW_REQUIRED` | Recovery exhausted; policy requires human decision |
| `FAILED_CLOSED` | Unknown critical state, evidence staleness, missing policy, missing rollback |

Decision rules are applied in strict priority order. No rule may be bypassed
by fixture injection.

---

## Containment Model (Simulated)

Containment actions are logical/simulated. No irreversible external mutation
occurs during certification.

| Action | Triggered By |
|---|---|
| `ISOLATE_AFFECTED_TARGET` | CONTAIN |
| `DISABLE_UNSAFE_AUTONOMOUS_ACTION_PATH` | CONTAIN, FAILED_CLOSED |
| `BLOCK_FURTHER_DEPLOYMENT` | CONTAIN, FREEZE, ROLLBACK, FAILED_CLOSED |
| `FREEZE_CHANGE_LIFECYCLE` | FREEZE |
| `BLOCK_PUBLICATION` | FREEZE |
| `REQUEST_ROLLBACK` | ROLLBACK |
| `SUSPEND_PROVIDER_DEPENDENT_OPERATION` | DEGRADE |
| `FORCE_READ_ONLY_MODE` | DEGRADE |

---

## Rollback Behavior

- Rollback is triggered by `CRITICAL_SLO_BREACH` or `POST_DEPLOYMENT_VERIFICATION_FAIL`.
- If no rollback target exists when rollback is needed → **FAILED_CLOSED**.
- Rollback actions are simulated (no real production mutation).
- After successful rollback, re-evaluation can return to **HEALTHY / CONTINUE**.

---

## Executive Escalation Boundaries

Escalation reasons include:

`CRITICAL_DRIFT`, `ROLLBACK_FAILURE`, `UNKNOWN_CRITICAL_STATE`,
`REPEATED_SLO_BREACH`, `SECURITY_REGRESSION`, `POLICY_CONFLICT`,
`UNAUTHORIZED_CHANGE`, `RECOVERY_EXHAUSTED`

Available executive decisions:

`ACKNOWLEDGE`, `CONTINUE_OBSERVATION`, `AUTHORIZE_BOUNDED_RECOVERY`,
`APPROVE_ROLLBACK`, `ACTIVATE_FREEZE`

**Executive control cannot bypass:**

- Security hard stops
- Unknown critical state
- Missing rollback target
- Failed A32 certification
- Unverifiable artifact identity

---

## Positive Scenarios

| Scenario | Expected State | Expected Decision |
|---|---|---|
| `HEALTHY_PRODUCTION_CONTINUES` | HEALTHY | CONTINUE |
| `TRANSIENT_WARNING_OBSERVES` | OBSERVING | OBSERVE |
| `PERSISTENT_SLO_DRIFT_DEGRADES` | DEGRADED | DEGRADE |
| `PROVIDER_DEGRADATION_DEGRADES` | DEGRADED | DEGRADE |
| `RECOVERY_SUCCESS_RETURNS_HEALTHY` | HEALTHY | CONTINUE |
| `REPEATED_IDENTICAL_EVALUATION_IS_IDEMPOTENT` | HEALTHY | CONTINUE |

---

## Fail-Closed Scenarios

| Scenario | Expected State | Expected Decision |
|---|---|---|
| `CRITICAL_SLO_BREACH_ROLLS_BACK` | ROLLBACK_REQUIRED | ROLLBACK |
| `POLICY_DRIFT_FAILS_CLOSED` | FAILED_CLOSED | FAILED_CLOSED |
| `CONFIG_DRIFT_CONTAINS` | CONTAINED | CONTAIN |
| `UNAUTHORIZED_ARTIFACT_CHANGE_FREEZES` | FROZEN | FREEZE |
| `STALE_EVIDENCE_FAILS_CLOSED` | FAILED_CLOSED | FAILED_CLOSED |
| `SECURITY_REGRESSION_CONTAINS` | CONTAINED | CONTAIN |
| `UNKNOWN_CRITICAL_HEALTH_FAILS_CLOSED` | FAILED_CLOSED | FAILED_CLOSED |
| `ROLLBACK_TARGET_MISSING_FAILS_CLOSED` | FAILED_CLOSED | FAILED_CLOSED |
| `POST_DEPLOYMENT_VERIFICATION_FAILURE_ROLLBACK` | ROLLBACK_REQUIRED | ROLLBACK |
| `RECOVERY_EXHAUSTED_ESCALATES` | EXECUTIVE_REVIEW_REQUIRED | EXECUTIVE_REVIEW_REQUIRED |

---

## Invariant Count

**20 invariants** verified on every run:

1. A32 certification is mandatory
2. A33 deployment evidence is mandatory
3. Active artifact must match approved artifact
4. Critical policy drift cannot continue silently
5. Critical config drift cannot continue silently
6. Unknown critical state fails closed
7. Rollback readiness is mandatory
8. Security hard stops are non-overridable
9. Executive control cannot bypass hard stops
10. Repeated evaluations are idempotent
11. Every decision emits evidence
12. No irreversible production mutation during certification
13. A15–A33 controls preserved
14. Healthy production continues (CONTINUE decision)
15. Transient warn observes (OBSERVE decision)
16. Persistent SLO drift degrades (DEGRADE decision)
17. Critical SLO breach rolls back (ROLLBACK decision)
18. Post-deployment failure rolls back (ROLLBACK decision)
19. Recovery success returns healthy (CONTINUE decision)
20. Recovery exhausted escalates (EXECUTIVE_REVIEW_REQUIRED decision)

---

## Evidence Location

```
services/kidults-autonomous-intelligence/reports/production-assurance/
  a34-production-assurance-<date>-<id>.json
```

Evidence fields: `assuranceRunId`, `sourceA32Evidence`, `sourceA33DeploymentEvidence`,
`assuranceStateModel`, `driftTypes`, `decisions`, `scenarios`, `invariants`,
`certification`, `noProductionMutation`, `completedAt`.

---

## CI Workflow

`.github/workflows/kidults-a34-production-assurance.yml`

Triggered on: push to relevant paths, `workflow_dispatch`.

Steps:
1. Install dependencies
2. Verify A34 package scripts present
3. `npm run typecheck`
4. `npm run a34:gate` (SIMULATION mode)
5. `npm run a34:certify` (SIMULATION mode)
6. `npm run a33:certify` (upstream regression)
7. `npm run a32:certify` (upstream regression)
8. Upload evidence artifact

---

## A15–A33 Controls Preserved

- No prior-stage policy, execution control, or deployment governance is weakened.
- A32 certification remains a mandatory gate for any production assurance run.
- A33 deployment evidence remains a mandatory gate.
- All security hard stops and executive boundaries from A15–A33 are enforced.

## No Irreversible Production Mutation

Certification runs exclusively in **SIMULATION** mode. All containment,
rollback, and freeze actions are logical/simulated. No real provider is
contacted, no credentials are consumed, no billing events are generated, and
no production state is mutated.
