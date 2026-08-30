# KIDULTS Current-SOLD Sample Governance

**Effective:** 2026-08-30  
**Owner:** Program Owner / KPMO  
**Canonical contract:** `coordination/kidults/source-intelligence/current-sold-sample-governance-v1.json`  
**Alignment contract:** `coordination/kidults/governance/current-sold-sample-governance-alignment-v1.json`

## Decision

The platform no longer treats `120 current-SOLD events` as a universal launch requirement. Rights and schema are evaluated for every event. Sample size is calculated from the claim, tolerated defect rate, confidence and pre-registered stopping rule.

## Governed tiers

| Tier | Claim | Rule |
|---|---|---|
| Canary | schema/boundary smoke | 5 cases; no statistical or market claim |
| Adapter qualification | source pipeline reliability | one-sided exact 95% UCB, defect tolerance 5%; zero-failure floor 59 |
| Private E2E | bounded internal product proof | one-sided exact 95% UCB, critical-defect tolerance 2.5%; zero-failure floor 119; at least 2 ultimate owners for multi-source proof |
| Beta reliability | release evidence reliability | one-sided exact 95% UCB, tolerance 1%; zero-failure floor 299 |

The zero-failure floor is calculated as:

`ceil(log(alpha) / log(1 - tolerated_defect_rate))`

The former 120 is therefore only an operational rounding of the Private E2E tier; it is not a legal, market-representativeness or Production threshold.

## Stakeholder alignment

- KPMO owns policy versioning and cross-track digest binding.
- Track A pre-registers the sampling frame and produces evidence.
- Track B independently recomputes confidence bounds and rejects post-hoc changes.
- Track C renders the approved claim ceiling and HOLD state.
- Track D binds the dynamic cohort to PostgreSQL/PITR and natural-run SLOs.
- Track E consumes uncertainty-aware read-only metrics.
- Track Z negotiates adaptive volume bands and purpose-specific rights, never “exactly 120”.
- ASI applies rights census first, then sample and coverage policy.

No sample count can authorize Public, Production, G5, provider contact, spend, credentials or legal commitment.
