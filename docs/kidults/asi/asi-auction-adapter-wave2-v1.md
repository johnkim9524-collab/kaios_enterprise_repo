# KIDULTS ASI Auction Adapter Wave 2 v1

**Owner:** KPMO  
**Priority:** P1  
**Direction:** Autonomous → Global → Irreplaceable Value → Transparent

## Outcome

This wave converts four generated source templates into source-specific, executable, fail-closed SOLD adapters:

1. Barrett-Jackson Results;
2. Broad Arrow Results;
3. Collecting Cars Sold;
4. Iconic Auctioneers Results.

Together with the existing Bonhams Cars Reference Adapter, the current implementation portfolio becomes:

```text
5 / 16 source-specific adapters implemented
11 source-specific adapters pending
```

The four new adapters cover 42 registered assignments. Including Bonhams Cars, implemented parser coverage reaches 66 of 156 registered assignments.

## Executable architecture

```text
Immutable source snapshot
        ↓
Source-specific host and schema configuration
        ↓
Shared public-auction integrity controls
        ↓
Event ID + Lot ID + Event Time
        ↓
Explicit SOLD + realised price + explicit currency
        ↓
Source-specific normalized candidate
        ↓
Generic KIDULTS Market Adapter Runtime
        ↓
HOLD until empirical rights, live schema, owner and origin pass
```

The shared parser owns only controls that are invariant across public auction-result channels. Each source retains its own host allowlist, schema version, owner candidate, event/lot patterns, explicit currency patterns and source-record namespace.

## Implemented controls

Every new adapter requires:

- immutable external snapshot input;
- HTTPS;
- exact source-host allowlist;
- exact HTML payload SHA-256;
- SHA-256 snapshot reference;
- canonical object identity;
- condition segment;
- event identifier;
- lot identifier;
- event timestamp;
- explicit terminal SOLD phrase;
- positive realised price;
- explicit, non-ambiguous currency;
- generic Market Adapter Runtime binding;
- deterministic replay.

The parser performs no network request. Network execution remains a separately governed safe-egress concern.

## Fail-closed semantic boundaries

For every source, the following eight mutation families are rejected:

```text
Estimate ≠ Sold
Ambiguous $ ≠ explicit currency
Sold without price ≠ transaction record
Script-only Sold signal ≠ visible terminal result
Missing Lot ID ≠ transaction grain
Payload-hash mismatch ≠ immutable snapshot
Wrong Host ≠ registered source
HTTP ≠ approved transport
```

The exact fixture matrix contains:

```text
4 positive synthetic controls
32 negative fixture mutations
4 deterministic replays
4 generic-runtime bindings
```

Synthetic controls test parser behavior only. They are not empirical source observations.

## Source-specific implementations

### Barrett-Jackson Results

- registered assignments: 18;
- target claims: dated SOLD, current-price input, liquidity/time-to-sale;
- implemented parser: dated observed SOLD transaction;
- current-price and liquidity remain downstream/template-only claims.

### Broad Arrow Results

- registered assignments: 12;
- target claims: dated SOLD, current-price input, liquidity/time-to-sale;
- implemented parser: dated observed SOLD transaction.

### Collecting Cars Sold

- registered assignments: 6;
- target claims: dated SOLD, current-price input, liquidity/time-to-sale;
- implemented parser: dated observed SOLD transaction.

### Iconic Auctioneers Results

- registered assignments: 6;
- target claims: dated SOLD, current-price input, liquidity/time-to-sale;
- implemented parser: dated observed SOLD transaction.

## Current empirical boundary

```text
Live source snapshots verified: 0
Purpose-specific rights verified: 0
Source adapters activated: 0
Evidence admitted: **0**
Market Events created: 0
```

Parser implementation does not establish:

- permission to collect, store or derive;
- the live source schema;
- the meaning of live SOLD labels;
- source-owner identity;
- factual-origin identity or independence;
- Evidence Admission;
- a current-price or liquidity claim.

## Remaining source-adapter backlog

The next implementation wave is generated automatically from the registered profile priority order:

```text
Bonhams Watches Results
Christie's Watches Results
Sotheby's Watches Results
PriceCharting API
```

After this wave, eleven source-specific adapters remain pending. Each backlog item retains exact claim targets, channel family, assignment impact and the eleven steps required before Evidence Admission.

## First lawful Evidence Admission path

```text
Implemented source-specific parser
        ↓
Governed immutable live snapshot
        ↓
Purpose-specific rights adjudication
        ↓
Empirical live-schema and SOLD-semantics proof
        ↓
Source owner and factual origin verification
        ↓
Adapter activation gate
        ↓
Generic runtime normalization
        ↓
Evidence Admission receipt
```

No gate may compensate for another. Failure or denial at one source moves the program to the next implemented or pending source; it does not stop the portfolio.

## Automatic execution

The exact-head workflow runs on:

- relevant protected-main changes;
- every three hours at minute 47;
- successful Bonhams Reference Adapter completion;
- successful Autonomous Resolution Layer completion;
- successful generic Market Adapter Runtime completion.

It typechecks the runtime, executes all fixture and mutation suites, builds the implementation registry twice, proves byte-identical replay, rejects false semantic weakening and Evidence promotion, emits a KPMO receipt, and retains the artifact for 90 days.
