# KIDULTS Sprint B33 — Data Integrity & Intelligence Activation

## Objective

Convert the current public enterprise preview from a presentation-driven staging experience into a single-source, traceable and fail-closed intelligence system without changing the approved Portal Base v1 design.

## Baseline protection

- Frozen visual baseline: `baseline/kidults-portal-base-v1`
- Working branch: `feat/kidults-sprint-b33-data-integrity`
- Portal layout, typography, color, spacing and responsive behavior are out of scope unless a data-state defect requires a narrowly scoped correction.

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

### B33-A1 — Asset inventory and ownership

- Register every intelligence field and consuming component.
- Assign canonical ownership to `intelligence-data.json` for the current staging phase.
- Record whether each field is raw, derived, precomputed or presentation metadata.

### B33-A2 — Unified intelligence data contract

- Add a machine-readable JSON Schema.
- Define allowed status values:
  - `illustrative`
  - `staging`
  - `validated`
  - `production`
- Define numeric ranges, required fields, uniqueness rules and matrix constraints.

### B33-A3 — Integrity validator

The validator must fail on:

- missing required fields
- invalid timestamp
- unsupported status
- duplicate category names
- percentage collections not totaling 100
- headline/trend current-value mismatch
- malformed or asymmetric correlation matrix
- score, confidence, liquidity or percentage values outside allowed ranges
- non-finite numbers

Warnings must be emitted for:

- tracked category count exceeding displayed category rows
- precomputed 30-day change without a derivation window in the retained trend data
- staging or illustrative labels exposed in a production build

### B33-A4 — Single-source UI wiring

- Confirm Hero Dial, KPI strip, trend, category cards and all visualizations consume the same contract.
- Remove duplicated hard-coded numeric fallbacks where safe.
- Preserve fail-closed behavior when the asset is unavailable or invalid.

### B33-A5 — Data-state UI

- Render a controlled state label from the contract.
- Prevent `validated` or `production` claims unless validation succeeds.
- Replace invalid values with a governed unavailable state instead of fabricated defaults.

### B33-A6 — Certification

Required gates:

- schema validation: 100%
- integrity rules: 100%
- deterministic validator output
- desktop regression: pass
- mobile 320 / 375 / 390 / 430: pass
- no Portal Base v1 visual drift

## Definition of done

Sprint B33 is complete only when every displayed intelligence value can be traced to the canonical asset, every derived value has an explicit rule, malformed data fails closed, and the approved portal baseline remains visually unchanged.
