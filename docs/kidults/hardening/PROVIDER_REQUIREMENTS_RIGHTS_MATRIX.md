# KIDULTS Provider Requirements & Rights Matrix

Status: design baseline. Actual providers, commercial terms and executed rights remain external dependencies.

## Selection rule

Candidates are classified **MUST_HAVE / CONDITIONAL / EXCLUDE**. Provider count is not a success metric; marginal intelligence value, provenance, rights, reliability and replaceability are.

## Required evaluation fields

| Dimension | Requirement |
|---|---|
| Category | Exact collectible/product categories covered |
| Geography | Markets/countries and localization limits |
| Historical depth | Earliest reliable observation/transaction date |
| Freshness | Update frequency and observable latency |
| Daily/peak volume | Expected sustainable and burst throughput |
| Access mode | API, feed, bulk file, webhook, licensed archive |
| Rate limits | Normal, burst and contractual ceilings |
| Provenance | Source lineage and evidence granularity |
| SLA | Availability, support, incident and recovery terms |
| Rights | Commercial use, AI processing, retention, caching, redistribution, derived intelligence |
| Replaceability | Time/cost/quality impact of substitution |
| Economics | Cost plus marginal intelligence value per cost |

## Topology

**Primary → Independent Verification → Fallback**.

Primary supplies authoritative acquisition where required. Independent Verification must be genuinely separate for critical facts. Fallback may be used only when quality, rights, provenance and freshness remain within policy; otherwise the pipeline fails closed.

## Rights checklist

Commercial use; AI/ML processing; historical retention; caching; permitted redistribution; derived-intelligence ownership/retention; audit rights; termination/export terms; subcontractor restrictions; geography restrictions; model-training restrictions where relevant.

Unknown or ambiguous rights block commercial use. Contract termination should not erase lawfully created derived intelligence, methodology state or internally generated analytics where contractually permitted.

## Provider health scorecard

Score uniqueness, provenance quality, reliability, rights fit, freshness/latency, historical depth, replaceability and marginal intelligence value per cost. Health state must be visible to Control Tower and must feed dependency risk.

## External evidence required before completion

Actual candidate datasets, sample data, verified historical depth, measured latency/volume, negotiated commercial terms, executed rights, live SLA performance and live failover evidence.
