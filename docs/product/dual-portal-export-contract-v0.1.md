# Dual Portal Export Contract v0.1

## Scope

This contract governs CSV, JSON, and PDF exports from the Kidults Enterprise Portal Beta and Artfund Institutional Portal Beta.

## Authorization

- Viewer: read only; export prohibited.
- Operator: export allowed only for a governed `ready` snapshot.
- Admin: same data-quality gates as Operator; no bypass of rights, evidence, methodology, freshness, confidence, or provenance controls.

## Required Export Manifest

Every export must include:

- vertical
- format
- generated timestamp
- record count
- methodology IDs and versions
- source coverage
- evidence count
- rights status
- deterministic checksum
- required attachment checksums

## Mandatory Attachments

1. `methodology.json`
2. `evidence-manifest.json`
3. `rights-manifest.json`

Artfund exports additionally expose provenance completeness and dispute status in the exported Trust Surface.

## Fail-Closed Rules

Export is blocked when any of the following is true:

- unauthenticated or Viewer role
- no records
- rights are not approved
- confidence is below 70
- evidence count is zero
- methodology is absent or not approved
- freshness is stale or expired
- Artfund provenance is disputed

## Format Rules

### CSV

- deterministic alphabetical column ordering
- UTF-8
- RFC-style quoted values
- nested values serialized deterministically

### JSON

- canonical field names
- stable ordering before checksum generation
- embedded Trust Surface and export manifest

### PDF

- executive cover and vertical identity
- visible `Staging`, `Beta`, or `Production` designation
- methodology, evidence, rights, freshness, and provenance appendix
- no unexplained score or index value

## Production Constraint

This contract authorizes staging implementation only. It does not authorize public release, commercial redistribution, or production promotion.
