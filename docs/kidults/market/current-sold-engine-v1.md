# KIDULTS Current-SOLD Engine V1.1

## Decision and truth boundary

`KIDULTS Current-SOLD` is an owned intelligence product. External providers remain replaceable evidence/source layers; they do not own the canonical event, evidence, correction, or ledger identities.

This change completes the internal code path:

`SOURCE -> ACQUISITION_RECEIPT -> RIGHTS_RECEIPT -> OBSERVATION -> CURRENT_SOLD_EVENT -> CANONICAL_EVIDENCE -> POSTGRES APPEND-ONLY LEDGER -> TRACK B -> PROJECTION`

It does **not** claim that empirical Current-SOLD data has been acquired. The empirical count remains `0`. The PostgreSQL migration is authored but not applied. No provider call, private database write, Public release, Production release, or G5 activation is performed by this change.

## P0 hardening

The admission engine now rejects an observation unless both acquisition and rights receipt IDs resolve inside the supplied governed registry and all of the following fields bind exactly:

- source ID, source transaction ID, and exact HTTPS source URL;
- provenance digest and canonical content digest;
- exact source commit SHA;
- exact canonical run ID;
- private Current-SOLD rights purpose and allow decision;
- optional rights validity interval.

The engine also fail-closes the following cases:

- one source transaction is mapped to different canonical objects: every related row is quarantined;
- one source transaction has multiple uncorrected contents: every related row is quarantined;
- price, currency, fee semantics, normalized price pair, or correction lineage is malformed;
- source SHA or canonical run binding is missing or malformed;
- state is not terminal `SOLD`, the sale is stale beyond 30 days, or rights are not allowed.

## Canonical identities

| Identity | Meaning | Stability |
| --- | --- | --- |
| `event_id` | Source transaction identity: `source_id + source_event_id` | Stable when transaction content changes |
| `content_digest` | SHA-256 of canonical transaction content | Changes for price/content/correction changes |
| `fact_id` | Canonical event-and-content fact identity | Stable across repeated governed acquisitions of the same fact |
| `evidence_id` | Fact plus exact source SHA, run ID, acquisition receipt, and rights receipt | Unique to an exact governed evidence lineage |

This separation prevents content edits from silently creating a new transaction identity while preserving exact evidence provenance across repeated runs.

## Canonical Evidence

`scripts/kidults/market/current-sold-evidence-v1.mjs` revalidates event identity and content digest before producing `SOLD_TRANSACTION_PRICE` Evidence. Raw provider payloads do not enter Track B. Track B receives only canonical Evidence with:

- realized sale assertion and fee semantics;
- canonical object identity;
- source, provenance, acquisition, rights, source SHA, and run lineage;
- correction lineage;
- private-only claim ceiling and explicit Public/Production/G5 HOLD.

## Batch envelope, CLI, and admission receipt

The batch envelope binds every observation to one exact `source_sha` and `canonical_run_id`. Ambiguous duplicate receipt IDs are rejected before admission.

Example control-only invocation:

```bash
node scripts/kidults/market/current-sold-batch-v1.mjs \
  --input /private/input/current-sold-batch.json \
  --receipt-registry /private/input/current-sold-receipts.json \
  --output /private/output/current-sold-bundle.json \
  --now 2026-09-01T05:00:00.000Z
```

The CLI never overwrites an existing output file. The private bundle contains the validated receipt-registry snapshot and emits a deterministic admission receipt containing evaluation time, envelope, registry, event-version, Evidence, and admission digests. A `PASS` batch is marked `ELIGIBLE_NOT_ATTEMPTED`; a partial or failed batch is `BLOCKED_BY_ADMISSION` and must not reach the ledger writer.

## PostgreSQL append-only ledger

The migration creates private event, Evidence, and PASS-receipt ledgers. Database constraints bind JSON payload identity fields to typed columns, deferred foreign keys bind event/Evidence rows to the batch receipt, an insert trigger independently enforces the exact correction head, and mutation triggers reject `UPDATE`, `DELETE`, and `TRUNCATE`; no update-upsert path exists.

The writer uses one transaction and advisory locks sorted by event identity. It performs these checks before commit:

1. Recompute and verify the bound receipt-registry snapshot, evaluation time, envelope, event, Evidence, admission, and receipt digests; admission is re-executed before any SQL.
2. Refuse any batch that is not full `PASS`.
3. Load and validate the persisted event correction chain.
4. Treat an exact replay as idempotent.
5. Reject a different content body from another run unless it is a `CORRECTED` event that supersedes the exact persisted head digest and advances observed time.
6. Insert event versions, canonical Evidence, and batch receipt atomically.
7. Roll back the entire transaction on any conflict or collision.

The writer accepts an injected PostgreSQL-compatible client and therefore contains no embedded credential, DSN, secret, network endpoint, or automatic migration step.

## Verification

Local control verification on 2026-09-01:

- Current-SOLD engine tests: 15 passed;
- canonical Evidence tests: 5 passed;
- batch/CLI tests: 6 passed;
- PostgreSQL writer/migration tests: 8 passed;
- total: **34 passed, 0 failed**;
- all six JSON schemas parsed successfully;
- all JavaScript modules passed syntax checks;
- append-only SQL negative scan passed.

These are control and pipeline tests. Synthetic test fixtures are not empirical Current-SOLD observations.

## Next governed execution

The first empirical execution remains a private smoke run with one lawful genuine terminal SOLD transaction. It must use a provenance-bound acquisition receipt, an applicable rights receipt, an exact source SHA/run ID, and a separately authorized private PostgreSQL target. Success permits only a `PIPELINE_FUNCTIONAL_ONLY` claim. Public, Production, and G5 remain HOLD.
