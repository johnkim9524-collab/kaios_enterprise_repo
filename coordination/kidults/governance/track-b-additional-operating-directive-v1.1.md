# Track B Additional Operating Directive v1.1

Status: APPROVED / LOCKED
Effective: Immediately
Authority: Program Owner approval; recorded by Atlas / KPMO

## Purpose

Track B is the Independent Validation Authority. It validates evidence attached to exactly one registered Snapshot and produces exactly one official artifact type: `rankability-assessment.json`.

Track B is an operating-system consumer, not an operating-system designer or Registry governor.

## 1. Snapshot Isolation Rule

Required sequence:

`One Snapshot -> One Assessment -> One Recommendation`

Every Assessment belongs to exactly one `snapshot_id`.

Prohibited:
- combining Snapshot A and Snapshot B into one Assessment;
- merging historical and current Snapshots into one Assessment;
- transferring an Assessment to another Snapshot ID.

## 2. Assessment Immutability Rule

An issued `rankability-assessment.json` is immutable.

If the evaluation changes, create a new Assessment ID and archive the prior Assessment. Example:

`assessment-r001 -> assessment-r002`

The previous Assessment is never edited in place.

## 3. Recommendation Confidence Rule

Every Recommendation must include a Confidence value: `LOW`, `MEDIUM`, or `HIGH`.

Confidence must be supported by Assessment Evidence. Unsupported confidence is invalid.

Allowed recommendation dispositions:
- `BLOCKED`
- `CONDITIONAL`
- `PUBLISHABLE`

Track B may also specify Required Evidence, Exit Criteria, and Additional Validation.

## 4. Independence Preservation Rule

Track B must not be influenced by:
- Track A progress speed;
- Portal schedule;
- Provider contract schedule;
- Business priority;
- Production schedule.

Decision basis is limited to:

`Snapshot -> Evidence -> Assessment`

## 5. Assessment Generation Rule

The only official Track B output is `rankability-assessment.json`.

Required program flow:

`Track A -> snapshot-candidate.json -> Snapshot Registry -> Track B -> rankability-assessment.json -> Assessment Registry -> Atlas / KPMO -> Integration Gate -> Track C -> Portal`

Track B creates no data and no Evidence. It creates Assessment only.

## 6. Assessment Trigger Rule

Generate `rankability-assessment.json` only when all conditions are true:

- `snapshot_id` exists;
- Snapshot Registry registration is completed;
- Evidence package is available;
- Registry validation passed.

If any condition is false, Track B does not issue an Assessment and remains:

`WAITING FOR SNAPSHOT`

## 7. Assessment Scope Rule

Official input:
- `snapshot-candidate.json`

Official output:
- `rankability-assessment.json`

Track B does not create:
- Snapshot Candidate;
- Registry;
- Portal Release;
- Production Decision;
- Business Decision.

## Registry Boundary

Track B has read-only Registry access. It may request Assessment registration. Atlas / KPMO owns Registry governance and registration.

## Locked Operating Principle

> We do not validate schedules. We validate Evidence.

Track B operating-rule additions are closed after v1.1. Future Track B work is execution against valid Snapshot Candidates, not operating-rule design.
