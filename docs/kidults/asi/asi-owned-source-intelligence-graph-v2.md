# KIDULTS ASI Owned Source Intelligence Graph v2

**Owner:** KPMO  
**Priority:** P2  
**State after merge:** Automatic deterministic SHADOW execution  
**Direction:** Autonomous → Global → Irreplaceable Value → Transparent

## Executed chain

```text
P0B Bounded Discovery Candidates
        +
P1 Source Classification / Qualification / Gate 1 / Admission-Candidate Preparation
        ↓
KIDULTS-owned Source Intelligence Graph
        ↓
Immutable Lineage + Graph Quality + Owned-Value Receipt
```

The v2 compiler consumes the current merged P0B and P1 artifacts. It replaces the stale v1 draft dependency on artifact names that never landed on protected main.

## Graph model

The graph contains **13 node types**:

```text
MISSION
SCOPE
DOMAIN
REGION
EVIDENCE_CLASS
SOURCE_CANDIDATE
CANONICAL_HOST
DISCOVERY_PROVIDER
FACTUAL_ORIGIN_CANDIDATE
GATE1_DECISION
ADMISSION_CANDIDATE
PREFLIGHT_ACTION
ACTION_TYPE
```

It contains **14 edge types** connecting missions to scopes, regions, evidence classes and candidates; candidates to hosts, discovery providers and factual-origin candidates; and candidates/missions to Gate 1 decisions, admission candidates and preflight actions.

## Current verified baseline

The exact bounded current-main input pair selected in workflow run `32636028997` produced:

```text
2,774 nodes
6,278 edges
192 missions
482 source candidates
111 canonical hosts
2 discovery providers
576 Gate 1 decisions
576 admission candidates
672 preflight actions
224 provider-switching primitives
```

Input artifacts:

```text
P0B artifact 9492109965
P1 artifact 9492137364
```

Graph digest:

```text
sha256:12887e716c8c091de033c8336f4aa0cced327c2af1b0d4b58eb1159df2660fb8
```

The totals are derived from the current immutable P0B and P1 inputs and validated rather than used as a permanent source-count completion target.

## Owned value

The output compounds KIDULTS-owned value in:

- mission-to-source-candidate lineage;
- canonical source-host identity;
- discovery-provider contribution;
- factual-origin candidate separation;
- Gate 1 decision history;
- admission-candidate readiness;
- preflight-action dependencies;
- provider-switching primitives;
- global scope × region × evidence-class structure.

External raw data is not treated as the moat. The graph structure, canonical identities, lineage, decision history and switching layer are KIDULTS-owned assets.

## Truth boundaries

```text
Source Candidate ≠ Evidence
Gate 1 HOLD ≠ Admission
Admission Candidate ≠ Admitted Evidence
Preflight Action ≠ Collection Authority
Factual-Origin Candidate ≠ Verified Factual Origin
Source Intelligence Graph ≠ Market Evidence Graph
```

The graph creates no market event, sold transaction, price observation, liquidity measure, evidence admission, Snapshot Candidate, Track B input, or customer claim.

## Automatic continuation

```text
Successful P1 run
        ↓
Restore P0B and P1 from that one immutable P1 artifact
        ↓
Build twice
        ↓
Byte-identical replay proof
        ↓
Graph validation and adversarial mutations
        ↓
KPMO P2 receipt and 90-day artifact
```

Manual dispatch remains only for recovery or explicit replay.

The P1 artifact contains both the P0B materialization rebuilt during that P1 run and the P1 outputs derived from it. P2 therefore never combines independently selected P0B and P1 artifacts. Relevant P2/P3 protected-main changes are routed through the P1 producer, and the successful P1 `workflow_run` is the only automatic P2 activation path.

## Completion state

`P2_OWNED_SOURCE_INTELLIGENCE_GRAPH_VERIFIED` means the source-intelligence graph, lineage, integrity and owned-value increment are verified for the exact bounded input pair. It does not mean that market evidence or a Snapshot Candidate exists.
