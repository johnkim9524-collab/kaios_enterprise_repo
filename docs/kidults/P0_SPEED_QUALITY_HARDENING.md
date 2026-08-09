# KIDULTS P0 — Speed × Quality Hardening

## Objective

Move the A40 GA baseline from evidence-oriented certification toward a production-grade engineering baseline without weakening any A15–A40 governance boundary.

The governing principle is **Speed × Quality**: reduce cycle time and operational friction while increasing determinism, maintainability, observability, and defect detection.

## Immediate P0 Tracks

### P0-1 — Real Data Truth Layer

Required proof before commercial production activation:

- authoritative golden dataset
- 100% provenance for critical facts
- deterministic entity resolution
- duplicate contamination below the approved threshold
- stale-data rejection
- provider identity and rights metadata
- traceable comparables and valuation inputs
- provider failover evidence
- repeatable truth-set validation

No synthetic PASS evidence may substitute for missing real-data proof.

### P0-2 — Engineering Hardening

Immediate controls:

- continuous typecheck
- runtime smoke validation
- repository-wide engineering quality audit
- machine-readable debt report
- oversized-file detection
- empty-catch detection
- explicit-any visibility
- runtime raw-console visibility
- TODO/FIXME/HACK visibility
- dependency-lockfile visibility
- lint/test/coverage capability visibility

The audit reports findings without weakening existing A15–A40 certification.

## Current Known Gaps

The current service package has strong stage certification coverage, but the post-GA hardening program must explicitly address:

- reproducible dependency locking
- generalized lint/test/coverage gates
- certification-framework complexity
- live observability proof
- live provider and real-data proof
- controlled unattended-operation proof

## Quality Gate

The workflow `.github/workflows/kidults-p0-speed-quality.yml` runs on relevant pull requests and performs:

1. dependency installation
2. TypeScript typecheck
3. runtime smoke validation
4. engineering quality audit
5. audit artifact retention

The first audit is intentionally diagnostic. P0 findings fail the gate; P1/P2 findings remain visible so they can be burned down rapidly without masking the baseline.

## Non-Negotiable Boundaries

This hardening track must not:

- weaken fail-closed behavior
- broaden autonomous authority
- bypass security, privacy, legal, financial, or executive controls
- manufacture real-data evidence
- perform unauthorized external mutation
- change A40 baseline semantics merely to make a quality gate pass

## Exit Criteria

P0 engineering hardening is complete only when:

- critical engineering findings are closed
- deterministic dependency installation is established
- code-quality gates are explicit and automated
- runtime smoke remains green
- A40 remains certifiable
- real-data truth validation has an authoritative dataset and provider evidence
- controlled live operations prove recovery, freshness, and failover behavior
