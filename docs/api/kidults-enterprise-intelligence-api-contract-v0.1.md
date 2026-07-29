# Kidults Enterprise Intelligence API Contract v0.1

## Read-only endpoints
- `GET /api/kidults/enterprise/overview`
- `GET /api/kidults/enterprise/kidult-100`
- `GET /api/kidults/enterprise/brands`
- `GET /api/kidults/enterprise/categories`
- `GET /api/kidults/enterprise/liquidity`
- `GET /api/kidults/enterprise/trust/:subjectId`

## Response requirements
Each metric includes metric ID, value, optional change, as-of timestamp, methodology ID and version, input fingerprint, confidence, evidence count, source coverage, rights status, freshness, and portal visibility decision.

## Access
Viewer, Operator, and Admin may read. Viewer export is prohibited. No write endpoint is authorized.

## Failure states
- 400 invalid query
- 401 unauthenticated
- 403 forbidden
- 404 not found
- 409 governance or methodology conflict
- 503 staging repository unavailable

## Promotion restriction
The API remains staging-only until real data wiring, integration tests, mobile QA, and a separate production certification pass.
