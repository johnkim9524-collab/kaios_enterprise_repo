# Dual Staging Executable Smoke Matrix v0.1

## Objective

Verify the executable Kidults and Artfund staging release candidate without enabling customer publication or Production promotion.

## Required sequence

1. Validate staging-only environment values.
2. Verify separate Kidults, Artfund, and governance databases.
3. Apply migrations in declared order.
4. Run database integrity checks.
5. Start authenticated read-only APIs.
6. Run portal and export authorization smoke tests.
7. Verify product and vertical failure isolation.
8. Rehearse backup, restore, and rollback.

## Smoke cases

| Vertical | Surface | Actor | Expected |
|---|---|---|---:|
| Kidults | Enterprise snapshot | unauthenticated | 401 |
| Kidults | Enterprise snapshot | viewer | 200 |
| Kidults | governed export | viewer | 403 |
| Kidults | governed export | operator ready snapshot | 200 |
| Artfund | Institutional snapshot | unauthenticated | 401 |
| Artfund | Institutional snapshot | viewer | 200 |
| Artfund | governed export | viewer | 403 |
| Artfund | disputed provenance record | operator | blocked |

## Failure isolation

- A Kidults API or migration failure must not corrupt or stop Artfund staging.
- An Artfund provenance failure must not block an eligible Kidults product.
- A report failure must not stop eligible alert or index processing.
- A rollback must preserve immutable publication, incident, and checksum history.

## Pass criteria

All expected statuses match, all databases report integrity `ok`, no publication flag is enabled, rollback checksum matches the backup checksum, and Production promotion remains unauthorized.
