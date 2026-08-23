# KIDULTS ASI Source Adapter Wave 2 v1

**Owner:** KPMO  
**Priority:** P1  
**Direction:** Autonomous → Global → Irreplaceable Value → Transparent

## Outcome

Wave 2 converts four high-value generated templates into actual source-specific parser implementations, all bound to one KIDULTS-owned fail-closed public-auction result core.

Implemented sources:

1. **Barrett-Jackson Results** — 18 governed assignments;
2. **Broad Arrow Results** — 12;
3. **Collecting Cars Sold** — 6;
4. **Iconic Auctioneers Results** — 6.

Together with the Bonhams Cars Reference Adapter, the portfolio now has:

```text
5 source-specific adapters implemented
11 source-specific adapters pending
0 source-specific adapters activated
0 admitted Evidence
0 Market Events
```

## Shared non-compensating parser core

The four adapters reuse one control core while retaining separate source IDs, hosts, path allowlists, schema versions, owner candidates, record grains and factual-origin candidates.

```text
Immutable Source Snapshot
        ↓
HTTPS + Host + Path allowlist
        ↓
Payload SHA-256 + Snapshot reference
        ↓
Event ID + Lot ID + Event time
        ↓
Explicit SOLD + Positive price + Explicit currency
        ↓
Source-specific record candidate
        ↓
Generic Market Adapter Runtime
        ↓
HOLD pending empirical rights, schema, semantics, owner and origin
```

### Accepted only as parser candidates

- explicit structured terminal `SOLD` plus price and ISO currency; or
- an allowed visible terminal phrase such as `Sold for`, `Sold at`, `Sold Price` or `Sale Price` with a positive price and explicit currency.

### Rejected automatically

For each of the four sources, the test suite rejects:

- estimate, bid, offer or reserve as SOLD;
- ambiguous `$` currency;
- `Sold` without an explicit realized price;
- SOLD signals found only inside script content;
- missing lot identifier;
- explicit UNSOLD terminal state;
- payload-hash mismatch;
- unapproved source host;
- non-HTTPS source URL;
- path outside the governed source-results surface.

The verified result is **40/40 negative fixture mutations rejected** and four deterministic positive replay proofs.

## Source-specific implementation state

| Source | Parser | Generic Runtime | Live Schema | Rights | Activated | Evidence |
|---|---|---|---|---|---|---|
| Bonhams Cars Results | Implemented | Bound | 0 | 0 | No | 0 |
| Barrett-Jackson Results | Implemented | Bound | 0 | 0 | No | 0 |
| Broad Arrow Results | Implemented | Bound | 0 | 0 | No | 0 |
| Collecting Cars Sold | Implemented | Bound | 0 | 0 | No | 0 |
| Iconic Auctioneers Results | Implemented | Bound | 0 | 0 | No | 0 |

## Why Evidence remains zero

Parser implementation is not Evidence admission.

The synthetic controls prove only deterministic parser and fail-closed runtime behavior. They do not prove:

- live source schema;
- collect, bounded-store and internal-derive rights;
- source-specific terminal SOLD meaning;
- source-owner identity;
- factual-origin identity or independence;
- source activation.

Therefore the exact state remains:

```text
Evidence admitted: 0
Market Events created: 0
First admission:
BLOCKED_PENDING_EMPIRICAL_RIGHTS_SCHEMA_SEMANTICS_OWNER_ORIGIN_AND_ACTIVATION
```

## Automatic continuation

The exact-head workflow runs on:

- relevant protected-main push;
- every three hours at minute 17;
- successful Bonhams Reference Adapter, Autonomous Resolution Layer or generic Market Adapter Runtime completion.

It typechecks all modules, executes deterministic fixtures, validates the four source profiles against the governed frontier and runtime contract, rejects false semantic weakening and false Evidence promotion, then emits a KPMO receipt and 90-day artifact.

## Remaining adapter backlog

The next implementation order is:

1. Bonhams Watches Results;
2. Christie’s Watches Results;
3. Sotheby’s Watches Results;
4. PriceCharting API;
5. Christie’s Handbags Results;
6. Reverb Price Guide.

Live schema and rights work proceeds separately under security and purpose-specific rights gates; a failed or denied source does not stop the remaining source lanes.

## Hard boundaries

```text
Parser implemented ≠ Live schema verified
Fixture verified ≠ Empirical source verified
Public page ≠ Collection permission
Source owner candidate ≠ Verified owner
Auction lot key ≠ Verified factual origin
Parsed SOLD candidate ≠ Admitted Evidence
One source ≠ Global market truth
Provider data ≠ Direct index or projection
```
