# Artfund Institutional Intelligence API Contract v0.1

## Scope

Authenticated read-only staging APIs for the Artfund Institutional Portal Beta.

## Endpoints

- `GET /api/artfund/institutional/overview`
- `GET /api/artfund/institutional/index/global-art-market`
- `GET /api/artfund/institutional/artists`
- `GET /api/artfund/institutional/auctions`
- `GET /api/artfund/institutional/provenance`
- `GET /api/artfund/institutional/segments`
- `GET /api/artfund/institutional/signals`

## Required Response Metadata

Every material response includes:

- `environment`
- `illustrative`
- `generated_at`
- `methodology_id`
- `methodology_version`
- `confidence_grade`
- `confidence_score`
- `source_coverage`
- `evidence_count`
- `rights_status`
- `freshness`
- `provenance_completeness`
- `provenance_disputed`

## RBAC

- Viewer: read and list
- Operator: read, list, internal export preview
- Admin: read, list, internal export preview
- Unauthenticated: denied

## Failure Semantics

- `400` invalid query or cursor
- `401` unauthenticated
- `403` forbidden or rights restricted
- `404` not found
- `409` methodology, confidence, rights, or provenance conflict
- `503` staging repository unavailable

## Restrictions

No write endpoint, public release, customer export, or production-readiness claim is authorized by this contract.
