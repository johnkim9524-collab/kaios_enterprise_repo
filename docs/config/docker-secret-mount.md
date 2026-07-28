# Docker Secret Mount

Docker Compose mounts `secrets/kaios_api_secret` into the Gateway and Scheduler containers as `/run/secrets/kaios_api_secret`.

Both services receive `KAIOS_API_SECRET_FILE=/run/secrets/kaios_api_secret`. The host secret file is ignored by Git.