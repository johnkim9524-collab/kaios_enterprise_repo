# Kidults Initial 20-Source Acquisition Plan

## Objective

Expand Kidults from one broad discovery feed to a balanced, rights-classified, evidence-preserving source portfolio suitable for global-standard collectibles intelligence.

## Source Portfolio Target

### Tier A — Official and Primary Sources: 8

- major manufacturer official news or product feeds
- official brand release calendars
- official licensing announcements
- official investor or corporate releases where relevant

Target qualities:

- primary evidence
- high identity confidence
- low interpretation risk
- explicit source ownership

### Tier B — Market and Transaction Sources: 5

- approved auction-result sources
- approved completed-sale marketplaces
- trusted dealer or pricing feeds
- certification or grading population sources

Target qualities:

- completed transaction evidence preferred
- stable identifiers
- timestamp and currency available
- rights classification completed before commercial display

### Tier C — Industry and Specialist Media: 4

- specialist collectibles publications
- toy and hobby industry media
- licensing industry news
- auction and secondary-market reporting

Target qualities:

- consistent editorial standards
- named publisher
- article timestamp
- evidence retained as citation metadata

### Tier D — Attention and Community Signals: 3

- approved search-interest source
- approved public community trend source
- approved event or convention source

Target qualities:

- used as signals, not standalone valuation evidence
- aggregation and privacy rules documented
- manipulation risk scored

## Acquisition Workflow

1. candidate discovery
2. source identity verification
3. terms and rights review
4. source tier assignment
5. collection-method approval
6. schema mapping
7. fixture test
8. staging collection
9. quality baseline
10. production promotion decision

## Mandatory Registry Fields

- source_id
- source_name
- owner
- source_tier
- canonical_url
- collection_method
- expected_frequency
- timeout_seconds
- retry_policy
- collect_allowed
- store_allowed
- transform_allowed
- display_allowed
- redistribute_allowed
- sell_allowed
- attribution_required
- retention_rule
- geographic_restrictions
- source_quality_score
- last_reviewed_at

## Promotion Gates

A source may enter Production only when:

- identity is verified
- rights classification is complete
- collection is technically stable
- data maps to canonical entities or evidence
- duplicate rate is measured
- source quality score meets threshold
- secrets are not required in logs
- failure quarantine is supported

## First Six-Week Targets

- Week 1: identify and classify 20 candidates
- Week 2: implement 5 adapters in staging
- Week 3: reach 20 active or approved sources through reusable adapter classes
- Week 4: expose source coverage and confidence in portals
- Week 5: autonomous source-quality and anomaly controls
- Week 6: promote approved sources without weakening the 30-day stability baseline

## Quality KPIs

- source success rate >= 95%
- rights classification = 100%
- provenance coverage >= 95%
- duplicate rate measured for every source
- critical source failure isolation <= 15 minutes
- commercially prohibited data published = 0

## Important Boundary

Source count is not a success metric by itself. A smaller set of stable, lawful, high-confidence sources is more valuable than a larger set of noisy or commercially unusable feeds.
