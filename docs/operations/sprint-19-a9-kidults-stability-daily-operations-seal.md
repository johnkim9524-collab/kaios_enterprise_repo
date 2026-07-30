# Sprint 19-A9 — Kidults Stability Daily Operations Seal

## Objective

Convert the currently verified Kidults Production stability baseline into a reproducible, fail-closed daily operations package.

This sprint does not deploy new application code, modify the production database schema, enable new publishing behavior, or authorize Artfund Production.

## Current baseline

- Production vertical: Kidults
- Observation period: 30 days
- Current state at sprint start: observing
- Production change allowed: false
- Final certification ready: false
- Artfund Production authorized: false

## Deliverables

1. `scripts/production/install-kidults-stability-operations.sh`
   - Creates the required baseline directories.
   - Installs root-owned wrappers with `root:kaios` ownership and mode `0750`.
   - Installs and enables snapshot and evaluation systemd timers.
   - Runs an immediate snapshot and evaluation.

2. `scripts/production/verify-kidults-stability-operations.sh`
   - Verifies directory structure, wrapper permissions, timer state, and the machine-readable status gate.

3. `contracts/certification/kidults-stability-daily-operations-seal.v0.1.json`
   - Records schedule, filesystem, security, daily acceptance, and final 30-day acceptance requirements.

## Installation

Run on `ih-prod-01` from the staging repository:

```bash
cd /opt/intelligence-holdings/staging/kaios-enterprise

git fetch origin main
git switch main
git reset --hard origin/main

chmod +x \
  scripts/production/install-kidults-stability-operations.sh \
  scripts/production/verify-kidults-stability-operations.sh

bash scripts/production/install-kidults-stability-operations.sh
```

## Verification

```bash
cd /opt/intelligence-holdings/staging/kaios-enterprise

bash scripts/production/verify-kidults-stability-operations.sh
```

Expected result:

```text
PASS kidults-stability-snapshot.timer enabled and active
PASS kidults-stability-evaluate.timer enabled and active
PASS /usr/local/sbin/kidults-stability-snapshot.sh root:kaios 750
PASS /usr/local/sbin/kidults-stability-evaluate.sh root:kaios 750
PASS machine-readable stability gate
Kidults stability daily operations verification passed.
```

## Daily operating rule

During the 30-day baseline:

- No planned Kidults Production application, database, scheduler, publishing, or infrastructure change is permitted.
- Emergency changes require an incident record, pre-change snapshot, rollback plan, and a new baseline decision.
- Any failed daily snapshot, invalid snapshot file, missing day, or active incident blocks final certification.
- Artfund Production remains explicitly unauthorized.

## Evidence locations

| Evidence | Location |
|---|---|
| Daily snapshots | `/mnt/ih_prod_01/backups/stability-baseline/daily` |
| Current status | `/mnt/ih_prod_01/backups/stability-baseline/status/kidults-stability-status.json` |
| Active incidents | `/mnt/ih_prod_01/backups/stability-baseline/incidents` |
| False positives | `/mnt/ih_prod_01/backups/stability-baseline/incidents/false-positive` |
| Baseline metadata | `/mnt/ih_prod_01/backups/stability-baseline-metadata` |

## Completion gate

Final stability certification may proceed only when all conditions are true:

- `elapsed_days >= 30`
- `successful_days >= 30`
- `failed_days == 0`
- `consecutive_pass_days >= 30`
- `invalid_snapshot_files == []`
- no active incident file
- `final_certification_ready == true`
- `artfund_production_authorized == false`

## Rollback

The installer changes only systemd units, wrappers, and baseline directories. To disable the new schedule without deleting evidence:

```bash
sudo systemctl disable --now \
  kidults-stability-snapshot.timer \
  kidults-stability-evaluate.timer
```

Do not delete baseline evidence during the observation period.
