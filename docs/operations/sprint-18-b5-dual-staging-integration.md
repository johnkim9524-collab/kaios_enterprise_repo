# Sprint 18-B5 — Dual Staging Integration Runbook

## Objective

Integrate the shared governance contracts with the Kidults and Artfund staging product slices, verify migration integrity, define all customer-visible failure states, complete mobile QA, and certify Week 2 readiness.

## Scope

- Shared governance snapshot wiring
- Kidults and Artfund entity-view integration
- Portal decision-state contract
- Migration verification checklist
- Desktop and mobile quality verification
- Week 2 certification inputs

## Required Portal States

- loading
- ready
- empty
- partial
- degraded
- unauthorized
- rights_restricted
- error

Each state must be explicit. Silent failure, blank cards, and ambiguous zero values are prohibited.

## Customer Visibility Gates

Customer-facing output is permitted only when:

1. authentication succeeds;
2. governance data is present;
3. commercial eligibility is true;
4. rights status is approved;
5. confidence score is at least 70;
6. Artfund provenance is not disputed;
7. freshness and methodology are available on the Trust Surface.

## Migration Verification

For each staging database:

1. apply governance migration;
2. apply vertical canonical migration;
3. run `PRAGMA foreign_key_check`;
4. run `PRAGMA integrity_check`;
5. verify required indexes;
6. insert one valid fixture;
7. verify prohibited values fail closed;
8. confirm no Production path is referenced.

## Mobile QA Matrix

Required widths:

- 320 px
- 360 px
- 390 px
- 412 px
- 768 px

Acceptance requirements:

- no horizontal overflow;
- minimum 44 px interactive targets;
- one-column trust surfaces below 768 px;
- readable labels without truncating evidence or rights status;
- portal state messages remain visible without hover;
- index and score cards preserve hierarchy on mobile.

## Week 2 Gate Inputs

- shared governance contracts merged;
- Kidults staging migration and entity repository merged;
- Artfund staging migration and entity repository merged;
- integration tests pass;
- TypeScript checks pass;
- failure-state matrix approved;
- mobile QA contract approved;
- Production remains unchanged.

## Prohibited Claims

This sprint does not authorize:

- Kidults Production database migration;
- Artfund Production readiness;
- public release of illustrative staging values;
- write APIs;
- commercial use of unknown or restricted rights data.
