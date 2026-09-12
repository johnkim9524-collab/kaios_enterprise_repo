# ASI Requirement-to-Adapter Coverage v1

## Purpose

This runner preserves the only unsuperseded requirement-level value identified in stale PR #1149: a deterministic crosswalk from all 192 governed replacement missions to the current 16-source adapter portfolio.

It does **not** restore #1149's parallel claim-suitable SDK. It also does not consume or synthesize the `replacement-mission-queue-v2.json`, `adapter-requirement-queue-v2.json`, or `adapter_requirement_id` values proposed by closed-unmerged PR #1148. Those are not protected-main lineage.

The authoritative current grain is the merged Autonomous Resolution Layer v1 mission:

```text
mission_id × scope_id × region × evidence_class
```

A new `coverage_record_id` is derived from that current grain and the required adapter claim. The record retains `legacy_v2_adapter_requirement_id: null` and `legacy_v2_identifier_synthesized: false`.

## Exact upstream lineage

The runner restores exactly one non-expired artifact from a successful `main` run of `KIDULTS ASI Autonomous Resolution Layer v1`. It binds the workflow run, artifact, producer SHA, consumer SHA, manifest digest, queue digest, and current static-input digests.

The runner binds the latest exact-main producer at execution time. Run IDs, artifact IDs, SHAs, expiry, and digests are emitted in the artifact binding and KPMO receipt rather than copied into this policy document as a stale baseline.

For an upstream completion, Coverage has one canonical fan-out identity: `head_sha + ASI_AUTONOMOUS_RESOLUTION`. The workflow concurrency key uses that exact SHA and upstream class with non-cancelling serialization (`cancel-in-progress: false`), so repeated successful producer runs for the same source SHA cannot execute canonical Coverage work in parallel. The 90-day canonical artifact guard then selects one leader or a verified alias after serialization. The binding, output manifest, and receipt also carry `upstream_class` and `canonical_run_key` (`<head_sha>:ASI_AUTONOMOUS_RESOLUTION`) so this deduplication identity remains auditable after execution. Manual recovery/replay remains isolated by its own workflow run ID and cannot cancel or impersonate the canonical upstream-triggered lane.

The successful canonical guard is limited to fixed GitHub Actions artifact and receipt readback for that exact source SHA and upstream class. It is not durable exactly-once execution: the artifacts expire after 90 days, and PostgreSQL-backed durable canonical uniqueness remains `REMOTE_LEDGER_ACTIVATION_HOLD`. A manual recovery request has its own request/run identity, is never a canonical leader or verified alias, and must repeat full Coverage validation. A verified alias may skip a duplicate full Coverage build and downstream Continuous Assurance full audit only after exact guard verification, and it must still emit an exact observer/classification receipt identifying what was reused and why. If fixed readback is unavailable, incomplete, or ambiguous, the automatic run fails closed without executing Coverage or emitting an alias; a separate manual recovery remains non-canonical and must repeat full validation.

Canonical semantic projection v1 deliberately separates behavior from observation provenance. Its identity material contains the source SHA and upstream class, the full deterministic replacement queue, manifest `id`/`version`/`results`, only the contract, adapter-contract, frontier, crosswalk, and replacement-queue binding fields consumed by the Coverage builder, the stable ARL receipt behavior/result/HOLD allowlist, and the Coverage contract, authoritative static inputs, implementation files, `package.json`, and `npm-shrinkwrap.json`. Producer run/attempt/title, P1 run and artifact IDs/digest, the raw generation key, timestamps, raw manifest receipt digest, and unrelated manifest bindings or outputs are excluded from semantic identity but remain mandatory in the exact leader or alias observation receipt. Thus a second successful ARL run with identical source and behavior may alias, while a queue, consumed result/binding, rights/HOLD, contract, static-input, implementation, or dependency change fails closed as a different semantic input. The canonical leader artifact embeds the serialized semantic receipt; every leader and Continuous Assurance alias readback verifies its exact file digest and recomputes `canonical_input_digest` from the serialized material before reuse.

Artifact binding v1.3.0 represents this distinction explicitly. `main_scope_validated` means only that the restored software-lineage artifact passed the exact `main` branch and SHA checks. It is never a release or deployment permission. `production_authorized: false` is mandatory for both Main and validation-only bindings, and the legacy `production_eligible` field is forbidden in new Coverage artifacts. Historical Coverage v1.2 artifacts that used `production_eligible` must be read only as legacy Main-scope metadata and must never be translated into Production authority. This naming change is scoped to the Coverage binding v1.3 contract; it does not prove that every dormant or unrelated legacy runtime domain in the repository is false-only or has migrated that field.

If the exact successful main artifact is unavailable, expired, ambiguous, from another workflow or branch, not ancestral to the consumer, or its digests no longer match current authoritative inputs, the runner fails closed. It never substitutes a fixture or a non-main artifact.

## Join and coverage rules

For every mission:

1. `scope_id` is crosswalked to its legacy scope IDs through `scope-registry-v1-to-v2-crosswalk-v1.json`.
2. A source is software-eligible only if its frontier `collection_scope_ids` intersect those legacy scopes and its runtime registration includes the mission's literal `required_adapter_claim`.
3. Acquisition/replacement eligibility is a separate gate: the purpose-rights preflight decision must equal `RIGHTS_CLEAR_FOR_PURPOSE`. Unknown, conditional, denied, paid-but-unapproved, login-gated, robots-blocked, or permission-pending sources remain in the rights preflight queue and cannot consume adapter priority.
4. Rights-clear sources are ordered by runtime priority rank and then `source_id`. The first three must reproduce the upstream replacement slots exactly; when no source is rights-clear, all slots remain unfilled.
5. The source's current claim ceiling is normalized from the Bonhams reference contract plus Wave 2, Wave 3, and Wave 4 contracts.
6. A requirement is `SOFTWARE_IMPLEMENTED` only when a software-eligible current source literally lists the required claim in `implemented_claim_parsers`.

A runtime-registered claim, template-only claim, context-only classifier, generic fixture, or another claim parser never inherits coverage. In particular:

- dated-SOLD does not imply CURRENT_PRICE;
- a SOLD parser does not imply liquidity;
- an exposure parser does not imply a SOLD transaction;
- listing, release, catalog, and aggregate-price context are not Evidence parsers.

Software claim coverage and lawful acquisition readiness are intentionally separate. A source can contribute a software claim ceiling while remaining unavailable for collection until purpose-specific rights are clear.

## Current deterministic result

The 16 normalized source claim-ceiling records and the 192 mission requirements are different denominators. They are not 16 rights-cleared or live-activated site adapters.

| Measure | Current software result |
|---|---:|
| Authoritative requirements | 192 |
| Domain × evidence-class families | 16 |
| Registered source profiles | 16 |
| Normalized source claim-ceiling records | 16 |
| Implemented source adapters | **16 / 16** |
| Pending registered-source adapter implementations | **0** |
| `SOFTWARE_IMPLEMENTED` | **39 / 192** |
| `CONTEXT_ONLY` | **15 / 192** |
| `NO_IMPLEMENTED_CLAIM_PARSER` | **138 / 192** |
| Source-profile discovery required | **120 / 192** |
| Schema-bound claim parser unavailable | **33 / 192** |
| Gap records with owner, declared SLA, idempotency and fallback definitions | **153 / 153** |
| Region-specific source-discovery work bundles | **42** |
| Schema-bound source × claim work units | **10** |
| Missing accountability bindings in the generated definitions | **0** |
| Active gap-queue consumers | **0** |
| Persisted first-admission or SLA-clock states | **0** |
| Queue acknowledgements, attempts, retry or DLQ receipts | **0** |
| `RIGHTS_SCHEMA_ACTIVATION_HOLD` | 192 / 192 |

The 39 software matches comprise 24 of 96 CURRENT_SOLD requirements and 15 of 96 liquidity requirements. One of 16 families is fully software-covered, five are partial, and ten have zero matching claim-parser coverage. The remaining 153 requirements are not 153 missing code modules: 120 have no registered source profile for the scope/claim, while 33 have a registered profile but cannot receive a truthful claim parser until source-specific rights, a live schema snapshot, and claim semantics are verified.

`software_gap_requirements` and `unmapped_requirements` are no longer canonical result fields. They remain only under `deprecated_compatibility_metrics` as read-only translations for older artifact readers, with explicit forbidden interpretations. Canonical status uses `source_profile_discovery_requirements`, `schema_bound_claim_parser_requirements`, and `claim_parser_not_implemented_requirements`; no deprecated counter may be reported as an internal defect or an unaccounted requirement.

The upstream Autonomous Resolution Layer has already terminalized all 672 original preflight actions and reduced remaining Gate 1 HOLD decisions to zero. Rejected discovery-metadata candidates are not carried forward as open preflight work.

The separate acquisition gate currently has 0 `RIGHTS_CLEAR_FOR_PURPOSE` profiles, 16 rights-preflight holds, 0 selected replacement profiles, and 0 adapter-acquisition backlog items. This does not erase the software claim ceiling; it prevents unapproved collection from being scheduled.

The runtime profile `verified_assignment_count` values sum to 156. That value is source-assignment metadata, not a requirement denominator, and is never compared with or subtracted from 192.

## Accountable gap-queue definitions

The 153 gap records are deterministic, accountable work definitions rather than executable or persisted queue entries. Every generated record names KPMO as the accountable owner and carries a declared P1 queue state, SLA metadata, a stable idempotency key, and a generic fail-closed fallback path. Therefore `153 / 153` proves that zero generated records are missing those accountability bindings; it does not prove queue admission, execution, acknowledgement, persistence, or operational completion.

| Gap class | Deterministic work-unit grain | Units | Intended execution owner | Declared SLA metadata |
|---|---|---:|---|---|
| Source-profile discovery | domain × region × evidence class | 42 | Track Z | acknowledge in 1 successful canonical Coverage run; target resolution in 5 |
| Schema-bound claim parser | source ID × required adapter claim | 10 | Track A | acknowledge in 1 successful canonical Coverage run; target resolution in 3 |

No queue consumer, scheduler, or durable queue-state store is established by this Coverage proof. `FIRST_CANONICAL_QUEUE_ADMISSION` is a declared future clock start, not a persisted event; no first-admission timestamp, running SLA clock, attempt history, acknowledgement, retry receipt, or DLQ receipt exists. The Coverage KPMO receipt is a build-validation receipt only, not a queue admission or completion receipt, and there is no remote finalizer that automatically persists or finalizes these work definitions. Actual queue execution remains **HOLD**.

KPMO retains the fail-closed decision and cross-Track accountability definitions. Track Z is the intended owner for internal lawful-source discovery and rights-route preparation, but this artifact grants no external-contact authority. Track A is the intended owner for immutable-schema and claim-semantics validation only after the protected prerequisites pass. These owner labels and SLA values are declarations, not acknowledgements or evidence of work performed. Fallbacks use only generic KPMO/Track Z/Track A routes: they never hard-code a stale provider, authorize a live request, contact a provider, activate an adapter, or bypass rights, Public, Production, or G5 gates.

## Generated outputs

- `requirement-adapter-coverage-ledger-v1.json` — all 192 current mission-grain records;
- `requirement-adapter-family-coverage-v1.json` — the 16 domain × evidence-class reporting families;
- `source-adapter-claim-ceiling-registry-v1.json` — the normalized 16-source registered/implemented/template/context claim ceilings (software capability records, not rights clearance or live activation);
- `requirement-adapter-gap-queue-v1.json` — 120 source-profile discovery requirements and 33 schema-bound claim-parser requirements, bound to 42 discovery and 10 schema work definitions with owner, declared SLA, idempotency and generic fallback metadata; it is not evidence of durable queue admission or execution;
- `requirement-adapter-coverage-manifest-v1.json` — exact producer/consumer SHA, upstream artifact, input and output digest lineage.

Generated data remains a 90-day workflow artifact. It is not committed as empirical truth.

## Determinism and mutation proof

The exact-head workflow builds twice and requires a byte-for-byte identical directory. Validation independently rebuilds the expected outputs and rejects:

- any dropped, duplicated, or denominator-substituted requirement;
- any change to the 192 unique mission and market-cell grain;
- any unbound or mixed upstream artifact, manifest, receipt, or static-input digest;
- a source outside the recomputed eligible set or a slot that differs from the first three eligible sources;
- a missing or duplicate source implementation record;
- registered-claim or cross-claim inheritance;
- context-only classification as parser coverage;
- rights, live schema, activation, Evidence, Market Event, Snapshot, Track B, Projection, Public, Production, or G5 promotion;
- missing owner/SLA/fallback bindings, duplicate idempotency keys, legacy `production_eligible`, or any `production_authorized: true` mutation;
- a manual-only normal activation path.

## Coverage build activation, not queue execution

Normal Coverage build validation is registered on:

- successful `KIDULTS ASI Autonomous Resolution Layer v1` completion;

The producer owns relevant protected-main path activation. The Coverage build consumer does not race the producer through an independent push or clock trigger; it starts only after the exact upstream run succeeds and restores artifacts from that run. Duplicate upstream completions at the same source SHA and upstream class share one non-cancelling serialized concurrency group. The schema retains a fail-closed `PULL_REQUEST_HEAD` validation tuple for compatibility testing, but the current Coverage workflow has no pull-request artifact-consumption trigger. This also prevents a delayed build consumer from binding a newer main SHA with no matching producer artifact. None of these triggers starts a gap-queue consumer, persists first admission, advances an SLA clock, or finalizes a queue receipt.

Manual dispatch is recovery or explicit replay only.

## Truth boundary

This runner proves software coverage lineage only. Every one of the 192 requirements remains `RIGHTS_SCHEMA_ACTIVATION_HOLD`.

It executes no live target-source request, contacts no provider, creates no collection right, verifies no live schema, activates no adapter, admits no Evidence, creates no Market Event or Snapshot Candidate, starts no Track B result, creates no Projection, and changes no Public, Production, or G5 state.

### Platform effects

- `autonomous_effect`: positive — all 672 preflight actions are terminal and remaining requirements are deterministically classified into accountable source-discovery or schema-bound work definitions, without claiming queue admission or execution.
- `global_effect`: positive — all 32 scopes × 3 regions × 2 evidence classes remain explicit, while software coverage is not called global empirical coverage.
- `irreplaceable_value_effect`: positive — KIDULTS owns the requirement-to-source claim-ceiling lineage and switching gaps.
- `transparency_effect`: positive — registered, implemented, context-only, empirical, and release states remain separate and digest-bound.
