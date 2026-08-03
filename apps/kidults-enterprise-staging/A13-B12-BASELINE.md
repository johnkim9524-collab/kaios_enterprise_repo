# A13-B12 Live Data Integration Baseline

## Objective
Connect the approved Kidults Collector Intelligence interface to a controlled live-data adapter while preserving the A13-B11 visual and product baseline.

## Architecture
- Existing staging route remains `/a13-b10/`.
- One HTML file, one physical CSS file and one interaction JavaScript file remain authoritative.
- Live data access is isolated behind a data adapter.
- Illustrative staging data remains the mandatory fallback.
- Production remains untouched.

## Required capabilities
1. Separate live, stale and fallback data modes.
2. Publish source freshness, confidence and provenance metadata.
3. Preserve the current category matrix, canon, method and time-series contracts.
4. Fail safely when a live endpoint is unavailable or invalid.
5. Never present fallback data as live evidence.
6. Keep status and freshness readable at 320px, 360px, 390px and 430px.

## Merge gates
- Adapter contract validation passes.
- Invalid live payloads fall back to illustrative staging data.
- UI visibly discloses the active data mode.
- No runtime stylesheet injection.
- Existing A13-B10 and A13-B11 regression tests remain green.
