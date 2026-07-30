# Sprint 19-A4 — Kidults Production Promotion Evidence Sealing

## Objective

Seal the verified Kidults Production readiness evidence after a 100/100 GO decision, preserve Artfund's production block, and create an immutable authorization package before any production deployment is executed.

## Current certified state

- Kidults decision: `go`
- Kidults readiness score: `100`
- Mandatory gates passed: `true`
- Hard blockers: none
- Kidults production promotion authorized: `true`
- Artfund production promotion authorized: `false`
- Production deployment executed by this sprint: `false`

## Safety boundary

This sprint does not modify the Kidults production runtime, containers, database, Caddy configuration, scheduler, or publication flags. It only validates and archives evidence already produced by the approved production audit.

## Required evidence

1. `production-audit.json`
2. `production-rollback-rehearsal.json`
3. `production-mobile-320.json`
4. `production-governance-trust.json`
5. `production-observability.json`
6. `production-incident-response.json`
7. `staging-production-delta.json`
8. `kidults-production-readiness.json`

## Server execution

```bash
cd /opt/intelligence-holdings/staging/kaios-enterprise

git fetch origin main
git switch main
git reset --hard origin/main

chmod +x scripts/production/seal-kidults-production-evidence.sh

ROOT_DIR="$PWD" \
EVIDENCE_DIR="$PWD/artifacts/production-audit" \
ARCHIVE_ROOT="/mnt/ih_prod_01/backups/production-certification" \
bash scripts/production/seal-kidults-production-evidence.sh
```

## Expected output

- `kidults-production-evidence-<UTC timestamp>.tar.gz`
- matching `.sha256`
- matching `.manifest.json`
- manifest status: `sealed`
- decision: `go`
- score: `100`
- Kidults authorization: `true`
- Artfund authorization: `false`
- production change executed: `false`

## Verification

```bash
LATEST_ARCHIVE="$(find /mnt/ih_prod_01/backups/production-certification -type f -name 'kidults-production-evidence-*.tar.gz' -printf '%T@ %p\n' | sort -nr | head -n 1 | cut -d' ' -f2-)"

sha256sum -c "${LATEST_ARCHIVE}.sha256"
python3 -m json.tool "${LATEST_ARCHIVE}.manifest.json"
tar -tzf "${LATEST_ARCHIVE}"
```

## Promotion boundary

A sealed package authorizes the next deployment decision gate. It does not itself deploy or promote production. The deployment sprint must separately create a pre-deployment snapshot, execute a controlled runtime replacement, run authenticated and unauthenticated smoke tests, verify mobile behavior, verify rollback readiness, and record a post-deployment certification.
