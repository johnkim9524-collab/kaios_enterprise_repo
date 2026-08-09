# KIDULTS Scale / Capacity / Cost Proof Baseline

Status: evidence-map and architecture baseline. Simulation/equivalent scale certification is not represented as sustained live-production throughput.

## Existing certification layers

- A10–A12: staged scale certification from smoke/100K/1M through 5M/10M-equivalent profiles.
- A13: provider concurrency and bounded acquisition pressure scenarios.
- A18: autonomous data-scale profiles including 100K, 1M and additional scale profile support.
- A26/A27: timeout, rate-limit, provider failure, recovery, incident and SLO governance scenarios.
- A35: capacity governance, saturation, throttling, workload shifting and protected reserve policy.
- A36: cost/budget governance and hard budget-stop behavior.

These layers establish deterministic control behavior. Live throughput, latency, resource consumption and cost must still be measured in controlled production-like runs.

## Capacity architecture

**D1 / control plane**: policies, canonical control records, orchestration state, decisions, audit indexes and compact operational metadata. Optimize schema/indexes for bounded transactional control queries rather than bulk historical storage.

**R2 / data plane**: retained raw/provider payloads, bulk normalized observations, historical evidence, archives and replay sources. Partition by stable domain/date/provider/entity strategy suitable for lifecycle and replay.

**Queues**: absorb burst, enforce bounded concurrency, isolate provider limits and support retry/DLQ. Backpressure must protect P0/control workloads before background or optional enrichment.

**Cache**: use only for reproducible derived/read-heavy outputs with explicit freshness and invalidation semantics. Cache must never hide source staleness or provenance failure.

## Required proof scenarios

100K → 1M → 5M → 10M-equivalent where meaningful, plus burst, replay, partial-provider failure, HTTP 429, HTTP 500, timeout, malformed payload, corrupt data, queue saturation, cache miss/stampede and recovery-replay.

## Cost envelope

Measure ingestion, validation, normalization, resolution, storage, queries, retries/replay and publication separately. Enforce hard budget stops for optional/background work before compromising reliability, security or recovery reserves.

## KPIs

Throughput, p50/p95/p99 latency, queue age, retry rate, DLQ rate, cache hit rate, D1 query latency, Worker CPU time, memory where observable, cold-start rate, R2 bytes read/written, cost per validated object, cost per intelligence output and intelligence value per unit cost.

## Exit criteria for live proof

A scale tier is live-certified only when workload shape, measured resource usage, error/retry behavior, cost envelope, backpressure and recovery evidence are captured under the target environment. Equivalent/synthetic runs remain labeled as such.
