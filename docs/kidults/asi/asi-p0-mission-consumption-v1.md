# KIDULTS ASI P0 Mission Consumption v1

**Owner:** KPMO  
**Priority:** P0  
**Execution state:** Machine-consumable SHADOW discovery task generation  
**Direction:** Autonomous → Global → Irreplaceable Value → Transparent

## Purpose

This stage consumes the 192 missions produced by the ASI Intelligence Preparation Wave. It replaces manual mission-by-mission routing with deterministic assignment to the current runtime-registered Source Discovery fleets.

It is the first execution stage after Unknown Registry, Intelligence Gap Engine, and Autonomous Mission Generator.

## Execution chain

```text
192 Autonomous Missions
        ↓
P0 Mission Consumer
        ↓
3 independent discovery lane tasks per mission
        ↓
576 SOURCE_DISCOVERY_REQUESTED events
        ↓
Runtime event validation
        ↓
Four-principle engine-alignment preflight
        ↓
Per-task alignment receipts
        ↓
P0 Mission Consumption Ledger and KPMO Receipt
```

## Three required lanes

Every mission is consumed into exactly three tasks:

1. `PRIMARY_CANDIDATE_LANE`
2. `INDEPENDENT_FALLBACK_LANE`
3. `FACTUAL_ORIGIN_REPLACEMENT_LANE`

This creates 576 tasks from 192 missions. The third lane is explicitly a demand for a distinct factual origin; a different hostname is not automatically treated as an independent factual origin.

## Runtime routing

Tasks are deterministically assigned to 11 currently registered, non-licensed Source Discovery fleets. The optional licensed gap-fill fleet remains reserved and receives zero tasks unless explicit authority is granted.

The mission payload does not select a provider or bypass canonical routing. The target fleet exists only in the Queue task envelope and is checked against the runtime registry.

## Runtime preflight

Every generated event is checked by the actual ASI runtime modules:

- `validateAsiEvent`
- `assertAsiEventPayloadHash`
- `assertAsiExecutionAlignment`

The runtime preflight verifies:

- registered Discovery fleet and Logical Engine binding;
- complete global partition: channel, region, language, scope, source role, frontier identity;
- no provider-direct path to truth, index, or projection;
- no collection, admission, or market-claim permission;
- versioned snapshot, payload hash, rights, freshness, reason codes, and trace references.

## Automatic activation

```text
Relevant protected-main push
or hourly schedule at minute 17
or successful ASI Intelligence Preparation Wave
        ↓
Regenerate current mission queue
        ↓
Consume 192 missions
        ↓
Generate 576 tasks
        ↓
Run 576 runtime alignment preflights
        ↓
Mutation rejection
        ↓
KPMO Receipt and Artifact
```

Manual dispatch remains only for recovery or explicit replay.

## Truth boundary

This stage proves mission consumption and runtime-preflighted discovery-task generation.

It does not yet prove:

- external network discovery execution;
- observed source candidates;
- source-owner or factual-origin independence;
- collection rights;
- evidence admission;
- market claims.

The next stage is `P0B_BOUNDED_DISCOVERY_EXECUTION_AND_SOURCE_CANDIDATE_INCREMENT`.

```text
Mission Consumed ≠ Source Discovered
Discovery Task ≠ Source Candidate
Source Candidate ≠ Evidence
Discovery ≠ Collection
Collection ≠ Admission
Admission ≠ Claim
Host ≠ Factual Origin unless proven
Priority ≠ Permission
```
