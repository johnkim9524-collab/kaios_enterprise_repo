# KIDULTS Source Channel and Data Strategy

Status: CANONICAL
Date: 2026-08-10

## 1. Principle

KIDULTS does not collect the world. It collects the signals that explain what matters, why it matters, and what may matter next.

Every source must pass:

VALUE -> RIGHTS -> PROVENANCE -> COMPARABILITY -> ECONOMICS -> ACTIVATE

Unknown rights => HOLD.

## 2. Source taxonomy — 13 classes

S1. Manufacturer / Brand
- launch date, MSRP, SKU/reference, production status, edition/run, specifications, official archive

S2. Designer / Creator / IP Owner
- creator attribution, collaboration, design intent, provenance, franchise/IP significance

S3. Primary Retail
- official retail price, allocation, availability, stock state, sell-out timing

S4. Secondary Marketplace
- asking prices, inventory, listings, velocity, spread, condition mix

S5. Auction House
- estimates, hammer price, buyer premium when available, lot frequency, sell-through, provenance, condition

S6. Dealer / Specialist Broker
- dealer inventory, offer levels, condition, specialist commentary, market depth

S7. Authentication / Grading / Registry
- grade, authenticity, population reports, serial/chassis/reference validation, registry data

S8. Institution / Museum / Archive
- acquisition, exhibition, institutional collection presence, catalog references, archival recognition

S9. Community / Collector Network
- ownership discussions, desire, collector narratives, expert debate, emerging interest

S10. Search / Social / Attention
- search interest, attention velocity, creator ecosystem, engagement and audience change

S11. News / Magazine / Editorial
- editorial attention, cultural narrative, historical context, emerging canon signals

S12. Reference / Research / Public Data
- structured identity, history, macro context, open data, government/library/reference datasets

S13. KIDULTS Derived Intelligence
- Entity Graph, Comparable Graph, WHY Graph, signal histories, factor histories, decision history, Future Canon Probability

## 3. Evidence tiers

Tier A — Authoritative Truth
Manufacturer, registry, museum, official archive, government/public record.

Tier B — Transaction Truth
Verified auctions, transactions, authenticated market records.

Tier C — Market State
Retail, dealer and marketplace inventory/asking observations.

Tier D — Demand & Culture
Community, search, social, news, editorial and cultural signals.

No tier substitutes for another. A community signal is not transaction truth. An asking price is not a sold price. A manufacturer claim is not secondary-market liquidity.

## 4. Seven intelligence primitives

Only collect observations that materially improve one or more of:

1. Identity / Provenance
2. Scarcity / Supply
3. Transaction / Price / Comparable
4. Liquidity
5. Demand / Attention
6. Canon / Institutional / Cultural
7. Risk / Confidence

If none improve, DO NOT COLLECT.

## 5. Source Class x Vertical

Source relevance is vertical-specific. Every registered source must declare:

- sourceClass
- verticalCoverage
- geography
- intelligenceContribution
- authorityLevel
- allowedMethod
- allowedFields
- licenseOrTermsBasis
- commercialUseStatus
- derivedDataStatus
- retentionStatus
- refreshPolicy
- rateLimitPolicy
- historicalDepth
- reliabilityScore
- provenanceRequirement
- fallbackSource
- legalReviewState

An auction source suitable for cars may be irrelevant for trading cards. A grading registry may be critical for cards but not for furniture. Source governance therefore operates as a matrix, not a flat list.

## 6. Data quantity strategy

The primary unit is a Decision-Grade Observation, not a raw row.

Initial 300-object universe target:
- 5-20 decision-grade observations per object per month
- roughly 1,500-6,000 high-value observations per month
- roughly 18,000-72,000 per year before high-frequency market feeds

As transaction/listing/attention feeds mature:
- 50K-500K observations/year early market scale
- 500K-5M observations/year at broader operational scale

The goal is not volume maximization. The goal is longitudinal explanatory density.

## 7. Data quality gates

Targets for index-grade data:

- critical provenance coverage = 100%
- rights classification coverage = 100%
- entity resolution >= 99.5%
- duplicate contamination < 0.5%
- stale/invalid critical rejection = 100%
- asking vs sold classification = 100% where applicable
- currency normalization = 100% for scored price observations
- time normalization = 100%
- material WHY evidence coverage = 100%
- unsupported critical causal claims = 0

## 8. Platform processing contract

INGEST
-> RIGHTS PREFLIGHT
-> NORMALIZE
-> ENTITY RESOLUTION
-> DEDUP
-> PROVENANCE
-> QUALITY
-> TIME SERIES
-> SIGNAL
-> COMPARABLE GRAPH
-> WHY GRAPH
-> FACTOR SCORE
-> KIDULT 100
-> MONITOR
-> RECOVERY

## 9. Moat creation

The durable asset is the accumulated relationship between:

Signal -> Cause Candidate -> Supporting Evidence -> Counter Evidence -> Outcome

Over time KIDULTS should know not only that an object moved, but which signals preceded the move, which explanations failed, and which causal patterns persisted across verticals.
