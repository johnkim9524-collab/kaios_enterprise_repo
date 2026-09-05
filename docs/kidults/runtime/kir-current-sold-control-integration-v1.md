# KIR / Current-SOLD control integration

## Scope

The bridge calls the existing KIR evaluator, `buildAtomicCurrentSoldBatchBundle`,
and the existing Evidence digest implementation. It is a synthetic integration
probe, not an empirical runtime, source adapter, PostgreSQL writer, rights grant,
Track B assessor or publication path.

The same KIR workflow now checks both the original runtime tests and the bridge
regressions. Its PR and path-matching main push filters cover the real Current-SOLD
modules and the fixture helper. There is no extra workflow, schedule, dispatch,
secret permission, database connection or provider request.

## Data and authority boundaries

Inputs require `CONTROL_ONLY_SYNTHETIC`, `kir-fixture-` identifiers,
`kir-fixture:` object identities and the exact host `kir-fixture.invalid`.
Repository/SHA/run/attempt are taken from the independently supplied execution
identity; the synthetic canonical run is derived from the actual run and attempt.
The test clock is explicit and is not a claim about current market freshness.

Registry digests are supplied explicitly and rechecked. The actual atomic engine
must reject the entire batch when any row fails. Event/Evidence generation is
exercised in memory, but raw rows, raw Evidence, bundles and engine ledger
eligibility are not returned by the bridge. Diagnostic counts are synthetic only.
Every result preserves zero empirical delta, zero database writes, false
provider/database/runtime/producer-health/promotion authority, and HOLD for
Public/Production/G5. Synthetic rights receipts do not establish legal rights.

## Durable proof

The workflow initializes a failing bridge packet before checkout. After regression
success it exercises a valid one-row case and a two-row case with one missing
acquisition receipt. The latter must admit zero rows and emit zero Evidence.
The terminal reconciler checks the bridge stage, exact identity, payload scope,
case outcomes and authority flags. It binds the bridge packet's actual file digest
into the KIR terminal receipt before always-upload. A missing, stale or malformed
bridge result cannot produce a valid aggregate receipt.

## Limits and next integration boundary

This does not activate the receipt-authority keyring from PR #1960, apply a
PostgreSQL migration, create an empirical Candidate/Evidence pair, start Track B,
approve a Projection, refresh the Canonical board or authorize protected-main
landing. Those remain independent gates. PR #2014's approval generation and
landing controls are not changed. Historical readiness data remain historical.

## Operating principles

- autonomous_effect: existing deterministic PR/main-path CI exercises connected code.
- global_effect: provider-neutral batch/Evidence API; no empirical scale claim.
- irreplaceable_value_effect: KIDULTS-owned generation and evidence lineage binding.
- transparency_effect: synthetic diagnostics cannot be represented as live data.
