# Artfund Read-Only Entity API Contract v0.1

## Objective

Expose canonical Artfund staging entities through stable, read-only endpoints without modifying Artfund production or authorizing write operations.

## Endpoints

- `GET /api/artfund/entities`
- `GET /api/artfund/entities/:entityId`
- `GET /api/artfund/entities/by-slug/:slug`
- `GET /api/artfund/entities/:entityId/provenance`
- `GET /api/artfund/entities/:entityId/trust-surface`

## Query Parameters

- `entity_type`
- `parent_entity_id`
- `status`
- `minimum_confidence`
- `cursor`
- `limit`

`limit` defaults to 25 and is capped at 100. Invalid cursors, limits, or confidence values fail closed with HTTP 400.

## RBAC

- Viewer: list, get, trust surface
- Operator: Viewer permissions plus provenance detail
- Admin: Operator permissions plus staging export where separately authorized
- Unauthenticated: HTTP 401

No write route is authorized.

## Response Trust Surface

Every material entity response includes or links to:

- confidence grade and score
- source coverage
- evidence count
- methodology identifier
- rights status
- freshness timestamp
- updated timestamp
- provenance completeness
- provenance status

## Commercial Display Gate

A customer-facing Institutional surface is eligible only when:

- rights status is `approved`
- confidence score is at least 70
- provenance status is not `disputed`
- methodology is approved or active
- evidence and freshness requirements are satisfied

## Failure Semantics

- 400: invalid query, cursor, limit, or confidence
- 401: unauthenticated
- 403: role lacks permission
- 404: entity not found
- 409: rights, methodology, confidence, or provenance conflict
- 503: staging database unavailable; retryable

## Constraints

- Staging-only
- No destructive migration
- No Artfund production readiness claim
- No public index publication authorization
- Production promotion requires a separate gate
