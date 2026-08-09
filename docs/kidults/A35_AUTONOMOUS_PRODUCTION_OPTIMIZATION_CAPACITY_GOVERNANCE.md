# A35 — Autonomous Production Optimization & Capacity Governance

**Stage:** A35
**Sprint:** KIDULTS A35
**Depends on:** A34 (Autonomous Production Assurance, `certificationPassed: true`)
**Evidence:** `services/kidults-autonomous-intelligence/reports/capacity-governance/`

---

## Objective

A35 implements a bounded autonomous production optimization and capacity
governance layer. It continuously evaluates production demand, performance,
resource utilization, capacity headroom, workload priority, provider
constraints, and cost signals and produces safe, deterministic optimization
decisions. All decisions are simulation/evidence-only; no external mutation
occurs during certification.

---

## Optimization State Model

| State | Description |
|---|---|
| `UNASSESSED` | Initial state, not yet evaluated |
| `ASSESSING` | Evaluation in progress |
| `OPTIMAL` | All dimensions healthy, maintain current posture |
| `UNDERUTILIZED` | Resources underutilized; observe or recommend scale-down |
| `CAPACITY_PRESSURE` | Approaching limits; scale-up recommended or noncritical deferred |
| `SATURATED` | At or near saturation; throttle noncritical workloads |
| `THROTTLED` | Active throttling applied |
| `REBALANCING` | Workload shift or rebalancing in progress |
| `DEFERRED` | Optimization deferred (e.g. imminent peak window) |
| `EXECUTIVE_REVIEW_REQUIRED` | Requires human executive authorization |
| `FAILED_CLOSED` | Terminal fail-closed state; no optimization permitted |

Unknown or unsupported state transition → `FAILED_CLOSED`.

---

## Capacity Dimensions

A35 evaluates 19 capacity dimensions. Each emits `PASS`, `WARN`, `FAIL`, or `UNKNOWN`.

| Dimension | Description |
|---|---|
| Request volume | Inbound request rate health |
| Throughput | Processing throughput health |
| Queue depth | Work queue depth health |
| Concurrency | Active concurrency health |
| CPU utilization | CPU usage percentage |
| Memory utilization | Memory usage percentage |
| Storage utilization | Storage usage percentage |
| Database pressure | Database load health |
| Provider capacity | External provider availability |
| Provider rate limits | Provider rate limit status |
| Latency (P99) | 99th-percentile latency health |
| Error rate | Error rate percentage health |
| Saturation | Overall saturation health |
| Workload backlog | Pending workload backlog health |
| Freshness obligations | Data freshness deadline compliance |
| Priority workload share | Protected priority workload allocation |
| Capacity headroom | Available headroom above minimum policy |
| Rollback headroom | Rollback capacity reserve status |
| Recovery reserve | Recovery capacity reserve status |

`UNKNOWN` in a critical dimension → `FAILED_CLOSED`.

---

## Demand Forecasting Model

A35 implements bounded deterministic demand projection across three windows:

| Window | Description |
|---|---|
| `CURRENT` | Current observed demand |
| `NEAR_TERM` | Short-horizon projection |
| `PEAK_WINDOW` | Known report-generation / scheduled peak window |

Forecast inputs: recent workload history, scheduled workloads, known
report-generation windows, provider constraints, operational backlog,
freshness deadlines.

Forecast outputs: `expectedDemand`, `confidence`, `capacityRequirement`,
`headroomRequirement`, `riskLevel`.

No speculative uncontrolled ML behavior.

---

## Headroom Policy

| Reserve | Minimum Protected |
|---|---|
| Capacity headroom | 15% |
| Rollback headroom | 10% |
| Recovery reserve | 10% |

If insufficient headroom is available → `CAPACITY_PRESSURE` or
`EXECUTIVE_REVIEW_REQUIRED` depending on severity.

Rollback and recovery reserves are never silently consumed for ordinary
optimization.

---

## Workload Priority Model

| Class | Examples |
|---|---|
| `P0_CRITICAL` | Security, incident response, rollback, production verification |
| `P1_HIGH` | Freshness-critical intelligence, customer-facing critical updates |
| `P2_STANDARD` | Standard autonomous processing |
| `P3_BACKGROUND` | Archive refresh, background enrichment, optional recomputation |

Under pressure: P3 defers first, P2 may throttle when policy permits, P0
retains protected capacity at all times.

---

## Scale-Up Governance

`SCALE_UP_RECOMMENDED` requires:
- Verified capacity pressure
- Demand evidence
- A34 assurance state safe enough to continue
- No critical security block
- No unresolved incident preventing change
- Valid capacity policy
- Known cost class
- Rollback/recovery reserve preserved

`SCALE_UP_RECOMMENDED` does **not** equal automatic procurement. If expansion
requires billing, procurement, or external provider mutation:
`CAPACITY_RESERVATION_REQUIRED` or `EXECUTIVE_REVIEW_REQUIRED`.

---

## Scale-Down Governance

`SCALE_DOWN_RECOMMENDED` requires:
- Sustained underutilization (≥ 3 consecutive samples)
- Sufficient post-reduction headroom (≥ 50%)
- Protected rollback capacity
- Protected recovery reserve
- No imminent demand/peak window
- No unresolved degradation
- No critical backlog

Scale-down is never triggered by a single low-utilization sample.

---

## Cost Governance

A35 evaluates cost signals without performing any financial transaction.

| Output | Description |
|---|---|
| `COST_ACCEPTABLE` | Cost within acceptable bounds |
| `COST_OPTIMIZATION_OPPORTUNITY` | Optimization opportunity identified |
| `COST_PRESSURE` | Elevated cost exposure detected |
| `EXECUTIVE_REVIEW_REQUIRED` | Executive review warranted |

No financial transaction may occur during certification.

---

## Provider Capacity Governance

| State | Response |
|---|---|
| `PROVIDER_HEALTHY` | Continue normally |
| `PROVIDER_DEGRADED` | Defer noncritical, throttle |
| `PROVIDER_RATE_LIMITED` | Shift workload |
| `PROVIDER_UNAVAILABLE` | Fail closed |
| `PROVIDER_UNKNOWN` | Fail closed |

---

## Positive Scenarios

| Scenario | Expected State | Expected Decision |
|---|---|---|
| `HEALTHY_CAPACITY_MAINTAINS` | `OPTIMAL` | `MAINTAIN` |
| `LOW_UTILIZATION_OBSERVES` | `UNDERUTILIZED` | `OBSERVE` |
| `SUSTAINED_UNDERUTILIZATION_RECOMMENDS_SCALE_DOWN` | `UNDERUTILIZED` | `SCALE_DOWN_RECOMMENDED` |
| `CAPACITY_PRESSURE_RECOMMENDS_SCALE_UP` | `CAPACITY_PRESSURE` | `SCALE_UP_RECOMMENDED` |
| `SATURATION_THROTTLES_NONCRITICAL` | `SATURATED` | `THROTTLE` |
| `P0_CAPACITY_IS_PROTECTED` | `CAPACITY_PRESSURE` | `DEFER_NONCRITICAL` |
| `BACKGROUND_WORKLOAD_DEFERS_FIRST` | `CAPACITY_PRESSURE` | `DEFER_NONCRITICAL` |
| `PROVIDER_RATE_LIMIT_SHIFTS_OR_THROTTLES` | `REBALANCING` | `SHIFT_WORKLOAD` |
| `REPEATED_IDENTICAL_EVALUATION_IS_IDEMPOTENT` | `OPTIMAL` | `MAINTAIN` |

---

## Fail-Closed Scenarios

| Scenario | Expected State | Expected Decision |
|---|---|---|
| `PROVIDER_UNAVAILABLE_FAILS_CLOSED_OR_CONTAINS` | `FAILED_CLOSED` | `FAILED_CLOSED` |
| `UNKNOWN_CAPACITY_STATE_FAILS_CLOSED` | `FAILED_CLOSED` | `FAILED_CLOSED` |
| `ROLLBACK_RESERVE_CANNOT_BE_CONSUMED` | `EXECUTIVE_REVIEW_REQUIRED` | `EXECUTIVE_REVIEW_REQUIRED` |
| `RECOVERY_RESERVE_CANNOT_BE_CONSUMED` | `EXECUTIVE_REVIEW_REQUIRED` | `EXECUTIVE_REVIEW_REQUIRED` |
| `IMMINENT_PEAK_PREVENTS_SCALE_DOWN` | `DEFERRED` | `OBSERVE` |
| `ACTIVE_INCIDENT_PREVENTS_UNSAFE_OPTIMIZATION` | `EXECUTIVE_REVIEW_REQUIRED` | `EXECUTIVE_REVIEW_REQUIRED` |
| `SECURITY_BLOCK_PREVENTS_OPTIMIZATION` | `FAILED_CLOSED` | `FAILED_CLOSED` |
| `BILLING_REQUIRED_ESCALATES` | `EXECUTIVE_REVIEW_REQUIRED` | `CAPACITY_RESERVATION_REQUIRED` |

---

## Invariant Count

**24 invariants** proven across all scenarios:

1. A34 assurance evidence is required
2. P0 capacity is protected
3. Rollback reserve is protected
4. Recovery reserve is protected
5. Critical unknown state fails closed
6. Billing mutation is prohibited
7. Procurement mutation is prohibited
8. Provider contact is prohibited during certification
9. External infrastructure mutation is prohibited
10. Scale-down cannot violate minimum headroom
11. Scale-up recommendation cannot bypass executive/billing boundary
12. Security hard stops remain non-overridable
13. Incident hard stops remain preserved
14. Repeated evaluations are idempotent
15. Every optimization decision emits evidence
16. All A15–A34 controls remain preserved
17. Healthy capacity maintains MAINTAIN decision
18. Low utilization observes
19. Sustained underutilization recommends scale-down
20. Capacity pressure recommends scale-up
21. Saturation throttles noncritical
22. Background workload defers first
23. Provider rate limit shifts or throttles
24. Provider unavailable fails closed

---

## Evidence Location

```
services/kidults-autonomous-intelligence/reports/capacity-governance/
  a35-capacity-governance-<date>-<hex>.json
```

Evidence includes: `optimizationRunId`, source A34 evidence reference,
demand observations, demand forecast, capacity dimensions, headroom
calculation, protected reserves, workload priorities, provider capacity
state, cost signals, optimization candidates, rejected candidates, final
decision, executive escalation, invariant results, timestamps, audit trail.

---

## CI Workflow

`.github/workflows/kidults-a35-capacity-governance.yml`

Triggers on push to A35 script, fixtures, package.json, or workflow file.

Steps: checkout → setup Node 20 → install → verify scripts → typecheck →
`a35:gate` → `a35:certify` → upstream A34/A33/A32 certification →
upload evidence artifact (90-day retention).

---

## Safety Boundaries

A35 preserves all A15–A34 controls and enforces the following:

| Boundary | Enforcement |
|---|---|
| No billing mutation | `noBillingMutation: true` in all evidence |
| No procurement mutation | `noProcurementMutation: true` in all evidence |
| No provider contact | Prohibited in `SIMULATION` mode |
| No external infrastructure mutation | `noExternalInfrastructureMutation: true` |
| No rollback reserve consumption | Checked before every optimization decision |
| No recovery reserve consumption | Checked before every optimization decision |
| Security hard stops non-overridable | `securityBlock → FAILED_CLOSED` always |
| Incident hard stops preserved | `activeIncident → EXECUTIVE_REVIEW_REQUIRED` always |
| Unknown critical dimension fails closed | `unknownCriticalDimension → FAILED_CLOSED` |
| Scale-down respects peak windows | `imminentPeakWindow → OBSERVE` always |
| Scale-up respects billing boundary | `billingMutationRequired → CAPACITY_RESERVATION_REQUIRED` |

**Confirmation:** No billing, procurement, provider contact, or external
infrastructure mutation occurs during A35 certification. All decisions
are simulation/evidence only.

**Confirmation:** All A15–A34 controls are preserved. No prior-stage
control is weakened or bypassed by A35.
