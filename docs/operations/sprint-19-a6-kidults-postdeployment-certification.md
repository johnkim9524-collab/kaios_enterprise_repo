# Sprint 19-A6 — Kidults Post-deployment Certification and Stability Baseline

## Objective

Seal the actual Kidults Production deployment result, capture immutable runtime evidence, and formally start the 30-day stability baseline without changing Artfund Production.

## Preconditions

- Sprint 19-A5 controlled Production promotion completed successfully.
- Kidults Production readiness remains GO / 100.
- Gateway and scheduler are running.
- Production database integrity is `ok`.
- Artfund Production promotion remains unauthorized.

## Evidence captured

- Docker Compose service state
- Docker image identifiers
- Gateway and scheduler inspection data
- Gateway and scheduler logs
- Health response
- Portal response
- Unauthenticated collector response
- Authenticated collector response
- Production database SHA-256
- Production database integrity
- Certification manifest
- Certification archive and SHA-256
- 30-day stability baseline start record

## Execution

```bash
cd /opt/intelligence-holdings/staging/kaios-enterprise

git fetch origin main
git switch main
git reset --hard origin/main

chmod +x \
  scripts/production/certify-kidults-postdeployment.sh \
  scripts/production/capture-kidults-stability-snapshot.sh

ROOT_DIR="$PWD" \
PROD_ROOT="/opt/intelligence-holdings/kidults/app" \
PROD_DB="/opt/intelligence-holdings/kidults/data/kaios.db" \
BASE_URL="https://kaios.kidults.com" \
ARCHIVE_ROOT="/mnt/ih_prod_01/backups/production-certification" \
STABILITY_ROOT="/mnt/ih_prod_01/backups/stability-baseline" \
bash scripts/production/certify-kidults-postdeployment.sh
```

## Certification success criteria

- Health HTTP 200
- Portal HTTP 200
- Unauthenticated collector HTTP 401
- Authenticated collector HTTP 200
- Database integrity `ok`
- Gateway image ID captured
- Scheduler image ID captured
- Database SHA-256 captured
- Certification archive checksum created
- Artfund change executed is false

## Stability baseline

The certification script creates a machine-readable 30-day baseline start record. Daily snapshots must confirm:

- Gateway running
- Scheduler running
- Health HTTP 200
- Portal HTTP 200
- Database integrity `ok`

Manual daily capture command:

```bash
BASE_URL="https://kaios.kidults.com" \
PROD_DB="/opt/intelligence-holdings/kidults/data/kaios.db" \
OUTPUT_ROOT="/mnt/ih_prod_01/backups/stability-baseline/daily" \
bash scripts/production/capture-kidults-stability-snapshot.sh
```

## Change boundary

This sprint does not deploy new application code, modify the Production database schema, enable Artfund Production, or enable new publishing behavior. It records and certifies the already completed Kidults Production promotion.
