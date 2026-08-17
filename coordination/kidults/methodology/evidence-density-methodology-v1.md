# KIDULTS Evidence Density Methodology v1

**Methodology ID:** `evidence-density-methodology-v1`  
**Status:** `DRAFT_FOR_TRACK_B_VALIDATION`  
**Owner:** Track A  
**Independent validator:** Track B

## Purpose

Evidence Density measures whether a small final intelligence output is supported
by a sufficiently large, diverse and well-resolved observation base.

## Object-level score

| Component | Weight |
|---|---:|
| Authority-weighted unique evidence | 25 |
| Independent source-family diversity | 20 |
| Provenance completeness | 20 |
| Freshness fitness | 15 |
| Entity-resolution certainty | 10 |
| Contradiction resolution | 10 |

## Required raw-base principle

A publishable object result must be the product of many observations, not one
headline record. The first Golden Dataset pilot uses these minimums:

```text
Raw observations per object         ≥ 40 target, ≥ 20 floor
Independent source families         ≥ 4
Tier 1 or Tier 2 sources             ≥ 2
Critical provenance completeness    100%
Unresolved critical contradictions  0
Duplicate contamination             < 1%
Entity resolution certainty         ≥ 0.99
```

## Evidence classes

- `PRIMARY_AUTHORITY`
- `MARKET_TRANSACTION`
- `AUTHENTICATION_CONDITION`
- `PROVENANCE_EVENT`
- `CULTURAL_ATTENTION`
- `SUPPORTING_CONTEXT`

Multiple pages from the same organization and same underlying dataset count as
one source family unless demonstrably independent.

## Candidate gate

- `EDS ≥ 85`: eligible for Track A Candidate, subject to all other gates.
- `EDS 70–84`: conditional; limitations must be explicit.
- `EDS 50–69`: research only.
- `EDS < 50`: not eligible.

Track B must reproduce the score, remove the strongest source, test sensitivity,
and confirm that stale or duplicated evidence is rejected.
