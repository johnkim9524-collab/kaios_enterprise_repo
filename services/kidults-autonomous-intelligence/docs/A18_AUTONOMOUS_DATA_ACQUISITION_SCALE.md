# A18 — Autonomous Data Acquisition Scale

## Objective

Prove that the KIDULTS autonomous intelligence runtime can ingest, normalize, deduplicate, classify, enrich, quality-score, analyze, and evidence high-volume data before paid-provider onboarding.

## Strategic position

A18 deliberately follows the two-track strategy:

1. Scale self-collectable/public/first-party data first.
2. Use observed coverage, quality, freshness, and product gaps to define exactly what external providers must supply.

This prevents premature provider dependence and turns provider outreach into a precise procurement exercise.

## Canonical pipeline

`source_discovery → policy_check → fetch → normalize → deduplicate → classify → enrich → quality_score → persist → analyze → evidence → publish_eligibility`

## Allowed source classes

- public web where collection is permitted
- public feeds
- public APIs
- first-party data
- provider-shaped synthetic data for certification

A18 does not embed provider credentials and does not enable unrestricted production publication or external mutation.

## Scale ladder

- smoke: 10K records
- baseline: 100K records
- million: 1M records
- extended: 5M records

CI certifies 100K and 1M on every relevant pull request. The 5M profile is available for explicit local or scheduled scale certification.

## Quality and safety gates

Every acquisition path must be non-interactive, fail-closed, provenance-aware, bounded-memory, batch-oriented, evidence-producing, and isolated from source-level failures. Publication eligibility remains disabled until later product-quality gates are certified.

## Exit criteria

A18 is complete when:

- typecheck passes;
- 100K and 1M profiles pass;
- dedupe leakage is zero under the deterministic certification workload;
- invalid-rate bounds hold;
- source-failure isolation and retry accounting hold;
- analysis coverage equals accepted records;
- reports are emitted as evidence;
- finalize returns the repository to synchronized `main`.

## Next stage

A19 will convert A18 evidence into a Data Coverage & Productization Gap Matrix: what can be collected autonomously, what can be derived into products, and what must be procured from external providers.
