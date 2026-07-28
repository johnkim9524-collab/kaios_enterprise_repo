# Observability and Metrics

KAIOS records request count, error count, response status, route usage,
latency, uptime, request ID, and correlation ID.

Operational endpoints:

- `/api/metrics`
- `/api/observability/status`
- `/api/alerts`

JSON request logs are written to `KAIOS_OBSERVABILITY_LOG_PATH`.
Authorization headers and tokens are never recorded.