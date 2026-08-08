# A20 — Intelligence Product Readiness & Monetization Gate

## Objective

Convert the A19 productization gap matrix into a deterministic certification gate for product readiness, monetization eligibility, publication eligibility, and dependency propagation.

## Canonical inputs

- A15 global autonomous policy foundation
- A16 autonomous execution control plane
- A18 autonomous acquisition scale evidence
- A19 product universe and data-strategy classification

A20 consumes the A19 SELF-FIRST, HYBRID, and PROVIDER-REQUIRED classifications as immutable evidence. It does not relabel products outside that canonical matrix.

## Readiness model

Each of the 18 intelligence products receives normalized scores for:

- dataCoverage
- provenanceCoverage
- freshness
- quality
- repeatability
- autonomousDerivation
- dependencyRisk
- publicationReadiness
- monetizationReadiness

Each product also carries deterministic classes for:

- readiness: `INTERNAL_READY`, `HYBRID_READY`, `DEPENDENCY_BLOCKED`, `QUALITY_BLOCKED`, `POLICY_BLOCKED`
- monetization: `MONETIZABLE_INTERNAL`, `MONETIZABLE_AFTER_PROVIDER`, `RESEARCH_ONLY`, `BLOCKED`
- publication: `INTERNAL_ONLY`, `CANARY_ELIGIBLE`, `PRODUCTION_BLOCKED`

No product is marked unrestricted production-ready in A20.

## Commercial architecture

- `CORE_DATA`: entity-master
- `SIGNAL`: canon-strength, market-momentum, collector-sentiment, scarcity-signal, culture-velocity, liquidity-signal
- `INDEX`: price-index, kidult-100
- `ANALYTICS`: comparables, availability-monitor, trend-radar, category-outlook
- `PREMIUM_INTELLIGENCE`: auction-intelligence, provenance-confidence, asset-history, condition-risk, auth-confidence

## Dependency propagation

A20 emits a dependency graph for:

- canonical product-to-dimension mapping
- internal-only, hybrid, and provider dependencies
- blocked upstream dependencies
- derived downstream products

Provider-required dependencies propagate downstream. A dependent product cannot become monetization-ready while a mandatory upstream product or provider dimension is blocked.

## Channel eligibility

The gate calculates future channel eligibility for:

- `PUBLIC_EDITORIAL`
- `PRO_SUBSCRIPTION`
- `ENTERPRISE_API`
- `DATA_LICENSE`
- `CUSTOM_INTELLIGENCE`

A20 determines eligibility only. It does not mutate billing systems, publish externally, contact providers, or embed provider credentials.

## Pass criteria

Certification passes only when every gate is true, including:

- A19 evidence consumed
- all 18 products classified
- readiness scores complete
- dependency propagation operational
- provider dependencies preserved
- monetization eligibility calculated
- publication eligibility calculated
- provenance, quality, and freshness gates enforced
- production publication blocked
- no provider contact
- no provider credentials
- no billing mutation
- no external publication
- fail-closed behavior verified
- evidence produced

## Fail-closed cases

A20 proves at least these negative cases:

1. missing provenance blocks monetization
2. sub-threshold quality blocks monetization
3. stale products cannot become publication eligible
4. provider-required products stay blocked without provider evidence
5. blocked upstream dependencies propagate
6. A19 data strategy cannot be bypassed
7. production publication remains blocked
8. missing evidence fails certification
9. unknown products fail closed

## Evidence

Machine-readable evidence is written to:

`services/kidults-autonomous-intelligence/reports/product-readiness/a20-product-readiness-<timestamp>.json`
