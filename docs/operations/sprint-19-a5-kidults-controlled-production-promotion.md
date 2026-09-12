# Sprint 19-A5 — Kidults Controlled Production Promotion

> **Current gate notice:** The former self-authorizing boolean path is superseded
> by `contracts/certification/kidults-controlled-production-promotion.v1.json`.
> The promote script revalidates the current-SOLD evidence and signed Program Owner
> receipt from the sealed archive immediately before any dry-run or execution path.

## Objective

Promote the authorized Kidults runtime through a controlled, reversible production procedure while preserving Artfund isolation.

## Current authorization

The promotion may proceed only when the executable gate verifies:

- technical decision: `ready_for_program_owner_release`
- 30 unique first-attempt scheduled natural runs over at least seven days
- exact source/policy/cohort/rights/schema bindings
- passing SLO and error budget plus verified PITR and rollback receipts
- an unexpired Ed25519 Program Owner release receipt bound to the readiness checksum,
  exact gateway/scheduler image IDs, and exact deployment-compose manifest digest
- an independently signed, exactly-once protected-executor consumption attestation
  bound to the archive, artifact, run/attempt, execution mode, and snapshot manifest
- Artfund remains unauthorized and no Production change is recorded in the archive

## Safety rules

1. The default mode is dry-run.
2. Production execution requires `KAIOS_EXECUTE_PRODUCTION_PROMOTION=true`.
3. Artfund files, services, databases, routes, and publication flags must not be changed.
4. A predeployment database, configuration, container, and rollback snapshot is mandatory.
5. Destructive database migration is prohibited.
6. Failed health, authentication, portal, or database checks block certification and require rollback.
7. The Production runtime checkout must be clean and its exact source SHA must match the SHA bound by the signed release receipt.
8. Program Owner and release-executor public keys and fingerprints are read only
   from fixed root-owned files under `/etc/kaios/kidults-production-release`.
9. The protected executor must place the signed consumption attestation at
   `/etc/kaios/kidults-production-release/replay-consumption/<archive-sha256-hex>.json`;
   the promote script never synthesizes or accepts an override for it.
10. Execute mode requires both checkouts on canonical `main`, a readable live
    remote `main` at the signed SHA, and an atomic local one-time marker under
    `/var/lib/kaios/kidults-production-release/consumed/<consumption-id>`.
    The immutable authorization marker remains unchanged for rollback validation;
    a separately fsynced `terminal-result.json` records promotion success or the
    automatic rollback outcome. It is published from a fully written private
    temporary inode by atomic `RENAME_NOREPLACE`; the exact-context success
    marker—not a shell variable—is the sole rollback-disarm authority. Before
    accepting a visible marker, the signal/error handler fsyncs its held parent
    directory and requires exact source, snapshot, deployment manifest, target
    image, and deployed immutable container-ID bindings. A signal before rename
    leaves a non-authoritative stale-temp `HOLD`; a signal after rename converges
    on that one accepted result without launching a contradictory rollback. A
    terminal special-file collision is inspected nonblocking and is invalid. A
    terminal file write or file-fsync failure before rename still triggers the
    bound rollback. If exact success is already atomically visible but both the
    publisher and signal/error handler cannot fsync the held parent, the process
    exits in an explicit critical operator `HOLD` without rollback; this avoids
    recording `PROMOTION_SUCCEEDED` and then executing a contradictory rollback.
    From the first command in the failure/signal handler through cleanup,
    terminal-authority evaluation, bound rollback handoff, and rollback-outcome
    publication, nested `ERR`, `INT`, and `TERM` remain ignored; they cannot
    restore default termination or bypass containment. The bound rollback child
    inherits those ignored dispositions for this bounded containment
    invocation.
    Temporary smoke/override cleanup failure is logged but cannot bypass this
    terminal-state decision or automatic rollback.
11. Immediately before the first container mutation, the gate revalidates receipt
    expiry plus archive, manifest, snapshot, compose, source, trust-key, fingerprint,
    and attestation bindings; any drift remains `HOLD`.
12. The snapshot must precede protected-executor consumption and remain no more
    than one hour old at promotion. Its signed manifest digests must exactly match
    the live Production compose and environment files.
13. The live compose bytes must match the deployment-manifest digest approved by
    the Program Owner and signed by the executor. The compose-resolved local
    gateway and scheduler image IDs must exactly match the IDs signed by both;
    deployment uses `--pull never --no-build`, and
    a root-only pinned compose override replaces mutable tags with those content
    IDs. Only the exact gateway and scheduler services are recreated with
    `--no-deps`, then both deployed containers are checked before smoke testing.
14. The external `CREATE_IF_ABSENT` nonce-store receipt is read from the fixed
    replay-consumption root under a filename derived from its signed nonce-store
    key (`/etc/kaios/kidults-production-release/replay-consumption/<key-hex>.nonce-store-receipt.json`).
    Its raw digest and full context are verified by the release gate.
15. SQLite capture uses the online backup API through a held source-parent FD and
    proves the SQLite connection opened the held source/target inodes. The helper
    samples `captured_at` immediately when `sqlite3_backup` returns, before later
    integrity or durability work, and writes it with UID, GID, and canonical mode from that same held source
    FD into an `O_EXCL|O_NOFOLLOW`, fsynced receipt; a later path `stat` is not
    authoritative. Concurrent legitimate WAL writers remain supported. Entry or
    ancestor namespace swaps fail closed. A hostile process running as the DB
    owner is not claimed as an integrity boundary because that principal can also
    mutate the database content and WAL/SHM sidecars directly.
16. Before mutation, rollback inputs are copied into a digest-named durable pin.
    Every ancestor from `/` through the pin root and prepared directory must be
    root-owned and group/world non-writable. Promotion holds stable FDs for both
    directories, binds their device/inode identities into the local consumption
    receipt, and revalidates them immediately before mutation and rollback.
17. Rollback preparation verifies the restore helper's exact signed-source Git
    blob, canonical root ownership/mode, syntax, and protected parent identity.
    Database restore reads the pinned image and publishes `kaios.db` through held
    source/destination directory FDs, a random `O_EXCL|O_NOFOLLOW` temporary file,
    digest-on-copy, `fchown`/`fchmod`/`fsync`, and directory-FD-relative atomic
    rename. Existing non-regular destinations, predictable-name collisions, or
    changed destination inodes fail closed without touching an external target.
18. The rollback executor binds gateway and scheduler container IDs before stop,
    treats any bounded stop failure as `HOLD`, and repeatedly proves the same
    ID/name pair has `Running=false`, `Paused=false`, `Restarting=false`, `Pid=0`,
    and status `created` or `exited`. Before publishing the restored main DB, it
    rejects unknown `kaios.db-*` state, stages every exact WAL/SHM/journal data
    and checksum pair through held FDs, fsyncs every member and the receipt
    directory, and only then moves the complete cohort by same-directory
    `RENAME_NOREPLACE` into reversible quarantine. Immediately after final
    quiescence and immediately before `docker start`, a held database-parent FD
    scan rejects all known WAL/SHM/journal entries and every unknown
    `kaios.db-*` entry; the canonical parent device/inode is revalidated both
    before and after that scan.
    Fresh immutable-ID/name quiescence proofs are adjacent to both the failed-DB
    forensic open and the atomic restore invocation. Docker enumeration or
    inspect errors are never interpreted as absence; exact-name containment
    accepts only `kidults-gateway`/`kidults-scheduler` list results whose inspect
    names are exactly `/kidults-gateway` and `/kidults-scheduler`.
19. The environment and compose files are one two-file rename-exchange
    transaction with mirrored destination/receipt journals. Failure after the
    first publication reverse-exchanges every published file back to its exact
    prior inode, records `ABORTED_ROLLED_BACK`, and removes transaction state.
    If any reverse exchange fails, the live transaction journal and temporary
    inodes remain, `ABORT_RECOVERY_HOLD` is durable, and startup stays forbidden.
20. Before any rollback mutation, an exclusive `ACTIVE_HOLD_ON_REENTRY` pointer
    and phase journal are fsynced. Prior restart policies are durably captured;
    the exact services are recreated stopped through a checksum-bound compose
    override that forces `restart: "no"`. On failure, the handler repeatedly
    resolves `kidults-gateway` and `kidults-scheduler` by exact name, binds late
    replacement IDs created by a partial compose failure, and disables restart
    plus stops every exact-name container it can prove. Prior policies remain
    forbidden until recovery checks pass, the rollback receipt/checksum close,
    the terminal-success manifest is published last at the terminal boundary,
    and the active pointer is atomically transitioned to
    `TERMINAL_SUCCESS_RESTART_POLICY_CLEANUP_PENDING`.
    Before either prior policy is restored, the held terminal pointer and
    terminal manifest are re-read nonblocking, identity-stability checked, and
    bound to streaming SHA-256 verification of `rollback-receipt.json` plus its
    checksum. Large receipt members are hashed incrementally. A crash after
    `RENAME_EXCHANGE` may leave one hidden old-active pointer; only its exact
    active-context binding permits automatic unlink plus root-directory fsync.
21. Rollback receipts use only the fixed protected root. The executor validates
    its entire ancestor chain through stable FD5, creates a random 64-hex
    exclusive `mkdirat` directory, holds it as FD4, and writes every member with
    `O_EXCL|O_NOFOLLOW`. A failure receipt, its checksum, and a manifest binding
    the exact pre-existing partial cohort by name, size, and SHA-256 are staged,
    fsynced, and published with `rollback-error-manifest.json` last through
    `RENAME_NOREPLACE`. An absent manifest is uncommitted `HOLD`; publication
    failure is reported distinctly with exit 74 and never clears the pointer.
    A terminal-manifest stage write, file-fsync, or pre-rename failure enters
    this same handler and still attempts the manifest-last error receipt. Every
    read from a mutable receipt/pointer namespace uses `O_NONBLOCK|O_NOFOLLOW`
    followed by a regular-file identity gate, so FIFOs and other special files
    cannot stall containment.
22. Re-entry is state-specific. `ACTIVE_HOLD_ON_REENTRY` is nonterminal and
    forbids prior-policy restoration or pointer removal.
    `TERMINAL_SUCCESS_RESTART_POLICY_CLEANUP_PENDING` proves terminal data
    recovery but permits only bound restart-policy reconciliation. A fresh
    rollback invocation never resumes either state implicitly. Terminal pointer
    archival ignores nested `ERR`, `INT`, and `TERM` before its first namespace
    mutation through transaction disarm; an archive error enters containment
    directly with no signal-handler gap.
23. Once rollback is armed, every explicit guard failure enters the same bound
    rollback handler as `ERR`, `INT`, and `TERM`; a helper-level `exit` may not
    bypass automatic rollback or terminal outcome persistence.

## Phase 1 — Capture predeployment snapshot

Run on the production server from the staging worktree:

```bash
cd /opt/intelligence-holdings/staging/kaios-enterprise
chmod +x scripts/production/capture-kidults-predeployment-snapshot.sh
bash scripts/production/capture-kidults-predeployment-snapshot.sh
```

Record the generated snapshot directory.

## Phase 2 — Dry-run authorization check

```bash
LATEST_ARCHIVE="$(find /mnt/ih_prod_01/backups/production-certification -type f -name 'kidults-production-evidence-*.tar.gz' -printf '%T@ %p\n' | sort -nr | head -n 1 | cut -d' ' -f2-)"
LATEST_SNAPSHOT="$(find /mnt/ih_prod_01/backups/production-certification -maxdepth 1 -type d -name 'kidults-predeployment-*' -printf '%T@ %p\n' | sort -nr | head -n 1 | cut -d' ' -f2-)"

EVIDENCE_ARCHIVE="${LATEST_ARCHIVE}" \
PREDEPLOYMENT_SNAPSHOT_DIR="${LATEST_SNAPSHOT}" \
bash scripts/production/promote-kidults-controlled.sh
```

Expected result:

```text
DRY RUN COMPLETE. No production change executed.
```

## Phase 3 — Explicit controlled execution

Execution is separately authorized and must use the same sealed evidence and snapshot values:

```bash
KAIOS_EXECUTE_PRODUCTION_PROMOTION=true \
EVIDENCE_ARCHIVE="${LATEST_ARCHIVE}" \
PREDEPLOYMENT_SNAPSHOT_DIR="${LATEST_SNAPSHOT}" \
bash scripts/production/promote-kidults-controlled.sh
```

## Required post-deployment evidence

- Gateway and scheduler running
- Health HTTP 200
- Portal HTTP 200
- Unauthenticated collector HTTP 401
- Authenticated collector HTTP 200
- Production database integrity `ok`
- Mobile 320px evidence remains valid
- Artfund promotion remains unauthorized

## Rollback boundary

The orchestrator does not overwrite the sealed snapshot. Once the first runtime
mutation is armed, an error, interrupt, termination, or failed smoke check invokes
the bound rollback executor automatically. No Artfund resource may be included in
rollback actions. Actual rollback reads the prepared snapshot through its held
directory FD and rejects unsafe captured DB modes, including special bits or
group/world write permissions. It restores the database only through the
FD-relative atomic helper described above; a destination symlink or non-regular
entry is `HOLD`, never an overwrite target. Docker state proofs are point-in-time
and rely on the protected single executor and Docker-control-plane serialization.
Host root, Docker-socket authority, or the same DB owner can still mutate DB/WAL
content and remain outside this receipt's claimed hostile-principal boundary.

### Active rollback pointer recovery

Never delete `.kidults-rollback-active-v1.json` or rerun rollback blindly. Open
it through the protected receipt-root FD and require its root-owned, single-link
`0600` identity plus exact source, snapshot, receipt-directory, and directory
identity bindings.

| Pointer state | Required response |
|---|---|
| `ACTIVE_HOLD_ON_REENTRY` | Keep every provable exact-name container stopped with `restart=no`; use the bound receipt directory and transaction journals to complete or reverse the interrupted nonterminal operation under an approved recovery procedure. Do not restore prior policies or clear the pointer. |
| `TERMINAL_SUCCESS_RESTART_POLICY_CLEANUP_PENDING` | Verify the held-FD `rollback-terminal-success-manifest.json` identity, digest, exact context, and streaming-bound rollback receipt/checksum. Validate a lone `.kidults-rollback-active-v1.terminal.<token>.tmp` as the exact exchanged prior active pointer, then automatically remove it and fsync the root; any extra or divergent stage remains `HOLD`. Reconcile each exact-name container idempotently to `restart-policy-before.json`; then create or verify the checksum-bound `restart-policy-after.json` and final exact receipt closure. Atomically rename the active pointer to `.kidults-rollback-terminal-v1.<receipt-directory>.json` with `RENAME_NOREPLACE`, fsync the root, and retain that terminal archive marker. |

Any missing container, ID/name rebinding, manifest or checksum mismatch, unsafe
inode, incomplete receipt closure, or failed fsync remains `HOLD`. The terminal
manifest authorizes restart-policy cleanup only, never a second database or
configuration restore.

## Certification outcome

Sprint 19-A5 is complete only after:

- the predeployment snapshot is sealed,
- dry-run authorization passes,
- controlled deployment is explicitly executed,
- all post-deployment checks pass,
- post-deployment evidence is sealed,
- production change is recorded as executed for Kidults only.
