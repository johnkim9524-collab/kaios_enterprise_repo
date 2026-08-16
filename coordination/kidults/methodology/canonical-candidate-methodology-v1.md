# Canonical Candidate Methodology v1

**ID:** `canonical-candidate-methodology-v1`  
**Status:** REGISTERED FOR INTERNAL VALIDATION  
**Effective:** 2026-08-16  
**Owner:** Track A

## Purpose

Create an immutable Candidate early enough to validate the governed Track A → Track B → Portal pipeline without fabricating market intelligence.

## Rules

1. Evidence precedes every metric.
2. Unsupported values are `null` with status `NOT_VERIFIED`; they are never converted to zero.
3. All eight Core Verticals must be present, even when seven remain blocked.
4. Authority metadata may support identity and collection provenance, but not demand, scarcity, valuation, liquidity or confidence by itself.
5. Physical-object identity and canonical-design identity are separate.
6. The provider-independent baseline is immutable.
7. The Candidate must bind one exact Evidence Package and one exact Signal Package.
8. Internal Candidate creation does not imply rankability, publication or Production eligibility.
9. Track B receives only the immutable Candidate and its referenced Evidence Package.
10. Any correction creates a new snapshot ID.

## Candidate Classes

- `STRUCTURAL_VALIDATION_CANDIDATE`
- `RANKABILITY_CANDIDATE`
- `PUBLICATION_CANDIDATE`

This version authorizes only the first class.
