# Global SOLD Source Intelligence Storage Operations v1

## Decision

PostgreSQL is the sole system of record. The Evidence Volume preserves permitted evidence bytes and manifests. D1 receives read-only approved projections. GitHub stores versioned code, policy and seed registries. GitHub Actions artifacts are transient execution evidence and never the canonical source pool.

This change does not apply a database migration, write the Evidence Volume, activate an adapter, contact a provider, spend funds, publish data, or authorize Production/G5.

## Canonical paths

| Asset | Canonical location |
| --- | --- |
| Research registry | `coordination/kidults/source-intelligence/global-sold-source-registry-v1.json` |
| Evidence manifest contract | `coordination/kidults/source-intelligence/source-intelligence-evidence-manifest-contract-v1.json` |
| Registry evidence manifest | `coordination/kidults/source-intelligence/global-sold-source-registry-evidence-manifest-v1.json` |
| Validation and generic PostgreSQL writer | `scripts/kidults/source-intelligence/global-sold-source-registry-v1.mjs` |
| Evidence manifest validator | `scripts/kidults/source-intelligence/source-intelligence-evidence-manifest-v1.mjs` |
| PostgreSQL migration | `infrastructure/postgres/source-intelligence/0001_global_sold_source_registry_v1.sql` |
| Evidence manifest migration | `infrastructure/postgres/source-intelligence/0002_source_evidence_manifest_ledger_v1.sql` |
| Evidence root after separately approved activation | `/mnt/ih_prod_01/evidence/current-sold` |
| D1 | Approved projection only; never raw evidence or canonical rights state |

## Storage classes

1. **Research metadata** — source identity, owner, roles, verticals, official URLs, rights decision, claim ceiling, access mode, scale, cadence, freshness and next action. It may enter the registry without authorizing target-content collection.
2. **Rights evidence** — versioned normalized claims and, only where permitted, restricted evidence snapshots. Every record needs an official URL, observed time, content digest or explicit `PENDING_NOT_ARCHIVED`, reviewer and review horizon.
3. **Transaction evidence** — enters `kidults_private.current_sold_*` only after a valid acquisition receipt, rights receipt, canonical object identity and batch admission PASS.
4. **Derived analytics** — stores methodology/model version and exact input digests. It cannot exceed the narrowest upstream claim ceiling.
5. **Serving projection** — D1 receives only an outbox-bound approved representation and a delivery receipt.

## Evidence Volume layout

```text
/mnt/ih_prod_01/evidence/current-sold/
  rights/{source_id}/{terms_version}/manifest.json
  acquisition/{source_id}/{yyyy}/{mm}/{dd}/{canonical_run_id}/manifest.json
  objects/{canonical_object_id}/manifest.json
  analysis/{methodology_id}/{version}/{run_id}/manifest.json
  corrections/{event_id}/{content_digest}/manifest.json
  deletion-receipts/{source_id}/{receipt_id}.json
```

Raw or copyrighted content is not written merely because a public URL exists. `HOLD` and `NO_GO` sources retain KIDULTS-authored assessment metadata only unless a purpose-specific right explicitly permits more.

## Runtime sequence

1. Validate and digest the GitHub registry.
2. Apply the migration only through the separately authorized remote PostgreSQL migration workflow with backup/PITR receipts.
3. Provision a dedicated LOGIN outside GitHub and grant exactly the `kidults_control_supply` group role.
4. Call `appendRegistrySnapshot(client, registry)`; the writer sets `kidults.writer_id=kpmo-supply-chain-admission-v1`, obtains a transaction advisory lock, inserts the snapshot and all assessments, and rolls back on any conflict.
5. Replaying the same digest is idempotent. Any same-digest payload difference fails closed.
6. Validate the evidence manifest against the exact registry digest and artifact bytes before recording its ledger row.
7. A later source version creates a new snapshot and a new manifest. Existing rows are never updated or deleted.
8. Adapter execution remains impossible until a separate current rights receipt, schema receipt and activation receipt are bound.
9. D1 projection remains disabled until an approved outbox event and projector receipt exist.

## Retention and deletion

- Registry assessments are append-only institutional decision history.
- Source bytes follow the provider-specific retention period; no global default can expand a provider right.
- Termination deletion produces an append-only deletion receipt containing source, affected object digests, deletion time, executor and policy/contract version.
- Derived-result survival follows the provider contract. Unknown survival rights mean derived data is quarantined, not retained.
- Actions artifacts remain convenience copies only and may expire without affecting canonical ledger durability.

## Verification

```bash
node scripts/kidults/source-intelligence/global-sold-source-registry-v1.mjs
node scripts/kidults/source-intelligence/source-intelligence-evidence-manifest-v1.mjs
node --test \
  tests/kidults/source-intelligence/global-sold-source-registry-v1.test.mjs \
  tests/kidults/source-intelligence/source-intelligence-evidence-manifest-v1.test.mjs
```

Expected result: both validators PASS, eleven tests PASS, zero tests FAIL. These are static/private controls and do not prove remote PostgreSQL, PITR, Evidence Volume, provider access, empirical current-SOLD, D1 projection, Public, Production or G5.
