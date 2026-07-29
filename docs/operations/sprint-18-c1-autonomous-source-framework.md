# Sprint 18-C1 — Autonomous Source Adapter Framework

## Objective

Implement the shared source-ingestion control plane required for autonomous Kidults and Artfund intelligence collection.

## Scope

- source adapter definition contract
- deterministic retry policy
- source health scoring
- lifecycle transitions
- quarantine rules
- schema drift detection
- initial dual-vertical onboarding manifest
- staging-only promotion controls

## Autonomous Lifecycle

`candidate -> approved -> active -> degraded -> quarantined -> retired`

A source may return from `degraded` or `quarantined` only after a new health assessment and explicit rights approval.

## Source Health Formula

- success rate: 35%
- freshness: 20%
- schema stability: 20%
- rights: 15%
- latency: 10%

Lifecycle decisions:

- score 70 or higher with approved rights: active
- score 50 to 69: degraded
- score below 50: quarantined
- rights below 100: quarantined for commercial use

## Schema Drift Policy

- no field change: pass
- unexpected optional fields: partial, continue collection
- missing required field: high or critical drift
- critical drift: quarantine and block normalization

## Retry Policy

Retries use capped exponential delay. Transport failures may retry until `maxAttempts`. Rights failures, critical schema drift, and commercial eligibility failures do not retry as transport errors.

## Failure Isolation

A failed source must not stop the other vertical or another source in the same vertical. Each execution returns a stable result containing:

- source ID
- status
- attempts
- duration
- drift assessment
- health assessment
- retryability
- quarantine reason

## Initial Onboarding

The initial manifest includes candidate sources for:

- Kidults discovery intelligence
- Kidults official brand intelligence
- Artfund auction intelligence
- Artfund institutional intelligence

All remain staging-only until rights review, schema validation, health scoring, and a separate promotion gate pass.

## Production Safety

- Kidults Production database is unchanged.
- No Artfund Production-readiness claim is made.
- No candidate source is commercially displayed.
- No source is promoted with unknown rights.
- Production promotion requires a separate certification.

## Acceptance Criteria

- retry delay is deterministic and capped
- schema drift is classified consistently
- source health produces deterministic grade and lifecycle
- unknown rights quarantine the source
- critical schema drift blocks downstream use
- noncritical expansion produces partial status
- initial dual-vertical manifest is machine readable
- TypeScript checks and tests pass
