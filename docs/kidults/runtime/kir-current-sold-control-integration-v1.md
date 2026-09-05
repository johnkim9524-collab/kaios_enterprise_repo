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


## Sentinel consumer hardening — local continuation, 2026-09-05

Canonical receipt consumption now rebuilds each material-defect record with the
native `buildMaterialRegistry` rules, recomputes the registry SHA-256, and derives
P0/P1 query counts from the normalized labels. Overlapping P0/P1 labels are valid;
their counts are not summed into a unique-issue total. Record order, title/label
severity parity, declared severity, effective priority, and canonical record
shape must all match. The consumer also requires the native V3 output identity,
exact 25-board set, source-bound generation, aggregate comment identifier, and
producer verification flags. It does not create or apply a Canonical generation.

All present public-boundary fields must be HOLD; `public_release=HOLD` cannot hide
`public=PASS`. The non-extracting ZIP reader rejects exponent/integer overflow
that would become a non-finite JavaScript number and rejects original ZIP names
that differ after NUL truncation. The PR trigger watches the native Canonical
registry/library and producer-output contracts as well as the consumer itself.

These are additional local consumer controls. Successful consumption of an
existing main-produced archive in a local test is not natural execution of the
new Sentinel on protected main. Source-run proof, deployment, real PostgreSQL,
staging business workloads, final Production readiness, and approvals remain
separate. The original downloaded ZIP, its GitHub run/attempt and archive digest,
local checker version, and member digests must be retained in any read-back
report. A Pages boundary audit proves only that project's recorded settings and
inventory at its observation time; it is neither a whole-estate audit nor proof
that the current KIR candidate is deployed. Production/Public/G5 remain HOLD.


## PR #2024 continuation boundary

The successor source baseline is PR #2024 exact head
`43c4c41947f74e05da5be0cb4a25237f157dbf7d`, not closed/unmerged PR #2016.
The newer restricted-byte hard stop, SQL constraint, contract, negative tests,
writer snapshots and dynamic ancestor-bound source export are preserved.
Legacy local code must never overwrite these newer controls.

Landing consumes structural exact-merge-SHA suite evidence only. Even four
SUCCESS step outcomes cannot grant producer-health authority: payload content
must pass the separate exact-SHA Sentinel gate. Before writing its local
consumption receipt, the consumer re-reads the selected run IDs/attempts,
terminal outcomes and main SHA. A changed generation fails closed. This is
read-back continuity, not an atomic lease on GitHub or a future-proof snapshot.
The CLI regression runs through synthetic GET responses and writes only a
private temporary receipt; it performs no GitHub operation.
