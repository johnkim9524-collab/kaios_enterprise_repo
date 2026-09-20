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
- The Common Control Foundation adds a provider-neutral Admission Port in front
  of future autonomous execution. Its current implementation is deliberately
  limited to local synthetic shadow requests. Unknown modes, external fetch,
  credentials, Production, Public and G5 fail closed without a manifest.
- A shadow manifest binds the exact request and decision digests, policy and
  registry revisions, kill epoch, endpoint fingerprint and expiry. The
  no-egress Broker revalidates those bindings immediately before every attempt;
  changed, expired, killed, redirected or retried authority is denied and never
  opens a network or credential path.
- The Autonomous Task Lifecycle is a separate deterministic state machine for
  pending, leased, running, retry, terminal and quarantine states. Every worker
  mutation is fenced by lease owner and monotonically increasing lease epoch;
  expired leases cannot checkpoint or complete, bounded retries preserve the
  checkpoint digest, and attempt exhaustion quarantines instead of looping.
- Task records bind only an Admission Request digest. They do not copy or own
  Provider, Rights or SERF state. Durable task persistence and remote worker
  activation remain HOLD until a PostgreSQL append-only adapter is implemented
  and independently verified.
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

The Common Control Foundation tests are local deterministic control evidence.
They do not prove SERF dual-key decisions, provider rights, signed manifests,
remote ledger persistence, external fetch, or Production readiness.

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

Before STAGING activation, apply all ordered PostgreSQL migrations to an approved
ephemeral instance, prove migration/restore/RLS/tenant isolation, deploy the
projector with the only write-capable D1 binding, prove two-client canonical
claim CAS/alias behavior and exact workflow receipt replay/conflict semantics,
rebuild D1 from the outbox and prove exact parity. Follow
`ACTIVATION_RUNBOOK.md`; remote PostgreSQL, Public, Production and G5 remain
HOLD.

## Autonomous task append-only ledger (local readiness)

The autonomous task lifecycle now has a PostgreSQL schema and runtime adapter for
append-only task snapshots and transition receipts. `(task_id, revision)` is the
compare-and-swap boundary; every accepted transition atomically inserts the next
snapshot and its digest-bound receipt. The dedicated writer role has SELECT/INSERT-only
access, while UPDATE, DELETE, and TRUNCATE are denied by both privilege and trigger.

This is local schema/runtime readiness only. No remote PostgreSQL instance, queue,
scheduler, remote worker, credential, external egress, Production, Public, or G5 path
is activated or claimed as verified.

## Autonomous task scheduler primitive (local readiness)

The scheduler primitive reads only the latest append-only task revisions, selects
available `synthetic-shadow` work in deterministic priority/time/task order, and
uses the ledger CAS path to claim it. Expired synthetic leases are recovered in
expiry order; exhausted attempts are quarantined. Candidate scans are bounded to
16 rows and contention skips are bounded, so no scheduler can overwrite a winner
or create an unbounded retry loop.

No periodic/event trigger or task payload executor is registered. Remote workers,
provider access, credentials, external egress, Production, Public, and G5 remain
HOLD.

## Synthetic worker execution envelope (local readiness)

The worker envelope revalidates the current Common Control admission proof before
persisting `START`, dispatches only an explicitly registered `synthetic-shadow`
handler, serializes digest-only checkpoints, and persists completion, cancellation,
retry, or quarantine through the existing append-only CAS ledger. Timeout and
cancellation abort the handler context; accepted checkpoints settle before the
final cancellation transition. Raw handler errors are reduced to bounded reason
codes.

The returned aggregate execution receipt binds the Common Control preflight receipt
and ordered durable transition receipt digests and has an independent exact-shape
verifier. It is not separately persisted yet and is rebuildable from the transition
ledger. The registry is a reviewed-code trust boundary, not an untrusted-code
sandbox. No trigger, remote worker, provider access, credential, external egress,
Production, Public, or G5 capability is enabled.

## Admission proof store and single-cycle runner (local readiness)

The admission proof store persists the exact synthetic source request, Common
Control decision, and shadow manifest as a separate append-only PostgreSQL
record. A dedicated NOLOGIN writer role has SELECT/INSERT only; the autonomous
task role has read-only proof access. Resolution requires an exact task/request
digest match and an unexpired manifest. The worker still revalidates current
policy, registry, kill state, endpoint, and expiry before `START`, so persistence
does not turn stale evidence into execution authority.

The single-cycle runner performs at most one bounded claim per call, resolves
the proof, invokes the existing preflighted worker, and returns a self-digest
receipt binding the claim, proof, and execution evidence. If proof is missing or
current preflight denies it, the runner does not invoke a handler: it uses the
same worker/lease-epoch fence to return the claim to bounded retry or quarantine
when attempts are exhausted. Unexpected post-start infrastructure failures are
left to the existing lease-expiry recovery path.

No loop, timer, cron, event trigger, remote PostgreSQL connection, remote worker,
provider adapter, credential resolver, external network path, Production,
Public, or G5 activation is registered. This is a local deterministic integration
primitive only.

## Recovery-first autonomous control tick (local readiness)

The control tick composes lease recovery and the single-cycle runner without
creating a scheduler loop. Every call scans for one expired synthetic lease
first. A recovered or quarantined lease ends that tick; bounded CAS contention
also ends it fail-closed. Only an idle recovery scan permits one new synthetic
claim and execution cycle. This prevents fresh work from starving recovery and
prevents uncertain recovery ownership from being bypassed by a new claim.

Its exact-shape, self-digest receipt binds either the recovery transition receipt
or the single-cycle receipt, never both. The aggregate receipt is returned locally
and remains rebuildable from the append-only transition ledger and its bound
receipts; it is not separately persisted. No loop, timer, cron, event trigger,
remote worker, provider path, credential resolver, external egress, Production,
Public, or G5 capability is registered.

## Bounded shadow supervisor (local readiness)

The shadow supervisor permits an explicit local caller to make bounded progress
across successful synthetic tasks without creating an autonomous scheduler. Each
call requires a tick budget of 1–16 and an elapsed-time budget of 1–60,000 ms.
Only `CYCLE_EXECUTED` may continue to another tick. Idle, recovery, retry,
quarantine, CAS contention, global kill, cancellation, or an unexpected dependency
failure stops the call immediately. This prevents exception states from turning
into tight retry loops or crossing the recovery-first boundary.

The supervisor checks the time budget before each tick and reduces the worker
timeout to the remaining budget. It does not hard-preempt an already in-flight
database call, so it is not an operational wall-clock SLO or remote concurrency
claim. Its exact-shape receipt records ordered tick states and receipt digests,
budget usage, counts, and a bounded non-secret failure class. No automatic trigger,
timer, cron, remote worker, provider path, credential resolver, external egress,
Production, Public, or G5 capability is registered.

## Supervisor invocation admission and approval queue (local readiness)

Supervisor execution now has a separate append-only request, decision, and
single-use consumption boundary. A request binds the exact synthetic worker,
tick and duration budgets, lease and retry limits, static handler registry,
current control-state digest, and expiry. A decision binds the exact request ID
and digest. Before execution, PostgreSQL must atomically insert the command ID
into the consumption ledger; rejection, expiry, changed control state, or a
duplicate command leaves the supervisor uninvoked.

The invocation connection and task connection are separate least-privilege
roles. Consumption is committed before task execution and is never reopened if
the supervisor later fails, preventing replay-based recovery from executing the
same authority twice. Current reviewer identity is deliberately labelled
`UNVERIFIED_LOCAL_SYNTHETIC_REVIEW_HOLD`: it is not Program Owner authority and
cannot authorize remote PostgreSQL, providers, credentials, external egress,
Production, Public, or G5. Cryptographic reviewer authentication and automatic
trigger registration remain unimplemented and HOLD.

## Provider-rights preflight projection (read-only)

Common Control can project the existing Track A/Z provider-rights decision gate
into a deterministic, digest-bound preflight result. `NO_GO` is denied,
`NEEDS_CLARIFICATION` remains HOLD, and even `PASS` is only
`PREFLIGHT_ELIGIBLE_NO_FETCH`. The projection creates no provider contact,
network access, credential lookup, database state, scheduler, or activation;
the Track A/Z artifact remains the canonical rights source.

An optional evidence binder can additionally prove that the exact eligible
preflight was signed by the fixed KPMO + Track A + Track Z quorum and consumed
once through the approval ledger. Its output remains
`VERIFIED_PROVIDER_PREFLIGHT_EVIDENCE_NO_ACTIVATION`; it is not wired to a
provider adapter or Fetch Broker and cannot authorize contact or execution.

## Cryptographic approval envelope (offline verification readiness)

The Common Control boundary now includes an offline Ed25519 verification envelope
and a fixed authority matrix. Local synthetic shadow approval requires KPMO;
provider preflight requires the exact KPMO + Track A + Track Z quorum; a protected
action package requires KPMO + Program Owner. Envelopes bind the exact subject,
requested capabilities, validity window, nonce, authority-matrix digest and a
caller-pinned trust-registry digest. Missing, extra, expired, future, tampered,
role-substituted or untrusted signatures fail closed.

This module only emits `SIGNATURES_VERIFIED_AUTHORITY_NOT_ACTIVATED` evidence. No
real role key is registered in the repository, and the module cannot generate a
key or issue a signature. It is not wired into supervisor invocation, provider
preflight, Fetch Broker, or a protected-action executor. Therefore reviewer
authentication for the current invocation path remains unimplemented; provider
contact, spend, credentials, external egress, Production, Public and G5 remain
HOLD even when a test envelope has a valid signature quorum. Nonce replay
persistence and single-use consumption are also not implemented in this offline
verifier; they remain separate requirements at any future execution boundary.

## Cryptographic approval single-use ledger (local readiness)

The separate approval-consumption module verifies the complete signed envelope
and its caller-pinned trust registry before opening a database transaction. It
then binds the exact expected authority class and subject and attempts one
append-only PostgreSQL insert. Migration `0007` gives a dedicated NOLOGIN role
SELECT/INSERT only and makes envelope ID, envelope digest and nonce digest unique.
An exact envelope replay returns `ALREADY_CONSUMED_HOLD` without a second
consumption receipt; reuse of the nonce by a different envelope is a conflict and
rolls back.

This closes the local replay-control primitive but does not register any real
KPMO, Track A, Track Z or Program Owner trust root. The ledger is not wired into
supervisor invocation, provider preflight or protected action execution, and its
consumption receipt explicitly keeps activation false. Live PostgreSQL
concurrency is not verified. Provider contact, spend, credentials, external
egress, Production, Public and G5 remain HOLD.

## Approval trust-root lifecycle (local synthetic boundary)

The trust-root lifecycle module accepts only Ed25519 public-key candidates for
the fixed KPMO, Program Owner, Track A and Track Z roles. It derives candidate,
synthetic-active, superseded and revoked states from immutable events. A rotation
must name the exact currently active predecessor for that role; revocation is
terminal and takes priority over any later activation attempt. Duplicate key IDs
or public-key fingerprints fail closed.

Migration `0008` adds append-only candidate and lifecycle-event tables under a
dedicated NOLOGIN role with SELECT/INSERT only. This is a local synthetic
primitive: no real role key is registered, no private-key generation, storage or
signing exists, and lifecycle output is not wired into the approval verifier.
Provider contact, spend, credentials, external egress, Production, Public and G5
remain HOLD. Real PostgreSQL concurrency is not verified.

## Trust handoff control bundle (four modular controls)

The snapshot ledger records a compiled registry, its handoff receipt and the
bound lifecycle digest as one immutable PostgreSQL row. The exact resolver
requires both registry ID and digest. The current-state fence recompiles the
supplied lifecycle under an externally pinned current lifecycle digest and
rejects a stale, rotated or revoked snapshot before signature verification.
The former gateway that invoked the consumer after a separate lifecycle check is
retained only as a fail-closed compatibility boundary. It always rejects.

These are four separate modules and contracts, not a merged trust subsystem.
Migration `0009` grants the snapshot writer SELECT/INSERT only and grants the
existing approval consumer SELECT only. No real key, automatic trigger or
remote database is activated; Production, Public and G5 remain HOLD.

## Atomic current trust head and revocation fence

The current-head publisher serializes lifecycle publication under one
PostgreSQL transaction advisory lock and appends either an active registry head
or a revocation tombstone chained to the previous head digest. The approval
gateway takes the same lock, reads the current head and inserts the single-use
nonce consumption in that same transaction. A rotation or revocation therefore
cannot commit between the decisive current-state check and consumption.
Runtime callers use only `approval-trust-runtime-v1.mjs`; validation rejects
imports of the retired gateway or direct atomic-gateway bypasses from runtime
modules.

Migration `0010` gives the dedicated head writer SELECT/INSERT only and the
approval consumer SELECT only. Local tests prove call order, tombstone denial
and rollback behavior with the deterministic adapter. Real multi-client
PostgreSQL concurrency remains `NOT_VERIFIED` until the approved ephemeral
runner executes; real keys, triggers, credentials, external egress, Production,
Public and G5 remain HOLD.

## Approval trust-registry compiler (explicit local handoff)

The registry compiler revalidates the complete synthetic lifecycle and emits
only the currently active public key for each role. Candidate, lifecycle-event
and derived-state digests are bound to a self-digested handoff receipt. Input
ordering does not change the registry or receipt, and revoked or superseded keys
cannot be emitted.

The output uses the existing caller-pinned approval registry format, but there
is no automatic connection to the verifier. A caller must reproduce the exact
handoff and explicitly provide both the registry and its exact digest. No real
key, private-key operation, supervisor trigger, provider path or protected
executor is connected. Production, Public and G5 remain HOLD.

## Autonomous Launcher minimal path (local synthetic only)

`launcher-v1.mjs` connects the existing atomic current-trust consumer to the
existing invocation admission and bounded shadow supervisor. The approval
subject is exactly the invocation request ID and request digest. Authority is
consumed first; replay, expiry, revocation, substitution, or control-state
drift stops before execution. The launcher adds no policy engine, persistence,
controller, gate, registry, network access, credential resolution, or trigger.

Its receipt binds the approval verification and consumption receipts to the
invocation consumption, supervisor, and execution receipts. This closes only
the local synthetic minimal path. Remote workers, automatic triggering,
Production, Public, and G5 remain HOLD.

The launcher also performs a pure, non-persisting operational evidence check
before returning success. It verifies the exact authority, invocation,
supervisor, ordered tick, task-cycle, task-execution, and lease-recovery digest
chain for the same request. This adds no runtime, storage, trigger, or policy
surface.

The same module reduces that verified chain to a non-authoritative read-only
operational status: `HEALTHY`, `QUARANTINED`, or `FAIL_CLOSED`. The projection
cannot activate a worker or any protected environment, is not persisted, and
does not replace PostgreSQL ledger truth.

For the existing management Control Tower, the launcher emits one bounded
observation adapter record from that status. It is `OBSERVE_ONLY`, carries the
source evidence digest and operational counters, and explicitly forbids
mutation or activation. No dashboard, persistence path, or second source of
truth is introduced.

From that verified observation, the launcher also emits a pure containment
recommendation: `CONTINUE`, `QUARANTINE`, or `STOP`. The mapping is exact and
fail-closed (`HEALTHY`, `QUARANTINED`, `FAIL_CLOSED` respectively), but it takes
no automatic action and grants no mutation or activation authority. Production,
Public, remote workers, and G5 remain HOLD.

Only `QUARANTINE` and `STOP` produce a digest-bound containment action package.
That package is shaped as an exact `PROTECTED_ACTION_PACKAGE` approval subject,
so the existing KPMO and Program Owner cryptographic approval boundary can be
reused without another approval system. `CONTINUE` produces no package. Package
creation performs no mutation, activation, persistence, or automatic action.

The containment package can now be atomically verified and consumed against the
current trust head using the existing `PROTECTED_ACTION_PACKAGE` quorum: KPMO
plus Program Owner. Consumption is single-use; replay is held, and expiry,
revocation, rotation, package substitution, or recommendation substitution
fails closed. The resulting receipt remains `NO_ACTION_TAKEN` and grants no
activation or mutation authority.

An approval-chain-bound containment fence is mandatory at launcher entry. The
launcher recovers the current fence from the append-only PostgreSQL source of
truth before request validation, trust consumption, invocation admission, or
task access; caller-supplied clear state is ignored. No persisted fence means
clear, while an approved `QUARANTINE` or `STOP` fence returns the corresponding
HOLD before any authority, admission, or task database access. It changes no
Production or external-system state. Approval consumption and active-fence
recording commit atomically; either write failing rolls both back.

Returning from containment is also append-only. An active `STOP` or
`QUARANTINE` fence can become `APPROVED_CONTAINMENT_RELEASED` only through a
new exact KPMO and Program Owner approval bound to the latest active fence
digest. Stale, replayed, substituted, or concurrently superseded releases roll
back and remain HOLD; no event is updated or deleted.

The current fence is resolved by a database-generated monotonic event sequence,
not by transaction timestamps. This prevents a transaction that waited on the
containment lock from becoming falsely older because its transaction timestamp
was captured before lock acquisition.

The complete local synthetic launcher chain is automatically revalidated on
protected-main changes and once daily by the read-only
`kidults-control-plane-autonomous-verification-v1.yml` workflow. The workflow
uses no persisted checkout credentials and grants no remote worker, external
egress, Production, Public, or G5 activation authority. Manual dispatch remains
only a recovery and diagnostic path.

## Lease, checkpoint, and truth reconciliation

Agent loss does not create a second task state. The existing scheduler reads
only the latest append-only PostgreSQL snapshot, recovers an expired `LEASED`
or `RUNNING` task, preserves its checkpoint digest, clears the former owner,
and issues the successor a higher lease epoch. The old worker cannot checkpoint
or complete against that epoch. Completion is another snapshot/transition pair,
so terminal truth remains reconstructable from the ledger.

The reconciliation contract adds no runtime module, table, policy engine,
controller, gate, registry, or trigger. Its end-to-end test covers agent loss,
checkpoint survival, successor completion, stale-worker rejection, and exact
terminal readback. Remote workers, Production, Public, and G5 remain HOLD.

## Ephemeral PostgreSQL evidence runner (implemented, not executed)

`scripts/autonomous-postgres-evidence-v1.mjs` is the fail-closed bridge from
local contract tests to an approved disposable PostgreSQL database. It accepts
only a clean exact HEAD, an empty database named `kidults_ephemeral_*`, the
explicit `EPHEMERAL_NON_PRODUCTION_APPROVED` confirmation, and a private output
directory outside the repository. The DSN is read only from the process
environment and is never written to the receipt.

The runner applies ordered migrations `0001` through `0011`, reads back the governed
NOLOGIN roles and least privileges, proves proof replay and rollback, rejects
append-only mutation and an orphan noninitial task snapshot, and runs two real
`psql` clients against one task revision to require exactly one snapshot and
transition winner. Migration `0005` adds a deferred database constraint so a
noninitial snapshot cannot commit without its matching transition in the same
transaction.

The same runner also starts a revocation publisher, waits for proof that it owns
the shared trust-head transaction lock, and then starts a separate approval
consumer. After the tombstone commits, the consumer must observe the revoked
head and insert zero approval consumptions; the final database counts must be
exactly two trust heads and zero consumptions.

The inverse order is also exercised with a new active head: the consumer first
proves ownership of the same lock and commits exactly one consumption, after
which the waiting publisher appends the chained tombstone. Across both races the
final counts must be exactly four trust heads and one consumption, proving both
legal serial orders rather than testing only the deny outcome.

The same ephemeral run appends an approved `STOP` fence, proves that the current
fence denies invocation, rejects mutation of that event, then appends a `RELEASE`
fence chained to the exact STOP digest. The latest fence must restore invocation
while Production, Public, and G5 remain HOLD, and the final append-only event
count must be exactly two. This is canary evidence only and does not activate a
remote worker or Production runtime.

Before `receipt.json` is written, an independent verifier requires the exact
source SHA, ordered migration set and digest, all boolean proofs, exact row
counts, self-digest integrity and every protected HOLD boundary. Added fields,
result substitution and a receipt that claims runtime, provider or release
authority are rejected even when an attacker recomputes the self-digest.

Example for an already approved isolated database:

```sh
export KIDULTS_EPHEMERAL_POSTGRES_DSN='<secret-manager injected DSN>'
export KIDULTS_EPHEMERAL_POSTGRES_CONFIRM='EPHEMERAL_NON_PRODUCTION_APPROVED'
npm --prefix services/kidults-control-plane run verify:autonomous-postgres-canary -- \
  --expected-sha '<exact clean HEAD SHA>' --output-dir '<empty private directory outside repository>'
```

This governed command runs the database evidence child first, then launches the
independent receipt verifier with a fresh minimal environment that contains no
DSN or approval confirmation. Both bounded child processes must succeed before
an aggregate ephemeral-only PASS is emitted.

Independently verify the resulting private receipt from the same exact clean
checkout without reading the PostgreSQL credential:

```sh
npm --prefix services/kidults-control-plane run verify:autonomous-postgres-receipt -- \
  --receipt '<absolute private receipt.json path>' --expected-sha '<exact clean HEAD SHA>'
```

This runner has not executed in the current environment because neither `psql`
nor an approved ephemeral DSN is available. It does not prove the JavaScript
runner against a live database, managed backup/PITR, remote worker activation,
or operational readiness. Automatic trigger, Production, Public, and G5 remain
HOLD.
