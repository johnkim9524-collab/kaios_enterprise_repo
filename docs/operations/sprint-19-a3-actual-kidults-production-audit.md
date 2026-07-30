# Sprint 19-A3 — Actual Kidults Production Audit Execution

## Objective

Execute a non-destructive audit of the current Kidults Production runtime and generate an evidence-based `go`, `hold`, or `rollback` decision.

## Safety Boundary

- Do not replace or restart the Production containers during evidence capture.
- Do not modify the Production database.
- Do not enable report, alert, or index publishing.
- Do not authorize Artfund Production promotion.
- The default decision remains `hold` until every mandatory gate passes.

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
```

Do not mark a key `true` without direct evidence.

## Final Decision

```bash
python3 scripts/production/finalize-kidults-production-readiness.py
python3 -m json.tool artifacts/production-audit/kidults-production-readiness.json
```

## GO Criteria

- Score is at least 90.
- Every mandatory gate passes.
- No destructive schema delta exists.
- Database integrity is `ok`.
- Backup integrity and rollback rehearsal pass.
- Unauthenticated premium access returns 401.
- Viewer export is not exposed.
- Mobile 320 px, governance, observability, and incident-response gates pass.

## HOLD Criteria

Use `hold` when recoverable evidence or readiness gaps remain. No Production promotion is authorized.

## ROLLBACK Criteria

Use `rollback` when a hard blocker is present, including database integrity failure, destructive schema delta, authentication bypass, viewer export exposure, restricted-rights exposure, or instability.

## Archive

Seal the final evidence package under the attached volume and record its SHA-256 checksum. Never archive secrets or bearer tokens.
