# Track B Additional Operating Directive v1.3

Status: APPROVED
Effective: Immediately
Rule Status: FINAL LOCKED
Owner of governance record: Atlas / KPMO
Track B access to Registry: READ ONLY / request registration only

## 1. Input Boundary Rule

Track B has exactly two official inputs:

1. `snapshot-candidate.json`
2. Evidence Package

Assessment does not begin until both are available and valid.

The following are not official assessment inputs:

- Portal results
- Business requests
- Provider requirements
- Estimates
- Verbal explanations
- Chat-only information

## 2. Output Boundary Rule

Track B has exactly one official output:

`rankability-assessment.json`

Track B does not generate Snapshot Candidates, Portal Releases, Registry changes, Production Decisions, Business Recommendations, or Final Rankings.

## 3. Assessment Completion Rule

An assessment is `COMPLETE` only when all of the following are true:

- snapshot_id verified
- Evidence Package verified
- Assessment Contract validation passed
- Registry traceability completed

Otherwise `assessment_status` remains `INCOMPLETE`.

## 4. Official Waiting State Rule

When trigger conditions are incomplete, Track B uses exactly one of these states:

- `WAITING_FOR_SNAPSHOT`
- `WAITING_FOR_EVIDENCE`
- `WAITING_FOR_REGISTRY`
- `WAITING_FOR_VALIDATION`

Track B does not generate temporary, estimated, provisional, or chat-derived assessments.

## Final Declaration

Track B operating-rule definition ends with Directive v1.3.

The official operational flow is now:

`Receive Snapshot Candidate -> Validate Evidence -> Generate rankability-assessment.json -> Handoff to Integration Gate`

No further operating-rule expansion is authorized under this locked baseline.
