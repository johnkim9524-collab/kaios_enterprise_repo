# KIDULTS Source Trust Methodology v1

**Methodology ID:** `source-trust-methodology-v1`  
**Status:** `DRAFT_FOR_TRACK_B_VALIDATION`  
**Owner:** Track A  
**Independent validator:** Track B  
**Effective:** 2026-08-16

## Principle

```text
AUTONOMOUS is the operating model.
TRUST is the governing constraint.
EVIDENCE is the unit of intelligence.
```

A high volume from one source never substitutes for independent corroboration.
The score is a source-selection and risk-management aid; it is not a claim that
all records from a source are correct.

## Weighted score

| Dimension | Weight |
|---|---:|
| Authority | 25 |
| Provenance quality | 20 |
| Independence | 15 |
| Rights clarity | 10 |
| Freshness | 10 |
| Historical depth | 10 |
| Schema stability | 5 |
| Cross-source corroboration | 5 |

Each dimension is measured from `0–100`. The weighted score is rounded to the
nearest whole number after penalties.

## Penalties

- unverifiable source identity: `-20`
- unresolved contradiction rate above 5%: `-15`
- duplicate contamination above 1%: `-10`
- stale-data acceptance: `-20`
- unclear or prohibited commercial rights: no publication, regardless of score
- missing provenance on a critical fact: evidence is rejected

## Provisional bands

| Score | Band | Allowed use |
|---:|---|---|
| 90–100 | A | Candidate evidence after rights and record-level validation |
| 80–89 | B | Candidate evidence with independent corroboration |
| 70–79 | C | Signal or supporting evidence only |
| 50–69 | D | Discovery lead only |
| <50 | Reject | Quarantine or exclude |

All R1 scores are `PROVISIONAL_NOT_TRACK_B_VALIDATED`.

## Source tiers

- **Tier 1:** primary manufacturer, museum, grading authority, regulator or
  authoritative archive.
- **Tier 2:** specialist auction house, licensed market-data provider or
  structured marketplace with defensible transaction evidence.
- **Tier 3:** professional community, specialist publication or expert forum.
- **Tier 4:** attention and early-signal sources such as search, social or news.

Tier is not a substitute for score. A Tier 1 source can be stale or rights-limited;
a Tier 2 source can provide stronger current-market evidence.

## Autonomous gate

The discovery agent may propose a source and calculate a provisional score. It
may not activate collection until all of the following are recorded:

1. official source identity;
2. permitted access mode;
3. robots / rate-limit / terms review;
4. rights state;
5. sample schema and record lineage;
6. credential location outside Registry;
7. bounded retry, circuit breaker and quarantine policy.

Paid commitment, contract, legal acceptance and Production activation require
John / KPMO approval.
