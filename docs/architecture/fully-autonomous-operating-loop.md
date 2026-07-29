# Fully Autonomous Operating Loop

## Definition

A fully autonomous intelligence platform must detect, classify, collect, normalize, resolve, validate, calculate, publish, monitor, recover, and learn without requiring routine human execution.

Autonomy is complete only when failure handling and quality judgment are part of the loop.

## State Model

1. `discovered`
2. `rights_pending`
3. `approved_for_collection`
4. `collecting`
5. `collected`
6. `normalizing`
7. `resolving_entities`
8. `quality_review`
9. `eligible_for_intelligence`
10. `scoring`
11. `publishing_pending`
12. `published`
13. `monitoring`
14. `degraded`
15. `quarantined`
16. `retry_scheduled`
17. `rolled_back`
18. `retired`

## End-to-End Loop

`Source Discovery -> Rights Gate -> Collection -> Normalization -> Entity Resolution -> Quality and Anomaly Control -> Scoring and Indexing -> Evidence-Linked Narrative -> Portal/API/PDF Publishing -> Monitoring -> Self-Healing or Rollback -> Learning Loop`

## Autonomous Decisions

### Source Discovery

The system may propose a source automatically but cannot make it externally publishable until rights classification is complete.

### Collection

The system selects collection time, timeout, retry, concurrency, and rate policy by source tier and historical behavior.

### Normalization

Schema drift creates a degraded run, preserves raw evidence, and activates a fallback parser or quarantine path.

### Entity Resolution

- high-confidence match: automatic merge
- medium-confidence match: provisional link
- low-confidence match: review queue
- conflicting canonical identity: quarantine

### Quality Control

The system must calculate:

- duplicate rate
- missing-field rate
- evidence coverage
- source agreement
- outlier severity
- freshness
- rights eligibility
- confidence distribution

### Scoring and Indexing

Calculations must be deterministic for a fixed methodology version and input snapshot.

### Narrative Generation

The system may only make claims supported by eligible evidence. Unsupported or low-confidence claims are removed or explicitly qualified.

### Publishing

Publishing requires all applicable gates:

- rights gate
- evidence gate
- methodology gate
- data-quality gate
- security gate
- luxury product gate

### Monitoring

The system monitors:

- source success rate
- signal volume
- duplicate rate
- freshness gap
- database integrity
- backup integrity
- portal/API health
- latency
- cost anomaly
- publication quality

## Self-Healing Policy

The runtime may automatically:

- restart a failed worker
- retry a source
- reduce concurrency
- activate a fallback parser
- suspend a degraded source
- restore the last approved publication
- recalculate an affected score or index
- create an incident record
- escalate after a retry threshold

## Rollback Policy

Automatic rollback is required when:

- customer-facing output loses evidence traceability
- index calculation is non-deterministic
- rights status changes to prohibited or unknown
- database integrity fails
- publication introduces critical security or availability regression
- quality score falls below the product threshold

Rollback must restore the most recent approved artifact and preserve the failed artifact for audit.

## Learning Loop

The platform updates operational weights from:

- source reliability history
- parser success history
- correction frequency
- user dispute outcomes
- false-positive anomaly rate
- report engagement
- alert usefulness
- index restatement frequency

Learning may adjust weights and thresholds but cannot silently alter an approved methodology version.

## Human Control Boundary

Human approval remains mandatory for:

- new rights interpretation
- approved methodology release
- taxonomy breaking change
- high-impact entity dispute
- public standard document release
- critical incident closure

Routine collection, processing, publishing, monitoring, and recovery must not require human action.

## Autonomous Maturity Levels

### Level 1 — Scheduled

Automated execution with manual diagnosis and recovery.

### Level 2 — Managed

Automated retry, health monitoring, and basic quarantine.

### Level 3 — Self-Healing

Automated diagnosis, fallback, rollback, and incident creation.

### Level 4 — Adaptive

Performance-based source weighting, anomaly calibration, and workload optimization.

### Level 5 — Autonomous Intelligence Network

Continuous source discovery, evidence-based product generation, controlled learning, and cross-vertical intelligence optimization.

## Six-Week Target

- Kidults production: Level 3
- Artfund staging: Level 2 moving to Level 3
- Shared KAIOS contracts: Level 4 ready

## Acceptance Criteria

- Every runtime state has defined entry and exit conditions.
- Failures produce a retry, quarantine, rollback, or escalation decision.
- No failed run can silently publish.
- The last approved publication is recoverable automatically.
- Methodology changes remain explicitly versioned despite adaptive operations.