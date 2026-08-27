# KIDULTS control-plane activation runbook

State: `IMPLEMENTED_NOT_VERIFIED / REMOTE_ACTIVATION_HOLD`

This runbook is the governed bridge from repository evidence to an approved
STAGING control plane. It does not authorize Production, Public, G5, provider
contact, contracts, spend or credential creation.

Governance mode: `SOLO_OWNER_AUTOMATED_EVIDENCE`. Human reviewer approval is
not a required gate. Required exact-head checks, immutable runtime receipts and
post-merge main revalidation are authoritative.

## Immutable activation order

1. Bind the exact PR head SHA and migration digest to the activation receipt.
2. Provision an approved ephemeral PostgreSQL STAGING instance with PITR and a
   separately encrypted backup target.
3. Apply `migrations/postgres/0001_system_of_record.sql` as a migration owner.
4. Create separate LOGIN principals outside the repository and grant each
   exactly one NOLOGIN group role created by the migration. Store credentials
   only in the approved secret manager.
5. Prove RLS, writer identity, append-only history and exact-resource access by
   running every negative mutation below.
6. Deploy the command, audit and supply paths without a D1 write binding.
7. Deploy only `kpmo-d1-projector-v1` with the write-capable D1 binding.
8. Rebuild D1 from the PostgreSQL outbox and compare row count, source event ID,
   source hash, schema version, projector ID and canonical row digest.
9. Keep the legacy ASI D1 writer disabled and prove its direct-write site count
   and remote write attempts are both zero.
10. Run two natural protected-main command → outbox → projector → immutable
    receipt chains without manual retry.
11. Revalidate the merged protected-main SHA and bind the post-merge result to
    the final STAGING activation receipt.

## PSA connection-day procedure (bounded, non-promotional)

PSA is a grading/certification and population lane; it is not a dated-SOLD
market feed. The first connection is limited to the policy in
`coordination/kidults/provider/psa-cert-verification-connection-policy-v1.json`.

1. Bind the token only in the approved secret manager. Never paste it into
   chat, Git, workflow inputs, artifacts or logs.
2. Confirm the account, endpoint and account-gated EULA read-back. A provider
   reply excerpt alone is not a terminal rights attestation.
3. Run one to three known-cert schema canaries through
   `psa-cert-verification-adapter.mjs`. The canary records only schema keys,
   field presence, response digest and failure class; it retains no raw body.
4. Require an approved schema digest/field map before private evaluation. The
   field map must be bound to the immutable rights evidence and purpose.
5. If bounded private evaluation is approved, store only in an encrypted,
   access-audited private store with a deletion deadline of at most 30 days.
   Emit a deletion receipt; public display and redistribution remain blocked.
6. Admit normalized data through the PostgreSQL supply-chain command path.
   Do not create `GRADED_POPULATION`, Candidate, Evidence, Track B or
   Projection state from a schema canary.
7. Stop immediately on rights mismatch, schema drift, expired rights,
   cardinality mismatch, rate-limit exhaustion, or missing failure receipt.

The PSA run remains `HOLD` for bulk/120-case acquisition until field-by-purpose
rights, Population/Census fields, derived-data disposition and provider-message
immutability are all terminally evidenced and approved.

Manual dispatch is break-glass only. Normal activation follows:

`PR merge → protected-main push → automatic scale wave → immutable artifact → KPMO governed receipt`

## Required negative mutations

All must be rejected and must produce an attributable receipt where applicable.

- unregistered or GUC-spoofed writer;
- writer ID used from the wrong PostgreSQL database role;
- tenant A reading or writing tenant B;
- token/client role attempting to replace PostgreSQL RBAC;
- permission for one resource used against another resource;
- inactive, future or expired membership/entitlement;
- unauditable access ALLOW;
- bad billing signature, duplicate event or lower state version;
- rights decision bound to another source, purpose or field set;
- expired/insufficient rights and cardinality mismatch;
- stale D1 event overwriting a newer read model;
- concurrent projector claim, expired lease and poison-event quarantine;
- direct legacy ASI D1 write after cutover.

## Acceptance evidence

- exact source SHA, exact-head required checks PASS and post-merge main revalidation receipt;
- PostgreSQL migration digest and server version;
- zero-bypass role/privilege read-back;
- tenant-isolation and writer-spoof negative receipts;
- billing, access, supply and observability transaction receipts;
- D1 full-rebuild parity digest and unknown-writer count `0`;
- backup restore plus PITR with recovery-point and recovery-time measurements;
- two consecutive automatic chain receipts;
- legacy writer disabled receipt;
- explicit rollback owner and expiry for the STAGING window.

## Rollback

- Before D1 cutover: stop the new command ingress and projector; the legacy
  runtime remains on hold and no canonical state is moved back to D1.
- After D1 cutover: stop ingress, expire projector leases, preserve PostgreSQL
  and append-only receipts, restore the previous D1 read model from its immutable
  artifact only for read availability, and investigate from the exact source
  event. Never promote D1 to canonical authority during rollback.
- PostgreSQL schema rollback is forward-fix by default. Destructive down
  migration requires separate legal/security/data-retention authority.

## Truth boundary

Repository tests and this runbook do not prove remote PostgreSQL, backup/PITR,
D1 parity, provider rights, GRADED population, Candidate/Evidence, Track B,
Projection, Production or G5. Those remain `HOLD`, `NONE` or `NOT_STARTED` until
their canonical evidence exists.

Constitution effects:

- `autonomous_effect`: `POSITIVE` — normal dispatch and receipts are automatic.
- `global_effect`: `POSITIVE` — tenant, jurisdiction, locale, currency and source
  rights are explicit rather than provider-specific assumptions.
- `irreplaceable_value_effect`: `POSITIVE` — customer context, lineage, rights,
  audit and derived projections remain KIDULTS-owned.
- `transparency_effect`: `POSITIVE` — every gate has an exact negative test,
  receipt and rollback boundary.
