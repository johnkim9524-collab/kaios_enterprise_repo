# KIDULTS ASI P0B Bounded Discovery Candidates v1

**Owner:** KPMO  
**Priority:** P0  
**Execution:** Bounded live public-metadata discovery  
**Direction:** Autonomous → Global → Irreplaceable Value → Transparent

## Purpose

P0B takes the 576 runtime-preflighted discovery tasks from P0 and executes four live public-metadata scope rotations through the existing OpenAlex and GDELT discovery lanes.

Observed HTTP(S) endpoints are canonicalized and deduplicated into a KIDULTS-owned Source Candidate Registry. Candidates are then bound to the 192 missions by exact scope hint while regional relevance and factual-origin independence remain explicit unresolved gates.

## Execution chain

```text
192 Missions / 576 P0 Discovery Tasks
        ↓
Four governed scope rotations
        ↓
OpenAlex public metadata discovery
+
GDELT public metadata discovery
        ↓
Source Fabric merge and validation
        ↓
Canonical endpoint and host normalization
        ↓
Source Candidate Registry
        ↓
Mission candidate binding
        ↓
Candidate Gap Register
        ↓
Provider / Host Diversity Report
        ↓
KPMO Receipt and Artifact
```

## Candidate binding

Each mission may receive up to three candidates:

1. Primary candidate;
2. Independent fallback candidate;
3. Factual-origin replacement candidate for investigation.

The third slot never proves factual-origin independence. A different hostname or discovery provider is not automatically a different factual origin.

Exact regional hints are preferred. Unknown or global hints may remain candidate inputs, but they do not count as proven regional coverage.

## What this stage proves

- bounded public-metadata network discovery was executed;
- at least one live lane returned results;
- canonical HTTP(S) source candidates were observed;
- duplicate endpoint observations were superseded deterministically;
- mission candidate coverage and gaps were measured;
- host and discovery-provider diversity were measured;
- source-candidate lineage is reproducible from the source-fabric digest.

## What this stage does not prove

- target-site body collection;
- target-content acquisition;
- rights to collect or derive from the target site;
- source-owner or factual-origin independence;
- regional market coverage;
- market-semantic relevance;
- evidence admission;
- a market claim.

## Automatic activation

```text
Relevant protected-main push
or hourly schedule at minute 37
or successful P0 Mission Consumption run
        ↓
Rebuild P0 mission queue
        ↓
Execute four public-metadata discovery rotations
        ↓
Build and validate candidate outputs
        ↓
Reject overclaim mutations
        ↓
Emit KPMO Receipt and 90-day Artifact
```

Manual dispatch remains only for recovery or explicit replay.

## Next stage

The next stage is P1 Source Classification and Evidence Admission Preflight:

```text
Source Candidate
        ↓
Owner / Factual-Origin Classification
        ↓
Purpose-Specific Rights Preflight
        ↓
Market-Semantic Relevance
        ↓
Technical Access / Schema Risk
        ↓
Gate 1 Source Safety
        ↓
Evidence Admission Candidate
```

```text
Public Metadata Discovery ≠ Target-Site Collection
Source Candidate ≠ Evidence
Scope Hint ≠ Proven Relevance
Region Hint ≠ Regional Coverage
Distinct Host ≠ Distinct Factual Origin
Discovery Provider ≠ Factual Origin
Candidate Binding ≠ Admission
```
