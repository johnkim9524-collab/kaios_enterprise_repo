# Kidults Read-only Entity API Contract v0.1

## Objective

Expose canonical Kidults staging entities to authorized portal clients without enabling writes or weakening governance controls.

## Endpoints

### `GET /staging/kidults/entities`

Supported query parameters:

- `entity_type`
- `parent_entity_id`
- `lifecycle_status`
- `minimum_confidence`
- `limit` from 1 to 100
- `cursor`

Response:

```json
{
  "ok": true,
  "data": {
    "items": [],
    "next_cursor": null
  }
}
```

### `GET /staging/kidults/entities/:entity_id`

Returns one canonical entity and its Trust Surface.

### `GET /staging/kidults/entities/by-slug/:slug`

Returns one canonical entity and its Trust Surface.

## Trust Surface

Every material response includes:

- `updated_at`
- `confidence_grade`
- `confidence_score`
- `source_coverage`
- `evidence_count`
- `methodology_id`
- `rights_status`
- `freshness_status`

No score, index, recommendation, or commercial intelligence module may omit these fields.

## RBAC

- Viewer: list and read
- Operator: list, read, and staging export
- Admin: list, read, and staging export
- Unauthenticated: denied

No write endpoint is authorized in Sprint 18-B3.

## Failure States

- `INVALID_QUERY` -> 400
- `UNAUTHENTICATED` -> 401
- `FORBIDDEN` -> 403
- `ENTITY_NOT_FOUND` -> 404
- `RIGHTS_RESTRICTED` -> 409
- `CONFIDENCE_BELOW_THRESHOLD` -> 409
- `DATABASE_UNAVAILABLE` -> 503

## Staging Constraints

- The Kidults Production database is not modified.
- Unknown or restricted rights block customer-facing commercial use.
- Confidence below 70 blocks Enterprise portal display.
- Candidate, disputed, merged, split, and retired records require explicit state treatment.
- Desktop and mobile clients consume the same API contract.
