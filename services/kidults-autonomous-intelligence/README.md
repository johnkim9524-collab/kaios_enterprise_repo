# KIDULTS Autonomous Intelligence

This service is the canonical backend foundation for KIDULTS. It converts governed evidence into deterministic intelligence snapshots while preserving the locked public portal visual baseline.

## Architecture

Sources → Ingest API → Source Registry → Entity Registry → Evidence Ledger → Observations → Methodology → Intelligence Run → Category Snapshots → Kidult 100 Snapshot → Publication Snapshot → Portal/API

## Production rule

No number is production-eligible unless it is derived from accepted evidence with provenance and passes the production gate. The default gate requires:

- at least 20 accepted evidence records;
- at least 4 scored categories;
- at least 3 active source families.

The thresholds are deliberately conservative bootstrap defaults and are versioned by methodology.

## Current methodology foundation

Category score weights:

- Market activity: 32%
- Cultural momentum: 24%
- Scarcity: 21%
- Canon strength: 23%

Category scores are confidence-aware. The headline Kidult 100 is a confidence-weighted mean of scored categories. The design is deterministic: identical canonical evidence and methodology produce the same scoring path.

## Endpoints

- `GET /health` — worker and D1 health.
- `GET /v1/intelligence/current` — latest published portal-compatible snapshot.
- `GET /v1/evidence/:id` — provenance-safe evidence metadata.
- `POST /internal/ingest` — collector ingestion endpoint.
- `POST /internal/publish` — calculate and publish a new snapshot.

Internal writes use `Authorization: Bearer <INGEST_TOKEN>` when the secret is configured. Production must configure this secret.

## Ingest contract

```json
{
  "source": {
    "name": "Example Marketplace",
    "family": "Marketplaces",
    "region": "North America",
    "trustTier": "B"
  },
  "entity": {
    "type": "brand",
    "name": "Example Brand",
    "category": "Character Goods"
  },
  "evidence": {
    "externalId": "example-123",
    "observedAt": "2026-08-08T00:00:00.000Z",
    "provenanceUrl": "https://example.invalid/item/123",
    "grade": "B",
    "confidence": 82,
    "raw": { "example": true }
  },
  "metrics": [
    { "key": "market_activity", "value": 78, "confidence": 82 },
    { "key": "cultural_momentum", "value": 70, "confidence": 76 },
    { "key": "scarcity", "value": 64, "confidence": 80 },
    { "key": "canon_strength", "value": 83, "confidence": 84 },
    { "key": "market_velocity", "value": 4.6, "confidence": 75 },
    { "key": "liquidity", "value": 88, "confidence": 81 },
    { "key": "active_listings", "value": 1240, "confidence": 90 }
  ]
}
```

## Local setup

1. Create the D1 database: `pnpm exec wrangler d1 create kidults-intelligence-db`.
2. Put the returned database ID into `wrangler.jsonc`.
3. Apply migrations: `pnpm run db:migrate:local`.
4. Start the worker: `pnpm run dev`.
5. Verify: `GET http://127.0.0.1:8787/health`.
6. Ingest evidence with `POST /internal/ingest`.
7. Run `POST /internal/publish`.
8. Verify `GET /v1/intelligence/current`.

## Autonomous schedule

The Worker cron runs at minute 17 of every hour. Each scheduled run creates a new immutable intelligence run and publication snapshot. Failures are written to `audit_log`; failed runs do not replace the last successful publication.

## Next implementation layer

The canonical foundation is intentionally source-agnostic. The next layer is the Source Adapter Pack: marketplace, auction, brand/direct, editorial and cultural-signal collectors feeding this ingestion contract. Entity resolution and source-specific legal/rate-limit controls belong in those adapters, not in the scoring core.
