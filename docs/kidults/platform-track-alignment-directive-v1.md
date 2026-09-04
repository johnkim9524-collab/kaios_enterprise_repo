# KIDULTS Platform + Track A–E Alignment Directive v1.1

Status: CANONICAL CANDIDATE  
Parent: #344 / #394 / #235  
Change-base: protected main `f46bdcd9003eb5c4b58208789956644f4ba19fe2`  
Production / Public / G5: HOLD

## 1. Purpose
This directive aligns the entire KIDULTS platform and Track A–E, with Track Z as the upstream provider/rights lane, to the Adaptive Canonical Scope System. The current 32 Collection Scopes are a versioned baseline, not a permanent taxonomy.

## 2. Shared system of record
All Tracks SHALL consume the same semantic chain:

KIDULTS Market Lens → Collectibles Universe → Global Common Core → Market Archetype → Canonical Collection Scope → Representative Product → Market Cell → Assertion → Evidence → Source → Canonical/Evidence/Market Graph → Track B → Projection → Portal/EOS/API.

Canonical Scope != Portal Category != Dynamic Vertical.

For Current-SOLD, the exact accountable chain is:

```text
Track Z source/rights authority
→ Track A / ASI Observation and Atomic Current-SOLD Admission
→ Track A Current-SOLD Event and Canonical Evidence
→ Track D append-only private ledger
→ Track A immutable Candidate/Evidence pair
→ Track B independent assessment
→ approved Projection
```

## 3. Three speeds of change
- Stable core: KIDULTS/Collectibles definitions, canonical identity principles, evidence grammar.
- Adaptive model: archetypes, scopes, normalization models, versioned through governance.
- Dynamic layer: representative products, market cells, dynamic verticals, customer decisions, signals, source demand.

## 4. North-Star gate
Every Track output SHALL be evaluated against AUTONOMOUS, GLOBAL, IRREPLACEABLE_VALUE, and TRANSPARENT.

## 5. Track A — Intelligence / Evidence Factory and Current-SOLD Engine
Track A is accountable for the Current-SOLD engine, including its product contract, strict SOLD/freshness semantics, receipt-bound atomic admission, canonical event identity, content/correction identity, Canonical Evidence and immutable Candidate/Evidence handoff.

ASI is Track A's runtime executor. KPMO governs authority, approval, receipt verification and Red-Team controls. Track Z supplies external source/provider/rights authority. Track D supplies append-only persistence and recovery proof. Track B remains an independent downstream validator and may not alter Track A Evidence or accept a control-only substitute.

Track A also owns scope-specific data requirement refinement, representative-product evidence demand, self-collected PoC, evidence admission and canonical identity/evidence/market graph build.

Track A SHALL:
- start from Decision → Irreplaceable Output → Assertion → Evidence → Data, never Source-first;
- preserve NOT_VERIFIED and provider independence;
- keep CONTROL_SYNTHETIC, PRIVATE_CANDIDATE and LAWFUL_EMPIRICAL classes separate;
- use whole-batch atomic Current-SOLD admission;
- reject listing, asking price, aggregate index, fixture and committed replay as individual empirical SOLD evidence;
- produce only one exact immutable Candidate/Evidence pair for Track B.

Track A SHALL NOT approve its own rankability, publication, provider authority, PostgreSQL activation, Public, Production or G5.

Canonical JD:
- `coordination/kidults/governance/track-a-current-sold-job-description-v1.json`
- `docs/kidults/governance/track-a-current-sold-job-description-v1.md`

## 6. Track B — Independent Validation
Owns: independent validation of Scope sufficiency, collectible qualification, representative-set bias, market-cell completeness, evidence sufficiency, source independence, scope drift recommendations, and index eligibility.

Official input remains one immutable Track A `snapshot-candidate.json` + Evidence Package pair only. Track B must not consume Portal output, control-only receipts, fixture/replay output, or private-candidate PASS as empirical truth.

Track B must not alter source Evidence. Scope create/split/merge/archive recommendations require independent validation before KPMO canonical versioning.

## 7. Track C — Portal / Customer Experience
Owns: customer-facing projection of canonical states, Dynamic Vertical UX, customer-decision signals, explanation of WHY/Evidence/Confidence/Limitation.

Portal may change categories/navigation faster than Canonical Scopes. Portal shall never create canonical scope, Current-SOLD admission, qualification, metric, ranking, or market truth. Customer behavior is a signal, not market truth.

## 8. Track D — Runtime / Reliability
Owns: versioned runtime for scope/product/cell/evidence workloads, private append-only PostgreSQL, D1 read-model separation, DEV→STAGING→PRODUCTION separation, observability, PITR, recovery, cost, rollback, and audit.

Capacity shall be derived from Product × Market Cell × Evidence Demand × Refresh cadence, not fixed URL/source counts. Current-SOLD migration and first remote write require a separate explicit gate. Production remains HOLD until G5.

## 9. Track E — IH Executive Operating System
Owns: projection of canonical lifecycle, scope drift, blockers, decisions, incidents, outcome status, and governance events.

EOS consumes registries/events; it does not create market truth. It must expose Scope lifecycle and version transitions, including EMERGING/CANDIDATE/VALIDATED/CANONICAL/MATURE/DECLINING/MERGED/SPLIT/ARCHIVED.

## 10. Track Z — Provider / Rights / External Source Authority
Owns upstream provider/source evaluation, field-by-purpose rights, authorized acquisition routes, credential/activation boundaries, provider replacement and concentration strategy.

Track Z does not own the Current-SOLD engine or KIDULTS canonical event/Evidence identities. Public visibility, candidate-repository declarations and self-hashes are not source/right authority.

## 11. Scope evolution governance
Signal → Dynamic Vertical → Evidence accumulation → Scope Candidate → Track B → KPMO → New Canonical Scope Version.

No autonomous direct promotion to canonical taxonomy. Historical observations are never rewritten; reinterpretation is versioned.

## 12. Provider rule
External providers are accelerators, gap-fillers and challengers, never business truth.

Before provider-derived Current-SOLD can enter Track A empirical admission, the chain must establish:
1. exact field/evidence/geography/freshness requirement;
2. source-specific acquisition and rights receipts;
3. writer-independent governed receipt-registry authority;
4. approved private runtime and credential boundary;
5. exact source SHA/run/digest binding;
6. no raw provider data in public repository artifacts.

Provider purchase, new contract/EULA, credential activation and external spend remain separately gated.

## 13. Shared fail-closed rules
- No missing → zero.
- No listing → sold.
- No provider ID → canonical ID.
- No UNKNOWN rights → PASS.
- No source count → quality claim.
- No fixture or committed replay → empirical acquisition.
- No exact digest alone → governed issuer authority.
- No low-level classifier → canonical admission.
- No Portal-side qualification/ranking.
- No scope/category synonym assumption.
- No history overwrite.
- No PostgreSQL write without its separate gate.
- No production without G5.

## 14. Alignment acceptance
Alignment is complete only when Track A–E and Track Z reference this canonical model, preserve shared IDs/lifecycle states, and no upstream, engine, ledger, validation or presentation surface can bypass Source/Data/Evidence/Authority governance.
