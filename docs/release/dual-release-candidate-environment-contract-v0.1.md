# Dual Release Candidate Environment Contract v0.1

## Purpose

Define the minimum environment boundary for the Kidults and Artfund dual-vertical release candidate.

## Environment Classes

| Environment | Kidults | Artfund | Customer Use |
|---|---|---|---|
| local | fixture and contract validation | fixture and contract validation | prohibited |
| staging | governed score, index, report, alert and portal validation | governed score, index, report, alert and portal validation | invited pilot only |
| production | existing protected Kidults runtime | not authorized | governed release only |

## Required Configuration

- `KAIOS_ENVIRONMENT`
- `KAIOS_RUNTIME_MODE`
- `KAIOS_DATABASE_URL`
- `KAIOS_VIEWER_TOKEN_FILE`
- `KAIOS_OPERATOR_TOKEN_FILE`
- `KAIOS_ADMIN_TOKEN_FILE`
- `KAIOS_KIDULTS_PORTAL_ENABLED`
- `KAIOS_ARTFUND_PORTAL_ENABLED`
- `KAIOS_REPORT_PUBLISH_ENABLED`
- `KAIOS_ALERT_DELIVERY_ENABLED`
- `KAIOS_INDEX_PUBLISH_ENABLED`

## Default Safety Values

```text
KAIOS_ENVIRONMENT=staging
KAIOS_RUNTIME_MODE=fixture
KAIOS_KIDULTS_PORTAL_ENABLED=true
KAIOS_ARTFUND_PORTAL_ENABLED=true
KAIOS_REPORT_PUBLISH_ENABLED=false
KAIOS_ALERT_DELIVERY_ENABLED=false
KAIOS_INDEX_PUBLISH_ENABLED=false
```

## Secret Rules

- Secrets are file-mounted and never committed.
- Tokens are never logged.
- Viewer cannot export.
- Operator and Admin cannot bypass governance gates.
- Staging and production secrets must be physically separate.

## Data Rules

- Staging databases are separate from Kidults production.
- Artfund has no production database authorization in this release candidate.
- Historical reports, alerts and index points are immutable.
- Unknown or restricted rights block customer-facing output.

## Promotion Rule

A release candidate may be promoted only after staging certification, authenticated smoke tests, backup and rollback verification, and an explicit production-promotion authorization.
