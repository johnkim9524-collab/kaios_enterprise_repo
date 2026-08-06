# KIDULTS Portal RC1 — Sprint B33 Certification

## Release candidate

- Product: KIDULTS Global Collectibles Intelligence Portal
- Candidate: Portal Base v1 / RC1
- Working branch: `feat/kidults-sprint-b33-data-integrity`
- Protected visual baseline: `baseline/kidults-portal-base-v1`
- Certification scope: Sprint B33 Data Integrity & Intelligence Activation

## Automated gates

Run in repository root:

```powershell
node scripts/kidults/validate-intelligence-data.mjs
node scripts/kidults/audit-public-intelligence-wiring.mjs
node scripts/kidults/audit-data-state-runtime.mjs
node scripts/kidults/certify-sprint-b33-release.mjs
```

All commands must exit with code `0`.

## Manual viewport matrix

### Desktop

- [ ] 1920px
- [ ] 1600px
- [ ] 1440px
- [ ] 1366px
- [ ] 1280px

### Mobile

- [ ] 320px
- [ ] 360px
- [ ] 375px
- [ ] 390px
- [ ] 412px
- [ ] 430px

## Visual regression checklist

- [ ] Hero remains consistent with the accepted Instrument Dial v2 state.
- [ ] KPI strip does not overflow or clip.
- [ ] Kidult 100 Trend renders without clipped labels or values.
- [ ] Category Intelligence cards fit within the viewport.
- [ ] Signal composition panel contains no unexplained empty column.
- [ ] Confidence, source and geographic donuts fit their cards.
- [ ] Top movers, lifecycle and correlation matrix remain readable.
- [ ] ONE GOVERNED SYSTEM section contains all content within the viewport.
- [ ] Company statement wraps without broken words.
- [ ] Footer remains inside the viewport.
- [ ] No horizontal page scroll exists at any certified width.

## Data-state checklist

- [ ] Current staging asset displays a controlled staging label.
- [ ] Invalid data displays `Data temporarily unavailable`.
- [ ] Invalid values and charts are not displayed.
- [ ] `validated` and `production` claims remain gated.
- [ ] Runtime state is available through `window.KIDULTS_INTELLIGENCE_RUNTIME`.

## Accessibility and quality

- [ ] Skip-to-content link works with keyboard input.
- [ ] Focus indicators remain visible.
- [ ] Text remains legible at 200% browser zoom.
- [ ] Lighthouse Performance reviewed.
- [ ] Lighthouse Accessibility reviewed.
- [ ] Lighthouse Best Practices reviewed.
- [ ] Lighthouse SEO reviewed.

## Certification decision

RC1 may be declared only when:

1. all four automated commands pass;
2. all desktop and mobile viewport checks pass;
3. no horizontal overflow or critical clipping remains;
4. fail-closed behavior is confirmed;
5. no unapproved Portal Base v1 visual drift is introduced.

## Sign-off

- Automated gates: pending local execution
- Manual visual QA: pending
- Lighthouse review: pending
- RC1 status: `CERTIFICATION IN PROGRESS`
