# ADR-001 — GitHub Actions Supply-Chain Pinning

Status: Accepted baseline decision; implementation hardening remains incremental.

## Context

Critical KIDULTS workflows currently use first-party/popular GitHub Actions such as checkout, setup-node and upload-artifact. Tag-based references are operationally simple but mutable; commit-SHA pinning reduces tag-mutation risk while increasing update overhead.

## Decision

1. Least-privilege workflow permissions are mandatory immediately.
2. Deterministic application dependencies are mandatory immediately (`package-lock.json` + `npm ci`).
3. Commit-SHA pinning is **recommended for security-critical or mutation-capable third-party Actions**.
4. Read-only GitHub-owned Actions may remain on reviewed major-version tags during the current hardening pass, provided dependency/update monitoring is retained.
5. Any Action with elevated write permissions, deployment authority, secret access or external mutation capability requires an explicit supply-chain review before production use.

## Rationale

The current critical certification workflows are read-only and fail closed. Converting every existing read-only GitHub-owned Action reference during the same hardening PR would create broad mechanical churn without materially improving runtime correctness. The higher-value immediate controls are least privilege, deterministic Node/toolchain/dependencies, no unreviewed mutation authority, and audit visibility.

## Follow-up

Before production deployment automation is authorized, pin mutation-capable Actions to reviewed immutable SHAs and record approved update procedure.

## Limitation

This ADR records the evaluation required by #210; it is not a claim that all Action references are already SHA-pinned.
