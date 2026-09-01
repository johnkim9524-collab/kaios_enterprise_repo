# KIDULTS Current-SOLD Engine V1.2

## Decision and truth boundary

`KIDULTS Current-SOLD` is an owned intelligence product. External providers remain replaceable evidence/source layers; they do not own canonical event, evidence, correction, or ledger identities.

The protected execution chain is:

`SOURCE -> ACQUISITION_RECEIPT -> RIGHTS_RECEIPT -> OBSERVATION -> ATOMIC_CURRENT_SOLD_ADMISSION -> CURRENT_SOLD_EVENT -> CANONICAL_EVIDENCE -> PRIVATE_DRY_RUN_RECEIPT -> POSTGRES APPEND-ONLY LEDGER -> TRACK B -> PROJECTION`

V1.2 is still internal control code. It does **not** claim empirical Current-SOLD acquisition, apply the PostgreSQL migration, write a private database row, call a provider, deploy, or grant Public, Production, or G5 authority.

## Collaboration audit findings fixed in V1.2

### 1. Partial batches could expose valid-looking Evidence

The V1.1 classifier could return `PARTIAL_FAIL_CLOSED` while retaining otherwise valid rows in `admitted`; the V1.1 bundle then transformed those rows into canonical Evidence even though PostgreSQL writing was blocked.

V1.2 inserts an atomic admission boundary:

- every observation must pass;
- any rejection or quarantine withholds **all** admitted events;
- non-PASS bundles contain zero event versions and zero canonical Evidence;
- validated rows may appear only as digest-only diagnostic identities;
- a non-PASS result is never ledger eligible.

This closes downstream consumption of a partial batch rather than merely blocking the final database writer.

### 2. Thirty-day observations were indistinguishable from strict Current-SOLD

The admission policy defines:

- strict Current-SOLD: sale age no greater than 7 days;
- bounded recent history: greater than 7 and no greater than 30 days;
- older facts: historical only.

V1.2 makes the canonical Current-SOLD admission path strict at seven days. A sale aged 8–30 days is rejected from this product path with `CURRENT_SOLD_NOT_STRICT_CURRENT`. A future bounded-recent product must use a separate explicit classification and cannot inherit the Current-SOLD name.

### 3. A supplied receipt registry needed an independent digest boundary

The atomic bundle requires a separately supplied `expectedReceiptRegistryDigest`. The complete validated registry snapshot is hashed and must match that exact SHA-256 value before admission can proceed.

For an empirical run, the digest authority class must be `GOVERNED_LEDGER_DIGEST`. Supplying the registry JSON and calculating an untrusted digest in the same empirical process is not sufficient governance; the caller must obtain the expected digest from the governed registry/ledger boundary.

### 4. The previous CLI could persist a raw full bundle

The V1.1 full-bundle CLI remains available only as a lower-level control diagnostic. It is no longer the canonical first-empirical execution path.

The V1.2 private dry-run runner:

- accepts private input and receipt-registry files;
- requires empirical files to be regular, non-symlink files inside an absolute private mount;
- rejects empirical files with group/world permissions;
- requires an exact external registry digest;
- retains the raw bundle only in memory;
- emits a redacted digest/count receipt with mode `0600`;
- writes no PostgreSQL row and applies no migration;
- prints no source URL, object identity, price, raw event, registry, or Evidence payload.

## Canonical components

| Role | Canonical component |
| --- | --- |
| Atomic admission and bundle | `scripts/kidults/market/current-sold-atomic-batch-v1.mjs` |
| Lower-level observation classifier | `scripts/kidults/market/current-sold-engine-v1.mjs` |
| Canonical Evidence transformer | `scripts/kidults/market/current-sold-evidence-v1.mjs` |
| Private empirical/control dry-run | `scripts/kidults/market/current-sold-private-dry-run-v1.mjs` |
| Synthetic control smoke | `scripts/kidults/market/current-sold-control-smoke-v1.mjs` |
| Legacy full-bundle diagnostic | `scripts/kidults/market/current-sold-batch-v1.mjs` |
| PostgreSQL writer | `scripts/kidults/market/current-sold-postgres-ledger-v1.mjs` |

## Atomic batch semantics

`admitAtomicCurrentSoldBatch` retains separate concepts:

- `validated_candidate_count`: rows that passed the lower-level classifier;
- `diagnostic_candidates`: event/content digest identities available only when the batch is blocked;
- `admitted_count`: canonical admissions, always zero unless the entire batch is `PASS`;
- `batch_admitted_current_sold_count`: never includes withheld candidates.

A mixed batch containing one valid row and one invalid unrelated row is therefore:

```text
status=PARTIAL_FAIL_CLOSED
validated_candidate_count=1
admitted_count=0
event_versions=0
evidence=0
ledger.write_eligible=false
```

## Synthetic control smoke

The control smoke fixture is generated at runtime and is explicitly classified as `CONTROL_SYNTHETIC`.

Its receipt must show:

```text
control_synthetic_admitted=1
empirical_admitted=0
postgres_migration_applied=false
postgres_rows_written=0
provider_calls=0
Public/Production/G5=HOLD
```

A successful synthetic smoke run proves only that the protected software path executes. It is prohibited as empirical, product, vertical, global, launch, Public, Production, or G5 evidence.

## Private empirical dry-run

The canonical dry-run invocation is:

```bash
node scripts/kidults/market/current-sold-private-dry-run-v1.mjs \
  --input /private/current-sold/input/batch.json \
  --receipt-registry /private/current-sold/input/receipt-registry.json \
  --expected-registry-digest sha256:<64-hex-governed-ledger-digest> \
  --registry-authority-class GOVERNED_LEDGER_DIGEST \
  --execution-class LAWFUL_EMPIRICAL_PRIVATE \
  --private-mount-root /private/current-sold \
  --receipt-output /private/current-sold/receipts/dry-run-receipt.json \
  --now 2026-09-01T10:00:00.000Z
```

The runner will fail closed when:

- either input is outside the private mount;
- an input is missing, empty, oversized, non-regular, a symlink, or accessible to group/others;
- the registry digest is missing or differs;
- the registry authority class does not match the execution class;
- any observation is not terminal SOLD, is older than seven days, has invalid price/currency/fee semantics, has invalid correction lineage, or lacks exact receipt/source/run binding;
- any row is rejected or quarantined.

The dry-run receipt may report a lawful empirical admission count only when the entire batch is `PASS`. That count remains `PIPELINE_FUNCTIONAL_ONLY`. It does not authorize PostgreSQL writing or release.

## PostgreSQL boundary

The existing append-only migration and writer remain unchanged in V1.2. They accept only a full PASS bundle and independently recompute the admission, event, Evidence, and receipt digests before SQL.

Migration application and the first private append-only write remain separate approval gates. V1.2 dry-run execution always records:

```text
write_requested=false
write_performed=false
migration_applied=false
rows_written=0
```

## Verification target

The exact-head workflow must complete all of the following:

- parse the seven existing Current-SOLD schemas plus the private dry-run receipt schema;
- syntax-check every Current-SOLD script and test;
- pass the full Current-SOLD suite, expected at **44 tests / 0 failures**;
- execute one runtime-generated synthetic control smoke;
- assert that the smoke receipt is redacted, mode `0600`, atomic, non-empirical, and no-write;
- pass the append-only PostgreSQL static negative scan.

## Next governed execution

After V1.2 is merged, the next empirical step is a **single lawful genuine SOLD transaction in private dry-run mode only**.

Required before that run:

1. provenance-bound acquisition receipt;
2. rights receipt applicable to private Current-SOLD use;
3. governed receipt-registry snapshot and external exact digest;
4. private mount containing `0600` input files;
5. exact source SHA and canonical run ID;
6. no PostgreSQL migration or write.

Public, Production, and G5 remain HOLD.
