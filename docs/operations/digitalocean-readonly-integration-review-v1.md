# DigitalOcean Read-Only Integration Review v1

**Date:** 2026-08-16  
**Owner:** Track D / KPMO  
**State:** FOUNDATION IMPLEMENTATION / NOT VERIFIED  
**Production:** HOLD

## Executive finding

The repository contains historical Production-audit paths and a bounded-live DigitalOcean adapter contract, but it does not contain verified evidence of a current live DigitalOcean API binding, a read-only token, a confirmed Droplet identifier, a successful current health audit, a backup/restore drill, or a rollback target.

The existing autonomous DigitalOcean adapter is a generic synthetic readiness adapter. It is not accepted as proof of a real infrastructure connection.

## Current references

- Public runtime reference: `https://kaios.kidults.com`
- Historical application root: `/opt/intelligence-holdings/kidults/app`
- Historical data path: `/opt/intelligence-holdings/kidults/data/kaios.db`
- Historical backup root: `/mnt/ih_prod_01/backups/kidults`
- Runtime Registry: `runtime-foundation-v1`
- Observation contract: `runtime-digitalocean-readonly-audit-v1`

These are references, not current health claims.

## Approved Phase 2 connection

Only a read-only audit is permitted:

```text
DNS Resolve
TLS Inspect
HTTP GET /
HTTP GET /api/health
DigitalOcean API GET /v2/droplets/{id} (optional)
```

The following remain prohibited:

```text
Deploy
Restart
Resize
Firewall mutation
DNS mutation
Snapshot restore
SSH
Database write
Provider Production connection
```

## Configuration

Repository variable names:

- `KIDULTS_MONITORED_BASE_URL`
- `DIGITALOCEAN_DROPLET_ID`

Repository secret name:

- `DIGITALOCEAN_READ_TOKEN`

The token must be read-only and scoped to the minimum account resources available. Secret values must never be committed, logged, copied into Registry records, or returned to the Portal.

## Evidence states

- `READ_ONLY_CONNECTION_VERIFIED` — public checks and DigitalOcean metadata GET both succeed.
- `PUBLIC_ENDPOINT_OBSERVED` — public endpoint checks succeed; DigitalOcean API metadata is not configured.
- `NOT_VERIFIED` — one or more public checks fail or no current evidence exists.

No state in this audit authorizes Production release.

## Next Track D work

1. Run the workflow without credentials to establish public endpoint evidence.
2. Register the exact Droplet ID as a repository variable.
3. Add a minimum-scope read-only token through GitHub Secrets.
4. Re-run and archive the evidence artifact.
5. Materialize backup, restore and rollback evidence separately.
6. Keep Release `HOLD` until the complete G5 chain passes.
