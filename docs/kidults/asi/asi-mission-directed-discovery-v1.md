# KIDULTS ASI Mission-Directed Discovery v1

**Owner:** KPMO  
**Priority:** P0 → P1 bridge  
**State:** Live public-metadata discovery with fail-closed claim readiness  
**Direction:** Autonomous → Global → Irreplaceable Value → Transparent

## Why this development is required

Mission Consumption materialized 426 unresolved source-lane discovery intents. Those intents were explicit machine work, but they still required a rotating discovery executor and a claim-specific admission compiler.

This component closes that next gap:

```text
426 Unfilled or Ambiguous Source-Lane Intents
        ↓
Rolling Cursor and 24-Intent Batch
        ↓
Wikidata / GitHub / DataCite Public Metadata Discovery
        ↓
Live Source Candidates with Mission Lineage
        ↓
Gate 1 Source Safety Classification
        ↓
Gate 2 Independent Reverification
        ↓
Gate 3 Discovery-Metadata Admission
        ↓
Current-Sold / Current-Price / Liquidity Assertion Gap Compiler
        ↓
Source-Specific Adapter Requirements
        ↓
KPMO Receipt and Artifact
```

## Autonomous rolling execution

The runner consumes 24 intents per cycle and persists the next cursor in the workflow artifact. With the initial 426-intent set, one complete rotation requires approximately 18 successful cycles.

The normal execution paths are:

- relevant protected-main push;
- hourly schedule;
- successful `KIDULTS ASI Mission Consumption v1` completion.

Manual dispatch remains recovery or explicit replay only.

A provider failure does not erase successful results from other lanes. Partial failure is an explicit output state.

## Global provider lanes

### Wikidata Official Website Graph

Searches public Wikidata entity metadata and reads P856 official-website statements. It does not crawl the discovered website.

### GitHub Repository Homepage Metadata

Searches public repository metadata and emits declared homepage URLs. It does not clone repositories or crawl the homepage.

### DataCite Open Research Metadata

Searches public DOI metadata and emits registered landing URLs and declared rights metadata. Gate 2 independently re-queries the primary DataCite record when Gate 1 finds a recognized open-metadata rights signal.

None of these lanes creates collection rights for a target source.

## Candidate truth boundary

Every candidate preserves:

- discovery-intent ID;
- mission ID;
- market-cell ID;
- primary/fallback/factual-origin lane slot;
- scope and region;
- evidence class;
- provider record and endpoint;
- observation time;
- source owner hint;
- provider health and partial-failure receipt.

Every candidate begins as:

```text
Source family: UNCLASSIFIED
Source role: UNCLASSIFIED_PENDING_RELEVANCE
Rights: UNASSESSED
Admission: NOT_ADMITTED
Gate 1: PENDING
Evidence: DISCOVERY_METADATA_ONLY
Collection: false
```

## Three verification gates

### Gate 1 — Source safety and relevance classification

Gate 1 may classify source-family and candidate-role metadata. It cannot create rights, admission or a market claim.

### Gate 2 — Independent reverification

Gate 2 re-verifies supported open-metadata evidence independently. A Gate 1 decision cannot be reused as Gate 2 evidence.

### Gate 3 — Purpose-specific metadata admission

Gate 3 may admit only a bounded discovery-metadata index record. It does not authorize target-source body collection and does not admit a sold event, price, exposure denominator or liquidity observation.

## P1 claim-specific readiness compiler

For every candidate, the compiler evaluates the exact assertion set from the strict current-market gate.

`CURRENT_SOLD_TRANSACTION` missions generate readiness records for:

1. `DATED_OBSERVED_SOLD_TRANSACTION`
2. `CURRENT_PRICE`

`LIQUIDITY_TIME_TO_SALE_EXPOSURE` missions generate readiness records for:

1. `LIQUIDITY_OR_TIME_TO_SALE`

A public metadata candidate does not satisfy any event-level claim assertion. Missing assertions remain explicit `HOLD` values.

Typical missing assertions include:

- exact item identity;
- terminal sold semantics;
- realized price and currency;
- event date;
- field-by-purpose collect/store/derive rights;
- condition or grade segmentation;
- duplicate and outlier controls;
- freshness calibration;
- exposure denominator;
- listing start and sale/censor end;
- sold, unsold, withdrawn and failed-sale semantics;
- source-owner and factual-origin independence.

## Source-specific adapter backlog

The compiler groups candidate endpoints by canonical host and evidence class and generates a machine-readable adapter requirement containing:

- field extraction contract;
- sold or exposure semantic contract;
- field-purpose rights matrix;
- freshness policy;
- duplicate, outlier and censor controls;
- canonical identity binding;
- provenance and factual-origin binding.

An adapter requirement is not an implemented adapter. It is the exact development and evidence obligation needed to move a source toward market-event admission.

## Hard boundaries

```text
Public Metadata Discovery ≠ Target-Site Collection
Discovered Endpoint ≠ Relevant Source until Gate 1
Gate 1 Classification ≠ Rights Admission
Gate 3 Metadata Admission ≠ Market-Event Admission
Source-Role Hint ≠ Terminal Sold Assertion
Dated Sold ≠ Current Price
Sold Count ≠ Liquidity without Exposure Denominator
Provider Owner Count ≠ Factual-Origin Independence
Partial Provider Failure must remain visible
Missing Assertion = HOLD, not Zero
```

## Downstream development still required

The component completes rolling mission-directed source discovery and exact P1 gap compilation. It intentionally exposes, rather than hides, the remaining work:

1. implement and test source-specific market-event adapters for the highest-value hosts;
2. establish exact field-purpose rights and source semantics;
3. admit genuine collector-market sold and exposure events;
4. materialize admitted events into KIDULTS-owned graphs;
5. compile a genuine immutable Candidate and Evidence Package.
