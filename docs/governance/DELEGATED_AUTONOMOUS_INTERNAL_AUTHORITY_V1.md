# Delegated Autonomous Internal Authority V1

**Stable control:** `AI-020 / DELEGATED_AUTONOMOUS_INTERNAL_AUTHORITY`  
**Authority:** KPMO Platform Governance  
**State:** MANDATORY / FAIL-CLOSED

## Decision

Necessary repository-internal, reversible, non-Production work SHALL proceed without routine Program Owner approval when an accountable Track agent and KPMO independently approve the exact change. This delegates decision authority only; it never transfers end-to-end accountability.

## Eligible work

Implementation, defect correction, refactoring, tests, validation, documentation, registry truth-sync, internal CI recovery, staging/shadow/canary execution, reversible recovery, PR Ready transition, and internal reversible governed landing are eligible only when every machine-policy condition passes.

## Required quorum and binding

The accountable Track, KPMO, and independent-verifier approvals are represented by distinct role-scoped GitHub OIDC workload identities with distinct workflow refs and KMS signing keys. All decisions bind the exact repository, base SHA, head SHA, head tree, scope digest, test evidence, verified rollback plan, expiry, and one-use nonce. Self-approval, workload reuse across roles, signing-key reuse, replay, stale evidence, drift, missing checks, or scope expansion fails closed.

The independent verifier is a separated machine workload and evidence gate, not a required human reviewer. No routine non-Owner or third-party human review is introduced by this policy.

## Program Owner reserved gates

Program Owner approval remains mandatory for Production, Public, G5, external communication, spend, contracts, legal exceptions, irreversible security changes, credential or permission expansion, secret creation/read/rotation/export, trust-root or ruleset weakening, destructive data operations, and protected promotion or release.

## Operating sequence

Detect → classify once → implement → regression and negative tests → Track/KPMO machine quorum → workload-independent verification → bounded governed landing → target-main revalidation → registry/evidence truth-sync → report.

Unknown or conflicting classification is `FAIL_CLOSED_OWNER_REQUIRED`. Production, Public, and G5 remain `HOLD` unless the Program Owner separately authorizes the exact gated action.

## Repository-wide approval envelope

`autonomous-approval-policy-envelope-v1.json` is the canonical router for approval-bearing work. It classifies work once as `INTERNAL_REVERSIBLE`, `STAGING_BOUNDED`, `OWNER_RESERVED`, or `UNKNOWN`. Eligible internal and bounded STAGING work must not repeatedly request Owner approval while its exact base, tree, scope, risk class, evidence, rollback and expiry remain valid.

An eligible envelope permits at most three attempts in two hours. A pre-mutation validation or dispatch failure does not consume the authority. Draft-to-Ready rebinding and a non-force empty recovery commit are automated only when the tree, scope, risk class, evidence and rollback digests remain identical. Every head generation is receipted. Any tree, scope, base, risk, evidence or Owner-boundary change invalidates the envelope and fails closed.

The exact-head Owner-comment landing policy remains available only for Owner-reserved actions and explicit recovery. Routing eligible internal work into that path is a policy violation because it recreates routine human orchestration.

## Normal activation and legacy recovery

Eligible internal landing uses three role-specific workflows as the normal path: `.github/workflows/kidults-autonomous-track-authorization-v1.yml`, `.github/workflows/kidults-autonomous-kpmo-authorization-v1.yml`, and `.github/workflows/kidults-autonomous-independent-verification-authorization-v1.yml`. Each role signs the same exact Git tuple through its own OIDC-bound AWS role and KMS key. The AWS durable ledger records the three approvals, and the finalizer may reserve and consume the one-use authorization only after quorum. Manual `Run workflow`, natural-language Owner comments and direct Owner merge clicks are recovery mechanisms, not normal orchestration.

The GitHub repository OIDC subject must be customized to include `repo`, `context`, and `workflow_ref`; AWS trust policies accept only `aud` and this customized `sub`. The legacy Atomic Governed Landing and Direct Owner Handoff remain available only until the role-scoped workload registry, customized OIDC subject, AWS roles/KMS keys, durable ledger, immutable receipt sink, and one successful live STAGING canary are verified. They must never be interpreted as permission to change Production, Public or G5 HOLDs.

An agent identity that violates scope, replays authority, omits evidence or abandons an executable duty is quarantined. Every unused authorization for that identity is revoked. A replacement must complete a fresh constitutional bootstrap and reproduce the work under a new authorization generation; the removed identity cannot approve its replacement.
