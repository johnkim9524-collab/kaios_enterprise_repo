# Sprint 18-C2 Source Execution Control Runbook

## Objective

Persist source execution history and health state, schedule deterministic retries, quarantine unsafe sources, and permit controlled automatic recovery for Kidults and Artfund staging.

## Components

- `source_execution_audit`
- `source_health_state`
- `source_recovery_event`
- deterministic retry scheduler
- automatic repeated-failure quarantine
- timed recovery eligibility
- Kidults news RSS adapter
- Artfund auction feed adapter

## Failure Separation

A source failure must not terminate another source execution or the other vertical. Every execution writes an independent audit record and updates only its own health state.

## Retry Policy

- retryable transport failures: up to four total attempts
- delay: 15, 30, 60 seconds, capped at 300 seconds
- rights, methodology, validation, and critical drift failures: no transport retry
- exhausted retry budget: failed or quarantined depending on health state

## Quarantine Policy

Immediate quarantine:

- rights not approved
- critical schema drift

Progressive quarantine:

- three consecutive execution failures
- health score below 40

## Recovery Policy

Automatic timed recovery is allowed only for repeated transport failures after the recovery timestamp. Rights quarantine requires approved rights. Critical schema drift requires reviewed adapter or schema changes.

A recovered source must complete repeated successful staging executions before returning to active status.

## Staging Validation

1. Apply shared governance migration.
2. Apply `0002_source_execution_control.sql` to an isolated staging database.
3. Run SQLite integrity and foreign-key checks.
4. Run package tests and TypeScript checks.
5. Execute Kidults and Artfund fixture adapters independently.
6. Confirm execution audit rows and health-state transitions.
7. Simulate transport failure, retry scheduling, quarantine, and recovery.
8. Confirm no Production database path is referenced.

## Production Constraints

- Kidults Production remains unchanged.
- Artfund Production readiness is not claimed.
- Candidate adapters remain staging-only.
- Commercial source promotion requires approved rights and a separate gate.
- No write API or public staging-value release is authorized.

## Acceptance Criteria

- execution audit history is append-only by contract
- health state persists per source
- retry timing is deterministic and capped
- unknown rights and critical drift quarantine immediately
- repeated failures quarantine automatically
- eligible transport failures may recover after cooldown
- adapter tests pass for both verticals
- SQLite migration integrity passes
