# Canonical same-main refresh and acknowledged-write evidence

## Scope

This correction is a code/control integration, not a Canonical Apply authorization,
Owner dispatch, protected-main merge, production-readiness proof or release.
Production/Public/G5 remain HOLD. Normal validation remains fail-closed.

## Observed cause

PR #2024 head `1a2a976c9277a71322a975cc6b1fc76352c09e7b` failed Live
Canonical run `33985008461`, job `101356802688`, at
`2026-09-05T18:45:15Z` with `COMMIT_MISMATCH`.
Aggregate comment `5552938233` was committed on the same protected main
`71319213c35f628b8bd54124ac9131abc47120d2` with 168 material defects.
The failed run's severity-parity stage observed 169. These are historical
observations, not a claim about the present live defect count.

The writer reused the strict live validator before append. When only issue
material changed on the same main, it threw before creating a replacement,
even after a fresh valid Owner authorization. A different main already had a
stale-generation path. Disabling live validation or retrying the unchanged
writer is not a correction.

## Parallel implementation preserved

The integration retains #2024 head `80e4ed60ffe6cbf152e00d3282bf20aa315e4070`'s
strict historical material classifier, immutable native Actions bot comments,
successful exact-main prior Owner writer-run proof and 31 regression cases.
It adds acknowledged-write accounting, pre-aggregate truth rechecking, isolated
readback retry receipts and 32 additional (partly overlapping) control cases.
No competing historical-comparison helper replaces the native implementation.

## Corrected behavior

Only the authorized write path can request historical comparison. Repository,
main, canonical board set, policy and all HOLD fields must still match. Prior
schema/version, writer identifiers and material field shapes are checked; every
one of the 25 prior member comments is fetched, identity/digest-bound, immutable
and validated against the same historical projection. Only then can a changed
material snapshot be replaced by a new append-only 25+1 generation.

The old generation is never edited or declared current. Read-only validation
still rejects drift as `COMMIT_MISMATCH`, now preserving the differing field
names in its own failure receipt. This does not independently reconstruct
historical material records that were not stored in that projection.

Immediately before writing, current truth and Owner authorization are re-read.
A second truth check before the aggregate prevents committing a snapshot that
changed while members were staged. Post-write truth and exact-generation
readback remain mandatory. These are bounded continuity observations, not a
GitHub atomic snapshot or lease.

Failure accounting includes an acknowledged aggregate response (26 rather than
25). `writes` counts acknowledged comment responses, not proof of rollback or
proof that a failed HTTP request made no server-side change. No deletion or
cleanup writes are added. Eventual readback recovery requires the exact
acknowledged aggregate ID and does not issue a second writer invocation.
Read-only retry receipts use isolated temporary paths and cannot overwrite the
original acknowledged-write failure receipt.

## Reproduction and closure

`node --test tests/kidults/kpmo/canonical-generation-refresh-v1.test.mjs`

All network functions in the tests are replaced by in-memory transports. The
synthetic environment is not an Owner approval and cannot send a real request.
Coverage includes ordinary same-main refresh, unchanged idempotence, main
advance, corrupt/missing/edited members, policy drift, Owner/attempt gates,
truth movement, partial writes, and bounded eventual readback.

The existing read-only Canonical Bootstrap workflow executes this suite.
Actual closure still requires this correction to land, a fresh exact-main
non-App Owner authorization, a new first-attempt Owner Apply dispatch, and a
Live Canonical PASS. Any head/main movement requires new binding. No previous
approval or synthetic test substitutes for those observations.
