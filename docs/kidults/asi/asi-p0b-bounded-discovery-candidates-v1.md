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
Hourly natural schedule at minute 37
(manual workflow_dispatch is recovery only, never natural proof)
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


## Exact-main natural trigger closure (2026-09-28)

The natural producer root is P0B's existing hourly schedule. Its in-job P0 mission queue rebuild is retained. P1 has no independent schedule. The complete route is:

`P0B(schedule) -> P1(workflow_run) -> ARL(workflow_run) -> Requirement Coverage(workflow_run)`

GitHub limits consecutive workflow_run continuations to three levels after the root event. The former P0 Mission -> P0B workflow_run edge consumed an extra level and suppressed Coverage after a successful ARL. This is an execution-topology defect, not a reason to dispatch a manual Coverage producer or weaken provenance. Reference: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run

At main 5266a4a53bb4d13de20aea264637633a39a2d99b, P0 Mission schedule run 36354709812, P0B workflow_run 36354767001, P1 workflow_run 36354915258, and ARL workflow_run 36354947378 were successful while the exact-SHA Coverage run index was empty. These are intermediate observations, not terminal natural-chain proof.

The deterministic SHADOW producer now runs on every protected-main push, retaining its existing pull-request filter, daily schedule, contents-read permission and all non-Production assertions. A main change outside its former path filter otherwise left the exact-SHA Sentinel waiting for the next daily SHADOW generation. No producer output, semantic validator, artifact digest requirement, provider right, runtime activation or promotion gate is relaxed.

The activation-estate validator binds the P0B schedule root, exact P1/ARL/Coverage upstream names, protected-main completed-event boundaries, the three-level budget and unfiltered protected-main SHADOW push. Six adversarial mutations cover missing roots, excessive depth, a redundant P1 schedule, wrong upstream identity, wrong branch and delayed SHADOW generation. The cancellation-watch validator separately rejects over-depth roots and an unbounded producer event guard.

Manual workflow_dispatch remains recovery only and is never natural-producer evidence. Sharded Reserve must still obtain its own schedule/workflow_run evidence; its Coverage-triggered manual recovery is excluded. KIR continuation consumption, exact-SHA REQUIREMENT/RESERVE health, semantic Continuous Assurance and terminal receipts remain mandatory. PR checks, local tests, a successful merge, or structural push Assurance cannot close the incident. Production/Public/G5 remain HOLD.
