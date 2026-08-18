# KIDULTS Policy-to-Platform Alignment Baseline v1

Status: CANDIDATE_FOR_FREEZE
Program phase: Policy-to-Platform Alignment Closure
Production: HOLD
Provider Contact: HOLD

## Canonical policy set

1. Evidence Before Metrics.
2. Claim Strength <= Evidence Strength.
3. Missing != Zero.
4. Provider != Truth.
5. Provider ID != Canonical ID.
6. Listing != Sold Transaction.
7. Bid/Ask != Transaction.
8. Attention != Demand != Transaction.
9. Regional Context != Regional Market Significance != Regional Liquidity.
10. Scarcity != Liquidity.
11. Simulation != Observation.
12. Anomaly != Fraud.
13. Normalized scores require Normalization Confidence.
14. A single authoritative, rights-admissible SOLD source may verify an individual transaction when identity, terminal sold state, date, amount/currency, venue/reference, provenance and freshness are satisfied.
15. There is no universal hard gate requiring two SOLD source families for individual transaction admission.
16. Source-family / venue / region / time / product corroboration increases with claim scope and risk, especially for representativeness, valuation, liquidity, regional significance and cross-market ranking.
17. Portal and IH-EOS consume governed Projection only and never create market truth.
18. Track B consumes only the exact immutable snapshot candidate + Evidence Package and does not edit upstream truth.
19. Track D operates runtime only; Production requires Integration Gate #238 and explicit G5.
20. Architecture/CI success is not empirical market validation or deployed-runtime readiness.

## Founder-approved execution sequence

Policy-to-Platform Alignment Closure
→ Holistic Review
→ Fast Improvement Sprint
→ Real bounded Intelligence PoC
→ Track B Independent Validation + Scale Decision

## Alignment dimensions required for closure

- KPMO Master / operating board
- Track A-E operating contracts
- Integration Gate
- Registry / evidence / market-event contracts
- validators / negative controls
- Snapshot / Assessment / Projection boundaries
- Portal / IH-EOS claim rendering boundaries
- Runtime / Production authorization boundaries

## Known post-alignment empirical gaps

These do not prevent policy alignment closure but remain blockers for later PoC/launch gates:

- real-world Scope-stratified entity-resolution benchmark below required confidence;
- Scope-specific market-activity depth incomplete;
- admitted Scope Source Pools not yet live-complete;
- ASI processors not operationally deployed;
- live approved Projection not yet connected to Portal/IH-EOS;
- empirical DEV/STAGING runtime capacity/recovery proof incomplete.

## Freeze rule

This baseline may be frozen only after the corresponding contract/validator PR passes all required checks and merges to canonical main. After freeze, new policy changes require an explicit versioned amendment; downstream Holistic Review must use the frozen baseline rather than chat or historical issue text.