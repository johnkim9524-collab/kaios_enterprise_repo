# A15 — Global Autonomous Policy Foundation

## Objective

Promote the platform from service-specific automation to a policy-governed Global Autonomous Intelligence Platform. Agents may propose and execute work only inside explicit policy boundaries; policy authorization, evidence, blast-radius limits and fail-closed behavior are mandatory.

## Governing model

**Agents propose. Policies authorize. Systems execute. Evidence proves.**

Every governed operation follows this execution contract:

1. discover
2. preflight
3. plan
4. authorize
5. execute
6. verify
7. cleanup or rollback
8. evidence
9. finalize

## Risk tiers

- **R0 — Observation:** read-only, health, metrics, collection and discovery. Autonomous.
- **R1 — Reversible automation:** retry, bounded restart, quarantine, temporary resources and certified failover. Autonomous under policy.
- **R2 — Controlled mutation:** staging writes, provider activation and bounded data changes. Requires preflight and evidence.
- **R3 — Production/material mutation:** production deploy, migration, infrastructure/network change or material publication. Requires preflight, canary, rollback and evidence.
- **R4 — Strategic/irreversible:** ownership transfer, mass destructive deletion, root/security ownership changes and major commitments. Explicit human approval remains mandatory.

## Core adapters

A15 establishes policy coverage for Cloudflare, GitHub, DigitalOcean, Provider, Database, Storage, DNS and Server execution surfaces. A16 will promote these policy declarations into the common execution control plane and adapter runtime contract.

## Confirmation policy

Autonomous execution must not depend on interactive prompts. Safe confirmation is replaced with machine-verifiable preflight, explicit policy authorization, bounded execution and verification. Human approval is preserved for R4 actions and any future policy explicitly classified as non-delegable.

## Certification gates

A15 fails unless all of the following are true:

- execution contract exists and is ordered
- mutation without preflight is denied
- interactive autonomous execution is denied
- production mutation without rollback is denied
- production mutation without canary is denied
- R4 self-authorization is denied
- R4 with explicit human approval can proceed
- unknown adapters fail closed
- cost and blast-radius budgets are enforced
- successful execution requires an evidence contract
- Cloudflare, GitHub, DigitalOcean and other core operational surfaces are inventoried

## Operator command

```powershell
npm run a15:finalize
```

The finalizer runs certification and, only after PASS, returns the repository to `main` and fast-forward synchronizes with `origin/main`.
