# A17 — Bounded Live Adapter Readiness

## Objective
Move the Global Autonomous Intelligence Platform from synthetic execution-control certification toward real external execution without granting broad autonomous mutation authority.

## Core adapters
- Cloudflare
- GitHub
- DigitalOcean

## Canonical execution contract
`discover -> preflight -> plan -> authorize -> execute -> verify -> cleanup_or_rollback -> evidence -> finalize`

## Safety standard
1. Policy is evaluated before execution.
2. Mutation is denied by default until explicitly authorized.
3. Every mutation requires preflight.
4. Production mutation requires bounded blast radius, canary evidence, and rollback readiness.
5. Destructive/high-risk actions remain approval-gated.
6. Execution is non-interactive after preflight; confirmations must be resolved by safe flags/contracts rather than prompts.
7. Every attempt, including denied and failed attempts, must emit evidence.
8. Verification failure must enter cleanup or rollback.
9. Stage finalization must return the repository to synchronized `main`.

## A17 scope boundary
A17 certifies readiness contracts and fail-closed behavior. It does not enable unrestricted production mutations. Real provider credentials, mutation budgets, and provider-specific live operations are introduced only through bounded follow-on gates.

## Exit criteria
`npm run a17:finalize` must report A15 PASS, A16 PASS, A17 PASS, then complete synchronized-main finalization.
