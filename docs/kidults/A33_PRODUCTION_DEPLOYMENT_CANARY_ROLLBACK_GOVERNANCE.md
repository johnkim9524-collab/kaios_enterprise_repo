# A33 — Production Deployment, Canary & Rollback Governance

**Stage:** A33
**Sprint:** KIDULTS A33
**Status:** Certified

## Objective

Convert the A32-certified production reality into a governed deployment lifecycle with
deterministic state transitions, canary health evaluation, promotion policy, rollback
governance, executive control boundaries, and immutable audit evidence.

No A15–A32 control is weakened. No real production system is mutated during
certification (SIMULATION mode is default and enforced).

---

## Deployment State Model

```
NOT_ELIGIBLE
  ↓ (eligibility pass)
READY_FOR_CANARY
  ↓
CANARY_DEPLOYING → CANARY_ACTIVE
  ↓                      ↓
CANARY_HEALTHY     CANARY_DEGRADED
  ↓                      ↓
PROMOTION_PENDING    DEFERRED (terminal)
  ↓
PROMOTED (terminal)

ROLLBACK_REQUIRED → ROLLING_BACK → ROLLED_BACK (terminal)

BLOCKED (terminal)
DEFERRED (terminal)
FAILED_CLOSED (terminal)
```

Any unknown state or invalid transition → **FAILED_CLOSED** immediately.

---

## Canary Model

A canary plan is built for every eligible deployment containing:

| Field | Description |
|---|---|
| `deploymentId` | Unique deployment identifier |
| `artifactId` / `version` | Artifact under deployment |
| `sourceCommitSha` | Source commit hash |
| `targetEnvironment` | Always `production` |
| `canaryPercentage` | 5% initial traffic slice |
| `rolloutCohort` | Traffic cohort identifier |
| `startTime` | ISO timestamp |
| `observationWindowMs` | 5-minute observation window |
| `successThresholds` | availability ≥ 99.9%, error rate ≤ 1%, p99 latency ≤ 500ms |
| `rollbackThresholds` | availability < 99%, error rate > 5%, p99 latency > 2000ms |
| `previousStableVersion` | Version to roll back to |
| `rollbackArtifact` | Rollback artifact reference |
| `policyVersion` | Governing policy version |
| `evidenceRefs` | A32 evidence references |
| `simulationMode` | True unless LIVE_SAFE mode |

---

## Promotion Rules

Promotion requires **all** of:

- Canary completed and health = `HEALTHY`
- All critical thresholds passed
- No blocking incident
- No active change freeze
- No security block
- No executive defer/reject
- Rollback target still valid and verifiable
- Evidence chain complete

Promotion decision values: `PROMOTE | DEFER | BLOCK | ROLLBACK | EXECUTIVE_DECISION_REQUIRED`

---

## Rollback Rules

Automatic rollback is triggered when:

- Canary health = `UNHEALTHY`
- Post-promotion verification fails
- Security block detected
- SEV1 incident active
- Executive FORCE_ROLLBACK
- Unknown critical runtime state

Rollback properties:
- **Idempotent** — repeated rollback calls produce identical results
- **Bounded** — always targets the known previous stable version
- **Evidence-generating** — every rollback emits an audit record
- **Non-silent** — rollback is never skipped without emitting evidence
- **Reversible only** via a new governed deployment cycle

---

## Executive Control Boundaries

Supported decisions:

| Decision | Effect |
|---|---|
| `APPROVE_PROMOTION` | Allows promotion of a healthy canary |
| `DEFER_PROMOTION` | Pauses promotion with audit record |
| `REJECT_PROMOTION` | Blocks promotion permanently for this cycle |
| `FORCE_ROLLBACK` | Forces rollback regardless of health |
| `ACTIVATE_CHANGE_FREEZE` | Enables deployment freeze |
| `RELEASE_CHANGE_FREEZE` | Removes deployment freeze |

**Hard stops that executive control cannot override:**

- Active security block
- Missing rollback target
- Unknown critical state (health = UNKNOWN)
- Failed A32 certification

These remain non-overridable regardless of executive decision.

---

## Positive Scenarios

| Scenario | Expected State | Outcome |
|---|---|---|
| `HEALTHY_CANARY_PROMOTES` | `PROMOTED` | Canary passes all checks and is promoted |
| `CANARY_DEGRADED_DEFERS` | `DEFERRED` | Degraded canary defers promotion |
| `CANARY_UNHEALTHY_ROLLS_BACK` | `ROLLED_BACK` | Unhealthy canary triggers automatic rollback |
| `EXECUTIVE_DEFER` | `DEFERRED` | Executive defers promotion with audit trail |
| `EXECUTIVE_REJECT` | `BLOCKED` | Executive rejects promotion |
| `EXECUTIVE_APPROVE` | `PROMOTED` | Executive approves healthy canary |
| `POST_PROMOTION_VERIFY_FAILURE_ROLLBACK` | `ROLLED_BACK` | Post-promotion check failure triggers rollback |
| `REPEATED_IDENTICAL_EVALUATION_IS_IDEMPOTENT` | `PROMOTED` | Repeated evaluations produce identical results |

---

## Fail-Closed Scenarios

| Scenario | Expected State | Outcome |
|---|---|---|
| `SECURITY_BLOCK_PREVENTS_DEPLOYMENT` | `FAILED_CLOSED` | Security block is non-overridable hard stop |
| `SEV1_BLOCKS_DEPLOYMENT` | `BLOCKED` | Active SEV1 blocks eligibility |
| `CHANGE_FREEZE_BLOCKS_DEPLOYMENT` | `BLOCKED` | Change freeze blocks eligibility |
| `MISSING_ROLLBACK_TARGET_FAILS_CLOSED` | `FAILED_CLOSED` | Missing rollback target is non-overridable |
| `STALE_A32_EVIDENCE_FAILS_CLOSED` | `FAILED_CLOSED` | Stale A32 evidence prevents eligibility |
| `UNKNOWN_HEALTH_FAILS_CLOSED` | `FAILED_CLOSED` | Unknown canary health blocks promotion |
| `PROVIDER_UNAVAILABLE_BLOCKS` | `BLOCKED` | Provider unavailability blocks deployment |
| `INVALID_STATE_TRANSITION_FAILS_CLOSED` | `FAILED_CLOSED` | Invalid state transition rejected deterministically |

---

## Invariants (16 total)

| Invariant | Description |
|---|---|
| `a32CertificationIsMandatory` | A32 certificationPassed must be true |
| `productionPromotionCannotOccurDirectly` | Promotion requires a canary phase |
| `rollbackTargetIsMandatory` | Missing rollback target fails closed |
| `securityBlockIsNonOverridable` | Security block cannot be overridden |
| `unknownCriticalStateFailsClosed` | Unknown health fails closed |
| `promotionRequiresHealthyCanary` | Only HEALTHY canary may be promoted |
| `executiveOverrideCannotBypassHardStops` | Executive cannot bypass hard stops |
| `repeatedEvaluationsAreIdempotent` | Identical inputs produce identical outputs |
| `everyDecisionEmitsEvidence` | All decisions generate audit records |
| `noProductionMutationDuringCertification` | No real system mutated in SIMULATION |
| `a15ToA32ControlsPreserved` | All prior-stage controls remain intact |
| `invalidTransitionFailsClosed` | Invalid state transitions fail closed |
| `executiveApproveCanPromoteHealthyCanary` | Executive can promote healthy canary |
| `executiveRejectBlocksPromotion` | Executive rejection blocks promotion |
| `rollbackIsIdempotent` | Rollback operations are idempotent |
| `postPromotionVerificationRollback` | Post-promotion failure triggers rollback |

---

## Evidence Location

```
services/kidults-autonomous-intelligence/reports/deployment-governance/
  a33-deployment-governance-<date>-<hash>.json
```

Each evidence record includes: `deploymentId`, source A32 evidence, artifact identity,
canary plan, health observations, thresholds, decisions, policy versions, executive
decisions, rollback decision, final deployment state, timestamps, audit trail, and
invariant results.

---

## CI Workflow

`.github/workflows/kidults-a33-deployment-governance.yml`

Steps:
1. Checkout + setup Node 20
2. Install dependencies
3. Verify A33 package scripts exist
4. Typecheck
5. Run `a33:gate` (SIMULATION mode)
6. Run `a33:certify` (SIMULATION mode)
7. Run upstream `a32:certify` (regression guard)
8. Upload evidence artifact (90-day retention)

---

## Package Scripts

```json
"a33:gate":    "node scripts/a33-deployment-governance.mjs",
"a33:certify": "npm run typecheck && npm run a33:gate",
"a33:finalize": "npm run a33:certify && ..."
```

---

## A15–A32 Controls Preserved

All upstream governance controls from A15 through A32 remain intact:

- Policy enforcement (A15)
- Execution control boundaries (A16)
- Live adapter boundaries (A17)
- Data scale governance (A18)
- Product readiness gate (A20)
- Publication control (A22)
- Commercial delivery control (A23)
- Production activation gate (A24)
- Autonomous runtime governance (A25)
- Recovery governance (A26)
- Operational governance (A27)
- Executive control tower (A28)
- Executive decision orchestration (A29)
- Control tower UI (A30)
- Governed gateway (A31)
- Production reality gate (A32)

A33 adds the deployment governance layer on top without weakening any prior control.

---

## Certification Safety

- All certification runs use `A33_MODE=SIMULATION` (default)
- No external system is contacted during certification
- No production mutation occurs during certification tests
- No credentials are embedded in any artifact
- No billing or provider actions are taken
