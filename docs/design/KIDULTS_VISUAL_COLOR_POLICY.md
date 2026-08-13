# KIDULTS Visual Color Policy

Status: FINAL MASTER — APPROVED
Effective date: 2026-08-11
Scope: KIDULTS public, responsive portal, preview, methodology, archive, report, operations and data-visualization surfaces.
Owner: Intelligence Holdings / KIDULTS
Canonical master: `docs/design/KIDULTS_FINAL_MASTER_DESIGN.md`

## 1. Purpose

This policy defines the official KIDULTS visual color system. The system is designed for a premium global intelligence platform: restrained, evidence-led, editorial, legible and institutionally credible.

## 2. Core rule

KIDULTS does not use color as decoration. Color communicates hierarchy, intelligence state and data relationships.

The public master is built around warm ivory surfaces, deep ink, Forest Intelligence and restrained muted neutrals. Gold is not part of the default public-master UI language and must not be introduced merely to signal luxury.

## 3. Official typography color hierarchy

| Tier | Token | Hex | Primary use |
|---|---|---|---|
| 1 | Primary Ink | `#0B1713` | KIDULTS wordmark, primary labels, core numbers, major navigation |
| 2 | Forest Intelligence | `#073D2D` | Hero editorial emphasis, verified/active intelligence, primary CTA, active state |
| 3 | Secondary Ink | `#303733` | Body copy, explanatory text, secondary labels |
| 4 | Muted Evidence | `#70756F` | Metadata, captions, timestamps, lower-priority evidence text |

### Semantic rule

Forest Intelligence means one of the following:

- verified;
- active;
- intelligence-bearing;
- selected/current;
- primary action.

Forest Green must not be used indiscriminately for ordinary body text.

## 4. Surface and border system

| Token | Hex | Primary use |
|---|---|---|
| Paper | `#FAF9F6` | Main page canvas |
| Paper Warm | `#FAF8F4` | Secondary surface/footer |
| Paper Card | `#FBFAF7` | Cards, dialogs, elevated editorial surfaces |
| Line | `#DDD9D2` | Borders, dividers, quiet chart tracks |
| Line Soft | `#E3DFD8` | Secondary separators |

The master must remain visually light. Avoid heavy dark panels on the public homepage unless a future owner-approved design revision explicitly introduces them.

## 5. State colors

| State | Hex | Rule |
|---|---|---|
| Verified / Active / Emerging | `#073D2D` | Approved active/verified state |
| Pending / Building / Inactive | `#A3A7A3` | Quiet neutral state |
| Warning | `#9B7438` | Use only for genuine review/pending warnings, not decoration |
| Risk / Negative | `#9E312D` | Negative movement, error, legal or critical status only |

Color must never be the sole carrier of meaning. State labels, icons or values must accompany state color.

## 6. Data-visualization policy

### 6.1 Default composition sequence

For donut, stacked and composition charts, use a restrained sequence that stays inside the master visual language:

1. `#073D2D`
2. `#315144`
3. `#5F8174`
4. `#A3A7A3`
5. `#D7D4CD`

Legends must follow the same order as the visualization.

### 6.2 Percentage and score scaling

- Percent data uses a true 0–100 scale.
- Score data uses the declared score maximum.
- Group maxima must never be silently normalized to 100%.
- Composition charts must validate totals.
- Change rates must not share the same semantic scale as scores.

### 6.3 Trend charts

- Primary trend: Forest Intelligence.
- Historical/supporting trend: Secondary Ink or muted neutral.
- Positive/verified current point: Forest Intelligence.
- Negative/risk exception: Risk Red only when analytically justified.
- Decorative gold trend lines are prohibited.

### 6.4 Donut/radial center labels

- Numeric value is primary.
- Descriptor is smaller and quieter.
- Labels must remain readable at 320px viewport width.
- Center text must never overflow the chart.

## 7. Component rules

- Header and footer `K I D U L T S` wordmarks use Primary Ink.
- Hero editorial headline uses Forest Intelligence.
- Primary CTA uses Forest Intelligence with a high-contrast light label.
- Navigation defaults to Primary Ink.
- Body copy defaults to Secondary Ink.
- Metadata/captions default to Muted Evidence.
- Verified/active states use Forest Intelligence.
- Building/pending states use muted neutral unless a genuine warning exists.
- Do not introduce lime, teal, bright mint, khaki, bright blue or decorative gold into the public master.
- New components must use shared tokens rather than local arbitrary colors.

## 8. Rights-safe visual object palette

Kidult 100 editorial objects should stay primarily within:

- ivory;
- warm white;
- pale stone;
- restrained charcoal/black accents;
- low-saturation neutral shadows.

Do not use branded colorways or high-saturation product-identifying combinations solely for visual appeal.

## 9. Accessibility

- Essential text must meet WCAG AA contrast requirements.
- Interactive focus states must remain visible on Paper and Forest surfaces.
- Color is never the only information channel.
- Charts require accessible labels or equivalent text summaries.

## 10. Governance

Any exception requires a design decision record with:

- business or analytical reason;
- affected surfaces;
- accessibility review;
- risk/legal review when relevant;
- duration if temporary;
- approval by the KIDULTS design-system owner.

## 11. Canonical CSS tokens

```css
:root {
  --kidults-primary-ink: #0B1713;
  --kidults-forest-intelligence: #073D2D;
  --kidults-secondary-ink: #303733;
  --kidults-muted-evidence: #70756F;
  --kidults-paper: #FAF9F6;
  --kidults-paper-warm: #FAF8F4;
  --kidults-paper-card: #FBFAF7;
  --kidults-line: #DDD9D2;
  --kidults-line-soft: #E3DFD8;
  --kidults-risk: #9E312D;
}
```

This policy supersedes earlier public-master color guidance where it conflicts with the 2026-08-11 Final Master.