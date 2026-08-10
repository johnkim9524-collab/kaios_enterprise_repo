# KIDULT 100 — Immediate Live-Data POC Operating Specification

Status: CANONICAL POC CONTROL
Date: 2026-08-10

## 1. Objective

Start operating KIDULTS against real external data now, without waiting for commercial provider contracts, while preserving the canonical rule: VALUE BEFORE DATA.

This POC is not a generic crawler. It exists to prove that the platform can repeatedly acquire decision-relevant observations, resolve them to collectible objects, preserve rights/provenance, generate evidence-backed WHY explanations, and feed a stable Kidult 100 product surface.

## 2. POC success definition

The POC is successful only if it proves all of the following:

1. Candidate universe can expand toward >=300 objects across the current 8 Core Verticals.
2. Every accepted observation maps to at least one KIDULTS intelligence primitive.
3. Every accepted observation has source, timestamp, rights class and payload fingerprint.
4. The same object can accumulate longitudinal observations without duplicate contamination.
5. Category-specific signals can coexist with a universal common intelligence contract.
6. WHY output contains supporting evidence, counter-evidence when available, confidence, SO WHAT and WHAT NEXT.
7. The portal consumes stable data contracts; adding a new signal must not require redesigning the page.

## 3. Current POC scope

### 3.1 Core Verticals

1. Toys & Models
2. Watches & Jewelry
3. Automobiles & Mobility
4. Fashion & Accessories
5. Design & Furniture
6. Technology & Cameras
7. Gaming / Music / Screen Culture
8. Cards / Comics / Memorabilia

These are Core Verticals, not permanent closed categories. New verticals enter through the category-admission contract.

### 3.2 Intelligence primitives

Only collect data that materially improves one or more of:

- Identity / Provenance
- Scarcity / Supply
- Transaction / Price / Comparable
- Liquidity
- Demand / Attention
- Canon / Institutional / Cultural
- Risk / Confidence

If an observation improves none of these, DO NOT COLLECT.

## 4. POC source channels

POC activation requires an explicit rights basis. Current immediately usable channel types are intentionally narrow:

| Source | Source class | Rights state | POC role |
|---|---|---|---|
| The Metropolitan Museum of Art Collection API | Institution / Museum / Archive | Open Access / public collection metadata | Canon, institutional recognition, identity, provenance |
| Art Institute of Chicago API | Institution / Museum / Archive | Most artwork API data CC0; description excluded from POC | Canon, institutional recognition, identity, provenance |
| Wikidata structured data | Reference / Research / Public Data | CC0 structured data | Cross-source entity identity, creator, brand, model, inception/date, classification |
| Smithsonian Open Access | Institution / Museum / Archive | CC0-designated open-access records; API key may be required for API access | Future POC expansion for design/technology/cultural objects |

No manufacturer, retailer, auction, marketplace, community, social, editorial or news channel is activated for automated collection merely because it is publicly visible. Each channel must pass the Source Rights Gate before collection.

## 5. Source Rights Gate

Before enabling any source:

VALUE -> RIGHTS -> PROVENANCE -> COMPARABILITY -> ECONOMICS -> ACTIVATE

Required registry fields:

- sourceClass
- verticalCoverage
- intelligenceContribution
- allowedMethod
- allowedFields
- licenseOrTermsBasis
- commercialUseStatus
- derivedDataStatus
- retentionStatus
- refreshPolicy
- rateLimitPolicy
- provenanceRequirement
- fallbackSource
- legalReviewState

Unknown rights => HOLD.

## 6. Candidate Universe POC

### Hard target

- 300+ candidate registry
- 100 published Kidult 100 constituents only after factor eligibility
- operating reserve target: 400-500 candidates

### POC seed behavior

The live POC may begin with fewer than 300 fully qualified objects, but it must continuously build toward the 300+ registry. It must never mislabel an incomplete POC universe as the final Kidult 100.

Candidate lifecycle:

DISCOVERED -> IDENTIFIED -> RIGHTS_PROVENANCED -> VERTICAL_QUALIFIED -> SIGNAL_ELIGIBLE -> WHY_ELIGIBLE -> INDEX_ELIGIBLE -> KIDULT100 / WATCHLIST / HOLD

## 7. Common Intelligence Contract

Every index-eligible object must be able to answer:

- WHAT is it?
- WHY does it matter?
- VALUE: what is the evidence-supported value state?
- SCARCITY: what makes supply constrained or abundant?
- LIQUIDITY: can it actually transact?
- MOMENTUM: what is changing?
- CANON: does cultural/institutional significance persist?
- RISK: what could make the interpretation wrong?
- WHAT NEXT: which observable events could change the thesis?

## 8. Vertical Intelligence DNA

The POC does not force identical fields across categories.

Examples:

- Automobiles: production, specification, originality, mileage, provenance, condition, auction history, concours/institutional relevance.
- Watches: reference, variation, dial/movement/case, serial range, completeness, service/polish state, auction/dealer comparables.
- Toys & Models: edition/run, sealed/completeness state, grading/population, franchise persistence, reissue risk, secondary-market depth.
- Fashion: designer/creative-director era, season/runway significance, production, condition, cultural adoption, archive/institution presence.
- Design & Furniture: designer, manufacturer, edition, production period, provenance, condition, institutional collection/exhibition.
- Technology & Cameras: generation, technical significance, production/serial, originality, completeness, working condition, design canon.
- Gaming / Music / Screen: edition/release state, creator/franchise canon, format/region/variant, condition/grading, historical significance.
- Cards / Comics / Memorabilia: issue/set/print, grade population, variant, player/character/event canon, provenance, transaction depth.

## 9. WHY evidence contract

Any material rank/score movement must emit:

WHAT_CHANGED
WHY
SUPPORTING_EVIDENCE[]
COUNTER_EVIDENCE[]
CONFIDENCE
SO_WHAT
WHAT_NEXT
INVALIDATION_CONDITION

WHY is mandatory for material decisions.

## 10. POC data-quality gates

- critical provenance coverage = 100%
- rights classification coverage = 100%
- entity resolution target >= 99.5%
- duplicate contamination < 0.5%
- asking vs sold classification = 100% when market data is introduced
- time/currency normalization = 100% for scored market observations
- unsupported causal claims = 0
- critical signal with no evidence = 0

## 11. Portal data contracts

The portal is a stable collector/institution playground. Its information architecture must not be redesigned whenever a new source or intelligence product appears.

Stable portal modules consume contracts:

- `globalRadar`
- `kidult100`
- `whyNow`
- `emergingIcons`
- `marketPulse`
- `canonWatch`
- `objectIntelligence`
- `comparables`
- `collectionLab`
- `institutionDesk`
- `researchLibrary`
- `methodologyConfidence`

New data populates or enriches these contracts. New UI modules require a product-level decision, not merely the arrival of a new field.

## 12. POC operating cadence

- open-data live collection: every 6 hours after workflow is on default branch
- candidate registry refresh: daily
- entity reconciliation: daily / on new evidence
- WHY recomputation: when material evidence changes
- Kidult 100 candidate scoring: daily POC, publish cadence governed separately
- source-rights registry review: on source activation or terms change

## 13. Claims discipline

POC evidence may prove live external collection, normalization, provenance, entity linking and selected canon/identity signals. It does not prove commercial transaction intelligence, provider SLA, production autonomy or market forecasting until those specific data and operations are independently evidenced.
