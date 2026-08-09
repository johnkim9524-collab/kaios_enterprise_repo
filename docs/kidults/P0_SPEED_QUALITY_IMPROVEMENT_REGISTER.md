# KIDULTS P0 Speed × Quality Improvement Register

## North Star
Target: 115+ / 120 overall, with Governance, Provenance, Autonomous Operations, and Proprietary Intelligence targeting 120.

Operating principle: Speed first. Quality never compromised.

## P0 — complete before commercial live

1. Runtime/toolchain alignment
   - Standardize Node 22+ across CI and local runtime.
   - Eliminate Node/Wrangler engine mismatch.
   - Gate: runtime smoke + CI PASS.

2. Real Data Truth Layer
   - Establish 100–500 object Golden Dataset.
   - Require authoritative provenance, deterministic entity resolution, deduplication, stale-data rejection, and traceable comparables.
   - Targets: critical provenance 100%; critical hallucination 0; entity resolution >=99%; duplicate contamination <1%; deterministic rerun 100%.

3. Unattended Operations Proof
   - Controlled live validation of provider failure, stale data, retry/backoff, recovery, alerting, and failover.
   - Targets: silent critical failure 0; bounded self-recovery >95%; routine manual intervention <1%.

4. Observability / SRE
   - Validate structured logs, metrics, alerts, SLOs, incident routing, recovery evidence, and executive exception visibility.
   - No production-critical path may be unobservable.

5. CI reproducibility and quality gates
   - Introduce deterministic dependency locking before live release.
   - Add explicit lint, unit/integration test, and coverage gates.
   - Separate product runtime quality from historical certification gates.

## P1 — high-value hardening

6. Certification complexity reduction
   - Preserve A15–A40 evidence lineage, but reduce runtime dependence on stage-specific orchestration.
   - Refactor common scenario/invariant/evidence machinery into shared libraries.

7. Large-file decomposition
   - P1 finding: scripts/a40-ga-certification.mjs exceeds 1,500 lines.
   - Review all >700-line files and decompose only where it reduces coupling and change risk.

8. Type-safety cleanup
   - Remove high-risk explicit `any` usage from runtime and control-tower paths first.
   - Start with src/index.ts, src/worker.ts, and control-tower adapter/fixtures.

9. Provider resilience architecture
   - Primary + independent verification + fallback for critical intelligence domains.
   - Contract requirements: commercial use, AI processing, historical retention, derived-data rights, redistribution, SLA, termination treatment.

10. Intelligence moat
   - Build Historical Intelligence Graph: identity → transaction history → comparables → liquidity → attention → scarcity → momentum → risk → valuation.
   - Convert Kidult 100 from ranking into explainable market benchmark.

## P2 — optimization

11. Performance / cost instrumentation
   - Measure cost per validated object, intelligence output, report, provider call, and failed/retried workload.
   - Optimize cache, batching, backpressure, D1 query/index usage, provider fan-out, and replay cost.

12. Executive operations simplification
   - Surface only health, freshness, provider risk, incidents, cost, revenue, governance exceptions, and decisions requiring human authority.

13. Product irreplaceability
   - Strengthen Kidult 100, valuation signals, comparable intelligence, category rotation, collector sentiment, and historical context.
   - Every major product must answer: what decision becomes materially harder without KIDULTS?

## Current engineering audit baseline

- Files scanned: 108
- Lines scanned: 31,899
- P1 findings: 1
- P2 findings: 48
- Oversized >1,500 lines: 1
- Large >700 lines: 17
- Explicit `any`: 27
- Empty catches: 0
- Runtime console calls: 0
- Missing explicit quality scripts: lint, test, coverage

## Today exit criteria

- P0 quality workflow green on Node 22+.
- Existing A10–A24 and autonomous runtime regression checks remain green.
- Improvement register committed to hardening branch.
- P1 large-file/type-safety targets identified.
- Real Data Truth Layer acceptance metrics frozen.
- PR remains draft until all current CI checks are green and audit evidence reviewed.

## Do not do

- Do not weaken A15–A40 invariants.
- Do not manufacture PASS evidence.
- Do not add architecture for architecture's sake.
- Do not trade quality for speed or speed for bureaucracy.
- Do not call simulation evidence real production proof.
