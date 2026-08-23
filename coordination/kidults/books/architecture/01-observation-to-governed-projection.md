# Architecture Book — Chapter 01: Observation to Governed Projection

**Edition date:** 2026-08-23 KST  
**Book:** Architecture Book  
**Track:** KPMO / Architecture / Tracks A–E  
**Decision IDs:** `KIDULTS-POSITIONING-V1-20260822`; `KIDULTS-COMPETITIVENESS-V1-20260822`  
**Snapshot ID:** N/A — architecture chapter; no Candidate/Evidence pair exists  
**Statement class:** TARGET ARCHITECTURE — implemented controls are named separately; this chapter is not Production proof  
**Gate state:** C1 established; C2 incomplete; Production/Public/G5 HOLD  
**Evidence references:** #235, #236, #237, #238, #240, #256, #881, #921, #1013, #1074, #1080, #1106, #1107, #1108, #1113; protected main `ea8bacc076ab228c3e7e334cd6cacbe86c3a3bdb`

## 1. Architectural objective

The architecture must transform fragmented global observations into reproducible customer intelligence without allowing discovery, volume, confidence, a provider or a user interface to self-authorize truth.

The invariant flow is:

`Discover → Screen → Reverify → Admit → Normalize → Resolve Identity → Pair Evidence → Assess Independently → Project → Render → Decide → Audit`

Every transition is explicit, versioned and reversible. Failure or absence closes the downstream claim.

## 2. Three-stage acquisition control

### Gate A1 — ASI ingress screening

ASI classifies discovered candidates before collection or analytical use. Source family, evidence role, provenance, rights state, freshness and expected product use are screened conservatively.

Output: candidate metadata and an explicit allow, hold or reject reason.

Boundary: discovery is not acquisition permission and not evidence.

### Gate A2 — independent reverification

A second control independently rechecks the material facts required for admission. It may not reuse the Gate A1 decision itself as evidence.

Output: reverification record bound to the candidate and rule version.

Boundary: a successful reverification still creates no right that the source did not grant.

### Gate A3 — bounded admission

Admission occurs only for the explicitly permitted purposes and fields. Collect, store, derive, internal display, public display and export are separate rights dimensions. Unknown rights fail closed.

Output: admitted observation metadata, provenance, rights horizon, retention and permitted transformation state.

Boundary: admission to a private evidence pool is not product publication.

## 3. Internal Core and provider boundary

KIDULTS must own the components that compound across providers:

- source registry and collection framework;
- canonical identity and entity resolution;
- KIDULTS ontology and normalization;
- Evidence, Market Observation and Rights Graphs;
- evidence admission, corroboration, freshness and limitations;
- comparable-distance logic;
- confidence and rankability contracts;
- derived analytics;
- Projection schema and generation;
- provider switching and replacement tests;
- audit, observability, rollback and release governance.

External providers may supply authorized observations, feeds, images, grading/condition data or specialist opinions. Raw and provider-restricted payloads remain in purpose-limited private storage under explicit retention rules. KIDULTS-derived structures are stored separately with lineage and permitted-use metadata.

A provider is never the KIDULTS system of record. Replacement must preserve the public analytical grammar while revalidating evidence, rights, freshness and output quality.

## 4. Canonical data planes

| Plane | Contents | Release boundary |
|---|---|---|
| Discovery plane | URLs, candidate metadata, source-family and evidence-role hypotheses | Never customer evidence |
| Private source plane | Authorized raw observations and source-specific metadata | Purpose/retention restricted |
| Canonical object plane | Resolved identity, maker/model/variant/year and state history | Field state required |
| Evidence plane | Claim-to-source lineage, corroboration, dates, transformations and limitations | Exact references required |
| Rights plane | Collect/store/derive/display/export permissions and expiry | Unknown or expired closes field |
| Assessment plane | Track B result bound to one exact immutable pair | Track B cannot mutate inputs |
| Projection plane | Approved customer-facing fields, methods, confidence, freshness, limitations and receipt IDs | Sole intelligence input to Portal/EOS |
| Decision/audit plane | User actions, release decisions, receipts, incidents and rollback history | Append-only accountability |

Missing remains missing throughout these planes. No adapter, database default, calculation or interface may silently convert it to zero.

## 5. Immutable Candidate/Evidence handoff

Track A emits exactly two official inputs:

1. `snapshot-candidate.json`
2. Evidence Package

They must share immutable identity, methodology and evidence-lineage bindings. Track A cannot self-approve rankability. Track B receives only the exact pair, validates without modifying it and emits one `rankability-assessment.json`.

If either input is absent, mismatched, mutable, rights-inadmissible or stale, Track B does not start.

## 6. Confidence and rankability

Confidence answers: *How strongly does the admitted evidence support this field or claim?*

Rankability answers: *Is this evidence and method suitable for comparison, ranking or release for the declared purpose?*

A high-confidence identity claim may coexist with an unrankable market claim. These states must remain separate in schemas, rules, interfaces and audit records.

## 7. Governed Projection

A Projection is the only product-facing intelligence contract. It packages:

- product and universe;
- exact filters and period;
- axes and units;
- approved values or explicit missing states;
- source count and independence;
- confidence and rankability;
- observation and update timestamps;
- freshness policy;
- rights and limitations;
- method version;
- evidence, assessment, release and rollback references; and
- a verifiable runtime receipt.

The Portal and IH-EOS consume the Projection. They do not calculate rankings, reinterpret provider payloads, strengthen states, or infer missing values.

The Projection contract in #1074 and executable consumer binding in #1080 remain Draft/open in the canonical repository. Therefore this architecture describes the required boundary; it does not claim a live approved implementation.

## 8. Portal and EOS responsibilities

The Portal is a **Brand Surface + Product Interface + Market Sensor**.

- As Brand Surface, it explains the category and trust model.
- As Product Interface, it presents governed state, evidence, filters, comparison, monitoring and next action.
- As Market Sensor, it records bounded customer intent and product interaction without converting behavior into unapproved intelligence.

IH-EOS consumes registered program, blocker, gate, outcome and Projection state so the Founder can understand and decide. Neither surface becomes an intelligence producer.

## 9. Security and operational controls

- LOCAL → DEV → STAGING → PRODUCTION remain separate.
- Credentials and signing keys are not committed or copied into registries.
- Provider access is activated only after rights and owner authorization.
- Security or trust-root migrations require explicit approval and fresh protected-main proof.
- Every deploy, rollback, incident and recovery creates an audit receipt.
- No Production deployment begins without a verified rollback target and explicit G5.
- An incident freezes promotion until recovery and root-cause closure.
- Logs expose operational reason codes and correlation IDs, not restricted payloads or credentials.

#881 remains CONTROL PASS SUSPENDED while the approval-gated trust-root migration is unmerged. Draft proof is not release authority.

## 10. Architecture Update Note

| Statement class | Current architectural meaning |
|---|---|
| **VERIFIED CURRENT STATE** | #1106 binds governed Common Crawl public-index traversal to the pre-Gate 1 control path; #1113 adds a deterministic 256-shard metadata reserve and 100k synthetic design-capacity proof; #1107 places hourly Common-Crawl-augmented Gate 1→2→3 rolling-pool v2 on current main; #1108 requires two distinct successful main-branch v2 cycle artifacts before v1 retirement |
| **UNKNOWN / NOT ESTABLISHED** | The two required main-branch v2 cycle artifacts are not yet evidenced; #1109–#1112 remain old-base/open |
| **TARGET** | Lawful source admission, the immutable Candidate/Evidence pair, Track B assessment, governed Projection, customer acceptance and explicit G5 |
| **PROPOSAL** | Any unmerged adapter, provider, schema or operating change remains non-authoritative until its normal gate passes |

The 256-shard and 100k results are control-path design-capacity evidence using synthetic inputs. They are not 100k lawful sources, market observations, Safe Pool entries, customer evidence or release readiness.

Promotion state is unchanged because the landed source controls do not produce lawful GRADED labels, collection/display rights, the immutable pair, Track B assessment or an approved Projection.

## 11. Decision mapping

| Decision / issue | Architectural responsibility |
|---|---|
| `KIDULTS-POSITIONING-V1-20260822` | Product promise must resolve to inspectable system state |
| `KIDULTS-COMPETITIVENESS-V1-20260822` | Provider-switchable governed decision layer remains internal Core |
| #235 | Produce immutable evidence-backed inputs |
| #236 | Independently assess the exact pair |
| #237 / #1080 | Render only semantically valid approved Projection |
| #240 / #921 | Operate, observe, recover and prove rollback in STAGING before Production |
| #256 | Consume registered truth for Founder decisions |
| #238 | Enforce cross-track promotion and G5 boundary |

## 12. Book Sync Report

- **Master Book:** customer value and product claims map to the Projection and evidence boundaries defined here.
- **Baseline Book:** every current NONE, NOT STARTED, OPEN, HOLD or blocked state remains visible and is not reinterpreted.
- **No Fourth Book:** preserved. Runbooks, issue ledgers and decision records support the three Books; they do not become another Book.
- **Sync state:** ALIGNED TO CANONICAL PROTECTED MAIN `ea8bacc0` AT 2026-08-23 09:03 KST.

## 13. Rollback

Revert this chapter file. The change is documentation-only and does not alter code, data, registry pointers, providers, credentials, rights, runtime, trust roots, public release or Production.
