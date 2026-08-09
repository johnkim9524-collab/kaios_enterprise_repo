# A36 — Autonomous Cost, Budget & Economic Governance

## Objective

A36 implements a bounded autonomous cost, budget, and economic governance layer for the KIDULTS Global Autonomous Intelligence Platform. It determines whether proposed operational resource decisions are economically admissible while preserving all A15–A35 safety, production, capacity, rollback, recovery, security, and executive governance boundaries.

A36 **NEVER** executes financial transactions, makes purchases, modifies billing, creates paid resources, accepts contracts, or makes external financial commitments. All such requirements are escalated to `APPROVAL_REQUIRED` or `EXECUTIVE_REVIEW_REQUIRED`.

**Depends on:** A35 capacity governance evidence (`certificationPassed: true`)

---

## Economic State Model

| State | Description |
|---|---|
| `UNASSESSED` | Initial state; evaluation not yet begun |
| `ASSESSING` | Active evaluation in progress |
| `WITHIN_BUDGET` | All dimensions PASS; budget headroom healthy |
| `COST_PRESSURE` | Warning threshold crossed; observation required |
| `BUDGET_PRESSURE` | Approval threshold crossed; optimization required |
| `ECONOMICALLY_INEFFICIENT` | Cost per output or utilization inefficiency detected |
| `OPTIMIZATION_RECOMMENDED` | Safe cost-reduction opportunity identified |
| `APPROVAL_REQUIRED` | Action economically admissible but requires human approval |
| `SPEND_BLOCKED` | Hard stop; no discretionary new spend authorized |
| `EXECUTIVE_REVIEW_REQUIRED` | Unknown price, provider anomaly, or escalated condition |
| `FAILED_CLOSED` | Missing budget, prohibited transaction, or unsupported state |

Unknown or unsupported state resolves to `FAILED_CLOSED`.

---

## Budget Envelope Model

Three budget envelope periods are supported:

| Period | Description |
|---|---|
| `DAILY` | 24-hour rolling budget window |
| `MONTHLY` | Calendar-month budget window |
| `QUARTERLY` | Calendar-quarter budget window |

Each envelope includes:
- `budgetLimit` — absolute authorized ceiling
- `committedAmount` — contractually committed amount
- `observedSpend` — actual spend observed
- `projectedSpend` — forward-looking projection
- `remainingHeadroom` — uncommitted available budget
- `warningThreshold` — utilization fraction triggering `COST_PRESSURE` (default 0.70)
- `hardStopThreshold` — utilization fraction triggering `SPEND_BLOCKED` (default 0.90)
- `approvalThreshold` — utilization fraction requiring `APPROVAL_REQUIRED` (default 0.80)
- `currency` — ISO 4217 currency code
- `evidenceTimestamp` — authoritative timestamp of the envelope data

No implicit unlimited budget. Missing authoritative budget resolves to `FAILED_CLOSED`.

---

## Cost Dimensions

Each of the 17 cost dimensions emits `PASS`, `WARN`, `FAIL`, or `UNKNOWN`:

| Dimension | Critical |
|---|---|
| `currentOperatingCost` | ✓ |
| `projectedOperatingCost` | ✓ |
| `marginalCost` | ✓ |
| `workloadCost` | ✓ |
| `providerCostExposure` | ✓ |
| `storageCostExposure` | |
| `computeCostExposure` | |
| `databaseCostExposure` | |
| `networkEgressCostExposure` | |
| `reservedCapacityCost` | |
| `recoveryReserveCost` | |
| `rollbackReserveCost` | |
| `costPerWorkloadUnit` | |
| `costPerSuccessfulOutput` | |
| `costTrend` | |
| `budgetUtilization` | ✓ |
| `remainingBudgetHeadroom` | ✓ |

`UNKNOWN` on any critical dimension cannot authorize new spend; escalates to `EXECUTIVE_REVIEW_REQUIRED`.

---

## A35 Capacity-Request Integration

A36 consumes A35 capacity recommendations and determines economic admissibility:

| A35 Decision | Budget State | A36 Decision |
|---|---|---|
| `SCALE_UP_RECOMMENDED` | Below approval threshold | `APPROVAL_REQUIRED` |
| `SCALE_UP_RECOMMENDED` | Above approval threshold | `APPROVAL_REQUIRED` |
| `SCALE_UP_RECOMMENDED` | Above hard stop | `SPEND_BLOCKED` |
| `SCALE_UP_RECOMMENDED` | Unknown price | `EXECUTIVE_REVIEW_REQUIRED` |
| `SCALE_DOWN_RECOMMENDED` | Any healthy state | `OPTIMIZE` |
| `DEFER_NONCRITICAL` | Above approval threshold | `DEFER_NONCRITICAL` |
| `MAINTAIN` | Healthy budget | `MAINTAIN` |

No actual procurement is performed.

---

## Protected Reserves

Economic optimization **NEVER** removes or reduces:

- **Rollback reserve** — required for safe deployment rollback
- **Recovery reserve** — required for incident recovery
- **P0 protected capacity** — P0-class critical workload capacity
- **Security capacity** — security and incident-response capacity

Any optimization candidate that would reduce a protected reserve is rejected. The system instead emits `OPTIMIZE` targeting non-protected cost areas, and the reserve protection invariants are enforced.

---

## Economic Anomaly Detection

| Anomaly | Classification |
|---|---|
| `UNEXPECTED_COST_SPIKE` | Critical — blocks discretionary spend |
| `BUDGET_BURN_ACCELERATION` | Critical — blocks discretionary spend |
| `COST_PER_OUTPUT_REGRESSION` | Warning |
| `IDLE_CAPACITY_COST` | Warning |
| `PROVIDER_COST_ANOMALY` | Critical — escalates to `EXECUTIVE_REVIEW_REQUIRED` |
| `EGRESS_COST_ANOMALY` | Warning |
| `STORAGE_GROWTH_ANOMALY` | Warning |
| `UNKNOWN_COST_SOURCE` | Critical — blocks discretionary spend |

Critical unexplained cost anomaly blocks all new discretionary spend until resolved.

---

## Financial Authority Boundary

A36 explicitly prohibits autonomous execution of:

- Payment
- Purchasing / procurement
- Subscription creation or upgrade
- Provider plan change
- Contract acceptance
- Credit-card use
- Invoice approval
- Financial transfer
- Paid resource provisioning

Any such requirement becomes `APPROVAL_REQUIRED` or `EXECUTIVE_REVIEW_REQUIRED`. Detected financial transaction attempts resolve to `FAILED_CLOSED`.

---

## Scenarios (18/18 PASS)

| Scenario | Category | Expected Decision |
|---|---|---|
| `HEALTHY_BUDGET_MAINTAINS` | POSITIVE | `MAINTAIN` |
| `BUDGET_WARNING_OBSERVES` | POSITIVE | `OBSERVE` |
| `PROJECTED_BUDGET_PRESSURE_OPTIMIZES` | POSITIVE | `OPTIMIZE` |
| `HARD_BUDGET_LIMIT_BLOCKS_SPEND` | SAFETY | `SPEND_BLOCKED` |
| `UNKNOWN_PRICE_REQUIRES_REVIEW` | SAFETY | `EXECUTIVE_REVIEW_REQUIRED` |
| `MISSING_BUDGET_FAILS_CLOSED` | SAFETY | `FAILED_CLOSED` |
| `SCALE_UP_WITHIN_BUDGET_REQUIRES_APPROVAL` | POSITIVE | `APPROVAL_REQUIRED` |
| `SCALE_UP_OVER_BUDGET_BLOCKED` | SAFETY | `SPEND_BLOCKED` |
| `SCALE_DOWN_ECONOMICALLY_SUPPORTED` | POSITIVE | `OPTIMIZE` |
| `BACKGROUND_WORKLOAD_DEFERRED_FOR_COST` | POSITIVE | `DEFER_NONCRITICAL` |
| `P0_CAPACITY_NOT_REDUCED_FOR_COST` | SAFETY | `OPTIMIZE` (reserves intact) |
| `ROLLBACK_RESERVE_NOT_REDUCED_FOR_COST` | SAFETY | `OPTIMIZE` (reserves intact) |
| `RECOVERY_RESERVE_NOT_REDUCED_FOR_COST` | SAFETY | `OPTIMIZE` (reserves intact) |
| `SECURITY_CAPACITY_NOT_REDUCED_FOR_COST` | SAFETY | `OPTIMIZE` (reserves intact) |
| `UNEXPECTED_COST_SPIKE_BLOCKS_DISCRETIONARY_SPEND` | ANOMALY | `SPEND_BLOCKED` |
| `PROVIDER_COST_ANOMALY_ESCALATES` | ANOMALY | `EXECUTIVE_REVIEW_REQUIRED` |
| `FINANCIAL_TRANSACTION_ATTEMPT_BLOCKED` | SAFETY | `FAILED_CLOSED` |
| `REPEATED_IDENTICAL_EVALUATION_IS_IDEMPOTENT` | INVARIANT | `MAINTAIN` |

---

## Invariants (29/29 PASS)

1. A35 certified evidence is required
2. No autonomous payment
3. No autonomous procurement
4. No autonomous subscription change
5. No autonomous provider plan change
6. No autonomous financial commitment
7. Missing authoritative budget fails closed
8. Unknown critical price cannot authorize spend
9. Hard budget limit cannot be bypassed
10. P0 capacity remains protected
11. Rollback reserve remains protected
12. Recovery reserve remains protected
13. Security capacity remains protected
14. Executive authority cannot bypass security hard stops
15. Economic optimization cannot weaken A15–A35 controls
16. Every economic decision emits evidence
17. Repeated evaluation is idempotent
18. Certification causes no external financial mutation
19. Healthy budget maintains
20. Budget warning observes
21. Projected budget pressure optimizes
22. Hard budget limit blocks spend
23. Scale-up within budget requires approval
24. Scale-up over budget blocked
25. Scale-down economically supported
26. Background workload deferred for cost
27. Unexpected cost spike blocks discretionary spend
28. Provider cost anomaly escalates
29. Financial transaction attempt blocked

---

## Evidence Location

Immutable evidence is written to:

```
services/kidults-autonomous-intelligence/reports/economic-governance/
```

Filename pattern: `a36-economic-governance-<YYYY-MM-DD>-<hex>.json`

Each evidence record contains:
- `economicRunId`
- Source A35 evidence reference
- Budget envelope evaluation
- Cost dimension observations
- Economic candidates and projections
- Protected reserve status
- Anomaly detections
- Rejected financial actions
- Approval requirements
- Final economic decision
- Invariant results
- Full audit trail with timestamps

---

## CI Workflow

`.github/workflows/kidults-a36-economic-governance.yml`

Triggers on push to A36 script, fixtures, or workflow file, plus `workflow_dispatch`.

Steps:
1. Checkout
2. Install dependencies
3. Verify A36 package scripts exist
4. Typecheck
5. Run `a36:gate`
6. Run `a36:certify`
7. Run upstream A35, A34, A33, A32 certifications
8. Upload evidence artifact (90-day retention)

---

## A15–A35 Controls Preserved

A36 does not modify, weaken, or override any A15–A35 safety controls:

- **A15** policy controls remain enforced
- **A16–A22** execution and publication controls are not touched
- **A23–A31** commercial delivery and gateway controls are preserved
- **A32** production reality gate is not modified
- **A33** deployment/canary/rollback governance is not modified
- **A34** production assurance controls are not modified
- **A35** capacity optimization boundaries are consumed as read-only input

Economic optimization operates exclusively within the approved budget envelope and never overrides safety, freshness, security, or operational hard stops.

---

## Certification: Zero Financial/External Mutation Confirmation

- **No payment** executed during certification
- **No purchasing** performed
- **No subscriptions** created or modified
- **No provider plan** changed
- **No contracts** accepted
- **No external financial commitments** made
- **No paid resources** provisioned
- All evaluation runs in `SIMULATION` mode
- Evidence files are written locally only; no external systems contacted
