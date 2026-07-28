# KAIOS Autonomous Scheduler and Run Lock

## Environment

```text
KAIOS_SCHEDULER_ENABLED=false
KAIOS_SCHEDULER_INTERVAL_SECONDS=3600
KAIOS_SCHEDULER_LOCK_TTL_SECONDS=3600
KAIOS_SCHEDULER_HEARTBEAT_SECONDS=30
KAIOS_SCHEDULER_RUNTIME_MODE=fixture
KAIOS_SCHEDULER_ID=kaios-primary
```

## Commands

```text
python scripts/run_scheduler.py --once
python scripts/run_scheduler.py
```

## API

```text
GET /api/scheduler/status
```

Scheduled executions use `trigger_type = scheduled`. SQLite runtime locks prevent overlapping runs and stale locks are recoverable after expiry.