# Sprint 20-A5 — Kidults Live Intelligence Operations

## Objective

Move the Kidults editorial staging portal from manually maintained JSON files to a controlled
operating loop that accepts validated collector evidence, refreshes public intelligence
atomically, manages conversion records, verifies backups, and remains isolated from production.

## Safety boundary

- staging paths only
- loopback portal runtime remains on `127.0.0.1:4173`
- source evidence must be placed in `validated-signals.json`
- no network collector is introduced by this sprint
- no production promotion is authorized
- public JSON files are replaced atomically only after the complete source batch validates
- conversion exports and backups remain mode `0600` inside mode `0700` directories

## Data contract

The collector handoff file is:

`/opt/intelligence-holdings/staging/data/kidults-operations/validated-signals.json`

It requires a `batch_id` and at least three signal records. Every record requires:

- `name`
- `category`
- `score` from 0 to 100
- `momentum_30d` from -100 to 100
- `confidence` from 0 to 100
- `freshness_hours` from 0 to 720

## Exact staging installation

```bash
cd /opt/intelligence-holdings/staging/kaios-enterprise
git pull --ff-only
node --test apps/kidults-enterprise-staging/server.test.mjs apps/kidults-enterprise-staging/operations.test.mjs
chmod +x scripts/staging/install-kidults-live-operations.sh
ROOT_DIR="$PWD" bash scripts/staging/install-kidults-live-operations.sh
```

## Exact operational checks

```bash
cd /opt/intelligence-holdings/staging/kaios-enterprise

node apps/kidults-enterprise-staging/operations.mjs status \
  --data /opt/intelligence-holdings/staging/data/kidults-conversions \
  --operations /opt/intelligence-holdings/staging/data/kidults-operations

curl -sS http://127.0.0.1:4173/health

sudo systemctl status kaios-kidults-editorial-staging.service --no-pager
sudo systemctl status kaios-kidults-intelligence-refresh.service --no-pager
sudo systemctl status kaios-kidults-operations-backup.service --no-pager
sudo systemctl list-timers --all --no-pager | grep "kaios-kidults"
```

## Conversion export

Exports contain personal data and must not be committed or placed under `public/`.

```bash
cd /opt/intelligence-holdings/staging/kaios-enterprise

sudo -u kaios node apps/kidults-enterprise-staging/operations.mjs export-conversions \
  --data /opt/intelligence-holdings/staging/data/kidults-conversions \
  --output /opt/intelligence-holdings/staging/exports/kidults/conversions-review.csv

sudo stat -c "%a %U:%G %n" \
  /opt/intelligence-holdings/staging/exports/kidults/conversions-review.csv
```

Expected file mode: `600 kaios:kaios`.

## Backup verification

```bash
LATEST_BACKUP="$(sudo find /opt/intelligence-holdings/staging/backups/kidults \
  -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -nr | head -1 | cut -d' ' -f2-)"

cd /opt/intelligence-holdings/staging/kaios-enterprise
sudo -u kaios node apps/kidults-enterprise-staging/operations.mjs verify-backup \
  --path "$LATEST_BACKUP"
```

Expected result: `"ok": true`.

## Schedule

- intelligence refresh: daily at 02:20 UTC with a randomized delay
- protected backup: daily at 02:45 UTC with a randomized delay
- conversion retention: Sunday at 03:10 UTC with a randomized delay

## Rollback

The installation does not alter production. To stop the new staging automation:

```bash
sudo systemctl disable --now \
  kaios-kidults-intelligence-refresh.timer \
  kaios-kidults-conversion-retention.timer \
  kaios-kidults-operations-backup.timer
sudo systemctl restart kaios-kidults-editorial-staging.service
```
