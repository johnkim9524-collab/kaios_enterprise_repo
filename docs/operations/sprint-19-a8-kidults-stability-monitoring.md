# Sprint 19-A8 — Kidults Production Stability Monitoring and Incident Gate

## Objective

Automate the 30-day Kidults Production stability observation period without changing the Production application, database schema, publishing behavior, or Artfund authorization state.

## Scope

This sprint adds:

- deterministic aggregation of daily stability snapshots;
- elapsed, successful, failed, missing, and consecutive pass-day counts;
- machine-readable final-certification readiness;
- fail-closed incident capture;
- an explicit Production change freeze during observation;
- an explicit Artfund Production authorization block.

## Inputs

Default snapshot root:

```text
/mnt/ih_prod_01/backups/stability-baseline
```

Expected daily file pattern:

```text
kidults-stability-*.json
```

## Outputs

```text
/mnt/ih_prod_01/backups/stability-baseline/status/kidults-stability-status.json
/mnt/ih_prod_01/backups/stability-baseline/status/kidults-stability-incident-YYYYMMDDTHHMMSSZ.json
```

## Evaluation command

```bash
python3 scripts/production/evaluate-kidults-stability-baseline.py \
  --snapshot-root /mnt/ih_prod_01/backups/stability-baseline \
  --output /mnt/ih_prod_01/backups/stability-baseline/status/kidults-stability-status.json \
  --required-days 30
```

## Incident command

```bash
STATUS_FILE=/mnt/ih_prod_01/backups/stability-baseline/status/kidults-stability-status.json \
INCIDENT_ROOT=/mnt/ih_prod_01/backups/stability-baseline/status \
bash scripts/production/capture-kidults-stability-incident.sh
```

Exit behavior:

- `0`: no incident;
- `2`: incident recorded and Production change remains blocked.

## Completion gate

Final stability certification is ready only when all conditions are true:

- at least 30 unique observation days exist;
- every counted daily snapshot has status `pass`;
- no invalid snapshot files exist;
- consecutive pass days are at least 30;
- Production change remains controlled until separate final certification.

## Fail-closed controls

During the observation period:

- Kidults Production schema changes are prohibited;
- Gateway and Scheduler replacement is prohibited except controlled incident recovery;
- new Collector sources are not promoted directly to Production;
- new publishing behavior is not enabled;
- Artfund Production promotion remains unauthorized.

## Expected status example

```json
{
  "status": "observing",
  "observation_days_required": 30,
  "elapsed_days": 1,
  "successful_days": 1,
  "failed_days": 0,
  "missing_days": 29,
  "consecutive_pass_days": 1,
  "latest_snapshot_status": "pass",
  "production_change_allowed": false,
  "final_certification_ready": false,
  "artfund_production_authorized": false
}
```

## Operational sequence

1. Run the evaluator after the daily stability snapshot.
2. Run the incident gate against the generated status file.
3. Preserve status and incident evidence under the mounted backup volume.
4. Investigate every incident before any Production change.
5. Keep final certification blocked until the full 30-day gate passes.

## Important status

This sprint does not deploy new Production application code and does not authorize Artfund Production promotion.
