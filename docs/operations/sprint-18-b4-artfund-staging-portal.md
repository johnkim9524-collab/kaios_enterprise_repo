# Sprint 18-B4 — Artfund Staging Canonical Database and Institutional Portal

## Objective

Create the first executable Artfund staging product slice using the approved Week 1 architecture, shared governance foundation, and dual luxury portal contracts.

## Scope

- Artfund canonical staging SQLite migration
- Artist, Artwork, Edition, Object Instance, Provenance Event, Exhibition, Auction Lot, Transaction, Institution, and Market Signal entities
- Alias, observation, signal, provenance, and audit tables
- Read-only entity repository
- Provenance Trust Surface
- Read-only entity API contract
- Responsive Institutional luxury portal shell

## Non-Negotiable Constraints

- Artfund Production readiness is not claimed.
- No destructive migration is authorized.
- No write API is authorized.
- Unknown or restricted rights block commercial display.
- Confidence below 70 blocks Institutional display.
- Disputed provenance blocks commercial display.
- Every material intelligence surface exposes confidence, evidence, methodology, rights, freshness, and provenance status.
- Desktop and mobile are completed together.

## Local Validation

Run from the repository root:

```bash
pnpm --filter @kaios/artfund-entity-contracts test
pnpm --filter @kaios/artfund-entity-contracts check
```

Validate the migration against an isolated SQLite database:

```bash
sqlite3 /tmp/artfund-staging.db < infrastructure/staging/artfund/0001_artfund_canonical_foundation.sql
sqlite3 /tmp/artfund-staging.db "PRAGMA integrity_check;"
sqlite3 /tmp/artfund-staging.db ".tables"
```

Expected integrity result:

```text
ok
```

Expected tables include:

- artfund_entities
- artfund_entity_aliases
- artfund_provenance_events
- artfund_observations
- artfund_signals
- artfund_audit_events

## Portal Validation

Open:

```text
apps/artfund-institutional-staging/public/index.html
```

Acceptance checks:

- no horizontal overflow at 320px width
- touch targets remain usable
- Trust Surface remains readable on mobile
- illustrative staging disclosure is visible
- no production or investment-advice claim
- distinct Artfund ivory, charcoal, and restrained-gold visual language

## Promotion Gate

This Sprint authorizes staging implementation only. Production promotion requires:

- source rights approval
- approved methodology
- confidence at least 70
- provenance not disputed
- migration and rollback certification
- security and RBAC certification
- Product Quality Score at least 90
- Data Trust Score at least 90
- Luxury Brand Fit at least 95
