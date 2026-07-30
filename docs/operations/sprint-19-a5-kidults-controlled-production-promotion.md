# Sprint 19-A5 — Kidults Controlled Production Promotion

## Objective

Promote the authorized Kidults runtime through a controlled, reversible production procedure while preserving Artfund isolation.

## Current authorization

The promotion may proceed only when the sealed evidence manifest states:

- decision: go
- score: 100
- production_promotion_authorized: true
- artfund_production_promotion_authorized: false
- production_change_executed: false

## Safety rules

1. The default mode is dry-run.
2. Production execution requires `KAIOS_EXECUTE_PRODUCTION_PROMOTION=true`.
3. Artfund files, services, databases, routes, and publication flags must not be changed.
4. A predeployment database, configuration, container, and rollback snapshot is mandatory.
5. Destructive database migration is prohibited.
6. Failed health, authentication, portal, or database checks block certification and require rollback.

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

ROOT_DIR="$PWD" \
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
ROOT_DIR="$PWD" \
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

The orchestrator does not overwrite the sealed snapshot. A smoke failure exits with code 2 and requires restoration from the captured snapshot under a separate rollback command sequence. No Artfund resource may be included in rollback actions.

## Certification outcome

Sprint 19-A5 is complete only after:

- the predeployment snapshot is sealed,
- dry-run authorization passes,
- controlled deployment is explicitly executed,
- all post-deployment checks pass,
- post-deployment evidence is sealed,
- production change is recorded as executed for Kidults only.
