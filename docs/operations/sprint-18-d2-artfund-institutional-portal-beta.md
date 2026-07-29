# Sprint 18-D2 — Artfund Institutional Portal Beta Runbook

## Objective

Operate and validate the first Artfund institutional portal beta without making a Production-readiness claim.

## Validation Order

1. Run package tests.
2. Run TypeScript checks.
3. Validate authenticated read-only API contracts.
4. Validate rights, confidence, methodology, freshness, and provenance gates.
5. Render the portal at 1440, 1024, 768, 390, 360, and 320 px widths.
6. Confirm no horizontal overflow.
7. Confirm loading, empty, partial, degraded, unauthorized, rights-restricted, provenance-disputed, and error states.
8. Confirm all staging values are labelled illustrative.

## Product Quality Gates

- Product Quality Score: at least 90
- Data Trust Score: at least 90
- Luxury Brand Fit: at least 95
- Mobile parity: pass
- Evidence visibility: pass
- Provenance visibility: pass

## Safety Constraints

- No write API.
- No public release.
- No customer export.
- No Artfund Production-readiness claim.
- Unknown or restricted rights fail closed.
- Confidence below 70 fails closed.
- Disputed provenance fails closed.

## Promotion Requirement

Promotion beyond staging requires authenticated smoke tests, real staging repositories, product-quality certification, and a separate release gate.
