# Sprint 18-D4 Export and Portal QA Runbook

## Objective

Complete the governed export foundation and final desktop/mobile quality contract for the Week 4 dual luxury portal MVP.

## Validation Order

1. Run TypeScript checks for `@kaios/portal-export-pipeline`.
2. Run export contract tests.
3. Verify Viewer export denial.
4. Verify Operator and Admin export only for `ready` governed snapshots.
5. Verify CSV column and checksum determinism.
6. Verify JSON export contains Trust Surface and manifest.
7. Verify PDF contract includes methodology, evidence, rights, freshness, and provenance appendices.
8. Verify Kidults and Artfund portal state matrices.
9. Verify 320, 375, 390, 768, 1024, and 1440 px layouts.
10. Verify touch targets, focus states, reduced motion, and no horizontal overflow.

## Required Failure Tests

- unauthenticated
- viewer export attempt
- empty record set
- unknown rights
- restricted rights
- confidence below 70
- zero evidence
- missing methodology
- stale and expired snapshot
- disputed Artfund provenance
- repository unavailable

## Expected Outcomes

- blocked requests return explicit reasons
- no prohibited export artifact is produced
- deterministic requests produce identical manifests and checksums
- one vertical failure does not affect the other vertical
- staging labels remain visible

## Safety Constraints

- No Kidults Production database change.
- No Artfund Production-readiness claim.
- No public release of illustrative staging values.
- No write API.
- No export bypass for Admin.

## Next Gate

After merge, Sprint 18-D5 performs integrated dual-portal QA, records final scores, certifies Week 4, and authorizes Week 5 autonomous reports and alerts.
