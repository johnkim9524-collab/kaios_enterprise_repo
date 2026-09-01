# KIDULTS Current-SOLD Engine V1.3

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

V1.3 is internal control code. It does **not** claim lawful empirical Current-SOLD acquisition, verify a live governed receipt authority, apply the PostgreSQL migration, write a database row, call a provider, deploy, or grant Public, Production, or G5 authority.

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

### 1. Atomic batch admission

The V1.1 lower-level classifier could return `PARTIAL_FAIL_CLOSED` while retaining otherwise valid rows in `admitted`. The old batch bundle could then transform those rows into canonical-looking Evidence even though the batch had not passed.

V1.2 made both batch layers atomic:

- every observation must pass;
- any rejection or quarantine withholds all admissions;
- a blocked batch contains zero event versions and zero canonical Evidence;
- valid-looking rows may appear only as digest-only diagnostics;
- a non-PASS batch is never ledger-write eligible.

### 2. Strict Current-SOLD time semantics

The product admission contract now enforces:

- maximum sale age: `7 days`;
- maximum future clock skew for `sold_at` or `observed_at`: `300 seconds`;
- sales aged 8–30 days: `CURRENT_SOLD_NOT_STRICT_CURRENT`;
- older observations cannot inherit the Current-SOLD product name.

### 3. Exact digest is not governed authority

The private runner requires a separately supplied exact SHA-256 digest for the complete validated receipt-registry snapshot. A mismatch fails before a candidate receipt is emitted.

The standalone runner still cannot prove who issued that digest. Its authority class is therefore:

```text
EXTERNAL_EXACT_DIGEST_UNVERIFIED
```

`LAWFUL_EMPIRICAL_PRIVATE` remains unavailable until a future `GOVERNED_RECEIPT_REGISTRY_AUTHORITY_ADAPTER` independently verifies the immutable registry object, issuer, digest, purpose-rights decision, validity interval, source SHA, canonical run, acquisition receipts, and rights receipts.

### 4. Raw full-bundle persistence disabled

The legacy full-bundle writer and executable CLI are disabled:

```text
CURRENT_SOLD_BATCH_RAW_BUNDLE_PERSISTENCE_DISABLED
CURRENT_SOLD_BATCH_LEGACY_CLI_DISABLED_USE_PRIVATE_DRY_RUN
```

The in-memory library remains available only for deterministic control and ledger recomputation and applies the same atomic withholding and strict seven-day semantics.

### 5. Private filesystem and clock trust

`EMPIRICAL_CANDIDATE_PRIVATE` requires:

- absolute, real, non-symlink private mount mode `0700`;
- regular, non-symlink, single-link input mode `0600`;
- no symlink component below the mount;
- realpath containment;
- `O_NOFOLLOW` open and device/inode/size revalidation;
- no caller-provided evaluation-time override;
- existing realpath-contained receipt directory mode `0700`;
- directory-descriptor-bound, exclusive `O_EXCL | O_NOFOLLOW` receipt creation mode `0600`.

The candidate receipt is digest/count-only. It contains no source URL, canonical object identity, price, raw event, registry, event version, Evidence payload, private path, raw batch ID, or raw canonical run ID.

## V1.3 post-landing evidence correction

### Root cause

The protected-main `push` trigger added in V1.2 is a useful fallback, but it cannot produce authoritative post-merge evidence for the normal Atomic Governed Landing path.

`KIDULTS Atomic Governed Landing V1` performs the server-side merge with the repository `GITHUB_TOKEN`. GitHub intentionally suppresses new workflow runs for most events created by that token, including the merge-generated `push`, to prevent recursive workflows. Therefore a successful Atomic Landing can create the exact protected-main merge commit while producing no Current-SOLD `push` run on that SHA.

This is a trigger-model defect, not a Current-SOLD engine-test failure.

### Correction

V1.3 adds:

```text
.github/workflows/kidults-current-sold-postlanding-v1.yml
```

The validator is triggered by completion of `KIDULTS Atomic Governed Landing V1`, not by the suppressed merge `push`. It grants post-landing authority only when all of the following hold:

- triggering workflow name is exactly `KIDULTS Atomic Governed Landing V1`;
- triggering event is `workflow_dispatch`;
- triggering workflow conclusion is `success`;
- triggering workflow branch is `main`;
- checked-out `GITHUB_SHA` is the current protected-main commit;
- the current commit has exactly two parents;
- its first parent equals `github.event.workflow_run.head_sha`, the main SHA on which the landing run started;
- its subject is a GitHub PR merge commit;
- the merge diff touches the Current-SOLD change surface.

If another main commit lands before this binding is established, the first-parent comparison fails closed rather than misattributing evidence.

The new workflow has only `contents: read`, references no secret, uses no new credential, and performs no repository, database, provider, deployment, or release mutation.

The older main `push` trigger remains a fallback for changes produced outside the token-suppressed Action path. It is not sufficient by itself for Atomic Governed Landing post-merge authority.

## Execution classes

| Execution class | Registry authority class | Truth ceiling | Lawful empirical count |
|---|---|---|---:|
| `CONTROL_SYNTHETIC` | `CONTROL_SYNTHETIC_GENERATOR` | `CONTROL_ONLY` | `0` |
| `EMPIRICAL_CANDIDATE_PRIVATE` | `EXTERNAL_EXACT_DIGEST_UNVERIFIED` | `PRIVATE_PIPELINE_CANDIDATE_ONLY` | `0` |
| `LAWFUL_EMPIRICAL_PRIVATE` | unavailable | blocked pending governed authority adapter | `0` |

A private candidate PASS proves only that supplied private inputs satisfy the software contract at system time. It does not establish legal provenance, governed receipt authority, product evidence, database persistence, launch readiness, or release permission.

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
| Exact-head engine validation | `.github/workflows/kidults-current-sold-engine-v1.yml` |
| Atomic-Landing post-merge validation | `.github/workflows/kidults-current-sold-postlanding-v1.yml` |

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

Do not pass `--now`. A candidate receipt may report private candidate admission, but must retain:

```text
lawful_empirical_admitted=0
governed_registry_authority_verified=false
lawful_admission_authorized=false
claim_ceiling=PRIVATE_PIPELINE_CANDIDATE_ONLY
```

No raw bundle is persisted and no PostgreSQL operation is attempted.

## PostgreSQL boundary

The append-only migration and writer remain separate from candidate evaluation. They accept only a full PASS bundle and independently recompute admission, event, Evidence, and receipt digests before SQL.

Migration application and the first private append-only write remain separate approval gates. V1.3 records:

```text
write_requested=false
write_performed=false
migration_applied=false
rows_written=0
```

## Verification target

Exact-head and post-landing workflows must:

- parse eight Current-SOLD JSON schemas/control files;
- syntax-check every Current-SOLD script and test;
- pass **53 tests / 0 failures**;
- prove mixed-batch atomic withholding through both batch layers;
- prove strict recency and future-timestamp rejection;
- prove self-declared lawful execution is unavailable;
- prove private mount/file/output mode, symlink, realpath, and exclusive-write controls;
- run one runtime-generated synthetic control smoke;
- verify the smoke receipt is redacted, mode `0600`, non-empirical, atomic, and no-write;
- pass the PostgreSQL append-only static negative scan;
- for Atomic Governed Landing, run from the completed landing event and bind the receipt to the exact resulting protected-main SHA through first-parent lineage;
- preserve empirical counts, PostgreSQL activity, provider calls, deployment, and Public/Production/G5 at `0 / false / HOLD`.

Manual `workflow_dispatch` remains diagnostic only. A plain protected-main `push` run is fallback evidence and cannot substitute for the Atomic-Landing completion binding when the merge was made with `GITHUB_TOKEN`.

## Next governed implementation

The next product code package remains `GOVERNED_RECEIPT_REGISTRY_AUTHORITY_ADAPTER`, not PostgreSQL activation. It must fail closed unless it binds an external immutable registry object and independently trusted issuer/digest evidence to the exact source SHA, canonical run, acquisition receipts, rights receipts, and purpose.

Only after that adapter is implemented and reviewed may one genuine transaction be evaluated as a lawful empirical dry-run candidate. Database migration and the first append-only write still require later explicit approval. Public, Production, and G5 remain HOLD.
