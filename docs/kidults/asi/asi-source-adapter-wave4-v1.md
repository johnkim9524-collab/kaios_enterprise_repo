# KIDULTS ASI Source Adapter Wave 4 v1

**Owner:** KPMO  
**Priority:** P1  
**Direction:** Autonomous → Global → Irreplaceable Value → Transparent

## Outcome

Wave 4 implements the final seven source-specific adapters and brings the registered software portfolio to:

```text
16 / 16 source-specific adapters implemented
0 / 16 empirically activated
Evidence admitted: 0
0 Market Events created
```

Software coverage complete ≠ Empirical activation complete.

The final seven sources do not share one market meaning. The implementation therefore does not copy the auction-result parser across incompatible channels. It applies a source-family-specific transaction parser, exposure parser or context-only classifier.

## Final seven sources

| Source | Implemented role | Claim ceiling before empirical activation |
|---|---|---|
| PriceCharting API | Current-value context classifier | Context only; documented product values ≠ dated sold transactions or Current Market Price |
| Reverb Price Guide | Aggregate price-guide context classifier | Context only; aggregate guide ≠ transaction or Current Price |
| Hasbro Pulse Collections | Release/listing context classifier | Context only; release/listing ≠ liquidity |
| GOAT Sneaker Marketplace | Strict exposure-candidate parser | Exposure candidate only; listing ≠ SOLD |
| COMC Marketplace | Strict exposure-candidate parser | Exposure candidate only; listing ≠ SOLD |
| BrickLink Catalog API | Strict exposure-candidate parser | Exposure candidate only; catalog/listing ≠ liquidity without denominator and outcome |
| Nike SNKRS Launch Calendar | Release/listing context classifier | Context only; sold-out/release ≠ liquidity |

## Shared governed market-surface core

```text
Immutable external snapshot
        ↓
HTTPS + exact host + allowed path
        ↓
Payload SHA-256 + snapshot reference
        ↓
Object JSON + RFC3339 time
        ↓
Source-specific field mapping
        ↓
Transaction / Exposure / Context-only branch
        ↓
Generic Market Adapter Runtime when a candidate exists
        ↓
HOLD until empirical rights, schema, semantics, owner and origin pass
```

The shared core performs no network request. It accepts only an immutable snapshot delivered by a separately governed acquisition path.

## PriceCharting correction

Official API documentation describes a product endpoint for current guide values and a separately authenticated, party-scoped offers endpoint. It does not document the generic `/api/transactions/{sale_id}` shape that the original synthetic fixture assumed. Wave 4 therefore fail-closed corrects PriceCharting to a current-value context classifier. No dated-SOLD parser remains registered for this source, and a fixture containing `SOLD` fields cannot create a transaction candidate.

## Exposure branch

GOAT, COMC and BrickLink require:

- source listing or inventory record ID;
- exposure start;
- observation end;
- governed terminal or censored outcome;
- censoring state;
- failed-sale handling;
- exposure denominator ID.

A listing count or sold-out label without this denominator and outcome structure is not liquidity.

## Context-only branch

Reverb Price Guide, Hasbro Pulse and Nike SNKRS are intentionally prevented from producing transaction or liquidity candidates from aggregate prices, release calendars, availability or sold-out labels.

These sources may still contribute lawful reference, listing, release or contextual observations after their own rights and admission gates. Their context classifier preserves that possible use without manufacturing a market claim.

## Executable proof

```text
Wave 4 adapters implemented                    7
Total registered adapters implemented          16
Remaining software adapter backlog              0
Deterministic replays                            7
Positive exposure fixtures                       3
Context-only classifications                     4
49 / 49 negative fixture mutations rejected
Generic Runtime bindings verified                3
Live source snapshots verified                   0
Rights-verified sources                          0
Activated adapters                               0
Evidence admitted: 0
Market Events                                    0
```

The 49 negative cases cover four integrity mutations and three source-family semantic mutations per source.

## First Evidence Admission boundary

The code portfolio is now complete, but the first lawful empirical admission still requires:

```text
Immutable live source snapshot
        ↓
Purpose-specific collect / store / derive rights
        ↓
Live schema verification
        ↓
Empirical transaction or exposure semantics
        ↓
Source owner + factual origin verification
        ↓
Source-specific activation gate
        ↓
Generic Runtime normalization
        ↓
Market Event admission receipt
```

External provider review or contact must follow:

```text
Track Z review
        ↓
KPMO integrated report
        ↓
Founder decision when an external permission, contract, credential or spend gate exists
```

## Hard boundaries

```text
Software coverage complete ≠ Empirical activation complete
Registered claim ≠ Implemented claim
Implemented adapter ≠ Activated adapter
Aggregate price guide ≠ Dated SOLD
Aggregate price guide ≠ Current Price
Release or listing ≠ Liquidity
Sold-out label ≠ Exposure denominator
Fixture candidate ≠ Evidence
Normalized candidate ≠ Market Event
One source ≠ Global truth
```

Public release, Production and G5 remain HOLD.
