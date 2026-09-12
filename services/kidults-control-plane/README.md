# KIDULTS persistent control plane

State: `IMPLEMENTED_NOT_VERIFIED / LOCAL_AND_CI_ONLY / REMOTE_ACTIVATION_HOLD`

This service boundary makes PostgreSQL the formal system of record and limits
Cloudflare D1 to disposable, reproducible read models.

The normal path is:

`authenticated command -> PostgreSQL transaction -> audit + outbox -> single registered projector -> D1 read model`

## Authority boundary

- PostgreSQL owns identity, organizations, memberships, authorization,
  subscriptions, entitlements, usage, source-rights decisions, audit events and
  the transactional outbox.
- D1 owns no business decision. It may contain only query-optimized projections
  that carry the source event ID, source hash, schema version and projector ID.
- Product and AI Workers do not receive a write-capable D1 binding. The eventual
  projector is the only active D1 writer.
- The existing autonomous-intelligence Worker is registered as
  `LEGACY_MIGRATION_HOLD`; its remote deployment is blocked by a preflight until
  its direct writes are replaced by the PostgreSQL/outbox/projector path.
- Enterprise authentication accepts only an identity adapter result marked as
  signature-verified, then derives organization membership, exact-resource
  permission and active billing entitlement from PostgreSQL rather than
  token/client role claims. Every ALLOW or DENY decision is written through a
  separate audit-role connection; an unauditable ALLOW fails closed.
- Billing accepts only signature-verified provider events, rejects stale state
  versions and commits billing, subscription, entitlement, audit and outbox
  changes in one transaction.
- Observability events are tenant-scoped, attributable, append-only and reject
  secret-like payload keys before any database mutation.
- PostgreSQL writer IDs are bound to NOLOGIN, no-bypass-RLS database roles.
  Deployment creates separate LOGIN principals and grants each exactly one
  governed group role; this repository never stores their credentials.
- D1 upserts are monotonic by source creation time and event ID, so a stale or
  duplicated outbox delivery cannot overwrite a newer projection.
- The projector claims PostgreSQL outbox events with a bounded lease, isolates
  concurrent workers, writes D1 idempotently and appends a terminal
  `PROJECTED` or `FAILED` PostgreSQL delivery receipt for every attempt. Poison
  events are quarantined after a bounded retry count and cannot create an
  infinite retry storm.
- A source can enter the reproducible supply ledger only through a transactional
  admission command that binds the exact source, purpose, field-set digest,
  unexpired rights decision, required permissions, code/schema versions,
  raw/normalized/replay digests and exact cardinality. Any mismatch rolls back
  the run, audit and outbox together.
- Ordered migration `0002_workflow_run_receipts.sql` adds an operational,
  append-only PostgreSQL ledger for workflow run ID/attempt, source and result
  digests, artifact identity and optional canonical leader/alias identity. A
  dedicated NOLOGIN role receives SELECT/INSERT only; UPDATE, DELETE and
  TRUNCATE are denied. Existing governed writer roles are preserved and receive
  only the registry-column and function privileges required by the existing
  SECURITY INVOKER writer guard.
- The local writer performs strict type/shape checks, rejects secret-like and
  over-256-KiB result payloads before database access. Credential-key denial
  includes API/access keys, client secrets, authorization, cookies, DSNs,
  passwords, private keys, generic secrets and tokens. The writer inserts then reads back
  every immutable field, accepts only exact idempotent replay and rolls back a
  conflicting replay. A SECURITY INVOKER database trigger and runtime checks
  both require a LEADER receipt to match the exact claim
  repository/path/run/attempt/leader-binding digest, or an ALIAS receipt to
  match the exact alias row and parent claim
  repository/path/run/attempt/alias-binding digest. Forged relations, digests,
  runs, cross-claim bindings and missing aliases fail before commit; no relation
  requires all canonical fields to be null.
- The same migration provides an atomic first-writer canonical claim and
  append-only alias surface keyed by repository, consumer workflow, source SHA,
  upstream class, generation discriminator and trusted classifier-contract
  digest. Only classifier output marked `dedupe_eligible=true` may claim. A
  same-key canonical-input mismatch is `INPUT_DIVERGENCE_HOLD`, never an alias.
  Coverage, Sharded Reserve and Shadow Evidence are stricter: their provisional
  classifier observation digest cannot claim; a final exact-artifact input
  digest plus upstream-binding and source-receipt digests is mandatory.

## Local verification

```sh
npm --prefix services/kidults-control-plane test
npm --prefix services/kidults-control-plane run validate
```

These checks verify contracts, schema boundaries, the exact production-source
writer inventory and the remote-deploy guard. They do not provision PostgreSQL,
mutate D1, use credentials or prove remote backup/restore. They also do not
prove real PostgreSQL concurrency/privilege behavior or that a STAGING workflow
receipt row has been persisted.

Workflow receipt and canonical claim read-back uses exact plain SELECT under the
append-only constraints. PostgreSQL row-locking SELECT forms are intentionally
absent because they require UPDATE privilege; the dedicated role remains
SELECT/INSERT-only while unique constraints serialize first-writer CAS.

GitHub Actions artifacts remain expiring transfer evidence, not the permanent
system of record. No receipt finalizer is activated while an approved STAGING
DSN, protected environment and migration read-back are unavailable. The future
finalizer must be a separate, fail-closed workflow; it must not add database
writes to Continuous Assurance. Canonical failed/stale-leader takeover also
remains unimplemented and on HOLD.

The dormant remote-activation evaluator is also fail-closed until it receives
an Ed25519-signed exact-head manifest from a separately protected public-key
trust root. Its receipt set must be exact and duplicate-free; every receipt
must be a regular non-symlink file whose real path remains under the declared
evidence root, match the exact schema and producer/run/artifact identity, and
carry a PostgreSQL system-of-record authority digest. A co-located digest or a
self-declared `PASS` is not activation authority.

## Required next runtime evidence

Before STAGING activation, apply both ordered PostgreSQL migrations to an approved
ephemeral instance, prove migration/restore/RLS/tenant isolation, deploy the
projector with the only write-capable D1 binding, prove two-client canonical
claim CAS/alias behavior and exact workflow receipt replay/conflict semantics,
rebuild D1 from the outbox and prove exact parity. Follow
`ACTIVATION_RUNBOOK.md`; remote PostgreSQL, Public, Production and G5 remain
HOLD.
