# AGCI Memory Layer v1.0

**Mission:** `#302`  
**Status:** ACTIVE FOUNDATION  
**First Value:** AUTONOMOUS  
**Production:** HOLD

## Purpose

AGCI-OS must remember both **when a market assertion was true** and **when the system learned it**. Memory is therefore append-only and bitemporal.

```text
Observe
→ Record
→ Preserve
→ Replay
→ Compare
→ Learn
→ Recommend
```

## Time Model

```text
valid_from / valid_to
Market or business-valid time

recorded_at
System knowledge time
```

Historical replay always receives both `valid_at` and `recorded_cutoff`. The same immutable inputs, policy version and cutoffs must produce the same state.

## Correction Model

Corrections never overwrite previous entries.

```text
Prior Memory Entry
→ supersedes
→ Correction Memory Entry
```

The prior entry remains available for replay before the correction was recorded.

## Memory Types

- Observation Memory
- Entity Memory
- Market State Memory
- Decision Memory
- Learning Memory

## Fail-Closed Boundary

Missing rights, missing provenance, stale input, invalid time ranges, duplicate IDs and unsupported memory types are quarantined. Identity conflicts enter `REVIEW_REQUIRED` and are excluded from governed replay until resolved.

## Consumer Boundary

```text
Memory Registry
→ Projection Engine
→ Portal / Executive / API / Reports
```

Direct Memory-to-Portal and Memory-to-Index paths are prohibited.

## Legal Erasure

Append-only storage does not prevent lawful erasure. A legally required removal uses an auditable tombstone or redaction record; silent deletion and historical rewriting are prohibited.

## Foundation Boundary

Contract-fixture Memory entries do not enter the Global Universe, do not compute KIDULT 500 or KIDULT 100, are not public, and do not authorize Production.
