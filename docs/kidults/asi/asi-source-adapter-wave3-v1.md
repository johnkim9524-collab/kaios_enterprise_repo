# KIDULTS ASI Source Adapter Wave 3 v1

**Owner:** KPMO  
**Priority:** P1  
**Direction:** Autonomous → Global → Irreplaceable Value → Transparent

## Outcome

Wave 3 implements four additional source-specific adapters on the existing KIDULTS-owned public-auction result parser core:

- Bonhams Watches Results;
- Christie's Watches Results;
- Sotheby's Watches Results;
- Christie's Handbags Results.

The portfolio state becomes:

```text
9 source-specific adapters implemented
7 source-specific adapters pending
16 registered source profiles total
```

## Executable chain

```text
Immutable source snapshot
        ↓
Source-specific host and path profile
        ↓
Shared public-auction parser core
        ↓
Event ID + Lot ID + event time
        ↓
Explicit terminal SOLD + price + currency
        ↓
Source-specific candidate grain
        ↓
Generic KIDULTS Market Adapter Runtime
        ↓
HOLD pending empirical rights, live schema, owner and factual origin
```

## Implemented controls

Every Wave 3 adapter enforces:

- HTTPS only;
- source host allowlist;
- source path allowlist;
- immutable snapshot reference;
- exact payload SHA-256;
- RFC3339 observation time;
- event and lot identifiers;
- explicit terminal SOLD semantics;
- positive realised price;
- explicit currency;
- ambiguous dollar rejection;
- script-only signal rejection;
- listing, estimate, bid, offer and reserve are not SOLD;
- deterministic replay;
- generic runtime binding;
- provider-direct path to index or projection forbidden.

## Fixture proof

```text
Positive fixture candidates parsed: 4
Deterministic replays verified: 4
Negative fixture mutations rejected: 40/40
```

Each source rejects ten mutation families:

1. estimate is not SOLD;
2. ambiguous dollar currency;
3. SOLD without explicit price;
4. script-only SOLD signal;
5. missing lot identifier;
6. terminal UNSOLD is not SOLD;
7. payload hash mismatch;
8. source host not allowed;
9. non-HTTPS source;
10. source path not allowed.

## Exact claim boundary

The four adapters implement only:

```text
DATED_OBSERVED_SOLD_TRANSACTION parser
```

`CURRENT_PRICE` remains a separate downstream gate requiring multiple admitted observations, freshness, condition segmentation, currency normalization, duplicate and outlier controls, and factual-origin independence.

No Wave 3 source claims liquidity. No source profile is promoted beyond its registered claim set.

## Empirical boundary

Current exact state:

```text
Live source snapshots verified: 0
Purpose-specific rights verified sources: 0
Source-specific adapters activated: 0
Evidence admitted: 0
Market Events created: 0
```

Parser implementation is not Evidence admission.

Fixture verification is not live source schema verification. A public result page is not automatically a collect, store or derive permission. Source-owner and factual-origin values remain candidates until verified.

## Remaining implementation backlog

The seven remaining profiles require channel-specific adapter families:

- PriceCharting API;
- Reverb Price Guide;
- Hasbro Pulse Collections;
- GOAT Sneaker Marketplace;
- COMC Marketplace;
- BrickLink Catalog API;
- Nike SNKRS Launch Calendar.

The next wave separates structured API market data, marketplace result surfaces and release or listing surfaces so that a source cannot inherit a SOLD or liquidity capability it does not empirically expose.

## Hard boundaries

```text
Parser implemented ≠ Adapter activated
Fixture verified ≠ Live schema verified
Public result page ≠ Rights pass
SOLD observation ≠ Current price
Source host ≠ Factual origin
Profile registration ≠ Evidence admission
One auction house ≠ Global market truth
```
