# Sprint 18-D5 — Dual Portal Quality Certification Runbook

## Purpose

Certify the Kidults Enterprise Portal Beta and Artfund Institutional Portal Beta against the approved Week 4 product, data, luxury, governance, export, desktop, and mobile gates.

## Validation Sequence

1. Run the dual portal quality certification package tests.
2. Run TypeScript checks for the certification package.
3. Confirm Kidults and Artfund portal contracts remain read-only.
4. Confirm Viewer export remains blocked.
5. Confirm Operator and Admin export paths still require governed ready snapshots.
6. Confirm Trust Surface completeness for both verticals.
7. Confirm Artfund provenance-disputed state exists and blocks display/export.
8. Confirm 320 px no-horizontal-overflow requirement remains explicit.
9. Confirm illustrative staging values remain labelled.
10. Confirm no Production promotion is included.

## Commands

```bash
pnpm --filter @kaios/dual-portal-quality-certification test
pnpm --filter @kaios/dual-portal-quality-certification check
```

## Expected Result

- Tests pass.
- TypeScript check passes.
- Kidults certification result is `pass`.
- Artfund certification result is `pass`.
- Dual gate result is `pass`.
- `week5Authorized` is `true`.

## Failure Handling

Any blocker fails the gate. The system must not average away a mandatory failure. Examples:

- Product Quality below 90
- Data Trust below 90
- Luxury Brand Fit below 95
- Horizontal overflow at 320 px
- Missing Trust Surface
- Viewer export enabled
- Missing rights-restricted state
- Missing Artfund provenance-disputed state
- Governed export not ready

## Promotion Boundary

This certification authorizes Week 5 staging development only. It does not authorize:

- Kidults Production database changes
- Public release of staging values
- Artfund Production-readiness claims
- Write APIs
- Ungoverned exports
