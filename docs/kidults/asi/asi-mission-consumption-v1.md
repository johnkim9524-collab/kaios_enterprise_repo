# KIDULTS ASI Mission Consumption Runtime v1

**Owner:** KPMO  
**Priority:** P0  
**State:** Executable SHADOW bridge  
**Direction:** Autonomous → Global → Irreplaceable Value → Transparent

## Why this development is required

The Intelligence Preparation Wave generated 192 machine-readable missions. Generation alone is not execution. Before this bridge, no component consumed those missions into source-specific runtime events.

This runtime bridge closes that exact gap:

```text
192 Generated Missions
        ↓
Mission Consumption State
        ↓
960 Product Work Obligations
        ↓
576 Source Lane Slots
        ↓
Registered Source Assignments or Discovery Intents
        ↓
Runtime-compatible SOURCE_DISCOVERY_REQUESTED Events
        ↓
Four-Principle Runtime Preflight
        ↓
DISCOVERY_APPROVED_DIRECTORY_OUTBOUND_FRONTIER Processor
        ↓
SOURCE_DISCOVERED / HOLD / UNKNOWN RIGHTS
        ↓
KPMO Receipt and Artifact
```

## Scope

The bridge consumes all:

```text
32 scopes × 3 regions × 2 critical evidence classes = 192 missions
```

The critical evidence classes are:

1. `CURRENT_SOLD_TRANSACTION`
2. `LIQUIDITY_TIME_TO_SALE_EXPOSURE`

It also materializes:

```text
160 representative products × 3 regions × 2 evidence classes = 960 product work items
```

Every mission has three explicit source-lane obligations:

1. Primary candidate lane;
2. Independent fallback lane;
3. Distinct factual-origin replacement lane.

This produces 576 lane slots.

## Product and scope binding

The current 160-product registry uses the legacy 32-scope taxonomy. The Mission Queue uses the current 32-scope taxonomy. Every product work item therefore passes through the governed scope crosswalk.

The bridge does not hide difficult mappings:

- one-to-one mappings bind directly;
- semantic-review mappings remain explicitly review-required;
- split mappings remain target-specific and do not select a successor automatically;
- retired scopes remain unresolved dynamic-scope work.

This prevents a convenient but false 100% product-to-mission binding claim.

## Registered source assignment

The bridge reads the governed high-authority source frontier and selects only candidates that satisfy both:

- a crosswalk-compatible scope;
- a role compatible with the mission evidence class.

A registered source assignment is advisory preparation only. It does not establish:

- field-by-purpose rights;
- source-owner independence;
- factual-origin independence;
- collector-market representativeness;
- current-price eligibility;
- liquidity eligibility.

Unfilled or ambiguous slots generate bounded discovery intents rather than zero values.

## Runtime event bridge

Eligible named assignments become canonical `SOURCE_DISCOVERY_REQUESTED` events with:

- mission ID;
- market-cell ID;
- lane slot;
- registered source identity;
- canonical host and host digest;
- current scope, region and demanded source role;
- required market semantics;
- claim ceiling;
- explicit `UNKNOWN` rights;
- explicit `HOLD` decision;
- complete trace references;
- no collection, public projection or other external side-effect permission.

The canonical runtime routes each event to:

```text
DISCOVERY_APPROVED_DIRECTORY_OUTBOUND_FRONTIER
```

The local SHADOW processor must produce:

```text
SOURCE_DISCOVERED
Decision: HOLD
Rights: UNKNOWN
Network requests: 0
External writes: 0
Collection execution: false
```

That output proves runtime consumption and lineage. It does not prove external content acquisition or market evidence.

## Automatic activation

```text
Relevant protected-main push
or every hour
or successful Intelligence Preparation Wave
or successful Global Any-Site Hourly Pooling v2
        ↓
Restore latest immutable inputs
        ↓
Build twice and compare deterministic replay
        ↓
Validate 192 missions, 960 product work items and 576 lane slots
        ↓
Exercise every emitted event through the aligned SHADOW processor
        ↓
Reject truth-boundary mutations
        ↓
Emit KPMO Receipt and 90-day Artifact
```

Manual dispatch remains recovery or explicit replay only.

## Hard boundaries

```text
Mission Generated ≠ Mission Consumed
Registered Source ≠ Rights-Admitted Source
Source Discovery Request ≠ Collection
Discovery Processor Output ≠ Evidence
Metadata Admission ≠ Market-Event Admission
Source Owner Count ≠ Factual-Origin Independence
Current Sold Transaction ≠ Current Price
Sold Count ≠ Liquidity without Exposure Denominator
Unfilled Lane ≠ Zero
Priority or Assignment ≠ Permission
```

## Downstream work still required

### P1 — Claim-specific source admission

Source-specific discovery and preflight results must satisfy the strict current-sold or liquidity assertion set, including exact rights, sold semantics, freshness, condition, exposure denominator, censoring and failed-sale handling.

### P2 — Owned graph runtime

Admitted entity, evidence and market-event records must be materialized into KIDULTS-owned canonical Entity, Evidence and Market Event Graphs. Event type declarations alone are not implementation.

### P3 — Immutable intelligence pair

A governed graph surface must be compiled into an immutable `snapshot-candidate.json` and `evidence-package.json`, exact-pair hashed, preflighted and handed to Track B.
