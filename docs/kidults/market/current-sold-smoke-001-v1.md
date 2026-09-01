# KIDULTS Current-SOLD Smoke 001

## Purpose

Prove the first genuine terminal SOLD fact can pass the owned Current-SOLD Engine with explicit acquisition, rights and provenance controls.

## Source and event

- source: U.S. Department of State Online Auction
- post: The Hague, NL
- item: `TELEVISION - SONY (AW7607L)`
- model: `KDL-26BX320`
- terminal state: `SOLD`
- source-reported realized amount: `EUR 9.00`
- auction scheduled closure used as the bounded sold-time basis: `2026-08-19T10:00:00Z`
- observed: `2026-09-01T06:23:44Z`

The sold-time binding is deliberately documented as a bounded join between the State Department auction-post closure and the corresponding result page. If that join cannot be independently maintained, the smoke must fail closed rather than weaken the Current-SOLD freshness rule.

## Rights and retention

Only factual fields are retained under the existing bounded State Department public-domain factual-field admission. No photos, graphics, seals, bidder/account data, raw HTML, full-description reproduction, credentials, bidding, purchase, contract or spend are included.

## Claim boundary

This is `SMOKE_EMPIRICAL_REFERENCE_ONLY`.

It establishes only that one real external terminal SOLD fact can be normalized into one owned `CurrentSoldEvent` with acquisition and rights receipts.

It does not establish collector-market representativeness, representative price, liquidity, time-to-sale, official Track B input, Approved Projection, Public, Production or G5 authority. Collector current-SOLD market evidence remains `0`.

## Next execution target

After this smoke lands: collector-relevant lawful SOLD 1 -> Canary 5 -> Functional Pilot 30-120.
