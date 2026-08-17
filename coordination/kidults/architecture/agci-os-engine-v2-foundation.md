# AGCI-OS Engine v2 Foundation

**Canonical Mission:** `MISSION-ARCH-0001`  
**Architecture Issue:** `#300`  
**Status:** FOUNDATION PREFLIGHT PASS  
**First Value:** `AUTONOMOUS`  
**Production:** HOLD

## Purpose

Engine v2 converts the approved Registry v2 architecture into an executable, deterministic and fail-closed operating pipeline.

```text
Observe
→ Collect
→ Raw Quarantine
→ Normalize
→ Resolve Entities
→ Validate Rights / Provenance / Freshness
→ Build Evidence Graph
→ Build Market Graph
→ Discover Clusters
→ Assess
→ Generate Indexes
→ Project
→ Monitor / Recover / Learn
```

## Foundation Preflight Boundary

The first Engine run is a `CONTRACT_TEST_FIXTURE_ONLY` preflight. It is not market Evidence, does not enter the Global Universe, does not create an approved Dynamic Vertical and does not calculate a Vertical Intelligence Index, KIDULT 500 or KIDULT 100.

The fixture exists only to prove that the Engine:

- isolates duplicate, stale, rights-missing and provenance-missing records;
- distinguishes listings from sold transactions;
- refuses automatic entity merges when identity claims conflict;
- builds deterministic Evidence Graph and Market Graph summaries;
- may discover a test-only cluster but cannot promote it publicly;
- keeps all Index outputs `NOT_COMPUTED` when Evidence and approval gates are absent;
- projects only governed, fail-closed state to Portal consumers;
- performs no Production mutation.

## Engine State Machine

```text
IDLE
→ OBSERVING
→ COLLECTING
→ QUARANTINING
→ NORMALIZING
→ RESOLVING_ENTITIES
→ VALIDATING
→ BUILDING_EVIDENCE_GRAPH
→ BUILDING_MARKET_GRAPH
→ DISCOVERING_CLUSTERS
→ ASSESSING
→ GENERATING_INDEXES
→ PROJECTING
→ MONITORING
→ RECOVERING
→ LEARNING
```

## Non-Negotiable Invariants

```text
Missing → zero                       PROHIBITED
Provider → Portal                    PROHIBITED
Provider → Index                     PROHIBITED
Listing = Sold Transaction           FALSE
Provider ID = Canonical ID           FALSE
Autonomous public Vertical promotion PROHIBITED
Unsupported metric fabrication       PROHIBITED
Production mutation                  PROHIBITED
```

## Human Gates

Human approval remains mandatory for Provider contracts and spend, rights and commercial use, Dynamic Vertical promotion, public publication, Production authorization, destructive infrastructure changes and residual-risk acceptance.

## Next Live Gate

The next Engine phase replaces the contract fixture with bounded, rights-explicit Shadow ingestion. A live run may enter the Global Universe only after source terms, schema, provenance, freshness and entity-resolution gates pass. Public Index computation remains separately gated by Track B and Founder/KPMO approval.
