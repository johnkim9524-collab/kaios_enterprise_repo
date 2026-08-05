# Kidults Forest Green System

Status: **Official design principle**

Scope: Kidults public portal, intelligence products, reports, operations surfaces and future product extensions.

## Principle

Kidults uses one green hue family as its primary brand color system. Product surfaces must not introduce unrelated greens for panels, buttons, positive indicators, links or decorative accents.

The system uses one controlled hue with differences in lightness and opacity only. This keeps the interface editorial, premium and institutionally consistent.

## Canonical tokens

```css
--kidults-forest-950: #052f27;
--kidults-forest-900: #063f32;
--kidults-forest-800: #084a3b;
--kidults-forest-700: #0a5947;
--kidults-forest-600: #0d6a54;
--kidults-forest-500: #148064;
--kidults-forest-300: #65a792;
--kidults-forest-150: #bfd6cd;
--kidults-forest-075: #e4eee9;
```

## Approved usage

| Role | Token |
|---|---|
| Primary dark panel | Forest 950 |
| Primary button and navigation emphasis | Forest 900 |
| Hero `CULTURE` wordmark | Forest 800 |
| Positive metric, live indicator and active action | Forest 500 |
| Secondary green text and icon | Forest 300 |
| Green border and divider | Forest 150 |
| Subtle green surface | Forest 075 |

## Semantic rules

1. Green means Kidults identity, active intelligence, verified positive movement or approved action.
2. BUY, positive delta, live status and active navigation use Forest 500, not separate lime or emerald colors.
3. Dark green panels and buttons use Forest 950–900.
4. Green borders use Forest 150 with opacity where necessary.
5. Gold remains a secondary editorial accent only. It must not compete with Forest Green.
6. Red is reserved for critical risk and destructive states.
7. Color alone must never carry meaning; every state requires text or an icon.

## Prohibited usage

- Unapproved lime, neon green, teal or olive accents
- Different greens for separate widgets without token justification
- Gradient combinations that shift the green hue toward blue or yellow
- Green used for warnings, destructive actions or critical failures

## Implementation contract

All Kidults CSS should reference semantic aliases mapped to the canonical tokens:

```css
--brand-primary: var(--kidults-forest-900);
--brand-display: var(--kidults-forest-800);
--brand-positive: var(--kidults-forest-500);
--brand-border: var(--kidults-forest-150);
--brand-surface: var(--kidults-forest-075);
```

Any future color change must update the canonical tokens first. Component-level hard-coded green values are not permitted.
