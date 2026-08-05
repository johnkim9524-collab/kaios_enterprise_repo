# KIDULTS Visual Color Policy

Status: Approved
Scope: KIDULTS public, provider, enterprise, methodology, archive, report, operations and data-visualization surfaces
Owner: Intelligence Holdings / KIDULTS

## 1. Purpose

This policy defines the official KIDULTS visual color system. Its purpose is to keep every page, chart, dashboard, report and provider-review surface visually consistent, premium, legible and suitable for a global enterprise intelligence platform.

## 2. Core Principle

KIDULTS uses a restrained Forest Green system. Color communicates hierarchy, state and data relationships without becoming decorative, playful or visually loud.

The system must:

- preserve a calm editorial-luxury character;
- use one coherent green family across product surfaces;
- rely primarily on lightness and tonal depth rather than high saturation;
- reserve gold for editorial emphasis and selected calls to action;
- reserve red only for negative movement, risk, error or critical status;
- maintain sufficient contrast for text, chart labels and interactive controls;
- render consistently on desktop and mobile.

## 3. Official Brand Palette

### Primary Forest

| Token | Hex | Primary use |
|---|---|---|
| Forest 950 | `#082F27` | Dark panels, enterprise surfaces, chart tooltips |
| Forest 900 | `#123F35` | Primary chart segment, major buttons, status panels |
| Forest 750 | `#356456` | Secondary chart segment, secondary emphasis |
| Forest 600 | `#5F8174` | Tertiary chart segment, supporting data |
| Forest 400 | `#8FA69D` | Low-emphasis chart segment, secondary fills |
| Forest 200 | `#C6C7B8` | Quiet chart segment, inactive or residual share |

### Editorial Gold

| Token | Hex | Primary use |
|---|---|---|
| Gold 600 | `#9B7438` | Section labels, selected editorial emphasis |
| Gold 400 | `#C19A54` | Premium CTA accents and limited highlights |

Gold must not be used as a general chart palette color unless a chart specifically represents an editorial or benchmark category.

### Neutral System

| Token | Hex | Primary use |
|---|---|---|
| Ink | `#101816` | Primary text |
| Muted | `#5F6965` | Secondary text, metadata |
| Paper | `#F4F0E7` | Main background |
| Paper 2 | `#F8F5EE` | Cards and chart surfaces |
| Line | `#D8D2C7` | Borders, dividers and chart tracks |

### State Colors

| State | Hex | Rule |
|---|---|---|
| Positive / Live | `#0B6B52` | Positive movement, live pulse, validated status |
| Warning | `#9B7438` | Pending review, incomplete validation |
| Risk / Negative | `#9E312D` | Negative movement, risk, error or critical status only |

State colors must never replace the primary Forest palette for ordinary data categories.

## 4. Data-Visualization Policy

### 4.1 Distribution and Composition Charts

Donut, pie, semi-donut and stacked composition charts must use the official muted Forest sequence:

1. `#123F35`
2. `#356456`
3. `#5F8174`
4. `#8FA69D`
5. `#C6C7B8`

The sequence must remain consistent between the chart and its legend.

### 4.2 Percent and Score Scaling

- Percent data must always use a 0–100 scale.
- Score data must always use the defined score maximum, normally 100.
- Group maxima must not be silently rescaled to 100%.
- Composition charts must validate their total and clearly indicate when the total is not 100%.
- Change rates must not share the same scale as index scores.

### 4.3 Trend Charts

- Primary trend line: Forest 900 or the main Forest token.
- Area fill: low-opacity Forest gradient.
- Current point: filled Forest 900.
- Historical points: Paper fill with Forest outline.
- Hover state: controlled Gold accent only.
- Negative trend or critical exception: Risk Red only when analytically justified.

### 4.4 Correlation and Heatmaps

Use a sequential Forest scale for magnitude. Diverging red/green scales may be used only when the data has a true positive and negative midpoint and the legend explicitly defines it.

### 4.5 Chart Center Typography

In donut and radial charts:

- the numeric value is primary;
- the descriptor such as `A + B`, `Covered` or `North America` is secondary;
- the descriptor must be smaller, lighter and visually quieter than the numeric value;
- descriptor text must remain readable at 320px viewport width;
- labels must not overflow the chart center.

## 5. Page and Component Rules

- Public, provider, enterprise, methodology, archive, monthly intelligence and operations pages must use the same Forest, Paper, Ink, Gold and state tokens.
- Dark panels must use Forest 950 or Forest 900, not unrelated black, blue or green values.
- Buttons must use Forest 900 by default; Gold is limited to premium editorial emphasis.
- Decorative mint, lime, teal, khaki or beige values outside this policy are not permitted.
- Gradients must stay inside the official palette and remain subtle.
- All new components must consume shared tokens instead of introducing local hard-coded colors.

## 6. Accessibility

- Body text and essential labels must meet WCAG AA contrast requirements.
- Color must not be the sole carrier of meaning; labels, values, icons or patterns must also communicate state.
- Interactive focus states must remain visible on both Paper and Forest backgrounds.
- Charts must include accessible labels or equivalent text summaries.

## 7. Governance

Any exception requires an explicit design decision record containing:

- the business or analytical reason;
- the affected surfaces;
- accessibility review;
- duration of the exception;
- approval by the KIDULTS design-system owner.

New KIDULTS releases must include a visual QA check confirming compliance with this policy across desktop and mobile.

## 8. Current Approved Visualization Palette

```js
const KIDULTS_VISUALIZATION_PALETTE = [
  '#123F35',
  '#356456',
  '#5F8174',
  '#8FA69D',
  '#C6C7B8'
];
```

This palette is the canonical default for confidence, source-composition and geographic-distribution visualizations.
