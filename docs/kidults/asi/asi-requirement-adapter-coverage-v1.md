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

Current implementation baseline, last verified at `2026-08-23T23:44:42Z`:

- protected-main source SHA: `81079541e708d5916621fec3758c357f96b7254b`;
- workflow run: `32674508442`;
- artifact: `9502274246` / `kidults-asi-autonomous-resolution-layer-v1`;
- artifact expiry: `2026-11-21T23:44:31Z`;
- replacement queue digest: `sha256:ad42655aa9290ec9fd29dcc2e18cfae52b3a0e8c5cf49ed92e2d6abdc9347dd1`;
- resolution manifest digest: `sha256:745a3554ca3c287bd42b6898c1ca0de8f0575aa4576ad3c8e949394f71f48263`.

If the exact successful main artifact is unavailable, expired, ambiguous, from another workflow or branch, not ancestral to the consumer, or its digests no longer match current authoritative inputs, the runner fails closed. It never substitutes a fixture or a non-main artifact.

## Join and coverage rules

For every mission:

1. `scope_id` is crosswalked to its legacy scope IDs through `scope-registry-v1-to-v2-crosswalk-v1.json`.
2. A source is eligible only if its frontier `collection_scope_ids` intersect those legacy scopes and its runtime registration includes the mission's literal `required_adapter_claim`.
3. Eligible sources are ordered by runtime priority rank and then `source_id`. The first three must reproduce the upstream replacement slots exactly.
4. The source's current claim ceiling is normalized from the Bonhams reference contract plus Wave 2, Wave 3, and Wave 4 contracts.
5. A requirement is `SOFTWARE_IMPLEMENTED` only when an eligible current source literally lists the required claim in `implemented_claim_parsers`.

A runtime-registered claim, template-only claim, context-only classifier, generic fixture, or another claim parser never inherits coverage. In particular:

- dated-SOLD does not imply CURRENT_PRICE;
- a SOLD parser does not imply liquidity;
- an exposure parser does not imply a SOLD transaction;
- listing, release, catalog, and aggregate-price context are not Evidence parsers.

## Current deterministic result

The 16 implemented source adapters and the 192 mission requirements are different denominators.

| Measure | Current software result |
|---|---:|
| Authoritative requirements | 192 |
| Domain × evidence-class families | 16 |
| Registered source profiles | 16 |
| Implemented source adapters | 16 |
| `SOFTWARE_IMPLEMENTED` | **39 / 192** |
| `CONTEXT_ONLY` | 15 / 192 |
| `UNMAPPED` | 138 / 192 |
| Total software gap | **153 / 192** |
| `RIGHTS_SCHEMA_ACTIVATION_HOLD` | 192 / 192 |

The 39 software matches comprise 24 of 96 CURRENT_SOLD requirements and 15 of 96 liquidity requirements. One of 16 families is fully software-covered, five are partial, and ten have zero matching claim-parser coverage.

The runtime profile `verified_assignment_count` values sum to 156. That value is source-assignment metadata, not a requirement denominator, and is never compared with or subtracted from 192.

## Generated outputs

- `requirement-adapter-coverage-ledger-v1.json` — all 192 current mission-grain records;
- `requirement-adapter-family-coverage-v1.json` — the 16 domain × evidence-class reporting families;
- `source-adapter-claim-ceiling-registry-v1.json` — the normalized 16-source registered/implemented/template/context claim ceilings;
- `requirement-adapter-gap-queue-v1.json` — all 153 software gaps;
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
- a manual-only normal activation path.

## Automatic activation

Normal execution is registered on:

- relevant protected-main push;
- relevant pull request validation;
- successful `KIDULTS ASI Autonomous Resolution Layer v1` completion;
- successful `KIDULTS ASI Source Adapter Wave 4 v1` completion;
- hourly recovery schedule at minute 12.

Manual dispatch is recovery or explicit replay only.

## Truth boundary

This runner proves software coverage lineage only. Every one of the 192 requirements remains `RIGHTS_SCHEMA_ACTIVATION_HOLD`.

It executes no live target-source request, contacts no provider, creates no collection right, verifies no live schema, activates no adapter, admits no Evidence, creates no Market Event or Snapshot Candidate, starts no Track B result, creates no Projection, and changes no Public, Production, or G5 state.

### Platform effects

- `autonomous_effect`: positive — the exact main artifact is automatically replayed into a fail-closed gap queue.
- `global_effect`: positive — all 32 scopes × 3 regions × 2 evidence classes remain explicit, while software coverage is not called global empirical coverage.
- `irreplaceable_value_effect`: positive — KIDULTS owns the requirement-to-source claim-ceiling lineage and switching gaps.
- `transparency_effect`: positive — registered, implemented, context-only, empirical, and release states remain separate and digest-bound.
