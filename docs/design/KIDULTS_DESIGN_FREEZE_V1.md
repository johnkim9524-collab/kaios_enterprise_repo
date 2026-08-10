# KIDULTS Final Design Freeze

Status: FINAL MASTER — FROZEN
Effective date: 2026-08-11
Scope: KIDULTS public portal, responsive portal implementation, preview portal, methodology, archive, intelligence, provider-facing presentation surfaces and future visual QA.
Canonical specification: `docs/design/KIDULTS_FINAL_MASTER_DESIGN.md`

## 1. Governance rule

The approved KIDULTS master is frozen. No visual element may be changed for cosmetic experimentation. Changes require an explicit reason tied to accessibility, data integrity, legal/risk control, functional correctness or a user-approved design revision.

Implementation work must reproduce the master rather than reinterpret it.

## 2. Brand signature

- Header wordmark: `K I D U L T S`, uppercase sans serif, generous tracking, dark primary ink.
- Header wordmark size: approximately 20px at the reference desktop scale; preserve its current visual weight and spacing.
- Footer wordmark: the same uppercase sans-serif signature, intentionally much smaller and quieter than the header.
- Do not substitute the previous serif `Kidults.` wordmark.
- Do not add decorative marks, boxes, gradients or gold to the wordmark.

## 3. Hero — locked

- Left editorial statement: `Objects worth / knowing before / everyone else.`
- Supporting copy: culture creates value before price reacts; Kidults discovers the signal, explains WHY and proves it with evidence.
- Primary CTA: `Explore Kidult 100`.
- Secondary CTA: `See WHY it matters`.
- Right hero feature: `Mobility Sculpture 01`, `Vision. Material. Direction.`
- Hero uses one primary mobility object only.
- No duplicate vertical object rail at the right edge of the hero.
- Hero visual remains an original, rights-gated editorial object.

## 4. Institutional intelligence layer — locked

The five-stage sequence is frozen:

`SIGNAL → VERIFY → ANALYZE → BENCHMARK → PUBLISH`

The supporting statement is frozen:

`We do not show objects. We prove why they matter.`

## 5. KPI / evidence hierarchy — locked

The visible hierarchy is:

- Live Evidence
- Source Families
- Qualified Signals
- Confidence Engine / confidence breakdown
- Coverage
- Update / access / production state as applicable

Coverage terminology is entity-neutral. The approved wording is:

`COVERAGE — 500+ Tracked Entities`

Do not revert this surface to `Brands Tracked` unless the underlying data contract is explicitly brand-only and the owner approves the wording change.

## 6. Kidult 100 preview objects — locked

The five preview objects and their visual language are frozen:

1. Mobility — low, simplified ivory mobility sculpture with black canopy.
2. Time — pale stone/ivory circular time object on a restrained rectangular base.
3. Footwear — monochrome ivory/white sneaker abstraction with no recognizable third-party trade dress.
4. Character — small neutral koala-like sculptural character; generic, non-branded, small nose, natural arms/hands.
5. Design — pale sculptural bowl/lounging chair form with a low dark base/shadow.

These five objects must remain neutral, simplified, rights-safe and visually balanced. Do not replace them with branded watches, recognizable sneakers, dark lounge chairs or third-party product imagery.

## 7. Canon Strength — locked

The maturity states are:

- Building
- Emerging
- Established
- Canonical

The master visual shows `Emerging` as the active state. The implementation may change the active state only when driven by validated data, not for decoration.

## 8. Typography system — locked

- Corporate brand signature: uppercase tracked sans serif.
- Hero and major editorial headings: premium editorial serif.
- Navigation, labels, controls and dashboard copy: restrained sans serif.
- Primary data values may use premium serif/numeric treatment where shown by the master.
- No page-level font substitution without design-system approval.

## 9. Color system — locked

The public master uses four typography tiers:

- Primary Ink: `#0B1713` — wordmark, primary labels, core numeric values.
- Forest Intelligence: `#073D2D` — hero editorial emphasis, verified/active intelligence, primary CTA.
- Secondary Ink: `#303733` — body copy and secondary explanations.
- Muted Evidence: `#70756F` — metadata, captions, lower-priority information.

Surface language remains warm ivory/paper with subtle neutral lines. Gold is not part of the default public-master UI language. See `KIDULTS_VISUAL_COLOR_POLICY.md`.

## 10. Layout — locked

- Warm ivory master canvas.
- Thin neutral dividers and restrained rounded cards.
- High whitespace ratio.
- No heavy dark footer.
- No decorative duplicate side rails.
- No horizontal page overflow at 320px and above.
- Mobile is a responsive adaptation of the same master, not a separate visual concept.

## 11. Footer — locked

- Lightweight ivory footer.
- Small uppercase tracked `K I D U L T S` signature at left.
- Short global-standard descriptor may remain subordinate to the wordmark.
- Center navigation remains visually quiet.
- Copyright remains at right on desktop and stacks responsively when needed.

## 12. Rights and governance — locked

The master must continue to communicate:

- no third-party product photos;
- no brand logos or trade dress;
- no endorsements implied;
- original design system;
- rights-gated content pipeline.

## 13. Data integrity rule

Every displayed number must have a provenance path when connected to production data. Missing or unverified values must never be converted into `0` or `0%`; use an unavailable/pending state until verified.

## 14. QA viewports

Required review widths:

- Mobile: 320, 375, 390, 430px
- Tablet: 768, 1024px
- Desktop: 1280, 1440, 1600, 1920px

## 15. Master status

This document supersedes earlier KIDULTS public visual baselines where they conflict with the 2026-08-11 Final Master. Historical sprint documents remain historical records and must not override this freeze.