# KIDULTS Sprint B33 — Data Integrity & Intelligence Activation

## Objective

Convert the current public enterprise preview from a presentation-driven staging experience into a single-source, traceable and fail-closed intelligence system without changing the approved Portal Base v1 design.

## Baseline protection

- Frozen visual baseline: `baseline/kidults-portal-base-v1`
- Working branch: `feat/kidults-sprint-b33-data-integrity`
- Portal layout, typography, color, spacing and responsive behavior are out of scope unless a data-state defect requires a narrowly scoped correction.
- Hero Instrument Dial v2 is accepted as-is at commit `5bf5b75`; no further dial-value size tuning is part of Sprint B33.
- The corrected mobile KPI containment is accepted and frozen for this sprint.

## Current authoritative staging asset

`apps/kidults-enterprise-staging/public/public-enterprise-preview/intelligence-data.json`

The asset currently contains:

1. Status metadata
   - `status`
   - `label`
   - `updated`
   - `methodologyVersion`
2. Headline intelligence
   - Kidult 100
   - 30-day change
   - confidence
   - coverage
   - source families
   - category count
   - sentiment
   - canon strength
   - market velocity
   - active listings
3. Trend observations
4. Category intelligence rows
5. Signal composition
6. Confidence distribution
7. Source composition
8. Geographic coverage
9. Top movers
10. Canon lifecycle
11. Correlation matrix

## Confirmed integrity observations

- Headline Kidult 100 and the last trend observation both equal `94.8`.
- Confidence distribution totals `100`.
- Signal composition totals `100`.
- Source composition totals `100`.
- Geographic coverage totals `100`.
- Correlation matrix is square and symmetric in the current asset.
- `headline.categories` is `12`, while only eight category records are currently rendered. This must be represented as tracked-versus-displayed, not treated as a data defect.
- The published `change30d` value is `2.1`, while the retained trend series spans 85 days. The 30-day value therefore requires an explicit derivation source or declared precomputed status.

## Delivery sequence

### B33-A1 — Asset inventory and ownership — COMPLETE

- Registered every intelligence field and consuming component.
- Assigned canonical ownership to `intelligence-data.json` for the current staging phase.

### B33-A2 — Unified intelligence data contract — COMPLETE

- Added the machine-readable JSON Schema.
- Defined the allowed status values: `illustrative`, `staging`, `validated`, `production`.
- Defined required fields, numeric ranges and integrity constraints.

### B33-A3 — Integrity validator — COMPLETE

- Validator passes the canonical staging asset with governed warnings only.
- Invalid status, timestamp, totals, duplicate categories, headline/trend mismatches and malformed matrices fail validation.

### B33-A4 — Single-source UI wiring — COMPLETE

- Hero Dial, KPI strip, trend, category cards and all visualizations consume the canonical contract.
- Hard-coded headline values are absent from `index.html`.
- Automated audit: `scripts/kidults/audit-public-intelligence-wiring.mjs`.
- Certified result: `[B33-A4] PASS`.

### B33-A5 — Data-state UI — COMPLETE

- Governed runtime: `b47-data-state-runtime.js`.
- Fail-closed presentation rules: `b47-data-state-runtime.css`.
- Runtime loads before intelligence rendering and validates the canonical response before publication.
- Controlled labels are derived from `illustrative`, `staging`, `validated` and `production` states.
- Invalid assets publish `Data temporarily unavailable` and suppress numeric/chart claims.
- Runtime diagnostics are exposed through `window.KIDULTS_INTELLIGENCE_RUNTIME` and document data attributes.
- Automated audit: `scripts/kidults/audit-data-state-runtime.mjs`.
- Certified result: `[B33-A5] PASS`.

### B33-A6 — Release certification — IMPLEMENTED / MANUAL VIEWPORT SIGN-OFF REQUIRED

- Automated release gate: `scripts/kidults/certify-sprint-b33-release.mjs`.
- RC1 checklist: `docs/kidults/releases/KIDULTS_PORTAL_RC1_CERTIFICATION.md`.
- Automated checks cover required release files, runtime load order, responsive controls, safe-area metadata, canonical status and core data presence.
- Manual certification covers desktop widths `1920 / 1600 / 1440 / 1366 / 1280` and mobile widths `320 / 360 / 375 / 390 / 412 / 430`.
- RC1 cannot be declared until viewport, overflow, accessibility and Lighthouse checks are signed off.

## Final certification command set

```powershell
node scripts/kidults/validate-intelligence-data.mjs
node scripts/kidults/audit-public-intelligence-wiring.mjs
node scripts/kidults/audit-data-state-runtime.mjs
node scripts/kidults/certify-sprint-b33-release.mjs
```

## Definition of done

Sprint B33 is complete only when every displayed intelligence value can be traced to the canonical asset, every derived value has an explicit rule, malformed data fails closed, all automated certification commands pass, the manual RC1 viewport matrix is signed off, and the approved portal baseline remains visually unchanged.
