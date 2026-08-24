# KIDULTS ASI Bonhams Cars Results Reference Adapter v1

**Owner:** KPMO  
**Priority:** P1  
**Direction:** Autonomous → Global → Irreplaceable Value → Transparent

## Outcome

This slice implements the first source-specific Reference Adapter for `bonhams-cars-results` and deterministically expands the same control template across all 16 registered source profiles.

The Reference Adapter accepts only an immutable external snapshot. It does not perform a network request itself. It verifies host, HTTPS, payload hash, snapshot digest, observation time, auction ID, lot number, event time, explicit terminal `Sold for` semantics, positive realized price, explicit currency, canonical object ID and condition segment before it creates a normalized candidate input for the generic KIDULTS Market Adapter Runtime.

## Reference Adapter

```text
Immutable Bonhams Snapshot
        ↓
URL / Host / HTTPS validation
        ↓
Payload-hash validation
        ↓
Auction ID + Lot Number
        ↓
Explicit Sold-for Price + Currency
        ↓
Event Time + Object + Condition
        ↓
Bonhams source-specific candidate
        ↓
Generic Market Adapter Runtime
        ↓
HOLD until Rights / Live Schema / Owner / Origin are verified
```

### Implemented

- Bonhams Cars source-specific SOLD parser;
- immutable snapshot and payload-digest checks;
- explicit currency mapping for USD, HKD, AUD, CAD, GBP, EUR, CHF and JPY;
- deterministic source record and factual-origin candidate IDs;
- binding to the generic fail-closed Market Adapter Runtime;
- deterministic replay test;
- eight negative fixture mutations.

### Rejected automatically

- estimate, bid, offer or reserve presented as SOLD;
- ambiguous `$` currency;
- `Sold` without explicit realized price;
- SOLD text that exists only inside script content;
- missing lot identifier;
- payload-hash mismatch;
- unapproved host;
- non-HTTPS source URL.

## 16-Source Template Expansion

The Reference Adapter control model is expanded into a machine-readable template for all 16 registered source profiles:

```text
1 implemented Reference Adapter
+
15 generated source-specific implementation templates
=
16 governed source profiles (not 16 acquisition-eligible sources)
```

Each profile is assigned one of four implementation families:

- `PUBLIC_WEB_AUCTION_RESULTS`;
- `PUBLIC_WEB_MARKETPLACE_RESULTS`;
- `STRUCTURED_API_MARKET_DATA`;
- `PUBLIC_WEB_RELEASE_OR_LISTING_SURFACE`.

Every template includes immutable snapshot integrity, host allowlisting, exact schema version, SOLD semantics, rights, owner/origin separation, provenance, duplicate grain, liquidity denominator, censoring, deterministic replay, mutation rejection and Evidence Admission receipt requirements.

A template is not a source-specific adapter. The 15 non-reference sources remain `TEMPLATE_GENERATED_IMPLEMENTATION_PENDING`. Before any template can enter implementation or acquisition priority, the source must pass the purpose-specific rights gate as `RIGHTS_CLEAR_FOR_PURPOSE`.

The current rights-first result is:

```text
Purpose-rights preflight rows: 16
RIGHTS_CLEAR_FOR_PURPOSE: 0
RIGHTS_HOLD: 16
Adapter-acquisition backlog: 0
Rights preflight queue: 16
```

## First Evidence Admission

Current exact result is **0 admitted Evidence**.

```text
Reference Adapter implemented: 1
Reference Adapter fixture verified: 1
Source templates generated: 16
Live Bonhams snapshots verified: 0
Purpose-specific rights verified: 0
Activated source adapters: 0
Admitted Evidence: 0
Market Events: 0
```

The implementation deliberately does not manufacture the first Evidence Admission. A parsed fixture candidate remains HOLD because:

- the fixture is not an empirical Bonhams source snapshot;
- purpose-specific collect/store/derive rights are not verified;
- live Bonhams schema is not verified;
- source-owner and factual-origin identities are candidates, not verified facts;
- the adapter is not `ACTIVATED_EVIDENCE_BOUND`.

The first lawful Evidence Admission requires a separately governed empirical step:

```text
Bounded live schema snapshot
        ↓
Purpose-specific rights adjudication
        ↓
Empirical SOLD semantics proof
        ↓
Source owner / factual origin verification
        ↓
Source-specific activation gate
        ↓
Generic runtime normalization
        ↓
Evidence Admission receipt
```

The program does not treat Bonhams or any other profile as implementation priority merely because it has assignments. A source that is unknown, conditional, denied, paid-but-unapproved, login-gated, robots-blocked or permission-pending stays in the rights preflight queue. The implementation backlog is populated only after a purpose-specific rights-clear decision; until then, the scheduler can switch among the rights queue without spending adapter effort on legally or commercially blocked sources.

## Hard boundaries

```text
Parser implemented ≠ Live schema verified
Fixture verified ≠ Empirical source verified
Public page ≠ Collection permission
Source owner candidate ≠ Verified owner
Auction lot key ≠ Verified factual origin
Parsed SOLD candidate ≠ Admitted Evidence
Template generated ≠ Source adapter implemented
One source ≠ Global market truth
```
