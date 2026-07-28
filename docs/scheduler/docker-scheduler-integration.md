# Docker Scheduler Integration

## Services

The Compose stack defines:

```text
kaios
kaios-scheduler
```

Both services use the same KAIOS image and the same SQLite volume.

## Shared Runtime Database

```text
kaios-runtime-data:/app/data
```

This enables the Gateway and Scheduler to coordinate:

```text
scheduler state
runtime lock
scheduled run history
```

## Scheduler Profile

The Scheduler is opt-in through the Compose profile:

```text
scheduler
```

Start both services:

```text
docker compose --profile scheduler up -d
```

Start only the Gateway:

```text
docker compose up -d
```

## Scheduler Command

```text
python -m scripts.run_scheduler
```

## Scheduler Environment

```text
KAIOS_SCHEDULER_ENABLED
KAIOS_SCHEDULER_INTERVAL_SECONDS
KAIOS_SCHEDULER_LOCK_TTL_SECONDS
KAIOS_SCHEDULER_HEARTBEAT_SECONDS
KAIOS_SCHEDULER_RUNTIME_MODE
KAIOS_SCHEDULER_ID
```

## Validation

The Gateway must become healthy before the Scheduler starts.

The Scheduler must:

```text
persist scheduled runs
share the runtime lock
avoid overlapping execution
release the lock after completion
```