# Docker Authentication Secrets

Docker Compose mounts three role-token files into the Gateway:

- `/run/secrets/kaios_viewer_token`
- `/run/secrets/kaios_operator_token`
- `/run/secrets/kaios_admin_token`

The Gateway reads them through:

- `KAIOS_VIEWER_TOKEN_FILE`
- `KAIOS_OPERATOR_TOKEN_FILE`
- `KAIOS_ADMIN_TOKEN_FILE`

Create local validation files under `secrets/`. The directory ignore
contract prevents the token files from being committed.

The Scheduler does not receive user-facing authentication tokens because
it does not expose the protected HTTP API.