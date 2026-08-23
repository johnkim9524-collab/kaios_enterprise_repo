# KIDULTS ASI P1 Market-Event Adapter Runtime v1

**Owner:** KPMO  
**Priority:** P1  
**Direction:** Autonomous → Global → Irreplaceable Value → Transparent

## Why this additional development is required

The ASI mission pipeline now generates, consumes and discovers source candidates. That does not make those candidates market evidence.

A real sold or liquidity source must still pass a source-specific adapter runtime that understands:

- exact source schema;
- terminal sold semantics;
- realized price and currency;
- event and exposure time;
- condition or grade segmentation;
- sold, unsold, withdrawn, failed-sale and censoring states;
- exact field-purpose rights;
- canonical object identity;
- source-owner and factual-origin lineage;
- duplicate, outlier and schema-drift controls.

This component implements that generic fail-closed runtime.

```text
Source-Specific Adapter
        ↓
Schema and Drift Gate
        ↓
Field-Purpose Rights Gate
        ↓
Sold or Exposure Semantic Gate
        ↓
Canonical Identity and Provenance Gate
        ↓
Normalized Record Ready for Separate Market-Event Gate
```

## Generic Runtime ≠ Source-Specific Adapter

The generic runtime is now implemented and tested. It provides the mandatory normalization and rejection behavior for every future source adapter.

It does not mean any registered source adapter is implemented or activated.

Current exact state:

```text
16 registered source profiles
0 source-specific adapters implemented
0 source-specific adapters activated
0 empirical market events admitted
0 current-price eligible sources
0 liquidity-eligible sources
```

## Dated sold normalization

A record cannot be normalized unless it includes:

- source record ID;
- canonical object ID;
- explicit terminal `SOLD` state;
- positive finite realized price;
- ISO currency;
- coherent event and observation time;
- condition or grade segment;
- source owner and factual origin;
- collect, bounded-store and internal-derive rights;
- provenance and immutable snapshot references;
- exact source schema version and payload hash.

The runtime rejects or holds listings, active offers, bids, asks, reserves and pending states.

```text
Listing ≠ Sold
Bid or Ask ≠ Sold
Offer ≠ Sold
Reserve ≠ Sold
```

## Liquidity normalization

A liquidity record requires an exposure denominator and full outcome semantics:

- exposure start;
- observation or event end;
- sold, unsold, withdrawn, failed-sale or right-censored outcome;
- censoring state;
- failed-sale handling;
- denominator ID;
- exact rights and provenance.

```text
Sold Count ≠ Liquidity
```

A sold count without exposure and censoring data cannot become a liquidity observation.

## Current-price readiness

A normalized dated sold record still does not establish current price. The separate readiness check requires:

- calibrated minimum sample;
- current freshness;
- condition segmentation;
- currency normalization;
- source-owner and factual-origin independence;
- outlier and duplicate control;
- temporal coherence;
- deterministic recomputation.

One transaction cannot establish a current price.

## Non-promotable fixture tests

The runtime is exercised with deterministic synthetic control fixtures to prove:

- schema validation;
- deterministic normalization;
- listing-not-sold rejection;
- unknown-rights hold;
- preflight-only adapter hold;
- denominator-required liquidity hold;
- schema-drift hold;
- provider-direct-path rejection;
- synthetic current-price promotion rejection.

Fixture output is permanently non-promotable and cannot prove empirical source rights, source semantics or market admission.

## Registered source portfolio

The current registry contains 16 source profiles representing 156 verified mission assignments. All remain `ADAPTER_NOT_IMPLEMENTED`.

The first source-specific implementation backlog is ordered by verified mission demand:

1. **Bonhams Cars Results** — 24 assignments;
2. Barrett-Jackson Results — 18;
3. Bonhams Watches Results — 18;
4. Christie’s Watches Results — 12;
5. Sotheby’s Watches Results — 12;
6. Broad Arrow Results — 12.

Each source must independently establish exact terms, rights, schema, sold/exposure semantics and factual-origin lineage before activation.

## Automatic validation

The runtime validation executes on:

- relevant protected-main push;
- every six hours;
- successful Mission-Directed Discovery completion.

It validates all profiles against the governed source frontier, typechecks the runtime, executes deterministic fixtures and rejects truth-boundary mutations.

## Hard boundaries

```text
Generic Runtime ≠ Source-Specific Adapter
Registered Profile ≠ Rights-Verified Source
Normalized Record ≠ Admitted Market Event
Dated Sold ≠ Current Price
Sold Count ≠ Liquidity
Synthetic Fixture ≠ Empirical Evidence
Provider Data ≠ Direct Index or Projection
```

## Next exact development

The runtime core is ready. The next implementation task is the first source-specific adapter, beginning with Bonhams Cars Results only after its exact source terms, field-purpose rights, schema and terminal-result semantics are evidenced and bound.
