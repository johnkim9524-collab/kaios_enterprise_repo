# KIDULT 100 — Source Expansion Wave 1

Status: ACTIVE SOURCE ACQUISITION PLAN
Date: 2026-08-10

## Objective

Move Stage 1 from 41 live candidates / 3 represented Core Verticals toward >=100 live candidates / 8 represented Core Verticals without weakening rights, provenance, comparability or preflight gates.

## Activation rule

VALUE -> RIGHTS -> PROVENANCE -> COMPARABILITY -> ECONOMICS -> ACTIVATE

Public visibility alone is not sufficient. Prefer official APIs, open-access repositories, government/open-data sources and explicitly reusable metadata.

## Wave 1 — Immediately usable / operationally suitable

### 1. Cooper Hewitt Smithsonian Design Museum Collections API
- Source class: Institution / Museum / Archive
- Access: public GraphQL API; no registration required for default rate-limited access
- Scale: ~215,000 design objects; ~27,000 creators/associated entities
- Rights basis: API is open access; Cooper Hewitt explicitly identifies CC0 objects for unrestricted reuse
- Primary verticals: Design & Furniture; Technology & Cameras; Fashion & Accessories; Toys & Models
- Intelligence contribution: identity, manufacturer/designer, date/year, type, material, department, institutional canon, creator graph
- POC activation: ACTIVE for metadata and CC0-designated objects

### 2. Library of Congress loc.gov JSON/YAML API
- Source class: Institution / Library / Public Research
- Access: public API; no API key; automation explicitly supported; rate limits apply
- Scale: broad digital collections, including books, photos, film/video, audio, manuscripts, printed music and 3D object facets
- Primary verticals: Gaming / Music / Screen Culture; Cards / Comics / Memorabilia; Technology & Cameras; Fashion & Accessories
- Intelligence contribution: identity, date, creator/contributor, subject, format, cultural persistence, archival/institutional recognition
- Rights basis: API access is public; media/content rights vary by item. POC defaults to metadata-only unless item rights permit broader use
- POC activation: ACTIVE_METADATA_ONLY

### 3. NHTSA vPIC Vehicle API / Standalone Data
- Source class: Government / Public Data / Manufacturer-reported registry
- Access: public API; standalone databases also available; rate controls apply
- Primary vertical: Automobiles & Mobility
- Intelligence contribution: make/model identity, model year, vehicle type, manufacturer, VIN-decoding variables, manufacturer-submitted specification data
- Rights basis: NHTSA/data.gov describes vPIC as an Open Data / Transparency source intended to be freely used by the public; dataset license field is unspecified, so KIDULTS treats it as PUBLIC_USE_METADATA with no broader rights inference
- POC activation: ACTIVE_IDENTITY_SPEC_METADATA

### 4. Wikidata Structured Data
- Source class: Reference / Research / Public Data
- Access: public structured data / SPARQL ecosystem
- Rights basis: structured data in main/property/lexeme namespaces is CC0
- Primary verticals: all 8
- Intelligence contribution: entity linking, creator/brand/model/date/classification, cross-source IDs
- POC activation: ACTIVE

### 5. Smithsonian Open Access
- Source class: Institution / Museum / Archive
- Access: Open Access API via api.data.gov key and weekly refreshed GitHub JSON repository
- Rights basis: CC0-designated items are open access; non-CC0 items retain restrictions
- Primary verticals: Technology & Cameras; Automobiles & Mobility; Design & Furniture; Gaming / Music / Screen; Fashion; Toys
- Intelligence contribution: identity, creator, institutional canon, provenance context, media when CC0
- POC activation: ACTIVE_VIA_OPEN_REPOSITORY / API_KEY_OPTIONAL_FOR_API

## Wave 1.5 — Rights-cleared but activation dependency exists

### Europeana APIs
- Source class: Institution aggregation / Cultural heritage
- Access: Search/Record/IIIF APIs; API key required
- Rights basis: API metadata is CC0; linked media follows per-record rights statements
- Primary verticals: Fashion; Design & Furniture; Technology & Cameras; Gaming/Music/Screen; Cards/Comics/Memorabilia
- POC state: READY_FOR_KEY; metadata can be activated after key provisioning

## Wave 2 — High-value sources pending terms/rights review

### Victoria and Albert Museum Collections API
- Value: >1M collection records, strong design/fashion/object coverage
- Primary verticals: Fashion & Accessories; Design & Furniture; Technology & Cameras; Toys & Models
- State: HOLD_RIGHTS_REVIEW because API reuse is governed by V&A website terms rather than a blanket CC0 statement

### Manufacturer / Brand official channels
- Value: SKU/reference, launch, MSRP, edition/production claims, discontinuation, specifications
- State: VERTICAL_BY_VERTICAL_RIGHTS_REVIEW; do not scrape by default

### Auction houses / marketplaces / grading registries
- Value: sold price, hammer, sell-through, listing stock, population, grade, liquidity
- State: HIGH_PRIORITY_MARKET_INTELLIGENCE but requires explicit API/feed/contract or verified permitted access method

## Vertical coverage target after Wave 1

1. Toys & Models — Cooper Hewitt + Smithsonian + Wikidata + existing open institutional sources
2. Watches & Jewelry — existing sources + Wikidata; still needs stronger specialist source in Wave 2
3. Automobiles & Mobility — NHTSA vPIC + Smithsonian + Wikidata
4. Fashion & Accessories — Cooper Hewitt + LOC + Smithsonian + Wikidata
5. Design & Furniture — Cooper Hewitt + Smithsonian + Wikidata
6. Technology & Cameras — Cooper Hewitt + Smithsonian + LOC + Wikidata
7. Gaming / Music / Screen Culture — LOC + Smithsonian + Wikidata
8. Cards / Comics / Memorabilia — LOC + Wikidata; specialist transaction/grading source remains a Wave 2 priority

## Immediate POC gate

Re-run Stage 1 only after adapters/source queries cover all 8 Core Verticals. Required minimums:
- >=100 unique live candidates
- 8/8 Core Verticals represented
- rights classification = 100%
- provenance = 100%
- intelligence primitive mapping = 100%
- duplicate contamination <0.5%
- unsupported causal claims = 0

Do not reduce the threshold to obtain a green run.
