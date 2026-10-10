# KIDULTS ASI Getty Historical Transaction Reference Replay v1

## Outcome

This lane deterministically parses two committed Getty Provenance Index JSON-LD reference snapshots and verifies their repository digests and CC0 rights metadata. It is **CONTROL_ONLY / NON-PROMOTABLE**.

It does not prove an acquisition-time network retrieval. No authoritative HTTP status, response headers, retrieval timestamp, raw-byte artifact, or run/attempt-bound acquisition receipt is present. Therefore live snapshots verified, machine-proven acquisition receipts, empirical historical evidence admitted, and historical transaction events created are all zero.

It also creates no generic market event, verified Current-SOLD event, current price, demand, liquidity, index input, snapshot candidate, Track B input, public release, Production activation, or G5 action.

## Bound reference records

- Sale activity: `https://data.getty.edu/provenance/fbc91494-294c-30a6-b6dc-885f3ea074ed`
- Object: `https://data.getty.edu/provenance/09539ab1-416d-3870-810b-8a6b3b604368`
- Rights: `https://data.getty.edu/provenance/docs/` (CC0)

The committed sale snapshot documents a title-transfer activity associated with stock number A1983, a monetary amount of 1,471.13 pound sterling, and a September 1938 month window. Those statements are reference-replay parsing results, not proof that this workflow fetched the source.

## Machine-enforced boundary

The adapter and package validator require:

- `committed_reference_snapshots_verified=2`
- `immutable_live_source_snapshots_verified=0`
- `machine_proven_acquisition_receipts=0`
- `historical_transaction_evidence_admitted=0`
- `historical_transaction_events_created=0`
- `promotable=false`

Negative mutations attempt to promote live acquisition, empirical admission, and an empirical event. Each must fail closed.

## Promotion requirement

A future empirical lane must independently retain acquisition-time HTTP status, headers, timestamp, exact raw bytes, source URL/version metadata, and a SHA/run/attempt-bound receipt. Rights evidence remains necessary but does not substitute for acquisition evidence.
