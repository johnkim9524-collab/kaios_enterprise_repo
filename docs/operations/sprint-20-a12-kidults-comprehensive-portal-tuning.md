# Sprint 20-A12 — Kidults Comprehensive Portal Tuning

## Objective

Complete one coordinated visual tuning pass across the Kidults staging portal after functional integration, while preserving all data bindings, archive behavior, conversion flows and production isolation.

## Delivered in this branch

- One canonical `portal-shell.css` for header, navigation and footer geometry
- Identical navigation labels, order, spacing and interaction across main, Methodology and Status
- Stable scrollbar gutter to prevent page-width movement between routes
- No active-page color, underline, transform or transition differences
- Shared A12 color tokens and surface hierarchy
- Improved copy, button, card, form and metadata contrast
- Rebalanced Hero, section spacing and card density
- Dark-green Methodology surfaces aligned with the main portal
- Clearer Status metrics, alerts and governance surfaces
- Desktop, tablet, 360 px and 320 px responsive safeguards
- Reduced-motion support
- Automated portal visual-contract tests

## Preserved behavior

- Kidult 100 JSON binding
- Monthly Intelligence binding
- Archive search and filtering
- Quality Status binding
- Newsletter, waitlist and inquiry submission behavior
- Consent, honeypot and validation behavior
- V22 CULTURE Hero treatment

## Validation commands

```bash
node --test apps/kidults-enterprise-staging/a12-portal-shell.test.mjs
node --test apps/kidults-enterprise-staging/a12-portal-visual-contract.test.mjs
node --test apps/kidults-enterprise-staging/a9-bindings.test.mjs
node --test apps/kidults-enterprise-staging/server.test.mjs
node --check apps/kidults-enterprise-staging/public/assets/app.js
node --check apps/kidults-enterprise-staging/public/assets/quality-status.js
```

## Staging browser review

Review these routes after deployment:

```text
http://127.0.0.1:4173/
http://127.0.0.1:4173/methodology.html
http://127.0.0.1:4173/operations.html
```

Required viewport checks:

- Desktop 1440 px
- Tablet 900 px
- Mobile 360 px
- Mobile 320 px

## Release boundary

This sprint changes staging presentation only. Production application, database, DNS, reverse proxy and deployment authorization remain untouched.

## Current gate

Functional integration remains intact. Final staging visual review and CI completion are required before closing A12 and issuing the executive sprint report.
