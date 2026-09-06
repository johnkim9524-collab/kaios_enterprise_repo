# Semantic-chain native run identity repair

## Scope and source

This is a continuation of Draft PR #2047, based on its exact live head
`4b9be81f1d8eeceadf48ddb0d5170098e7273984` and protected-main snapshot
`f62bd27a84508c8d9d4ac59c74d9700efc9bab16`. Source reconstruction used the native
tracked-object snapshot from run `34022919531`, artifact `9986097198` (ZIP SHA-256
`63b0ddaaf22309dfd627ace06cc091647fcb252d4f7e913b44358656f8766974`). The local
bootstrap was consumed as `BOOTSTRAP_VERIFIED`, with `LOCAL_COMMIT_BOUND` scope;
it is not a remote-ref attestation or merge authority.

The previously prepared 60c9ad7 patch is integrated without reverting the newer
4b9be81f guard: expectedProducerEvent remains restricted to workflow_run. Invalid
terminal conclusions are now rejected before a scheduled/manual SKIP. The
existing fixture and all earlier source/attempt/event rejection rules remain.

## Root cause and integrated correction

Historical native run `34013158292` had `name` and `display_title` equal to
`KIDULTS ARL / p1-34013139877`. Its safe-archive, resolution and regression steps
finished before the current-run jq guard compared `name` with the static YAML
workflow name and exited 4. The historical failure remains a failure.

The correction accepts either the static name or the exact, bounded dynamic
name for the corresponding fixed workflow path. This is a name-consistency
check only: source SHA, event, lifecycle, run ID, attempt, repository, producer
receipt, archive and generation-cardinality checks remain independently required.
Arbitrary prefixes, recovery names, mismatched display titles and unsafe IDs are
not accepted. No default green or fallback to a predecessor SHA is added.

The ARL current-run guard binds the native run/attempt, both repositories,
exact P1 title, workflow path, event and source. Shared ARL history and Coverage
history accept the native name form while retaining complete-page and duplicate
producer rejection. Coverage's exact upstream read checks both native repository
identities and the triggering attempt. Its output uses the schema's stable
workflow name only after validation; native display title remains separately bound.

Coverage's existing Assurance binding step and content observer are selected by
fixed workflow path rather than dynamic display name. The native Coverage name
must still equal either the static name or the exact source-SHA title. The
independent sentinel validates the same bounded name/path contract and rechecks
the raw display title during native run re-read. Its strict four-producer gate,
permissions, schedule and no-promotion boundary are unchanged.

The generation classifier also rejects missing/invalid events, nonterminal or
malformed lifecycle, unsafe run IDs, invalid attempts and malformed source SHA
before an expected nonauthoritative skip. Well-formed scheduled/manual producers
remain nonauthoritative; this does not enable any producer or provider.

## Terminal evidence

The ARL producer job now initializes a nonconsumable failure observation before
checkout. An independent inline-Python finalizer records six step outcomes and
job status; the same observation is retained on ordinary success or failure.
The separate artifact cannot be selected as the canonical ARL producer artifact.
Its observation PASS never grants producer, release or promotion authority.
Abrupt runner loss can still prevent artifact upload; this does not claim
unconditional durability or permanent storage beyond Actions retention.

## Reproduction and remaining gates

Run the following on the candidate revision:

```sh
node --test tests/kidults/source-intelligence/semantic-chain-native-run-identity-v1.test.mjs
node scripts/kidults/source-intelligence/validate-asi-orchestration-run-history-v1.mjs
node scripts/kidults/source-intelligence/validate-asi-autonomous-resolution-provenance-v1.mjs
node scripts/kidults/kpmo/validate-requirement-assurance-watch-v1.mjs
node scripts/kidults/kpmo/run-p0-control-plane-closure-suite-v1.mjs
```

New tests execute the actual ARL jq predicate, Coverage inline JavaScript and
terminal Python extracted from the workflow, as well as complete pagination,
receipt binding and sentinel trigger regressions. They use bounded offline
fixtures, not independent business samples or natural main execution.

Remote publication, hosted exact-head CI, governed landing, natural four-producer
Semantic proof, actual staging workload, PostgreSQL/PITR and production-readiness
remain distinct gates. No existing authorization is transferred. No Ready,
Handoff, manual dispatch, main write, provider/credential/remote database mutation,
external spend or deployment is performed by this change. Public/Production/G5 HOLD.

- autonomous_effect: repairs existing producer-to-observer continuity without adding workflow-run edges.
- global_effect: strengthens shared cross-source identity handling; no empirical coverage increase claimed.
- irreplaceable_value_effect: preserves exact source, generation and retained failure lineage.
- transparency_effect: keeps raw native identity, stable schema identity, observation and health authority separate.

## Unified KIR regression and evidence limits

The existing KIR workflow selects these shared identity/observer paths and
executes the native semantic-chain regression together with its existing ten
runtime, Current-SOLD, ledger, source-storage and readiness-intake test files.
No existing test is removed. The new suite contains 90 tests (84 from the
previous packet plus four malformed terminal conclusions, expected-event
authority widening and KIR wiring regressions). These are synthetic/local
checks, not live business samples. The original 160 KIR tests remain.

The snapshot trigger covers the new helper, observer and KIR workflow edits.
This changes only existing PR/push path coverage, not the workflow_run graph,
schedules, dispatches, credentials, permissions, fanout limits or main approval
policy. Actions YAML parsing and offline shell syntax are separate from hosted
CI and from natural producer execution. Authoritative current-head results are
the native PR head, hosted run/job/artifact identifiers and their read-back, not
any count in this document copied onto a later head.

References: GitHub Docs, Workflow syntax for GitHub Actions (run-name); REST API
endpoints for workflow runs (run, attempt, path, source); Events that trigger
workflows (workflow_run).
