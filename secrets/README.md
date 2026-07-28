# Local Docker Secrets

Create `secrets/kaios_api_secret` before starting Docker Compose. The secret file is ignored by Git and must never be committed.

Docker mounts it as `/run/secrets/kaios_api_secret`.