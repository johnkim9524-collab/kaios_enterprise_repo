# KIDULTS ASI Getty Historical Transaction Admission v1

## Outcome

This lane creates the first exact-digest, rights-admitted historical transaction evidence package in the current source-intelligence program. It consumes two official Getty Provenance Index JSON-LD records and admits one bounded historical title-transfer record plus one separate historical transaction event.

It does **not** create a generic `market-event-v1`, a verified current sold event, current price, demand, liquidity, index input, snapshot candidate, Track B input, public release, Production activation or G5 action.

## Bound source records

- Sale activity: `https://data.getty.edu/provenance/fbc91494-294c-30a6-b6dc-885f3ea074ed`
- Object: `https://data.getty.edu/provenance/09539ab1-416d-3870-810b-8a6b3b604368`
- Rights: `https://data.getty.edu/provenance/docs/` (CC0)

The sale record documents a title-transfer activity associated with stock number A1983, a monetary amount of 1,471.13 pound sterling, and a September 1938 month window. The amount is not relabeled as a hammer price, all-in realized price or current price. The month window is not relabeled as an exact day.

## Why Getty is outside Top16

The Top16 portfolio already has 16 fixture-verified software adapters, but it still has zero empirically activated sources. The official preflight in this wave found non-compensating external blockers: explicit automated-collection restrictions, login-gated prices, WAF access, or paid-token/account requirements. Those states remain in `top16-empirical-activation-preflight-v1.json` and are not bypassed.

Getty is a separately admitted `HISTORICAL_TRANSACTION_PROVENANCE` source already present in the canonical rights-admitted pool. Its admission proves the end-to-end evidence machinery without fabricating a Top16 or current-market result.

## Deterministic pipeline

1. Verify the two committed raw JSON-LD payload digests.
2. Verify the official Getty IDs, purchase/provenance classification, title transfer, object identity, month precision, monetary amount and sterling authority ID.
3. Bind the CC0 purpose-rights admission.
4. Normalize exactly one historical transaction provenance record.
5. Admit one historical evidence record and create one separate historical transaction event.
6. Reject routing into the generic current-market event layer, including forged admitted-wrapper attempts.
7. Keep Top16, current signal, Public, Production and G5 gates on `HOLD`.

## Local verification

```bash
KIDULTS_TYPESCRIPT_MODULE=/path/to/typescript/lib/typescript.js \
  node services/kidults-autonomous-intelligence/scripts/asi-getty-provenance-index-test.mjs \
  > /tmp/kidults-getty-adapter-test-v1.json

node scripts/kidults/source-intelligence/build-asi-getty-historical-transaction-admission-v1.mjs \
  coordination/kidults/source-intelligence/getty-provenance-historical-transaction-observation-v1.json \
  coordination/kidults/source-intelligence/asi-getty-historical-transaction-admission-contract-v1.json \
  coordination/kidults/source-intelligence/top16-empirical-activation-preflight-v1.json \
  /tmp/kidults-getty-adapter-test-v1.json \
  /tmp/kidults-getty-historical-run-1

node scripts/kidults/source-intelligence/validate-asi-getty-historical-transaction-admission-v1.mjs \
  /tmp/kidults-getty-historical-run-1 \
  coordination/kidults/source-intelligence/getty-provenance-historical-transaction-observation-v1.json \
  coordination/kidults/source-intelligence/asi-getty-historical-transaction-admission-contract-v1.json \
  coordination/kidults/source-intelligence/top16-empirical-activation-preflight-v1.json \
  /tmp/kidults-getty-adapter-test-v1.json
```
