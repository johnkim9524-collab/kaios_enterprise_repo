# KIDULTS ASI Owned Source Intelligence Graph v1

**Owner:** KPMO  
**Priority:** P2  
**Direction:** Autonomous → Global → Irreplaceable Value → Transparent

## Purpose

P2 converts the outputs of P0 Mission Consumption and P1 Candidate Preflight into a deterministic KIDULTS-owned source-intelligence graph.

```text
Mission Consumption
        +
Source Candidate Increment
        +
Host Preflight
        +
Candidate Admission Readiness
        ↓
KIDULTS-Owned Source Intelligence Graph
```

The graph compounds knowledge about source identity, discovery lineage, replaceability, host behavior, preflight state, and admission readiness. It does not create a transaction, market event, price observation, liquidity measure, evidence admission, or Snapshot Candidate.

## Canonical graph path

```text
Mission → Source Candidate
Source Candidate → Canonical Host
Source Candidate → Discovery Lane
Source Candidate → Factual-Origin Candidate
Canonical Host → Host Preflight
Source Candidate → Host Preflight
Source Candidate → Admission Readiness
Mission → Scope → Domain
Mission → Region
Mission → Evidence Class
```

## Node types

The graph contains exactly the governed types below:

- `MISSION`
- `SCOPE`
- `DOMAIN`
- `REGION`
- `EVIDENCE_CLASS`
- `SOURCE_CANDIDATE`
- `CANONICAL_HOST`
- `DISCOVERY_LANE`
- `FACTUAL_ORIGIN_CANDIDATE`
- `HOST_PREFLIGHT`
- `ADMISSION_READINESS_STATE`

All node IDs are derived deterministically from node type and canonical key.

## Edge types

- `MISSION_IN_SCOPE`
- `MISSION_IN_REGION`
- `MISSION_REQUIRES_EVIDENCE_CLASS`
- `SCOPE_IN_DOMAIN`
- `MISSION_HAS_SOURCE_CANDIDATE`
- `CANDIDATE_OBSERVED_ON_HOST`
- `CANDIDATE_DISCOVERED_VIA_LANE`
- `CANDIDATE_HAS_FACTUAL_ORIGIN_CANDIDATE`
- `HOST_HAS_PREFLIGHT`
- `CANDIDATE_ASSIGNED_PREFLIGHT`
- `CANDIDATE_HAS_ADMISSION_READINESS`

Canonical relationships such as `SCOPE_IN_DOMAIN` may be referenced by multiple missions. The builder creates one canonical edge and merges all lineage references instead of duplicating or overwriting the edge.

## KIDULTS-owned value

This graph creates internal assets that remain valuable when a provider changes:

- Mission-to-source-candidate lineage;
- Canonical source-host identity;
- Discovery-lane contribution history;
- Candidate factual-origin separation;
- Host-preflight history;
- Candidate admission-readiness history;
- Provider-switching primitives;
- Global scope, region, and evidence-class coverage structure.

External raw data is not treated as the moat. The durable value is the KIDULTS-owned identity, lineage, method, replacement structure, and decision state.

## Integrity controls

The graph is built twice from the exact same immutable P0 and P1 artifacts. Both directories must be byte-identical.

Validation rejects:

- duplicate node or edge IDs;
- invalid edge-to-node references;
- orphan Mission nodes;
- orphan Source Candidate nodes;
- candidate promotion to evidence;
- preflight promotion to admission;
- factual-origin candidate promotion to verified origin;
- forbidden market-event, transaction, price, liquidity, claim, or Snapshot nodes;
- graph or lineage digest mutation;
- manual-only activation.

## Automatic execution

```text
Successful P1 Candidate Preflight run
or relevant main push
or hourly schedule at :52
        ↓
Restore latest main P0 artifact
        ↓
Restore latest main P1 artifact
        ↓
Build graph twice
        ↓
Validate canonical nodes, edges, lineage, quality, and owned value
        ↓
Reject truth-boundary mutations
        ↓
Emit KPMO P2 receipt and 90-day artifact
```

Manual dispatch remains only for recovery or explicit replay.

## Truth boundary

```text
Source Intelligence Graph ≠ Market Evidence Graph
Source Candidate ≠ Evidence
Host Preflight ≠ Admission
Factual-Origin Candidate ≠ Verified Factual Origin
Admission Readiness ≠ Admission
Mission-Candidate Edge ≠ Transaction Lineage
Graph Completeness ≠ Market Coverage Completeness
```
