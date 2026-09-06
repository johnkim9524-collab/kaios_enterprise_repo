# KIR PostgreSQL payload binding: NULL must fail closed

## Defect and scope

At PR #2024 source `88ec9c109fc8e691d177d4cec649129ec46ee3b7`, eight
CHECK expressions across six Current-SOLD and source-intelligence tables
could evaluate to SQL NULL when required JSON fields were missing or JSON
null. PostgreSQL CHECK accepts both TRUE and NULL. A non-null JSONB column
does not imply its required properties exist. Application validators reject
these inputs, but the database must not depend exclusively on those callers.
This is a schema enforcement defect, not evidence of an observed production
corruption or a new provider acquisition.

## Upgrade path, including existing databases

Apply these files only through a separately authorized database migration:

- Current-SOLD: after `0001_current_sold_append_only_ledger_v1.sql`, apply
  `0002_payload_binding_fail_closed_v1.sql`.
- Source intelligence: after registry `0001` and manifest `0002`, apply
  `0003_payload_binding_fail_closed_v1.sql`.

The historical migration files are intentionally unchanged. Merely re-running
CREATE TABLE IF NOT EXISTS would not fix an already-existing table.

Each upgrade preserves the prior predicate and requires its whole result to
be `IS TRUE`. Source authority flags and the external-raw-content flag also
require actual JSON booleans rather than strings coercible to booleans. The
source assessment rights-shape and decision-consistency constraints are
included. Restricted external bytes remain prohibited by the existing hard
stop. This does not implement cryptographic recomputation inside SQL or a
complete JSON-schema validator.

Each transaction uses a 5-second lock timeout and a 60-second per-statement
timeout. Constraints are replaced and then fully validated before COMMIT.
A violated pre-existing row aborts the whole upgrade; it is not rewritten,
deleted, or silently accepted. Concurrent callers cannot observe the
uncommitted constraint replacement. Operators must investigate invalid data
under the established evidence/repair policy rather than deleting it to
manufacture a PASS. No grants, native trust root, triggers, foreign keys,
release rules, or Owner gates are relaxed. Reapplication is supported.

## Bounded actual-PostgreSQL regression

The existing `P0 PostgreSQL Greenfield Runtime` workflow is extended rather
than adding another workflow or an external database connection. Its existing
PostgreSQL 16 image and digest are preserved. The new runner accepts only the
exact CI service container ID and matching source/run context. It has no DSN
argument and never consumes the staging or Production database credentials.

`python3 scripts/staging/verify-kir-postgres-payload-binding-v1.py --self-test`
only validates offline fixture generation and entry guards. It does not
constitute a PostgreSQL execution.

The workflow invokes `--run-ci` against disposable databases inside that
pinned service. The original and upgraded CHECK constraints are copied to
temporary test tables to isolate JSON NULL/missing/type semantics from
unrelated foreign-key dependencies. Valid examples and already-invalid
mismatches remain covered. A second database seeds invalid rows in the real
receipt and source-registry tables and verifies that upgrades fail with
check-violation SQLSTATE, preserve the row, and roll back the constraint
replacement. Trigger/FK/privilege definitions are compared before/after and
upgrade reapplication is exercised. Databases created by this invocation are
dropped on either success or failure. The artifact includes exact source,
run, image, migration digests, completed counts, failure and cleanup state.

The fixture rows are synthetic SQL-shape probes, not engine-approved business
observations. A successful run proves the stated database constraint scope;
it is not a KIR real-writer end-to-end proof, a remote staging workload,
DigitalOcean PostgreSQL/PITR evidence, a lawful current-SOLD sample, or
production-readiness/release authorization. Production/Public/G5 remain HOLD.

Reference: PostgreSQL official documentation, Constraints / Check Constraints:
https://www.postgresql.org/docs/current/ddl-constraints.html
