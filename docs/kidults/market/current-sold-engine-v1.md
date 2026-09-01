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

### Atomic batch admission

Any rejection or quarantine now withholds every admission, event version, and canonical Evidence in both batch layers. A non-PASS batch is never ledger-write eligible, and valid-looking rows remain digest-only diagnostics.

### Strict Current-SOLD time semantics

- maximum sale age: `7 days`;
- maximum future clock skew for `sold_at` or `observed_at`: `300 seconds`;
- sales aged 8–30 days: `CURRENT_SOLD_NOT_STRICT_CURRENT`;
- older observations cannot inherit the Current-SOLD product name.

### Exact digest is not governed authority

The private runner requires a separately supplied exact SHA-256 digest for the complete receipt-registry snapshot, but the standalone runner cannot establish who issued it. Its authority class therefore remains `EXTERNAL_EXACT_DIGEST_UNVERIFIED`. `LAWFUL_EMPIRICAL_PRIVATE` is unavailable until a governed authority adapter independently verifies the immutable registry object, issuer, digest, purpose rights, validity interval, source SHA, canonical run, acquisition receipts, and rights receipts.

### Raw persistence, filesystem, and clock controls

The legacy full-bundle writer and executable CLI are disabled. Private candidate input and receipt paths require realpath containment, exact `0700/0600` modes, no symlink or hard-link escape, `O_NOFOLLOW`, inode revalidation, directory-descriptor-bound exclusive output creation, and system-time evaluation. Candidate receipts remain digest/count-only and do not contain raw event or Evidence data.

## V1.3 exact post-landing correction

### Root cause

PR #1799 correctly added a protected-main `push` trigger. The governed landing itself, however, is executed by GitHub Actions with the repository `GITHUB_TOKEN`. GitHub prevents most events created by that token from recursively starting new workflow runs. The server-side merge therefore produced protected main `6c5d7a1041730a8b3531ae66c77537665cfd44db`, but that exact SHA had zero workflow runs and zero check runs.

This is a trigger-model defect, not a Current-SOLD engine-test failure. Treating the absent merge `push` as proof would be fail-open; adding another `workflow_run` consumer was also rejected because it exceeded the control-plane fan-out budget.

### Correct design: same trusted landing job

V1.3 does not add a new workflow consumer. Instead, `KIDULTS Atomic Governed Landing V1` performs the complete sequence in one globally serialized trusted job:

```text
trusted protected-main checkout
  -> stage trusted Current-SOLD post-landing validator in RUNNER_TEMP
  -> re-read exact PR/head/base/status/ruleset authority
  -> server-side merge with expected head SHA
  -> re-read protected main and require exact returned merge SHA
  -> checkout that exact merge SHA with two-parent history
  -> execute the validator staged before the merge
  -> verify first parent = pre-merge protected main
  -> verify second parent = approved PR exact head
  -> verify the merge touched the Current-SOLD control surface
  -> rerun 53 Current-SOLD tests and all no-write guards
  -> publish `KIDULTS Current-SOLD Post-Landing V1` status on the exact merge SHA
  -> upload the redacted post-landing receipt
```

The validator is copied to `RUNNER_TEMP` before the merge, so a PR cannot replace the validator and then use its own newly merged version to self-certify. Atomic landings are serialized with one protected-main concurrency group rather than one group per PR.

### Exact controls

The post-landing validator requires:

- a server-returned 40-character merge SHA;
- the exact pre-merge protected-main SHA;
- the approved exact PR head SHA;
- the exact PR number, landing run ID/attempt, and authorization ID;
- exactly two merge parents;
- first parent equal to the pre-merge main SHA;
- second parent equal to the approved PR head SHA;
- a matching `Merge pull request #<number>` subject;
- at least one changed file in the Current-SOLD or its governed landing surface;
- eight parseable Current-SOLD JSON control files;
- syntax validity for every Current-SOLD module;
- **53 tests / 53 pass / 0 fail**;
- synthetic control smoke PASS with lawful empirical and private candidate counts at zero;
- legacy raw-persistence guard PASS;
- append-only PostgreSQL static guard PASS;
- an exact-merge commit status and artifact receipt.

Any failure publishes a failure status on the exact merge SHA and leaves Public, Production, and G5 on HOLD. Post-merge validation is detection and containment, not a false claim of transactional rollback after the GitHub merge has already occurred.

The previous protected-main `push` trigger remains a fallback for non-token-suppressed changes. It is not the authoritative evidence path for normal Atomic Governed Landing.

## Execution classes

| Execution class | Registry authority class | Truth ceiling | Lawful empirical count |
|---|---|---|---:|
| `CONTROL_SYNTHETIC` | `CONTROL_SYNTHETIC_GENERATOR` | `CONTROL_ONLY` | `0` |
| `EMPIRICAL_CANDIDATE_PRIVATE` | `EXTERNAL_EXACT_DIGEST_UNVERIFIED` | `PRIVATE_PIPELINE_CANDIDATE_ONLY` | `0` |
| `LAWFUL_EMPIRICAL_PRIVATE` | unavailable | governed authority adapter required | `0` |

A private candidate PASS proves only that supplied private inputs satisfy the software contract at system time. It does not establish legal provenance, governed receipt authority, product evidence, database persistence, launch readiness, or release permission.

## Canonical components

| Role | Canonical component |
|---|---|
| Atomic admission and bundle | `scripts/kidults/market/current-sold-atomic-batch-v1.mjs` |
| Low-level observation classifier | `scripts/kidults/market/current-sold-engine-v1.mjs` |
| Canonical Evidence transformer | `scripts/kidults/market/current-sold-evidence-v1.mjs` |
| Private candidate dry-run | `scripts/kidults/market/current-sold-private-dry-run-v1.mjs` |
| Synthetic control smoke | `scripts/kidults/market/current-sold-control-smoke-v1.mjs` |
| PostgreSQL writer | `scripts/kidults/market/current-sold-postgres-ledger-v1.mjs` |
| Append-only migration | `infrastructure/postgres/current-sold/0001_current_sold_append_only_ledger_v1.sql` |
| Exact-head engine validation | `.github/workflows/kidults-current-sold-engine-v1.yml` |
| Governed server merge | `.github/workflows/kidults-atomic-governed-landing-v1.yml` |
| Trusted exact-merge validation | `scripts/kidults/market/current-sold-postlanding-v1.mjs` |

## Synthetic control smoke

A successful synthetic smoke proves software-path execution only:

```text
control_synthetic_admitted=1
private_candidate_admitted=0
lawful_empirical_admitted=0
postgres_migration_applied=false
postgres_rows_written=0
provider_calls=0
Public/Production/G5=HOLD
```

It is prohibited as empirical, product, vertical, global, launch, Public, Production, or G5 evidence.

## Private candidate dry-run

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

Do not pass `--now`. The private candidate path persists no raw bundle and performs no PostgreSQL operation.

## PostgreSQL boundary

The append-only migration and writer remain separate from candidate evaluation and independently recompute admission, event, Evidence, and receipt digests before SQL.

```text
write_requested=false
write_performed=false
migration_applied=false
rows_written=0
```

Migration application and the first private append-only write remain separate approval gates.

## Bootstrap and exit condition

The landing that installs V1.3 itself executes the prior protected-main landing implementation, so its own exact merge cannot use the new same-job step. V1.3 becomes authoritative only after it is merged and a subsequent Current-SOLD-relevant governed landing is executed with the new main implementation.

That subsequent landing must produce:

- a successful Atomic Governed Landing run;
- a successful `KIDULTS Current-SOLD Post-Landing V1` status on the exact resulting merge SHA;
- a post-landing artifact bound to both merge parents and the landing authorization;
- `53 / 53 / 0` with empirical counts, PostgreSQL activity, provider calls, deployment, and release states unchanged.

Only then can the post-merge evidence defects be closed. The next product-code package remains `GOVERNED_RECEIPT_REGISTRY_AUTHORITY_ADAPTER`, not PostgreSQL activation. Public, Production, and G5 remain HOLD.
