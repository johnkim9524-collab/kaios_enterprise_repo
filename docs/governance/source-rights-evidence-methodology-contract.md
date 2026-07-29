# Source, Rights, Evidence, and Methodology Contract

## Purpose

Establish mandatory governance controls for every Kidults and Artfund intelligence asset before it enters production products.

## Source Registry

### Source Types

- official
- marketplace
- auction
- institutional
- gallery
- museum
- media
- community
- search-interest
- contributed
- partner

### Source Tiers

- `T1`: primary or official source
- `T2`: verified institutional or market source
- `T3`: reputable secondary source
- `T4`: community or unverified discovery source

T4 sources may generate discovery signals but must not independently support premium prices, valuations, index inclusion, or institutional conclusions.

## Rights Classification

Each source must answer six independent permissions:

1. collect
2. store
3. transform
4. display
5. redistribute
6. sell

Allowed values:

- `allowed`
- `restricted`
- `prohibited`
- `unknown`

`unknown` is treated as prohibited for external display, redistribution, and sale.

Required rights fields:

- `rights_status`
- `license_type`
- `terms_url`
- `attribution_required`
- `retention_limit_days`
- `display_permission`
- `redistribution_permission`
- `commercial_use_permission`
- `reviewed_by`
- `reviewed_at`
- `next_review_at`

## Evidence Ledger

Evidence must be immutable after publication. Corrections create a superseding record.

Required controls:

- content hash
- source record link
- extraction method
- parser or model version
- evidence type
- claim scope
- effective date
- confidence grade
- human review status
- supersedes link
- dispute status

## Confidence Grades

### A — Verified

Primary evidence, direct transaction, official filing, official catalogue, or independently reconciled primary records.

### B — High Confidence

Multiple reputable sources agree and no material contradiction exists.

### C — Moderate Confidence

One reputable source or several partially consistent secondary sources.

### D — Low Confidence

Discovery-level evidence, incomplete identity, weak transaction detail, or material uncertainty.

### U — Unverified

Not eligible for premium products, index calculation, or external factual claims.

## Methodology Registry

Every score, index, ranking, fair-value range, liquidity grade, and automated narrative rule must register:

- `methodology_id`
- `vertical`
- `name`
- `semantic_version`
- `status`
- `effective_from`
- `effective_to`
- `input_contract`
- `calculation_contract`
- `exclusion_rules`
- `outlier_policy`
- `missing_data_policy`
- `confidence_policy`
- `rebalancing_policy`
- `restatement_policy`
- `approval_record`
- `change_log`

Allowed statuses:

- draft
- research
- beta
- approved
- retired

## Product Eligibility Rules

### Public Preview

Minimum confidence: C, with explicit label.

### Collector or Investor Premium

Minimum confidence: B for price, fair value, liquidity, and actionable alerts.

### Enterprise or Institutional Product

Minimum confidence: B, with methodology and source coverage displayed.

### Reference Index

- methodology status must be beta or approved
- constituent evidence must meet the index-specific threshold
- deterministic recalculation must pass
- input snapshot hash must be recorded
- restatement policy must be published

## Dispute and Correction

1. A disputed fact is not deleted.
2. The fact receives `disputed` status.
3. A replacement evidence record may supersede it.
4. Affected scores, indices, reports, and portals are recalculated.
5. A restatement record lists affected products and periods.

## Enforcement Gates

A source cannot enter production unless:

- Source Registry is complete.
- Rights classification is complete.
- Required attribution is supported.
- Evidence retention is configured.
- Product eligibility is calculated.
- Monitoring and review dates are assigned.

A methodology cannot publish unless:

- version is fixed
- tests reproduce expected values
- change log exists
- confidence and missing-data rules exist
- owner and approval record exist

## Acceptance Criteria

- 100% of production sources have completed rights classification.
- 95% or more of premium product outputs have evidence traceability.
- No U-grade evidence appears in paid products.
- Every customer-visible score and index exposes its methodology version.
- Corrections preserve an auditable history.