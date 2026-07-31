# Sprint 20-A7 — Kidults Intelligence Quality & Alerting

## Outcome

Sprint 20-A7 adds a fail-closed quality layer between the live collector evidence loop and public staging intelligence. It evaluates freshness, coverage, confidence and published-output integrity; records only alert transitions; retains the last operational public state; and exposes a non-sensitive, mobile-responsive status page.

Production promotion remains explicitly unauthorized.

## Delivered

- `quality-alerts.mjs` with deterministic `operational`, `degraded` and `critical` states
- versioned staging policy `KQ-1.0`
- SHA-256 verification for all three public intelligence outputs
- freshness, record, category, source and confidence gates
- transition-only non-PII JSONL alert history
- last-good status preservation and restoration
- hourly staging-only systemd evaluation
- quality evaluation chained to the daily collector evidence loop
- public `operations.html` status surface with 320px+ responsive design
- CI coverage and six dedicated quality-alert tests
- accessibility, reduced-motion and forced-colors compatibility inherited from the portal design system

## Quality policy

| Gate | Threshold | Failure state |
| --- | ---: | --- |
| Latest completed run | ≤ 30 hours | Critical |
| Validated records | ≥ 20 | Critical |
| Categories | ≥ 4 | Degraded |
| Approved sources | ≥ 1 | Degraded |
| Average confidence | ≥ 70 | Degraded |
| Maximum signal freshness | ≤ 168 hours | Degraded |
| Verified public outputs | 3, SHA-256 exact | Critical |

## Exact staging installation

Run these commands on the staging host:

```bash
cd /opt/intelligence-holdings/staging/kaios-enterprise
git switch main
git pull --ff-only origin main

npm --prefix apps/kidults-enterprise-staging test
bash -n scripts/staging/run-kidults-intelligence-quality-alerting.sh
bash -n scripts/staging/install-kidults-intelligence-quality-alerting.sh

sudo bash scripts/staging/install-kidults-intelligence-quality-alerting.sh
```

## Exact verification

```bash
cd /opt/intelligence-holdings/staging/kaios-enterprise

sudo systemctl show kaios-kidults-intelligence-quality.service \
  --property=Result \
  --property=ExecMainStatus \
  --property=InactiveEnterTimestamp \
  --no-pager

sudo systemctl list-timers --all --no-pager \
  kaios-kidults-intelligence-quality.timer

sudo journalctl \
  -u kaios-kidults-intelligence-quality.service \
  -n 100 \
  --no-pager \
  -o cat

python3 -m json.tool \
  apps/kidults-enterprise-staging/public/data/quality-status.json
```

Expected service result:

```text
Result=success
ExecMainStatus=0
```

The status can be `operational`, `degraded`, or `critical`; a non-operational state is an evidence result, not a process failure.

## Local visual validation

Server:

```bash
cd /opt/intelligence-holdings/staging/kaios-enterprise/apps/kidults-enterprise-staging/public
python3 -m http.server 4173 --bind 127.0.0.1
```

Tunnel from Windows PowerShell:

```powershell
ssh -N -L 4173:127.0.0.1:4173 kaios@146.190.111.173
```

Open:

```text
http://127.0.0.1:4173/operations.html
```

Validate 320 × 700, 375 × 812, 768 × 1024 and desktop widths. Confirm no horizontal page overflow, keyboard-visible focus, readable status without color, and alert announcements through the live region.

## Last-good restoration

Use only when the public status file is damaged or unintentionally replaced:

```bash
cd /opt/intelligence-holdings/staging/kaios-enterprise/apps/kidults-enterprise-staging

node quality-alerts.mjs restore-last-good \
  --public "$PWD/public" \
  --operations /opt/intelligence-holdings/staging/data/kidults-operations
```

This restores only the redacted staging status document. It does not modify intelligence outputs or production.

## Rollback

```bash
sudo systemctl disable --now kaios-kidults-intelligence-quality.timer
sudo rm /etc/systemd/system/kaios-kidults-intelligence-quality.timer
sudo rm /etc/systemd/system/kaios-kidults-intelligence-quality.service
sudo systemctl daemon-reload
```

The operational evidence in `/opt/intelligence-holdings/staging/data/kidults-operations` remains recoverable after rollback.

## Validation report

- Node test suite: 25 passed, 0 failed
- quality-alert-specific tests: 6 passed
- shell syntax: required for both A7 scripts
- JSON validation: required for policy and public status
- HTML structure: status page includes one `h1`, skip link, labeled navigation and live regions
- mobile contract: minimum supported viewport is 320px
- security: no public paths, source identifiers, URLs, credentials or PII
- production isolation: `production_promotion_authorized` remains `false`

## Sprint decision

Sprint 20-A7 is complete when CI passes, the staging service reports `Result=success`, `operations.html` renders at 320px without horizontal page overflow, and the pull request is reviewed and merged. Production deployment is out of scope.
