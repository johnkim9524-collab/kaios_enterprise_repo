# Read-only Governance API Contract v0.1

## Endpoints

- `GET /api/governance/sources`
- `GET /api/governance/sources/:id`
- `GET /api/governance/rights`
- `GET /api/governance/evidence`
- `GET /api/governance/methodologies`
- `GET /api/governance/confidence`

## Query Contract

Supported filters: `vertical`, `status`, `limit`, and opaque `cursor`.

- `limit` defaults to 50 and is capped at 200.
- invalid cursors fail closed with HTTP 400.
- list ordering must be deterministic.

## RBAC

- Viewer: read and list.
- Operator: read, list, and controlled export.
- Admin: read, list, and controlled export.
- unauthenticated requests return 401.
- unauthorized actions return 403.

## Trust Surface

Material records expose:

- vertical
- status
- version
- updated timestamp
- rights eligibility where applicable
- methodology version where applicable
- confidence grade where applicable
- evidence identifiers where applicable

## Failure States

- `UNAUTHENTICATED` — 401
- `FORBIDDEN` — 403
- `NOT_FOUND` — 404
- `INVALID_QUERY` / `INVALID_CURSOR` — 400
- rights, methodology, or confidence conflicts — 409
- unavailable or degraded database — 503

No endpoint in this contract permits mutation.
