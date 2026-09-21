# Delegated Autonomous Internal Authority V1

**Stable control:** `AI-020 / DELEGATED_AUTONOMOUS_INTERNAL_AUTHORITY`  
**Authority:** KPMO Platform Governance  
**State:** MANDATORY / FAIL-CLOSED

## Decision

Necessary repository-internal, reversible, non-Production work SHALL proceed without routine Program Owner approval when an accountable Track agent and KPMO independently approve the exact change. This delegates decision authority only; it never transfers end-to-end accountability.

## Eligible work

Implementation, defect correction, refactoring, tests, validation, documentation, registry truth-sync, internal CI recovery, staging/shadow/canary execution, reversible recovery, PR Ready transition, and internal reversible governed landing are eligible only when every machine-policy condition passes.

## Required quorum and binding

The accountable Track agent and KPMO must be distinct identities. Both decisions bind the exact repository, base SHA, head SHA, head tree, scope digest, test evidence, verified rollback plan, expiry, and one-use nonce. Self-approval, replay, stale evidence, drift, missing checks, or scope expansion fails closed.

## Program Owner reserved gates

Program Owner approval remains mandatory for Production, Public, G5, external communication, spend, contracts, legal exceptions, irreversible security changes, credential or permission expansion, secret creation/read/rotation/export, trust-root or ruleset weakening, destructive data operations, and protected promotion or release.

## Operating sequence

Detect → classify → implement → regression and negative tests → independent Track review → KPMO review → exact-head revalidation → one-use governed landing → target-main revalidation → registry/evidence truth-sync → report.

Unknown or conflicting classification is `FAIL_CLOSED_OWNER_REQUIRED`. Production, Public, and G5 remain `HOLD` unless the Program Owner separately authorizes the exact gated action.

## Normal activation and legacy recovery

Eligible internal landing uses `.github/workflows/kidults-autonomous-internal-landing-v1.yml` as the normal path. Track, KPMO and independent-verifier events bind one exact Git tuple; the AWS durable ledger conditionally reserves and consumes the authorization generation before the privileged landing step may merge. Manual `Run workflow`, natural-language Owner comments and direct Owner merge clicks are recovery mechanisms, not normal orchestration.

The legacy Atomic Governed Landing and Direct Owner Handoff remain available only until the autonomous path has a configured actor registry, OIDC role, durable ledger table, immutable receipt sink and one successful live STAGING canary. They must never be interpreted as permission to change Production, Public or G5 HOLDs.

An agent identity that violates scope, replays authority, omits evidence or abandons an executable duty is quarantined. Every unused authorization for that identity is revoked. A replacement must complete a fresh constitutional bootstrap and reproduce the work under a new authorization generation; the removed identity cannot approve its replacement.
