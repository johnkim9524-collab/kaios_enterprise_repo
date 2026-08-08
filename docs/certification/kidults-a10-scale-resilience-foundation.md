# KIDULTS A10 — Scale & Resilience Foundation

## Objective

A10 establishes the first repeatable scale-certification layer above the A9 certified autonomous runtime. It is intentionally provider-independent and uses deterministic synthetic observations to find architectural limits before paid provider onboarding.

## Operating principle

Current-scale-appropriate implementation, next-scale-ready architecture.

A10 does not attempt to prove hyperscale production readiness. It proves that the KIDULTS evidence contract, validation rules, deduplication semantics, failure accounting, and measurement discipline can be exercised at materially larger volumes without touching production data.

## Profiles

| Profile | Records | Purpose |
| --- | ---: | --- |
| smoke | 10,000 | rapid regression and CI feedback |
| baseline | 100,000 | A10 certification target |
| million | 1,000,000 | opt-in local/CI capacity probe; becomes a formal gate in A11 |

## Synthetic workload

The generator produces multiple source families and categories and deterministically mixes normal observations with duplicate replay, malformed entities, stale observations, corrupt metric values, simulated rate limiting, and simulated provider failures.

Synthetic evidence is always marked non-commercial and non-production. No A10 path is allowed to promote synthetic data.

## Required integrity gates

- Data loss = 0
- Duplicate leakage = 0
- Untracked failures = 0
- Unauthorized publication = 0
- Synthetic data production eligibility = false

## Measurements

Each run emits a JSON certification artifact under `reports/scale/` containing generated, accepted, duplicate, rejected, rate-limited and provider-failure counts; records/second; batch P50/P95/P99/max latency; process heap/RSS; and all gate outcomes.

## Operator commands

From `services/kidults-autonomous-intelligence`:

- `npm run a10:certify` — typecheck + 10K smoke + 100K baseline
- `npm run scale:1m` — opt-in one-million-record probe

## What A10 proves

A10 proves the scale-test harness, deterministic accounting, synthetic workload model, basic validation/quality-gate model, deduplication semantics, and repeatable benchmark reporting.

## What A10 does not yet prove

A10 does not certify remote D1 write throughput, R2 throughput, queue backpressure, distributed worker concurrency, provider-specific API limits, true network latency, production cost per million records, or billion-record analytical performance. Those become explicit later-stage gates after the Provider/Data Volume Model determines the required capacity envelope.

## Exit criteria

A10 may close when both GitHub CI and an operator run of `npm run a10:certify` pass, report artifacts are retained, all integrity gates are true, and no A9 regression is introduced.

## Next gates

1. A11 — 1M certification with persistence-aware measurement.
2. A12 — 10M sustained-load certification and storage-path separation.
3. A13 — 50M/100M-equivalent architecture simulation, backpressure and partition strategy.
4. A14 — failure/recovery, replay and cost certification.
5. A15 — provider-readiness gate driven by self-collected data productization and exact data-gap requirements.
