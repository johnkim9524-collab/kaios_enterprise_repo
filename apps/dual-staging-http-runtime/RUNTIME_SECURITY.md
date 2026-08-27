# Dual Staging Runtime Security Boundary

Status: staging-only. Production/Public/G5 remain HOLD.

## Runtime data contract

Set `KAIOS_STAGING_RUNTIME_DATA_DIR` to an absolute directory that is readable by the runtime service. The service writes only one-time nonce markers below `nonces/`.

For each vertical (`kidults` or `artfund`) provide:

```text
<RUNTIME_DATA_DIR>/
  kidults/
    projection.json
    entitlements.json
  artfund/
    projection.json
    entitlements.json
  nonces/
```

`projection.json` is server-owned. The API never accepts a projection from the client.

```json
{
  "projection": {
    "replace": "with the approved server-side read model"
  },
  "projection_digest": "sha256-of-JSON.stringify(projection)",
  "as_of": "2026-08-27T00:00:00.000Z"
}
```

`entitlements.json` contains bounded export grants. Keep this file outside the repository and protect it as runtime configuration.

```json
{
  "entitlements": [
    {
      "id": "replace-with-random-entitlement-id",
      "subject": "operator",
      "vertical": "kidults",
      "scopes": ["EXPORT"],
      "status": "active",
      "projection_digest": "same-sha256-as-projection",
      "expires_at": "2026-08-28T00:00:00.000Z"
    }
  ]
}
```

Revocation is fail-closed. Set `status` to a value other than `active` or add `revoked_at`. Expired, malformed, mismatched or missing grants are denied without returning the projection.

## Export request contract

Exports are `POST` only and require an operator bearer token plus:

- `x-kaios-entitlement-id`
- `x-kaios-nonce` (24-128 characters; one-time use)
- `x-kaios-projection-digest` (64-character lowercase SHA-256)

The route authorizes the grant, loads the projection from the server-owned store, binds both the request and entitlement to the exact digest, and then atomically creates a persistent nonce marker with `O_EXCL`. A replay returns `409 NONCE_REPLAY`, including after process restart.

## Fail-closed behavior

- Missing runtime adapter: `503`
- Missing control headers: `400`
- Missing, revoked, expired or scope-denied entitlement: `403`
- Projection or entitlement digest mismatch: `409`
- Nonce replay: `409`
- No failure response includes projection data

## Required environment additions

```dotenv
KAIOS_STAGING_RUNTIME_DATA_DIR=/opt/intelligence-holdings/staging/runtime-data
KAIOS_STAGING_VIEWER_SUBJECT=viewer
KAIOS_STAGING_OPERATOR_SUBJECT=operator
```

The runtime data directory should be owned by the service account, mode `0750`; `nonces/` should be mode `0700`. Projection and entitlement files should be mode `0640` or stricter.

## Verification

```bash
node --test apps/dual-staging-http-runtime/src/server.test.mjs
```

The exact-head CI workflow runs the same adversarial suite and enforces source invariants. A green workflow is necessary but not sufficient for protected-main or production authorization; independent exact-head review and the existing G5 gate remain mandatory.
