# KIDULTS ASI P0B Bounded Discovery Candidates v1

**Owner:** KPMO  
**Priority:** P0  
**Execution:** Exact Source Fabric artifact consumption and candidate derivation  
**Direction:** Autonomous → Global → Irreplaceable Value → Transparent

## Purpose

P0B converts the P0 mission queue plus the exact protected-main Source Fabric discovery artifact into KIDULTS-owned source candidates. It does **not** issue OpenAlex, GDELT, or other provider requests itself.

The Source Fabric workflow is the sole provider-budget authority for this lane. P0B is an artifact consumer: it validates the exact producer run, source SHA, runtime event class, artifact identity, digest and archive safety before deriving candidates.

## Execution chain

```text
Source Fabric Scale PI1
(schedule / workflow_dispatch / protected-main push)
        ↓
Exact successful protected-main run
        ↓
Exact run-bound Source Fabric artifact
+ digest / archive integrity validation
        ↓
P0B rebuilds the P0 mission task queue
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

P0B has no independent schedule or protected-main push provider lane. Normal autonomous activation is the successful `KIDULTS ASI Source Fabric Scale PI1` `workflow_run`; manual dispatch is recovery only and must restore an exact current-main Source Fabric artifact.

## Provider-budget boundary

```text
Source Fabric = provider request authority
P0B          = exact artifact consumer
P1           = exact P0B artifact consumer
```

This prevents the same OpenAlex/GDELT provider budget from being spent independently by multiple downstream stages while preserving the downstream candidate pipeline.

For P0B, all of the following are invariant:

- `provider_requests_issued_by_p0b = 0`;
- `provider_execution_authority = false`;
- Source Fabric run is repository/path/name/main/SHA/event bound;
- `pull_request` Source Fabric runs are not runtime authority;
- artifact must be unique, unexpired, run/SHA-bound and SHA-256 digest-bound;
- archive limits and digest are checked before extraction;
- Production/Public/G5 remain `HOLD`.

## Candidate binding

Each mission may receive up to three candidates:

1. Primary candidate;
2. Independent fallback candidate;
3. Factual-origin replacement candidate for investigation.

The third slot never proves factual-origin independence. A different hostname or discovery provider is not automatically a different factual origin.

Exact regional hints are preferred. Unknown or global hints may remain candidate inputs, but they do not count as proven regional coverage.

## What this stage proves

- an exact governed Source Fabric artifact was consumed;
- canonical HTTP(S) source candidates were derived from that artifact;
- duplicate endpoint observations were superseded deterministically;
- mission candidate coverage and gaps were measured;
- host and discovery-provider diversity were measured;
- source-candidate lineage is reproducible from the Source Fabric artifact/run/digest lineage;
- P0B itself issued no provider request.

## What this stage does not prove

- target-site body collection;
- target-content acquisition;
- rights to collect or derive from the target site;
- source-owner or factual-origin independence;
- regional market coverage;
- market-semantic relevance;
- evidence admission;
- a market claim;
- Public, Production or G5 eligibility.

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
Source Fabric Observation ≠ Target-Site Collection
Source Candidate ≠ Evidence
Scope Hint ≠ Proven Relevance
Region Hint ≠ Regional Coverage
Distinct Host ≠ Distinct Factual Origin
Discovery Provider ≠ Factual Origin
Candidate Binding ≠ Admission
```
