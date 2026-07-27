# KAIOS Live Adapter Foundation

## Status

Sprint 10 Live Adapter Foundation.

## Objective

Collect real RSS or Atom evidence without silent fallback.

## Live Source Selection

Live mode uses only sources where `enabled` and `live_enabled` are true.

## Environment

```text
KAIOS_LIVE_RSS_URL
KAIOS_LIVE_HTTP_TIMEOUT_SECONDS
KAIOS_LIVE_RETRY_DELAY_SECONDS
```

## Evidence Fields

```text
source_url
payload_hash
external_id
evidence_url
evidence_title
evidence_summary
published_at
collected_at
```

## Failure Policy

Live mode does not silently switch to fixture or fallback data.