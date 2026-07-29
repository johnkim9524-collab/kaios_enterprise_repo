# Sprint 18-C3 — Entity Resolution Foundation

## Objective

Create the deterministic identity-resolution layer that converts source candidates into canonical Kidults and Artfund entities while preserving alias history, duplicate suppression, merge/split auditability, evidence references, and vertical isolation.

## Scope

- Canonical entity and candidate contracts
- Alias normalization and matching
- External identifier matching
- Parent-context scoring
- Deterministic candidate ranking
- Duplicate candidate suppression
- Merge and split audit records
- Entity redirect foundation
- Kidults product-resolution profile
- Artfund artist/artwork-resolution profile

## Resolution Decision Model

| Decision | Meaning |
|---|---|
| `match` | Candidate may attach to an existing canonical entity |
| `review` | Evidence is plausible but requires operator review |
| `create` | Candidate is materially distinct and may create a new entity |
| `reject` | Candidate is inconsistent or insufficient |

Default thresholds:

- Auto-match: 90
- Manual review: 70
- Duplicate suppression: 95

An exact approved external-identifier match produces score 100. Name-only matching never bypasses vertical, entity-type, parent-context, rights, confidence, or provenance controls.

## Kidults Resolution Priorities

1. Official maker SKU, UPC, EAN, or canonical product URL
2. Brand and product-line context
3. Product, edition, variant, and reissue boundaries
4. Alias and symbol normalization such as `BE@RBRICK`
5. Manual review for edition/variant or original/reissue conflicts

## Artfund Resolution Priorities

1. Artist authority identifier, catalogue raisonné identifier, institution accession identifier, or auction lot URL
2. Artist, title, year, medium, dimensions, and edition context
3. Artwork versus object-instance separation
4. Provenance-chain compatibility
5. Manual review for attribution, workshop, edition, instance, or provenance disputes

## Merge Control

A merge must:

- identify one surviving canonical entity;
- preserve all aliases and evidence references;
- create an immutable audit record;
- create redirects from retired IDs;
- never silently rewrite published historical observations;
- require operator or admin approval when commercial outputs were previously published.

## Split Control

A split must:

- produce two or more resulting canonical entities;
- identify the conflated dimensions;
- preserve original audit history;
- re-evaluate observations, scores, indices, reports, and portal surfaces;
- trigger restatement review when historical products were affected.

## Failure and Safety Rules

- Cross-vertical matching is prohibited.
- Cross-entity-type matching is prohibited.
- Unknown rights remain commercially blocked.
- Confidence below 70 remains blocked from premium surfaces.
- Disputed Artfund provenance remains commercially blocked.
- Candidate ambiguity is routed to review rather than forced to match.
- Merge and split actions are never destructive deletes.

## Staging Verification

Run package tests and TypeScript checks. Apply the staging migration only to isolated staging databases. Verify:

- alias uniqueness;
- score bounds;
- deterministic pagination and ranking;
- duplicate suppression;
- merge/split audit constraints;
- redirect integrity;
- Kidults Production remains unchanged.

## Promotion Gate

This Sprint authorizes the entity-resolution foundation only. It does not authorize automatic Production merges, public release, destructive migration, or Artfund Production readiness.
