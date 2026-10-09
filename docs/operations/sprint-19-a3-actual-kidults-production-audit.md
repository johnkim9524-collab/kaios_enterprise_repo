# Sprint 19-A3 — Actual Kidults Production Audit Execution

> **Current gate notice:** The original score-only `go` path is superseded by
> `contracts/certification/kidults-controlled-production-promotion.v1.json`.
> A 100/100 audit is technical evidence only and can never authorize Production.

## Objective

Execute a non-destructive audit of the current Kidults Production runtime and generate an evidence-based `go`, `hold`, or `rollback` decision.

## Safety Boundary

- Do not replace or restart the Production containers during evidence capture.
- Do not modify the Production database.
- Do not enable report, alert, or index publishing.
- Do not authorize Artfund Production promotion.
- The default decision remains `hold` until every mandatory gate passes.
- Predeployment SQLite capture must bind the online-backup bytes and recovery
  UID/GID/mode receipt to the same held source inode. Legitimate concurrent WAL
  writes are supported; path/ancestor substitution fails closed. This does not
  claim integrity against a hostile DB-owner principal that can directly mutate
  the database or its WAL/SHM sidecars.

## Execution Order

```bash
cd /opt/intelligence-holdings/kidults/app

git fetch origin main
git switch main
git reset --hard origin/main

chmod +x scripts/production/execute-kidults-production-audit.sh

PROD_ROOT=/opt/intelligence-holdings/kidults/app \
PROD_DB=/opt/intelligence-holdings/kidults/data/kaios.db \
EVIDENCE_DIR=/opt/intelligence-holdings/kidults/app/artifacts/production-audit \
BACKUP_ROOT=/mnt/ih_prod_01/backups/kidults \
BASE_URL=https://kaios.kidults.com \
bash scripts/production/execute-kidults-production-audit.sh
```

## Delta Evidence

Create `artifacts/production-audit/staging-production-delta.json` only after comparing the certified staging baseline with the current Production runtime.

Required keys:

```json
{
  "id": "KIDULTS_STAGING_PRODUCTION_DELTA_EVIDENCE_V1",
  "version": "1.0.0",
  "producer_id": "KIDULTS_STAGING_PRODUCTION_DELTA_CERTIFIER_V1",
  "source_sha": "<exact 40-character source SHA>",
  "observed_at": "<UTC ISO-8601 timestamp>",
  "state": "VERIFIED",
  "evidence": {
    "status": "pass",
    "destructive_schema_delta": false,
    "viewer_export_exposed": false,
    "restricted_rights_exposed": false,
    "rollback_rehearsal_passed": true,
    "mobile_320_passed": true,
    "governance_gate_passed": true,
    "observability_passed": true,
    "incident_response_ready": true,
    "critical_deltas": []
  }
}
```

Do not mark a key `true` without direct evidence.

## Final Decision

```bash
python3 scripts/production/finalize-kidults-production-readiness.py
python3 -m json.tool artifacts/production-audit/kidults-production-readiness.json
```

The finalizer writes complete checksum-bearing JSON to a private
`O_EXCL|O_NOFOLLOW` inode, fsyncs it, and atomically publishes it in the held
evidence directory. A rerun may replace only an existing single-link regular
`0600` output; a symlink, hardlink, unsafe parent, or interrupted hidden temp is
`HOLD` and is never followed or truncated. Special-file collisions are opened
nonblocking only for metadata classification and are rejected without waiting
on the special file.

The legacy audit and delta inputs are likewise opened relative to the held
evidence-directory FD with `O_NONBLOCK|O_NOFOLLOW`, admitted only as stable
single-link regular files, size-bounded, and read from the held inode.
A FIFO or other special-file input therefore produces `HOLD` without blocking.
The downstream Node release gate applies the same nonblocking, no-follow,
stable-regular-file rule to mutable evidence, archive, manifest, attestation,
and trust-key inputs (with explicit support for already-held `/proc/self/fd/N`
descriptors used by the evidence sealer).

That one checksum-bearing JSON file is the sole readiness commit record. A
second completion sentinel is forbidden because it would introduce a two-file
atomicity gap. Same-directory atomic publication gives readers either the old
complete JSON or the new complete JSON; only a successful finalizer return
attests that both the file and its held parent directory were fsynced. An
interrupted or failed invocation is not a completion attestation, even if a
complete new directory entry became visible before the failure.

## Ready-for-Program-Owner criteria

- Score is exactly 100/100.
- Every mandatory gate passes.
- No destructive schema delta exists.
- Database integrity is `ok`.
- Backup integrity and rollback rehearsal pass.
- Unauthenticated premium access returns 401.
- Viewer export is not exposed.
- Mobile 320 px, governance, observability, and incident-response gates pass.
- The governed `production-readiness-evidence-v1.json` proves at least 30 unique,
  first-attempt scheduled natural runs spanning at least seven days.
- Every run is bound to the exact source, policy, cohort, rights census and schema
  census digests, plus passing SLO/error-budget and verified PITR/rollback receipts.

The resulting decision is `ready_for_program_owner_release` with
`production_promotion_authorized=false`. A separate signed Program Owner release
receipt is mandatory for sealing and promotion.

## HOLD Criteria

Use `hold` when recoverable evidence or readiness gaps remain. No Production promotion is authorized.

## ROLLBACK Criteria

Use `rollback` when a hard blocker is present, including database integrity failure, destructive schema delta, authentication bypass, viewer export exposure, restricted-rights exposure, or instability.

## Archive

Seal the final evidence package under the attached volume and record its SHA-256 checksum. Never archive secrets or bearer tokens.
