# DigitalOcean Read-Only Integration Review v1

**Date:** 2026-08-22  
**Owner:** Track D / KPMO  
**State:** EXTERNAL API DISABLED / SECRETLESS TERMINAL-RED TOMBSTONE  
**Production:** HOLD

## Current approval boundary — #1837

Protected-main scheduled run `33567184505` resolved the DigitalOcean read token and queried provider metadata without an exact-current-main Program Owner authorization receipt. Its artifact `9823564125`, digest `sha256:4a467b17f1ad64c943b59e886e123faf34cac053863af2990b9e825e4fb88f6a`, is a **NON-PROMOTABLE / AUTHORIZATION-INVALID / READ-ONLY OBSERVATION**. It does not establish provider authority or runtime-to-Droplet binding.

The correction candidate classifies the active provider state as `DISABLED_PENDING_EXACT_MAIN_APPROVAL`:

- autonomous `schedule` is removed;
- no GitHub Environment is entered;
- `DIGITALOCEAN_READ_TOKEN` and `DIGITALOCEAN_DROPLET_ID` are not resolved;
- no DigitalOcean provider script or API call is reachable;
- only an inert `workflow_dispatch` request surface remains;
- that request runs a secretless tombstone and terminates RED with `DISABLED_PENDING_EXACT_MAIN_APPROVAL` before any provider edge.

A future provider read requires a **new workflow version**, a fresh exact-current-main Program Owner approval, one-shot run/attempt binding, and a terminal consumption receipt. Historical repository text, a prior run, Owner identity, or a workflow input is not standing authority. Public/Production/G5 remain `HOLD`.

## Executive finding

The repository contains historical Production-audit references and a bounded-live DigitalOcean adapter contract, but it does not contain verified evidence that the public KIDULTS runtime is bound to any specific DigitalOcean Droplet. Public runtime observation and DigitalOcean API metadata are independent evidence unless a separate binding proof is produced.

The generic autonomous DigitalOcean adapter is not accepted as proof of a real infrastructure connection.

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
DigitalOcean resource identity is NOT VERIFIED for current authority.
runtime_droplet_binding_verified=false
binding_method=NONE
```

## Historical Phase 2 observation contract

The historical contract allowed secretless public observations and an optional provider metadata GET. The provider API item is now disabled; only separate secretless public observation may remain within its own control surface.

A historical successful public observation plus a DigitalOcean metadata GET does **not** prove that the public runtime is hosted by, routed to, or otherwise bound to that Droplet.

The following remain prohibited without their separate explicit gates:

```text
DigitalOcean credential resolution
DigitalOcean API request
Autonomous provider schedule
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

## Configuration truth

Historical provider variable name, inactive:

- `DIGITALOCEAN_DROPLET_ID`

Historical provider secret name, inactive:

- `DIGITALOCEAN_READ_TOKEN`

Neither value is resolved by the current correction workflow. Secret values must never be committed, logged, copied into Registry records, or returned to the Portal.

The workflow exposes only an inert `workflow_dispatch` request surface. Its sole job contains no Environment, provider secret, provider variable, checkout, provider script, provider URL, or artifact publication edge; it emits the disabled state and exits non-zero so the request cannot look GREEN.

## Evidence states

- `PUBLIC_RUNTIME_AND_DROPLET_METADATA_OBSERVED_INDEPENDENTLY` — historical observation only; `runtime_droplet_binding_verified=false` and `binding_method=NONE` remain explicit.
- `PUBLIC_ENDPOINT_OBSERVED` — secretless public endpoint observation only.
- `DROPLET_METADATA_OBSERVED_ONLY` — historical provider observation, not current authority.
- `NOT_VERIFIED` — neither observation set establishes binding.

No state in this audit authorizes Production release or asserts runtime-to-Droplet binding.

## Next Track D work

1. Keep provider credential resolution and DigitalOcean API access disabled.
2. Keep any public endpoint observation separate, secretless and non-authorizing.
3. If a future provider read is necessary, create a new workflow version and obtain exact-current-main Program Owner approval with one-shot binding before any Environment or secret resolution.
4. Preserve historical provider observations as audit evidence only.
5. If runtime-to-Droplet binding must be asserted, define and execute a separate authoritative binding proof rather than inferring it from independent observations.
6. Materialize backup, restore and rollback evidence separately under their own gates.
7. Keep Public/Production/G5 `HOLD`.
