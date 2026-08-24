# KIDULTS Original Full-Scope Portal — External Gate Runbook

Status: INTERNAL PREPARATION COMPLETE / EXTERNAL EXECUTION PENDING  
Canonical surface: `portal-r001`  
Production/Public/G5: `HOLD`

## Operating boundary

The Portal consumes a server-admitted Projection. It does not call provider APIs, calculate market truth, infer rights, or promote a fixture. Partner Review and legacy variants remain separately preserved and are not valid deployment inputs.

## Gate order

1. GitHub administrator records the 15/15 Environment and trusted-execution readback.
2. Staging operator executes the exact source SHA deployment and captures health receipt.
3. Staging operator executes the rollback drill and captures restored-digest receipt.
4. Rights administrator records source × purpose × geography rights for a lawful current SOLD source.
5. Track A submits only the exact immutable `snapshot-candidate.json` + `evidence-package.json` pair.
6. Independent Track B reviewer records the assessment against both exact digests.
7. Human reviewer records screen-reader and usability acceptance.
8. Staging/RUM operator records remote LCP/CLS/INP and edge TLS/observability receipts.
9. Control-plane approver issues the short-lived Projection capability only after all preceding receipts pass.

## Fail-closed rules

- Missing, stale, unsigned, mutated, or self-attested receipts remain `HOLD`.
- A Portal screenshot, CI green check, provider response, listing, historical transaction, or chat statement is not a Track B input.
- A rights withdrawal, Evidence digest change, assessment mismatch, freshness expiry, or rollback event revokes the Projection.
- No receipt authorizes Production, Public release, or G5 by itself.

## Required evidence

Populate only `portal-external-gate-evidence-index-v1.json` slots. Every receipt must include UTC time, exact source/build identity, reviewer or operator identity, and its governing digest. Never place credentials or raw personal data in receipts.

## Recovery

On any failed health check, stale Projection, rights withdrawal, or observability gap: stop promotion, revoke the capability, preserve the failed bundle, restore the last verified release, and attach the rollback receipt. Do not re-run with a different source SHA to make a failed result pass.
