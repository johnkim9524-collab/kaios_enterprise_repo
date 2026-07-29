# Dual Release Candidate Rollback Package v0.1

## Rollback Triggers

- health or authenticated smoke failure
- database integrity failure
- failed migration or incompatible schema
- rights, methodology, confidence or provenance gate bypass
- portal rendering failure at supported widths
- report, alert or index publication with invalid checksum
- unrecoverable orchestration incident

## Rollback Units

Rollback is isolated by vertical and product whenever possible.

1. Portal application
2. Read-only API wiring
3. Report publication
4. Alert delivery
5. Index publication
6. Database migration
7. Full staging bundle

## Mandatory Evidence

Each rollback event records:

- release candidate ID
- vertical and product
- triggering incident ID
- original artifact checksum
- rollback artifact checksum
- operator identity or autonomous controller ID
- started and completed timestamps
- post-rollback health result

## Database Rule

- Never silently delete immutable publication history.
- Forward-only remediation is preferred.
- A database restore requires a verified backup and integrity check.
- Kidults production database is outside this staging rollback package.

## Success Criteria

- previous healthy artifact restored
- authenticated health and portal smoke tests pass
- database integrity is `ok`
- autonomous schedulers are either healthy or intentionally paused
- incident and rollback audit records are immutable
