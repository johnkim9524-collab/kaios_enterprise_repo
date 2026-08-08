# A21 — Autonomous Intelligence Product Pipeline

## Objective

Turn the A20 readiness and monetization model into a governed autonomous intelligence product pipeline. A21 operationalises the canonical 18-product universe defined in A19 and scored in A20 by running every product through a deterministic, policy-governed pipeline.

A21 is **pipeline and certification architecture only**. It does **not** enable production publication, provider procurement, billing, credentials, or external mutation.

---

## Governing principle

**Global Autonomous Intelligence Platform** — policy → preflight → acquire → normalize → validate → derive → score → package → publication gate → evidence → rollback/recovery.

Every stage of the pipeline is non-interactive, fail-closed, and evidence-producing.

---

## Pipeline stages

| # | Stage | Description |
|---|-------|-------------|
| 1 | **policy** | Load and verify global autonomous policy before any execution. Policy is checked per-product and globally. |
| 2 | **preflight** | Validate all preconditions before any mutation phase. Confirms A19/A20 evidence is available and all invariants hold. |
| 3 | **acquire** | Bounded, non-interactive data acquisition. PROVIDER-REQUIRED products are dependency-blocked without valid provider evidence. SELF-FIRST and HYBRID sources are acquired autonomously. |
| 4 | **normalize** | Canonicalise acquired data to `canonical-a19-schema-v1`. Assigns idempotency key per product per run. |
| 5 | **validate** | Quality, provenance, and freshness gates (A20 thresholds). Produces per-product blocking reasons. |
| 6 | **derive** | Derive intelligence products from normalised data. Respects upstream dependency blocking. |
| 7 | **score** | Deterministic scoring: pipeline readiness, publication readiness, monetization readiness, dependency risk. |
| 8 | **package** | Assemble pipeline product record with stable ID, provenance lineage, and A20 classification reference. |
| 9 | **publication gate** | Apply A20 publication gate. Production publication is unconditionally blocked. Only CANARY_ELIGIBLE and INTERNAL_ONLY states may pass. |
| 10 | **evidence** | Produce machine-readable JSON evidence for the complete run. |
| 11 | **rollback/recovery** | Evidence-only quarantine plan for blocked products. No mutation on rollback. |

---

## Architecture invariants

| Invariant | Value |
|-----------|-------|
| Production publication | **UNCONDITIONALLY BLOCKED** — no pipeline path enables production publication |
| Provider contact | Never occurs during pipeline execution |
| Provider credentials | Never consumed or stored |
| Billing/procurement | Never mutated |
| External mutation | Never occurs |
| Execution mode | Non-interactive only |
| Policy check | Before every execution phase |
| Preflight check | Before every mutation phase |
| Unknown states | Fail closed |
| Evidence | Machine-readable JSON produced for every run |

---

## Data strategy boundaries

Boundaries established in A19 and enforced by A21:

| Strategy | Products | Pipeline behaviour |
|----------|----------|--------------------|
| **SELF-FIRST** | 8 products | Fully autonomous acquisition, normalisation, derivation, and scoring. |
| **HYBRID** | 4 products | Partial autonomous acquisition. Provider supplementation required before commercial release; pipeline completes internal phases. |
| **PROVIDER-REQUIRED** | 6 products | Dependency-blocked at acquisition. No pipeline phases beyond `acquire` are attempted without valid provider evidence contract. |

---

## Execution properties

- **Idempotency** — each product is assigned a deterministic idempotency key (`sha256(runId + product)`).
- **Deterministic run identity** — `RUN_ID = a21-pipeline-{date}-{sha256(inputs)[0:16]}`.
- **Provenance** — every packaged product carries full lineage: dimension, strategy, A19 classification, A20 readiness/monetization/publication class.
- **Freshness** — acquisition timestamp embedded in every packaged product record.
- **Stable IDs** — `kidults.{dimension}.{product}.v1`.
- **Retry boundaries** — up to 2 retries with 50 ms backoff per product.
- **Bounded concurrency** — maximum 6 products processed concurrently.
- **Failure isolation** — individual product failures do not break the pipeline; failed products are quarantined.
- **Rollback/recovery** — evidence-only rollback plan produced for every blocked/errored product; no production mutation on rollback.
- **Topological execution** — products are processed in dependency order; upstream results are available to downstream derivations.

---

## Consumed evidence

A21 consumes without duplicating or reclassifying:

- **A15** Global Autonomous Policy Foundation
- **A16** Autonomous Execution Control Plane
- **A17** Bounded Live Adapter Readiness
- **A18** Autonomous Data Acquisition Scale
- **A19** Data Coverage & Productization Gap Matrix (canonical 18-product universe)
- **A20** Intelligence Product Readiness & Monetization Gate (readiness/monetization/publication classes and thresholds)

---

## Package scripts

| Script | Command | Description |
|--------|---------|-------------|
| `a21:pipeline` | `node scripts/a21-intelligence-product-pipeline-certify.mjs` | Run the full A21 pipeline and produce evidence. |
| `a21:certify` | `npm run typecheck && npm run a21:pipeline` | Typecheck then run pipeline certification. |
| `a21:finalize` | `npm run a21:certify && stage-finalize.ps1 -Stage A21` | Certify and finalize (syncs main). |

---

## Certification gates

All gates must pass for `a21:certify` to succeed:

- Global policy checked
- Preflight passed (A19/A20 evidence confirmed, all invariants verified)
- All 18 canonical products processed
- Production publication blocked for all products
- PROVIDER-REQUIRED products dependency-blocked
- SELF-FIRST products complete full pipeline
- Policy checked before every execution phase
- Preflight checked before mutation phases
- Non-interactive execution confirmed
- No provider contact
- No provider credentials
- No billing mutation
- Machine-readable evidence produced
- Run identity deterministic
- Idempotency keys present on all normalised products
- Stable IDs present on all packaged products
- Rollback plan produced
- All fail-closed tests pass
- All positive-case tests pass

---

## Certification tests

### Fail-closed (negative) cases

| Test | Expected |
|------|----------|
| Production publication unconditionally blocked | All products: `gateClass !== PRODUCTION_READY` |
| PROVIDER-REQUIRED products dependency-blocked at acquire | `acquisitionClass === DEPENDENCY_BLOCKED` |
| PROVIDER-REQUIRED products do not pass publication gate | `passed === false` |
| Self-first products with sufficient scores reach CANARY_ELIGIBLE or INTERNAL_ONLY | `gateClass ∈ {CANARY_ELIGIBLE, INTERNAL_ONLY}` |
| Non-interactive execution | All policy checks: `nonInteractive === true` |
| Policy checked before every product | All: `policyChecked === true` |
| No provider contact | All: `noProviderContact === true` |
| No billing mutation | All: `noBillingMutation === true` |
| All 18 canonical products processed | `pipelineResults.length === 18` |
| Run identity deterministic | `RUN_ID.startsWith('a21-pipeline-')` |
| Stable IDs unique across packaged products | No duplicates |
| Upstream blocking propagates to dependents | Direct dependents of blocked products are also blocked |
| Unknown product fails closed | Not reachable with canonical universe; gate verified |
| Rollback plan is evidence-only | `noMutationOnRollback === true` |
| Idempotency keys present | All normalised products have key |

### Positive cases

| Test | Expected |
|------|----------|
| At least one SELF-FIRST product completes full pipeline | `pipelineStatus === COMPLETE` |
| All SELF-FIRST products are acquired | `acquired === true` |
| All SELF-FIRST products are normalised | `normalized === true` |
| SELF-FIRST products above thresholds pass validation | `valid === true` |
| 8 SELF-FIRST products identified | Count === 8 |
| 4 HYBRID products identified | Count === 4 |
| 6 PROVIDER-REQUIRED products identified | Count === 6 |

---

## CI

GitHub Actions workflow: `.github/workflows/kidults-a21-intelligence-product-pipeline.yml`

Triggers on:
- Pull requests touching `services/kidults-autonomous-intelligence/**`
- Manual `workflow_dispatch`

Permissions: `contents: read` (no write, no secrets, no external mutation).

Uploads `a21-pipeline-evidence` artifact (machine-readable JSON) on every run.

---

## What A21 does NOT do

- Does **not** enable unrestricted production publication.
- Does **not** contact providers.
- Does **not** add real provider credentials.
- Does **not** initiate billing or procurement.
- Does **not** bypass A20 readiness gates.
- Does **not** weaken any A15–A20 fail-closed policy.
- Does **not** duplicate or reclassify A19/A20 canonical product definitions.
