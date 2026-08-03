# A13-B13 Live Source Onboarding & Resilience

## Objective
Connect approved live data sources through an explicit registry while preserving safe fallback behavior and operational transparency.

## Scope
- source registry with stable source identifiers
- health-check contract per source
- timeout, retry and circuit-breaker policies
- source-level freshness and provenance
- partial-failure handling
- aggregate operational health contract

## Safety
- Production remains untouched.
- Staging remains the only execution target.
- No live source may be treated as trusted without explicit provenance.
- Partial source failure must not invalidate healthy sources.
- Total failure must preserve the approved illustrative fallback.

## Architecture
- one HTML file
- one physical CSS file
- one interaction JavaScript file
- JSON contracts under `/a13-b10/data/`
- no runtime stylesheet injection
- mobile validation at 320px, 360px, 390px and 430px
