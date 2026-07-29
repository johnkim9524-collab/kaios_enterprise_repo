# Sprint 18-E1 — Autonomous Report Engine

## Objective

Generate evidence-linked flagship intelligence reports for Kidults and Artfund without allowing unsupported, low-confidence, rights-blocked, or draft-methodology claims to reach customer-facing output.

## Execution Flow

1. Load governed score, index, entity, quality, rights, evidence, and methodology snapshots.
2. Build the required vertical report profile.
3. Evaluate every narrative claim independently.
4. Block unsupported claims instead of softening or inventing language.
5. Produce deterministic evidence and methodology manifests.
6. Generate a stable checksum and immutable archive key.
7. Persist the report, claims, and publication events in staging.
8. Publish only when every claim is supported and all governance gates pass.

## Kidults Flagship Report

- Executive Summary
- Kidult 100
- Brand Momentum
- Category Rotation
- Liquidity
- Risk Signals
- Outlook
- Methodology and Evidence

## Artfund Flagship Report

- Executive Summary
- Global Art Market Index
- Artist Momentum
- Auction Liquidity
- Provenance Strength
- Segment Rotation
- Risk Signals
- Outlook
- Methodology and Evidence

## Blocking Rules

- Evidence count below the claim minimum: block.
- Unknown, restricted, expired, or disputed rights: block.
- Confidence below 70: block.
- Missing, draft, or deprecated methodology: block.
- Disputed Artfund provenance: block publication.
- Any blocked claim: report state remains blocked.

## Archive Contract

Archive keys follow:

`<vertical>/<edition>/<report-id>-<checksum>.json`

Historical archives are immutable. Corrections create a new report version and a publication event; they do not overwrite prior reports.

## Staging Verification

- Run package tests.
- Run TypeScript checks.
- Apply `0006_autonomous_report_archive.sql` to an isolated SQLite database.
- Verify `PRAGMA integrity_check` returns `ok`.
- Generate the same report twice and confirm identical checksums.
- Remove evidence from one claim and confirm publication is blocked.
- Change rights to unknown and confirm publication is blocked.

## Restrictions

- No Production database migration.
- No public release of illustrative staging narratives.
- No silent claim omission that changes the analytical conclusion.
- No human or system actor may bypass rights, evidence, methodology, confidence, or provenance gates.
