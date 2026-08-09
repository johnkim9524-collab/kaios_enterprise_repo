# KIDULT 100 Operational Universe v0.1

## Purpose
Kidult 100 must be operated against a real, rights-aware external-data universe before licensed commercial market providers are available. This document defines the minimum operational universe, legal source channels, field contract, and evidence rules for live platform validation.

## Operating rule
- Minimum constituent pool: **120 real external objects** so the index can select and rank at least 100 while preserving exclusions, duplicates, and quality holds.
- Minimum category breadth: **6 categories × 20 records** target before ranking.
- This v0.1 universe is an **operational validation universe**, not the final commercial Kidult 100 benchmark constituent list.
- No source may be collected unless its access and reuse conditions are recorded.
- Public/open-access evidence must remain distinct from licensed market-price, transaction, liquidity, and commercial redistribution rights.

## Initial category universe
1. Toys & Models
2. Watches & Jewelry
3. Fashion & Accessories
4. Cameras & Consumer Objects
5. Furniture & Design Objects
6. Vehicles & Transport Design

The purpose of the initial mix is to exercise cross-category entity normalization, provenance, deduplication, classification, ranking inputs, and autonomous operations across heterogeneous collectible objects.

## Legally collectable source channels — v0.1

### The Metropolitan Museum of Art — Open Access / Collection API
- Channel: public REST Collection API.
- Rights basis: The Met Open Access program releases basic collection data and eligible public-domain assets under CC0 / unrestricted reuse.
- Use in v0.1: identity, title, maker/creator, object date, classification/object type, accession/object identifiers, public-domain status, source URL, image URL where open access, observed timestamp, payload fingerprint.
- Commercial caveat: non-copyright rights such as trademarks, privacy/publicity, and third-party rights remain separate checks.

### Art Institute of Chicago — Public API / Open Access data
- Channel: public API.
- Use in v0.1: identity, title, artist/creator display, date, classification, reference number, API link, public-domain flag, update timestamp, observed timestamp, payload fingerprint.
- Collection rule: do not collect long-form descriptive text in the operational feed; keep to structured object metadata used by the platform validation layer.

### Smithsonian Open Access — phase-next approved source
- Channel: Open Access API / Open Access GitHub dataset.
- Rights basis: CC0-designated Open Access assets may be used commercially and noncommercially subject to third-party/non-copyright rights.
- Use once API-key/GitHub ingestion path is configured: expand category coverage, especially toys, transport, industrial/product design, fashion, watches and historical consumer objects.

## Required collected fields
Every accepted record must carry:
- `source`
- `sourceRecordId`
- `canonicalTitle`
- `creator` (nullable if source legitimately lacks it)
- `objectDate` (nullable)
- `classification` (nullable)
- `category`
- `sourceUrl`
- `observedAt`
- `payloadHash`
- `license` / rights basis
- `publicDomain` where supplied
- `sourceUpdatedAt` where supplied

## Data classes

### Class A — Identity / Provenance
Required now and fully operable from open sources:
- canonical identity
- source record ID
- title/name
- maker/creator
- date/year
- classification/type
- source URL
- rights/license marker
- source update / observation time
- payload hash

### Class B — Collectible Context
Derived or source-supported fields that can be operated before market providers:
- category
- era
- material/type where available
- institutional presence
- cross-source entity links
- rarity proxies only when evidence exists
- cultural/canon signals from open authoritative sources

### Class C — Market Intelligence
Not to be fabricated from open-access museum data. Requires rights-appropriate market sources:
- asking/sold price
- transaction history
- liquidity
- bid/ask spread
- inventory/supply
- sell-through
- price momentum
- comparable transaction set

Until Class C is available, Kidult 100 may run as an **operational/cultural-intelligence benchmark simulation**, but not as a fully market-validated valuation index.

## Acceptance gates for the 120-object live pool
- actual external network collection = true
- accepted unique records >= 120
- category coverage >= 6 categories
- each category accepted records >= 15; target 20+
- required identity-field coverage = 100% for accepted records
- provenance coverage = 100%
- duplicate contamination = 0 in accepted pool
- rights basis recorded = 100%
- source errors recorded and isolated
- Unified Preflight outcome cannot be `READY` for commercial market publication unless live market rights and operational certification exist

## Refresh cadence
- Operational validation cadence: every 6 hours.
- Historical snapshot retention: each successful run emits machine-readable evidence.
- Constituent-pool changes must be deterministic from source results and filtering rules, and all exclusions must be explainable.

## 120-point implication
Provider contracts are not a prerequisite to test the collection, normalization, provenance, deduplication, category coverage, evidence, preflight, scheduling, and recovery portions of the platform. They remain required for provider-SLA proof and any restricted market/commercial data layer.