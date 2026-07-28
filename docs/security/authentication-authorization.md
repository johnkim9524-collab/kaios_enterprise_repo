# Authentication, Authorization, and API Protection

## Authentication

KAIOS supports Bearer token authentication when
`KAIOS_AUTH_ENABLED=true`.

Role tokens are configured independently:

- `KAIOS_VIEWER_TOKEN`
- `KAIOS_OPERATOR_TOKEN`
- `KAIOS_ADMIN_TOKEN`

Tokens must be unique and are never returned by an API response or audit
record.

## Authorization

Public routes:

- `/api/health`
- `/api/status`
- `/api/config/status`
- `/api/security/status`

Viewer routes:

- `/api/edition`
- `/api/scheduler/status`
- `/api/runs`
- `/api/runs/{id}`

Operator routes:

- `/api/collector`
- `/api/runtime`

Admin tokens inherit viewer and operator access.

## Responses

- Missing or invalid authentication returns `401`.
- Insufficient role permission returns `403`.
- Rate limit exhaustion returns `429`.

## Rate Limiting

The in-process limiter is configured by:

- `KAIOS_RATE_LIMIT_REQUESTS`
- `KAIOS_RATE_LIMIT_WINDOW_SECONDS`

This limiter is appropriate for the current single-primary deployment.
A distributed limiter is required before horizontal scaling.

## Audit

Authentication, authorization, and rate-limit outcomes are written as
JSON Lines to `KAIOS_SECURITY_AUDIT_PATH`. Tokens are never recorded.

## Portal

The Portal stores the Bearer token in browser session storage and adds
the Authorization header to same-origin API requests. Closing the browser
session removes the token.