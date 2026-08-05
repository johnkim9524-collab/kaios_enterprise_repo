# KIDULTS Portal Base v1

Status: FROZEN BASELINE

Registered: 2026-08-05

Source branch: `feat/kidults-public-enterprise-upgrade`

Baseline branch: `baseline/kidults-portal-base-v1`

Primary path:

`apps/kidults-enterprise-staging/public/public-enterprise-preview/`

## Scope

This baseline fixes the current KIDULTS public enterprise portal as the approved portal base for subsequent data, runtime, provider, API, and production work.

The baseline includes:

- Public enterprise portal information architecture
- KIDULTS visual identity and typography system
- Forest Green primary palette with restrained gold accents
- Hero intelligence dial and KPI hierarchy
- Kidult 100 trend presentation
- Category Intelligence presentation
- Confidence, source, geographic, lifecycle, correlation, and mover visualizations
- Provider Partnership, API, Company, Methodology, Archive, Reports, and Operations navigation
- Desktop and mobile responsive rules beginning at 320px
- Mobile overflow containment for charts, cards, governed-system blocks, KPI strips, and headings

## Freeze rules

1. This branch is a recovery and comparison baseline.
2. Do not develop new features directly on this branch.
3. Future work must branch from the active development branch or from this baseline when a clean portal foundation is required.
4. Changes to the visual system require an explicit design-system decision.
5. Data, runtime, API, and production integrations must preserve the approved portal hierarchy and responsive behavior.
6. Desktop and mobile behavior must be validated together.
7. No release is accepted when horizontal page overflow exists at 320px, 375px, 390px, or 430px.

## Approved design direction

- Primary: Forest Green
- Accent: restrained Gold
- Editorial display type for major headings
- Sans-serif interface type for navigation, labels, and operational text
- Tabular/lining numerals for data presentation
- Calm, evidence-led enterprise presentation
- No unnecessary decorative expansion

## Baseline use

Use this branch to:

- restore the approved portal base;
- compare future visual or responsive changes;
- create clean feature branches;
- validate regressions before deployment;
- preserve the portal independently of future data and runtime development.

## Next phase

The next phase should prioritize:

1. validated production data connection;
2. graph and report automation;
3. provider pilot workflow;
4. API and enterprise access controls;
5. Cloudflare production deployment;
6. operational monitoring and release certification.

This document formally records the KIDULTS portal base as frozen and approved.
