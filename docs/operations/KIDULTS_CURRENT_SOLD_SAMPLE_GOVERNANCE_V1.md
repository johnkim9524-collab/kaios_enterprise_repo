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
| Adapter qualification | source pipeline reliability | one-sided exact 99% UCB, major-defect tolerance 1%, critical defects 0; zero-failure floor 459 |
| Private E2E | bounded internal product proof | one-sided exact 99% UCB, major-defect tolerance 0.25%, critical defects 0; zero-failure floor 1,840; at least 2 ultimate owners |
| Beta reliability | release evidence reliability | one-sided exact 99% UCB, major-defect tolerance 0.1%, critical defects 0; zero-failure floor 4,603 |

The zero-failure floor is calculated as:

`ceil(log(alpha) / log(1 - tolerated_defect_rate))`

The former 120 is not sufficient for any statistical reliability claim under this policy. A 119/120 or 120/120 control fixture may exercise plumbing only; it cannot satisfy Private E2E reliability. The thresholds are risk-policy choices informed by enterprise SLO practice, not claims that Google, AWS or Microsoft publish these exact data-defect rates.

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

## Automatic release escalation

The requested claim determines the minimum tier automatically. A control fixture, canary, adapter qualification or Private E2E result can never satisfy a Beta or Production claim. Any Public or Production request is routed to the Production tier, which additionally requires at least 30 natural scheduled runs over 7 days and an SLO/error-budget receipt. Threshold downgrades after observation are rejected.
