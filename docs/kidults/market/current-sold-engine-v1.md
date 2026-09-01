# KIDULTS Current-SOLD Engine V1.2

## Decision and truth boundary

`KIDULTS Current-SOLD` is an owned intelligence product. External providers remain replaceable evidence-source layers; they do not own canonical event, Evidence, correction, batch, or ledger identities.

The protected execution chain is:

```text
SOURCE
  -> ACQUISITION_RECEIPT
  -> RIGHTS_RECEIPT
  -> OBSERVATION
  -> ATOMIC_CURRENT_SOLD_ADMISSION
  -> CURRENT_SOLD_EVENT
  -> CANONICAL_EVIDENCE
  -> PRIVATE_CANDIDATE_DRY_RUN_RECEIPT
  -> GOVERNED_RECEIPT_REGISTRY_AUTHORITY_ADAPTER (pending)
  -> POSTGRES APPEND-ONLY LEDGER (separate approval)
  -> TRACK B
  -> PROJECTION
```

V1.2 is internal control code. It does **not** claim lawful empirical Current-SOLD acquisition, verify a live governed receipt authority, apply the PostgreSQL migration, write a database row, call a provider, deploy, or grant Public, Production, or G5 authority.

Current truthful state:

```text
lawful_genuine_current_sold_admitted=0
private_candidate_current_sold_admitted=0
postgres_migration_applied=false
postgres_rows_written=0
provider_calls=0
deployment=false
Public/Production/G5=HOLD
```

## Collaboration-audit defects closed in V1.2

### 1. Partial batches could expose canonical-looing Evidence

The V1.1 lower-level classifier could return `PARTIAL_FAIL_CLOSED while retaining otherwise valid rows in `admitted`. The V1.1 batch bundle then transformed those rows into canonical Evidence even though the batch itself had not passed.

V1.2 makes the batch boundary atomic in both the legacy library and the canonical wrapper:

- every observation must pass;
- any rejection or quarantine withholds **all** admitted rows;
- a blocked batch contains zero event versions and zero canonical Evidence;
- valid-looking rows may appear only as digest-only diagnostic identities;
- a non-PASS batch is never ledger-write eligible.

A mixed batch therefore resolves to:

```text
status=PARTIAL_FAIL_CLOSED
validated_candidate_count>=1
admitted_count=0
event_versions=0
evidence=0
ledger.write_eligible=false
```

### 2. Thirty-day recency was not strict Current-SOLD

The product admission contract defines strict Current-SOLD as a sale no older than seven days. V1.2 enforces:

- maximum sale age: `7 days`;
- maximum future clock skew for `sold_at` or `observed_at`: `300 seconds`;
- sales aged 8–30 days: `CURRENT_SOLD_NOT_STRICT_CURRENT`;
- older observations require a separately named historical or bounded-recent product and cannot inherit the Current-SOLD name.

### 3. An exact digest was not a governed authority

V1.2 requires a separately supplied exact SHA-256 digest for the complete validated receipt-registry snapshot. A mismatch fails before any candidate receipt is emitted.

However, the standalone private runner does **not** prove who issued that digest. Its empirical-candidate authority class is therefore explicitly:

```text
EXTERNAL_EXACT_DIGEST_UNVERIFIED
```

The unavailable class is:

```text
LAWFUL_EMPIRICAL_PRIVATE
```

A future `GOVERNED_RECEIPT_REGISTRY_AUTHORITY_ADAPTER` must independently verify the registry source, issuer, immutable object identity, exact digest, purpose-rights decision, validity interval, source SHA, and canonical run before any lawful empirical count may exceed zero.

### 4. Raw full-bundle persistence was unsafe for a first empirical run

The old full-bundle writer and executable CLI are disabled:

```text
CURRENT_SOLD_BATCH_RAW_BUNDLE_PERSISTENCE_DISABLED
CURRENT_SOLD_BATCH_LEGACY_CLI_DISABLED_USE_PRIVATE_DRY_RUN
```

The in-memory batch library remains available for deterministic control and ledger recomputation, but it also applies whole-batch atomic withholding and strict seven-day semantics.

### 5. Private-path and clock trust required hardening

For `EMPIRICAL_CANDIDATE_PRIVATE`, V1.2 requires:

- an absolute private mount;
- a real, non-symlink mount directory with exact mode `0700`;
- regular, non-symlink input files with exact mode `0600`;
- no hard links;
- no symlink component below the mount;
- realpath containment after resolution;
- open with `O_NOFOLLOW`;
- device/inode/size revalidation after opening;
- no caller-provided evaluation-time override;
- an existing realpath-contained receipt directory with exact mode `0700`;
- directory-descriptor-bound output creation to prevent parent replacement between validation and write;
- exclusive `O_EXCL | O_NOFOLLOW` receipt creation with exact mode `0600`.

The receipt is digest/count-only. It contains no source URL, canonical object identity, price, raw event, receipt registry, event version, Evidence payload, private output path, raw batch ID, or raw canonical run ID. Batch and run identities are represented only by SHA-256 digests.

## Execution classes

|Execution class | Registry authority class | Truth ceiling | Lawful empirical count |
|---|---|---|---:|
| `CONTROL_SYNTHETIC` | `CONTROL_SYNTHETIC_GENERATOR` | `CONTROL_ONLY` | `0` |
| `EMPIRICAL_CANDIDATE_PRIVATE` | `EXTERNAL_EXACT_DIGEST_UNVERIFIED` | `PRIVATE_PIPELINE_CANDIDATE_ONLY` | `0` |
| `LAWFUL_EMPIRICAL_PRIVATE` | unavailable | blocked pending governed authority adapter | `0` |

A private candidate PASS proves only that the supplied private inputs satisfy the software contract at the system clock. It does not establish legal provenance, governed receipt authority, product evidence, database persistence, launch readiness, or release permission.

## Canonical components

| Role | Canonical component |
|---|---|
| Atomic admission and bundle | `scripts/kidults/market/current-sold-atomic-batch-v1.mjs` |
| Low-level observation classifier | `scripts/kidults/market/current-sold-engine-v1.mjs` |
| Canonical Evidence transformer | `scripts/kidults/market/current-sold-evidence-v1.mjs` |
| Private candidate/control dry-run | `scripts/kidults/market/current-sold-private-dry-run-v1.mjs` |
| Synthetic control smoke | `scripts/kidults/market/current-sold-control-smoke-v1.mjs` |
| Legacy in-memory batch library | `scripts/kidults/market/current-sold-batch-v1.mjs` |
| PostgreSQL writer | `scripts/kidults/market/current-sold-postgres-ledger-v1.mjs` |
| Append-only migration | `infrastructure/postgres/current-sold/0001_current_sold_append_only_ledger_v1.sql` |

## Synthetic control smoke

The runtime-generated fixture is explicitly `CONTROL_SYNTHETIC`. Its redacted receipt must show:

```text
control_synthetic_admitted=1
private_candidate_admitted=0
lawful_empirical_admitted=0
postgres_migration_applied=false
postgres_rows_written=0
provider_calls=0
Public/Production/G5=HOLD
```

A successful synthetic smoke proves software-path execution only. It is prohibited as empirical, product, vertical, global, launch, Public, Production, or G5 evidence.

## Private candidate dry-run

The standalone candidate invocation is:

```bash
node scripts/kidults/market/current-sold-private-dry-run-v1.mjs \
  --input /private/current-sold/input/batch.json \
  --receipt-registry /private/current-sold/input/receipt-registry.json \
  --expected-registry-digest sha256:<64-hex-external-exact-digest> \
  --registry-authority-class EXTERNAL_EXACT_DIGEST_UNVERIFIED \
  --execution-class EMPIRICAL_CANDIDATE_PRIVATE \
  --private-mount-root /private/current-sold \
  --receipt-output /private/current-sold/receipts/candidate-dry-run-receipt.json
```

Do not pass `--now` for a private candidate. The runner uses system UTC and rejects an empirical-candidate time override.

A candidate receipt may report:

```text
private_candidate_admitted=N
lawful_empirical_admitted=0
governed_registry_authority_verified=false
lawful_admission_authorized=false
claim_ceiling=PRIVATE_PIPELINE_CANDIDATE_ONLY
```

No raw bundle is persisted and no PostgreSQL operation is attempted.

## PostgreSQL boundary

The existing append-only migration and writer remain separate from the candidate dry-run. They accept only a full PASS bundle and independently recompute admission, event, Evidence, and receipt digests before SQL.

Migration application and the first private append-only write remain separate approval gates. V1.2 always records:

```text
write_requested=false
write_performed=false
migration_applied=false
rows_written=0
```

## Verification target

The exact-head workflow must:

- parse eight Current-SOLD JSON schemas/control files;
- syntax-check every Current-SOLD script and test;
- pass **51 tests / 0 failures**;
- prove mixed-batch atomic withholding through both batch layers;
- prove 8–30-day and future-timestamp rejection;
- prove self-declared lawful execution is unavailable;
- prove private mount/file/output mode, symlink, realpath, and exclusive-write controls;
- run one runtime-generated synthetic control smoke;
- verify that the smoke receipt is redacted, mode `0600`, non-empirical, atomic, and no-write;
- pass the PostgreSQL append-only static negative scan.

## Next governed implementation

The next code package is not PostgreSQL activation. It is the `GOVERNED_RECEIPT_REGISTRY_AUTHORITY_ADAPTER`, which must fail closed unless it can bind an external immutable registry object and independently trusted digest/issuer evidence to the exact source SHA, canonical run, acquisition receipts, rights receipts, and purpose.

Only after that adapter is implemented and reviewed may a single genuine transaction be evaluated as a lawful empirical dry-run candidate. Database migration and the first append-only write still require a later explicit approval. Public, Production, and G5 remain HOLD.
