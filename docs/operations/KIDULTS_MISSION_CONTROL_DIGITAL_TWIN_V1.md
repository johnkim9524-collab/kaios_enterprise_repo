# KIDULTS Mission Control & Digital Twin v1.0

## Purpose

Mission Control converts the operational Registry into an executable, observable program state.

It does not replace the four Tracks and does not create intelligence. It reads canonical Registry records and exposes:

- Current milestone
- Track missions
- Work queue
- Dependency and blocker state
- Current Digital Twin state
- Production HOLD / release state

## Canonical flow

```text
Operational Registry
        ↓
Mission Registry
        ↓
Work Queue + Dependency State
        ↓
Blocker Registry
        ↓
Digital Twin Current State
        ↓
Executive Control Tower
```

## Initial milestone

`MS-0001 — First Canonical Snapshot`

The primary blocker is `BLOCKER-0001 — No canonical snapshot candidate`.

## Automatic transition rule

When Track A registers a valid immutable candidate and Evidence Package:

1. `snapshot.current_candidate_snapshot_id` becomes non-null.
2. `blocker-no-canonical-candidate` must be resolved.
3. Track B mission may move from `BLOCKED` to `IN_PROGRESS`.
4. Track B waiting state may move from `WAITING_FOR_SNAPSHOT` to assessment execution.
5. Digital Twin is regenerated from Registry truth.

## Fail-closed rules

- No candidate means no assessment.
- Track C cannot display a Candidate as Published.
- Track D cannot publish or deploy without G5 approval.
- A blocker may not be silently removed; its exit criteria must be satisfied.
- Mission and Digital Twin state must match the source Registry.

## Commands

```text
node scripts/kidults/mission-control/validate-mission-control.mjs
node scripts/kidults/mission-control/build-current-state.mjs
```
