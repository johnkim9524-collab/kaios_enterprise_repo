# Production Configuration and Secrets

KAIOS uses a typed, fail-fast configuration contract for local, test, staging, and production environments.

## Secret Loading

`KAIOS_API_SECRET` supports either a direct environment value or `KAIOS_API_SECRET_FILE`. The two sources are mutually exclusive. Staging and production fail fast when the secret is missing.

## Public Status

`GET /api/config/status` reports configuration health and secret source metadata without returning secret values.

## Docker Secret Example

```text
KAIOS_ENVIRONMENT=production
KAIOS_API_SECRET_FILE=/run/secrets/kaios_api_secret
```

Never commit the secret file to Git.