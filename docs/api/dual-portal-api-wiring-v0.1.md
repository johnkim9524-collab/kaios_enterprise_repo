# Dual Portal API Wiring v0.1

## Objective

Connect the Kidults Enterprise Portal Beta and Artfund Institutional Portal Beta to governed staging score and index repositories.

## Read Surfaces

- Kidults enterprise snapshot
- Artfund institutional snapshot
- Vertical score collection
- Vertical index collection
- Export eligibility manifest

## Access Model

Authenticated Viewer, Operator, and Admin roles may read governed snapshots. Export eligibility is limited to Operator and Admin roles.

## Visibility Requirements

Customer display requires approved rights, approved or active methodology, confidence of at least 70, at least one evidence item, and non-expired freshness. Artfund records with disputed provenance remain blocked.

## Repository Inputs

- methodology-versioned scores
- daily indices
- rights status
- evidence count
- source coverage
- confidence
- freshness
- provenance dispute state

## Portal States

`loading`, `ready`, `empty`, `partial`, `degraded`, `unauthorized`, `rights_restricted`, `provenance_disputed`, and `error`.

## Export Manifest

An eligible export records the vertical, generation time, format, methodology identifiers, evidence count, source coverage, approved rights state, and checksum.

## Constraints

No write interface is included. Kidults Production remains unchanged. Artfund Production readiness is not claimed. Illustrative staging values remain non-public.
