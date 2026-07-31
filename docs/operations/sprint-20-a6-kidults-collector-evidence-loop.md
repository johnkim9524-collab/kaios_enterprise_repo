# Sprint 20-A6 — Kidults Collector Evidence Loop

## Outcome

Sprint 20-A6 connects the existing live RSS collector to the staging Kidults
intelligence data pipeline. Only allowlisted, recent, attributable evidence can
refresh Kidult 100, Monthly Intelligence and Archive data.

Production promotion is not authorized by this sprint.

## Safety contract

- Runs only below `/opt/intelligence-holdings/staging/`.
- Accepts only `mode: live` collector output from an enabled staging source.
- Enforces source collection, storage and transformation rights.
- Rejects stale, future-dated, malformed, unknown-source and synthetic coverage
  records.
- Deduplicates evidence by source, external identifier and brand.
- Preserves the previous validated dataset when a new batch fails.
- Stores only hashed evidence URLs in the validated dataset and records non-PII
  audit events.
- Requires at least three independently populated categories before publication.
- Uses an explicit `OR` query so each tracked brand can independently produce
  evidence; the previous all-term query could return an empty feed.

## Exact validation commands

```bash
cd /opt/intelligence-holdings/staging/kaios-enterprise
git switch main
git pull --ff-only origin main

cd apps/kidults-enterprise-staging
npm test

cd /opt/intelligence-holdings/staging/kaios-enterprise
python3 -m unittest discover -s tests -p 'test_source_collector.py'
bash -n scripts/staging/run-kidults-collector-evidence-loop.sh
bash -n scripts/staging/install-kidults-collector-evidence-loop.sh
git diff --check
```

## Exact staging installation

```bash
cd /opt/intelligence-holdings/staging/kaios-enterprise
sudo bash scripts/staging/install-kidults-collector-evidence-loop.sh
```

The installer performs an immediate live staging collection and enables the
daily timer. It fails closed if the source is unavailable or evidence coverage
is insufficient.

## Evidence and status

```bash
cd /opt/intelligence-holdings/staging/kaios-enterprise/apps/kidults-enterprise-staging
node operations.mjs status \
  --public "$PWD/public" \
  --operations /opt/intelligence-holdings/staging/data/kidults-operations \
  --data /opt/intelligence-holdings/staging/data/kidults-conversions

sudo journalctl -u kaios-kidults-collector-evidence.service -n 100 --no-pager
sudo systemctl list-timers --all --no-pager kaios-kidults-collector-evidence.timer
```

Validated evidence:

```text
/opt/intelligence-holdings/staging/data/kidults-operations/validated-signals.json
/opt/intelligence-holdings/staging/data/kidults-operations/collector-evidence-audit.jsonl
/opt/intelligence-holdings/staging/data/kidults-operations/latest-run.json
```

## Rollback

```bash
sudo systemctl disable --now kaios-kidults-collector-evidence.timer
sudo systemctl stop kaios-kidults-collector-evidence.service
sudo rm /etc/systemd/system/kaios-kidults-collector-evidence.timer
sudo rm /etc/systemd/system/kaios-kidults-collector-evidence.service
sudo systemctl daemon-reload
```

Rollback leaves the last valid staging data and audit trail intact.
