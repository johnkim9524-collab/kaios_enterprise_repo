# KIDULTS Light Luxury Editorial — FINAL DESIGN BASELINE v1.0

Status: **LOCKED**
Effective: 2026-08-10
Owner decision: Final visual design is frozen. No autonomous/backend/data task may alter the visual system without an explicit visual-baseline upgrade approved by the owner.

## Canonical visual direction

This baseline is the approved KIDULTS global premium intelligence platform visual system:

- Light Luxury Editorial, warm ivory/cream canvas.
- Deep ink/green typography and restrained olive accents.
- No dark forest-green section backgrounds.
- Large editorial serif hero statement: `Objects worth knowing before everyone else.`
- Premium original-object Hero with `Mobility Sculpture 01`.
- Right-side vertical object rail: Mobility / Time / Footwear / Koala / Lounge / Camera.
- Koala uses the approved small black nose treatment.
- Institutional Intelligence Layer remains directly below Hero.
- KPI strip remains compact and horizontal.
- Kidult 100 benchmark remains a horizontal five-object presentation plus Canon Strength.
- Global Data Coverage, Evidence Summary, and Methodology remain a three-part horizontal intelligence layer.
- Institutional Access / Rights & Governance / Institutional Ecosystem remain a single horizontal three-column band below the intelligence layer.
- Footer/navigation hierarchy remains unchanged.
- Desktop and mobile responsiveness are mandatory; mobile changes may solve containment only and must not reinterpret the visual system.

## Canonical information architecture

1. Discover / Hero
2. Institutional Intelligence Layer
3. Evidence / Source Families / Data / Confidence / Snapshot / Production / Kidult 100 status
4. Kidult 100 benchmark
5. Global Data Coverage / Evidence Summary / Methodology
6. Institutional Access / Rights & Governance / Institutional Ecosystem
7. Footer taxonomy

## Change-control rule

Allowed without a visual-baseline version upgrade:

- Evidence Engine API/data binding
- Confidence values and status text
- Kidult 100 data values and evidence-gated states
- Methodology data/version values
- Institutional access-control states
- Accessibility fixes
- Responsive containment fixes
- Security/provenance disclosures required for correctness

Not allowed without explicit approval and a new baseline version:

- Hero layout, proportions, typography, or headline treatment
- Color-system changes
- Object visual family replacement or simplification
- Right-side object rail removal/reordering
- Kidult 100 layout redesign
- Institutional Intelligence Layer redesign
- Moving Institutional Access back into a right-side vertical rail
- Introducing dark/forest-green background blocks
- Replacing premium object visuals with generic icons/placeholders
- Any autonomous visual redesign

## Runtime/data principle

**Design is static; intelligence is dynamic.**

The Evidence Engine may update values and states, but must bind into existing DOM surfaces rather than regenerate the page structure. Fail-closed governance remains mandatory: unverified or production-ineligible intelligence must stay gated.

## Repository baseline

Primary implementation path:

`apps/kidults-enterprise-staging/public/global-standard.html`

The baseline must be treated as an immutable presentation contract by Evidence Engine, Confidence, Kidult 100, Methodology, and Institutional Access work.

## Visual-reference note

The owner-approved reference is the final 2026-08-10 Light Luxury Editorial composition with the photorealistic ivory Mobility Sculpture hero, matching premium object family, small-nose Koala, compact right rail, and horizontal institutional-access band. Any future implementation review must compare against that reference before deployment.
