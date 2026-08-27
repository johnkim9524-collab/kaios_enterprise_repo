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

## Local verification

```sh
npm --prefix services/kidults-control-plane test
npm --prefix services/kidults-control-plane run validate
```

These checks verify contracts, schema boundaries, the exact production-source
writer inventory and the remote-deploy guard. They do not provision PostgreSQL,
mutate D1, use credentials or prove remote backup/restore.

## Required next runtime evidence

Before STAGING activation, apply the PostgreSQL migration to an approved
ephemeral instance, prove migration/restore/RLS/tenant isolation, deploy the
projector with the only write-capable D1 binding, rebuild D1 from the outbox and
prove exact parity. Follow `ACTIVATION_RUNBOOK.md`; Production/Public/G5 remain
HOLD.
