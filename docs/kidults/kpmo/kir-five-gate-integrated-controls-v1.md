# KIR five-gate integrated controls

## Scope

This follow-up is based on protected main
`5c5622ae52f48d360487ef69245164479b8a6c3a` after #2047. It joins the five
outstanding areas into one **code-control execution**, not an operational
completion receipt or a new release authority. No changes from sibling #2050
or #2053 are overwritten, cherry-picked or implicitly approved.

The existing KIR workflow keeps its original 250-test command. A mandatory
additional step runs the fixed five-group suite serially and validates its
retained bundle. Its outcome is part of the existing KIR terminal reconciler;
a failed integrated step cannot leave a successful KIR terminal receipt.
The companion artifact contains the receipt and exact stdout/stderr for all
five groups. Overlapping tests with the original command are not independent
samples and must not be added together as an empirical population.

## Five groups

1. Canonical: actual CLI/failure/recovery/refresh tests, including read-back and
   stale-generation rejection under closed transports.
2. Semantic: native ARL/Coverage identity and all existing five sentinel test
   files. Missing, skipped and stale producer evidence is not upgraded to PASS.
3. Atomic negative: dispatch receipt, lifecycle/transport and one-use tests.
   Invalid numeric identities and source/checkout mismatch now fail before
   canonical identity conversion and before any consumption.
4. Staging and ledger: loopback HTTP, PostgreSQL adapter, Current-SOLD bridge,
   ledger writer and atomic rollback/recompute tests. These use isolated test
   transports, not the managed production/staging database.
5. Production readiness: original KIR contract/source-storage tests, real
   readiness composer/member validators and the complete production evidence
   test file. Synthetic fixtures never attest an actual observation window.

## Root-cause correction: Atomic pre-mutation identity

The dispatch bootstrap accepted zero, leading-zero and unsafe integers because
it used digit-only regular expressions before `Number` conversion. It also did
not bind its diagnostic receipt to the actual workflow execution source. This
made malformed identities appear structurally valid and left source lineage
incomplete in the earliest negative-path evidence.

The initializer now requires positive safe integer identities in canonical
numeric form and compares the workflow's GITHUB_SHA with the actual checked-out
Git commit before accepting the bootstrap context. Missing or mismatched source
still emits a sanitized failure receipt. Version 2.5.0 includes execution source,
checked-out SHA and a bound/unbound flag. The intended PR head remains a separate
field: it is not incorrectly equated with the base workflow source.

The finalizer recomputes a version-2.5 rejected dispatch against its own exact
invocation and preserves that failure before any token/API gate. A copied or
modified rejection cannot silently replace another run. The later authorizer,
one-use consumption, merge transport and terminal-recovery contracts are unchanged. A structurally valid bootstrap is still
DISPATCH_RECEIVED_FAIL_CLOSED, never permission to merge. No workflow is dispatched
by this patch and #1898 still needs its authorized native negative execution.

## Integrity and resource boundaries

The suite refuses a dirty or different checkout, requires canonical origin and
rechecks source identity before each group and after completion. Test files and
commands are a fixed frozen allowlist, not caller-provided globs or commands.
Groups run serially, each bounded to 120 seconds and 16 MiB per captured stream.
Subprocesses receive an explicit environment without tokens, DSNs, loader options
or inherited proxy/credential settings. Existing loopback/closed-transport tests
remain tests; this is not an operating-system network sandbox.

Exit code zero alone is insufficient: a unique TAP summary with positive test
count, all tests passed, zero failures/cancellations/skips/todos is required.
A failed group is retained and the remaining groups still run, unless the source
identity itself changes. A private empty output directory outside the checkout
prevents replacing older proof. Each group updates an atomic failure-first
receipt, and completed logs are content-hashed. Offline verification rereads all
11 exact members, rejects links/traversal/missing/extra files and recomputes the
receipt and log digests and TAP counts. It proves content integrity only, not
native execution or operator authority. Abrupt runner loss remains outside the
artifact-retention guarantee.

No new workflow-run edges, schedules, jobs, credentials or permissions are added.
The existing KIR PR/push filters cover the newly integrated test surfaces.
The original KIR artifact shape is unchanged; five-gate controls have a distinct
non-authorizing companion artifact.

## Reproduction

Run from a clean exact commit and an empty private directory:

```sh
OUT="$(mktemp -d)"
SHA="$(git rev-parse HEAD)"
node scripts/kidults/runtime/run-kir-five-gate-control-suite-v1.mjs run \
  --expected-sha "$SHA" --output-dir "$OUT"
node scripts/kidults/runtime/run-kir-five-gate-control-suite-v1.mjs verify \
  --expected-sha "$SHA" --output-dir "$OUT"
```

## Operational exit criteria remain separate

The receipt lists, but does not claim to observe: authorized current-main
Canonical apply/live evidence; the four actual Semantic producers and consumers;
a native Atomic invalid-input execution and retained failure; lawful exact-pair
staging work plus managed PostgreSQL readback/PITR; and native production-evidence
provenance with the complete natural observation window. Existing evidence must
be checked before requesting any repeat action. No standing approval is created
or transferred. Production/Public/G5 remain HOLD.

- autonomous_effect: existing KIR push/PR executes all five control families without five manual invocations.
- global_effect: cross-source identity and shared controls integrated; no new geographic/source coverage claim.
- irreplaceable_value_effect: exact owned code/test and diagnostic lineage retained with re-verifiable digests.
- transparency_effect: code controls, content integrity, native execution and release authority remain distinct.
