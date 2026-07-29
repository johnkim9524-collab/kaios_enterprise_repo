# Sprint 18-C5 — Deterministic Scoring and Daily Index Foundation

## Objective

Implement methodology-versioned, deterministic scores and daily index calculation foundations for Kidults and Artfund.

## Included

- Shared deterministic scoring engine
- Methodology validation and checksum binding
- Stable input fingerprinting
- Kidults Brand Momentum, Canon Strength, and Liquidity Grade profiles
- Artfund Artist Momentum, Auction Liquidity, and Provenance Strength profiles
- Daily Kidult 100 and Artfund index calculation foundation
- Score and index audit persistence migration
- Contract tests
- Week 3 gate certification

## Operational Controls

1. Only approved or active methodologies may calculate scores or indices.
2. Input ordering must not change a result or fingerprint.
3. Confidence below 70 excludes a constituent from premium index calculation.
4. Rights, evidence, quality, provenance, and entity-resolution gates run before scoring.
5. Every result stores methodology ID, version, checksum, as-of time, and input fingerprint.
6. Restatement never overwrites history silently; it creates a new status and audit record.
7. Kidults Production remains unchanged.
8. Artfund Production readiness is not claimed.

## Score Foundations

### Kidults

- Brand Momentum
- Canon Strength
- Liquidity Grade

### Artfund

- Artist Momentum
- Auction Liquidity
- Provenance Strength

## Index Foundations

- Kidult 100 daily calculation
- Artfund Global Art Market Index daily calculation
- Initial sub-index calculation uses the same deterministic contract

## Required Validation Order

Source eligibility → evidence and rights → entity resolution → quality and anomaly gate → methodology approval → deterministic score → constituent eligibility → daily index calculation → Trust Surface → staging publication.

## Promotion Restrictions

- No public release of illustrative staging values
- No commercial use without approved rights
- No index publication with draft methodology
- No constituent below confidence 70
- No Artfund constituent with disputed provenance
- No destructive Production migration

## Verification

```powershell
pnpm --filter @kaios/deterministic-scoring-engine test
pnpm --filter @kaios/deterministic-scoring-engine check
```

Week 4 Luxury Portal MVP implementation begins only after PR checks and Week 3 gate certification pass.
