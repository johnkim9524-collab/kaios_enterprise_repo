# DigitalOcean Read-Only Integration Review v1

**Date:** 2026-08-22  
**Owner:** Track D / KPMO  
**State:** EXTERNAL API DISABLED / SECRETLESS PUBLIC OBSERVATION ONLY  
**Production:** HOLD

## Current approval boundary — #1837

Protected-main scheduled run [33567184505](https://github.com/johnkim9524-collab/kaios_enterprise_repo/actions/runs/33567184505) resolved the DigitalOcean read token and queried provider metadata without an exact-current-main Program Owner authorization receipt. Its artifact `9823564125` is classified as a non-promotable, authorization-invalid read-only observation; it does not establish runtime binding or provider authority.

The active workflow state is `DISABLED_PENDING_EXACT_MAIN_APPROVAL`. Autonomous schedule, Environment entry, credential resolution and DigitalOcean API calls are removed. The remaining manual surface is inert. A future provider read requires a new workflow version, exact-current-main Program Owner approval, one-shot execution binding and terminal consumption receipt. Public/Production/G5 remain `HOLD`.

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

## Historical Phase 2 observation contract (provider API currently disabled)

The historical contract allowed the following read-only observations. The DigitalOcean API item is currently disabled; only secretless public observation remains permitted:

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

Historical provider variable name (inactive):

- `DIGITALOCEAN_DROPLET_ID`

Historical provider secret name (inactive):

- `DIGITALOCEAN_READ_TOKEN`

Neither value is resolved by the active workflow. No standing repository record or prior observation substitutes for exact-current-main Program Owner approval. Secret values must never be committed, logged, copied into Registry records, or returned to the Portal.

The workflow exposes only an inert `workflow_dispatch` request surface and hard-disables the sole job before Environment, credential or provider execution.

## Evidence states

- `PUBLIC_RUNTIME_AND_DROPLET_METADATA_OBSERVED_INDEPENDENTLY` — public endpoint observations and a DigitalOcean metadata GET both succeed, but `runtime_droplet_binding_verified=false` and `binding_method=NONE` remain explicit.
- `PUBLIC_ENDPOINT_OBSERVED` — public endpoint observations succeed; DigitalOcean API metadata is not observed.
- `DROPLET_METADATA_OBSERVED_ONLY` — DigitalOcean metadata is observed while the public endpoint observation is incomplete.
- `NOT_VERIFIED` — neither observation set is sufficient.

No state in this audit authorizes Production release or asserts runtime-to-Droplet binding.

## Next Track D work

1. Keep the canonical public endpoint observation read-only and fail-closed.
2. Keep DigitalOcean provider credential resolution and API access disabled.
3. If a future read is needed, create a new workflow version and obtain exact-current-main Program Owner approval with one-shot binding before any Environment or secret resolution.
4. Archive public observation and Droplet metadata as independent evidence.
5. If runtime-to-Droplet binding must be asserted, define and execute a separate authoritative binding proof rather than inferring it from two independent observations.
6. Materialize backup, restore and rollback evidence separately.
7. Keep Release `HOLD` until the complete G5 chain passes.
