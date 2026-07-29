# Sprint 18-B3 Kidults Staging Portal Runbook

## Objective

Implement the first executable Kidults staging product slice without modifying the Kidults Production database or production portal.

## Included

- Canonical Kidults staging SQLite schema
- Entity, alias, observation, signal, and audit-event tables
- TypeScript entity repository contract
- Deterministic filtering and pagination
- Trust Surface builder
- Read-only entity API contract
- Responsive Enterprise luxury portal shell
- Contract tests

## Isolation

The migration is staging-only:

`infrastructure/staging/kidults/0001_kidults_canonical_foundation.sql`

It must never be applied to `/opt/intelligence-holdings/kidults/data/kaios.db`.

Recommended local staging path:

`runtime/staging/kidults/kidults-staging.db`

## Verification

```powershell
pnpm --filter @kaios/kidults-entity-contracts check
pnpm --filter @kaios/kidults-entity-contracts test
```

SQLite verification:

```powershell
New-Item -ItemType Directory -Force runtime\staging\kidults | Out-Null
sqlite3 runtime\staging\kidults\kidults-staging.db ".read infrastructure/staging/kidults/0001_kidults_canonical_foundation.sql"
sqlite3 runtime\staging\kidults\kidults-staging.db "PRAGMA integrity_check;"
sqlite3 runtime\staging\kidults\kidults-staging.db ".tables"
```

Expected integrity result:

`ok`

## Portal Preview

Serve:

`apps/kidults-enterprise-staging/public/index.html`

The shell is intentionally read-only and uses illustrative staging values. It must not imply that preview metrics are certified production data.

## Trust Surface Gate

Every material intelligence module must expose:

- confidence grade and score
- source coverage
- evidence count
- methodology ID
- rights status
- freshness status
- updated timestamp

## Product States

The implementation phase following this shell must support:

- loading
- empty
- partial
- degraded
- unauthorized
- rights-restricted
- low-confidence
- not found
- database unavailable

## Mobile Acceptance

- no horizontal overflow
- 44px minimum interactive targets
- single-column card layout below 900px
- two-column navigation below 480px
- Trust Surface stacks to one column on narrow phones
- readable hierarchy without hover

## Promotion Constraints

- no Production migration
- no public DNS binding
- no customer-facing claim based on illustrative data
- no commercial display for unknown or restricted rights
- no portal display below confidence score 70
- production promotion requires a separate certification gate
