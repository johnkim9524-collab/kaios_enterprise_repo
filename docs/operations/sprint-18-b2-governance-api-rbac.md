# Sprint 18-B2 Governance API and RBAC Runbook

## Objective

Provide executable repository, RBAC, and failure-state contracts for the Week 2 read-only governance APIs.

## Validation

Run:

```bash
pnpm --filter @kaios/governance-contracts test
pnpm --filter @kaios/governance-contracts check
```

## Required Outcomes

- repository filtering and pagination are deterministic
- invalid cursors fail closed
- viewer cannot export
- unauthenticated access fails with 401 semantics
- restricted rights and unapproved methodology use 409 semantics
- database outages use 503 semantics

## Safety

- no Production database migration is included
- no write API is authorized
- no Artfund Production claim is made
- Staging promotion remains subject to Issue #27
