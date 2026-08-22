# DigitalOcean Read-Only Integration Review v1

**Date:** 2026-08-22  
**Owner:** Track D / KPMO  
**State:** FOUNDATION IMPLEMENTATION / NOT VERIFIED  
**Production:** HOLD

## Executive finding

The repository contains historical Production-audit paths and a bounded-live DigitalOcean adapter contract, but it does not contain verified evidence that the public KIDULTS runtime is bound to any specific DigitalOcean Droplet. Public runtime observation and DigitalOcean API metadata are independent evidence unless a separate binding proof is produced.

The existing autonomous DigitalOcean adapter is a generic synthetic readiness adapter. It is not accepted as proof of a real infrastructure connection.

## Current references

- Canonical public runtime reference: `https://kaios.kidults.com`
- Historical application root: `/opt/intelligence-holdings/kidults/app`
- Historical data path: `/opt/intelligence-holdings/kidults/data/kaios.db`
- Historical backup root: `/mnt/ih_prod_01/backups/kidults`
- Runtime Registry: `runtime-foundation-v1`
- Observation contract: `runtime-digitalocean-readonly-audit-v1`

These are references, not current health or infrastructure-binding claims.

## Current read-only observation

Historical evidence run `31904765488` / artifact `9252030451` observed:

| Check | Result |
|---|---|
| DNS | OBSERVED |
| TLS | OBSERVED; certificate expires 2026-10-03 |
| `/` | HTTP 403 |
| `/api/health` | HTTP 403 |
| DigitalOcean API metadata | NOT CONFIGURED |
| Runtime-to-Droplet binding | NOT VERIFIED |
| Mutation | NONE |

Official interpretation:

```text
PUBLIC_ENDPOINT_OBSERVED

DNS and TLS are reachable.
Application health is NOT VERIFIED because the edge returns HTTP 403.
DigitalOcean resource identity is NOT VERIFIED because the read-only API
token and Droplet ID are not configured.
Runtime-to-Droplet binding is NOT VERIFIED.
```

## Approved Phase 2 observation

Only a read-only observation is permitted:

```text
DNS Resolve
TLS Inspect
HTTP GET /
HTTP GET /api/health
DigitalOcean API GET /v2/droplets/{id} (optional)
```

A successful public observation plus a successful DigitalOcean metadata GET does **not** prove that the public runtime is hosted by, routed to, or otherwise bound to that Droplet. A separate binding method and evidence are required for such a claim.

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

The public runtime target is fail-closed to:

- `https://kaios.kidults.com`

Repository variable name:

- `DIGITALOCEAN_DROPLET_ID`

Repository secret name:

- `DIGITALOCEAN_READ_TOKEN`

The token must be read-only and scoped to the minimum account resources available. Secret values must never be committed, logged, copied into Registry records, or returned to the Portal.

The workflow must run only from `refs/heads/main` before the secret-bearing audit step. GitHub Environment/ref restriction remains a separate external control-plane item and is not claimed by this document.

## Evidence states

- `PUBLIC_RUNTIME_AND_DROPLET_METADATA_OBSERVED_INDEPENDENTLY` — public endpoint observations and a DigitalOcean metadata GET both succeed, but `runtime_droplet_binding_verified=false` and `binding_method=NONE` remain explicit.
- `PUBLIC_ENDPOINT_OBSERVED` — public endpoint observations succeed; DigitalOcean API metadata is not observed.
- `DROPLET_METADATA_OBSERVED_ONLY` — DigitalOcean metadata is observed while the public endpoint observation is incomplete.
- `NOT_VERIFIED` — neither observation set is sufficient.

No state in this audit authorizes Production release or asserts runtime-to-Droplet binding.

## Next Track D work

1. Keep the canonical public endpoint observation read-only and fail-closed.
2. Register the exact Droplet ID only through the approved repository variable path.
3. Add a minimum-scope read-only token only through the approved GitHub secret path.
4. Archive public observation and Droplet metadata as independent evidence.
5. If runtime-to-Droplet binding must be asserted, define and execute a separate authoritative binding proof rather than inferring it from two independent observations.
6. Materialize backup, restore and rollback evidence separately.
7. Keep Release `HOLD` until the complete G5 chain passes.
