# Sprint 18-F1 — Dual Release Candidate Packaging

## Objective

Package the certified Week 1–5 contracts, engines, portals and autonomous publication controls into one staging-only release candidate.

## Packaging Sequence

1. Verify main is clean and current.
2. Validate all Week 1–5 machine-readable gate files.
3. Validate migration ordering from `0001` through `0009`.
4. Create the release manifest and deployment bundle.
5. Validate the environment contract and safe default flags.
6. Validate rollback units and artifact checksums.
7. Generate release notes.
8. Run contract, TypeScript and smoke checks.
9. Authorize staging deployment only.

## Required Smoke Matrix

- unauthenticated portal API returns 401
- Viewer read succeeds and export fails
- Operator/Admin governed export succeeds only for ready snapshots
- Kidults and Artfund failures remain isolated
- reports, alerts and indices remain disabled until explicit enablement
- mobile portal has no horizontal overflow at 320px
- rollback package restores the previous healthy artifact

## Exit Criteria

- deterministic manifest and bundle IDs
- every artifact has a checksum or immutable source reference
- environment defaults fail closed
- staging rollback is independently executable
- production promotion remains unauthorized
