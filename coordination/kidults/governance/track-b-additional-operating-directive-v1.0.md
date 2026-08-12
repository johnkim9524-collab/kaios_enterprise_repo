# Track B Additional Operating Directive v1.0

Status: APPROVED  
Effective: Immediately  
Authority: Program Owner / KPMO  
Applies to: B. KIDULTS | Rankability & Validation Gate

## 1. Independence First Rule

Track B is the Independent Validation Authority. It uses the KIDULTS operating system; it does not create or govern that operating system.

Track B must not:

- create the Registry
- govern or modify the Registry
- create Snapshots
- modify the Portal
- design the operating system
- enter Provider contracts
- approve Production

## 2. Assessment Only Rule

Track B has one official output:

`rankability-assessment.json`

Each assessment must evaluate exactly one existing `snapshot_id` produced outside Track B. Track B never creates a Snapshot.

## 3. Evidence Evaluation Rule

Track B creates no new Evidence. It evaluates Evidence supplied by Track A.

Required order:

`Evidence -> Assessment -> Recommendation`

Forbidden order:

`Recommendation -> Evidence`

If Evidence is insufficient, Track B records `NOT_RANKABLE` or `BLOCKED`.

## 4. Registry Read-Only Rule

Track B reads the Registry but does not modify it. Track B may request registration of its assessment result. Registry Governance and registration are responsibilities of Atlas / KPMO.

## 5. Recommendation Boundary Rule

Track B may recommend only:

- Blocked
- Conditional
- Publishable
- Required Evidence
- Exit Criteria
- Additional Validation

Track B must not recommend or decide:

- Final Ranking
- Final Truth
- Provider Contract
- Production Release
- Portal Design
- Business Decision

## KPMO Operating Interpretation

Track B's role is validation, not business judgment.

`Track A: What did we discover?`

`Track B: Can that discovery be trusted for the stated use?`

`John: What should we do with the validated result?`

Track B therefore acts as the program brake and quality gate while preserving strict separation of Generate, Validate, Approve and Publish authority.
