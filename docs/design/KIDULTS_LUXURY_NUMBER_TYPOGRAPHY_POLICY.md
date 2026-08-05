# KIDULTS Luxury Number Typography Policy

**Status:** Official design policy  
**Version:** 1.0  
**Applies to:** KIDULTS public, provider, report, archive, methodology, operations and enterprise interfaces

## 1. Purpose

KIDULTS numerical information must feel authoritative, editorial and premium while remaining precise and highly readable. Numbers are treated as a core brand asset, not as generic body text.

The system establishes one consistent hierarchy for hero indices, dashboard KPIs, chart values, tables, percentages, deltas and supporting labels.

## 2. Core principles

1. Numbers lead; labels support.
2. Display numbers use editorial serif styling.
3. Operational and tabular numbers use tabular figures.
4. Decimal values remain optically balanced.
5. Animation must be restrained and informative.
6. All values must remain accessible and accurate on desktop and mobile.
7. No decorative styling may obscure meaning, units, sign or time period.

## 3. Typography roles

### 3.1 Hero Metric

Use for the primary index or headline value such as `94.8`.

- Editorial display serif
- High contrast, moderate stroke modulation
- Large optical size
- Tight but not compressed tracking
- Line height: 0.9–1.0
- Font weight: 400–500
- Color on dark surfaces: Paper White `#F4F1EA`
- Color on light surfaces: Ink `#0D1715`

Recommended CSS token:

```css
--kidults-number-hero-size: clamp(4.75rem, 8vw, 8.5rem);
--kidults-number-hero-weight: 450;
--kidults-number-hero-line-height: 0.92;
--kidults-number-hero-tracking: -0.04em;
```

### 3.2 Primary KPI

Use for `500+`, `128K`, `94%`, `42` and major dashboard figures.

```css
--kidults-number-primary-size: clamp(2.5rem, 4vw, 4.75rem);
--kidults-number-primary-weight: 450;
--kidults-number-primary-line-height: 0.95;
--kidults-number-primary-tracking: -0.025em;
```

### 3.3 Secondary KPI

Use for card values, ranking values and compact operational metrics.

```css
--kidults-number-secondary-size: clamp(1.75rem, 2.5vw, 3rem);
--kidults-number-secondary-weight: 500;
--kidults-number-secondary-line-height: 1;
```

### 3.4 Chart and table numbers

Use a sans-serif family with tabular figures for chart axes, tables, confidence, velocity, liquidity and timestamps.

```css
font-variant-numeric: tabular-nums lining-nums;
font-feature-settings: "tnum" 1, "lnum" 1;
```

Chart numbers must never use ornamental display styling when it harms comparison or alignment.

## 4. Decimal treatment

The default public presentation keeps the full value on one baseline:

```text
94.8
```

The integer, decimal point and fraction must remain semantically one value. A reduced fractional treatment may be used only in controlled hero components.

Recommended ratio:

- Integer portion: 100%
- Decimal point: 55–65%
- Fractional digit: 62–72%
- Baseline shift: optical, not exceeding 0.08em

Do not stack the decimal on a separate line. Do not separate the decimal in accessible text.

Example markup:

```html
<span class="luxury-number" aria-label="94.8">
  <span class="luxury-number__integer">94</span><span class="luxury-number__decimal">.8</span>
</span>
```

## 5. Labels and hierarchy

Supporting labels must be concise, uppercase only where useful, and visibly subordinate.

Preferred hierarchy:

```text
CURRENT INTELLIGENCE STATE
94.8
KIDULT 100 INDEX
▲ 2.1% · 30D
```

Label tokens:

```css
--kidults-metric-label-size: 0.72rem;
--kidults-metric-label-weight: 650;
--kidults-metric-label-tracking: 0.14em;
--kidults-metric-caption-size: 0.82rem;
```

Do not use `LIVE` unless the value is truly live. Use `Current`, `Current Edition`, `Verified`, `Staging` or `Updated` according to the actual state.

## 6. Color rules

The number system follows the official KIDULTS Forest Green palette.

- Dark card number: `#F4F1EA`
- Light background number: `#0D1715`
- Positive delta: approved muted green accent
- Negative delta: approved restrained risk red
- Neutral or pending: muted gray-green
- Labels: gold or muted secondary text only when contrast passes accessibility requirements

No neon green, saturated lime, bright cyan or decorative gradients are allowed for primary numeric values.

## 7. Animation

Allowed:

- 400–650 ms count-up for a single primary KPI
- Subtle opacity and translate transition
- Gentle chart draw animation
- Reduced-motion fallback

Forbidden:

- Bounce
- Elastic motion
- Repeated pulsing of numbers
- Spinning values
- Animation that delays access to the final value

Required reduced-motion rule:

```css
@media (prefers-reduced-motion: reduce) {
  .luxury-number,
  .luxury-number * {
    animation: none !important;
    transition: none !important;
  }
}
```

## 8. Responsive rules

### Desktop

- Hero metrics may use the full display scale.
- Decimal and unit remain visually connected.
- Supporting label must not compete with the number.

### Mobile 320–430 px

- Hero size must use `clamp()` and never overflow.
- Decimal treatment remains legible.
- Minimum side padding: 16 px.
- No horizontal scrolling.
- Supporting labels may wrap to two lines, but the numeric value must not wrap.

Recommended mobile cap:

```css
@media (max-width: 480px) {
  .luxury-number--hero {
    font-size: clamp(3.5rem, 20vw, 5.5rem);
  }
}
```

## 9. Accessibility and data integrity

- Preserve the complete numeric value in accessible text.
- Never rely on color alone for positive, negative or pending status.
- Include units and time windows, e.g. `%`, `30D`, `brands`, `sources`.
- Use `aria-label` when visual decimal styling splits the value.
- Minimum contrast must meet WCAG AA.
- Tabular data must remain selectable and readable without animation.
- Displayed values must match the underlying data source exactly.

## 10. Approved component classes

```css
.luxury-number {}
.luxury-number--hero {}
.luxury-number--primary {}
.luxury-number--secondary {}
.luxury-number--chart {}
.luxury-number--table {}
.luxury-number__integer {}
.luxury-number__decimal {}
.metric-label {}
.metric-caption {}
.metric-delta {}
```

## 11. Governance

This policy is mandatory for all new KIDULTS numerical components. Existing pages must be migrated during visual QA and release-candidate work.

Any exception requires:

1. A documented readability or data-density reason
2. Mobile QA at 320, 375, 390 and 430 px
3. Accessibility verification
4. Design review approval

## 12. Release checklist

- [ ] Hero index uses the official luxury-number token
- [ ] KPI hierarchy is consistent
- [ ] Decimal values are optically balanced
- [ ] Chart and table values use tabular figures
- [ ] Units and periods are explicit
- [ ] Positive and negative states are not color-only
- [ ] Mobile values do not overflow
- [ ] Reduced-motion behavior is present
- [ ] Values match the underlying data
- [ ] Public, provider and report pages use the same system
