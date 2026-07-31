# Sprint 20-A8 — Kidults Global Editorial Design System

## Outcome

Sprint 20-A8 establishes one consistent public visual language across three functional layers:

- Consumer: approachable discovery and conversion.
- Intelligence: evidence-led rankings, research and reports.
- Operations: public, non-sensitive quality and freshness status.

All three now use the same ivory editorial canvas, high-contrast luxury typography, fine rules, restrained gold accents and square archival components. Dark navy is reserved for decision-critical status and governance panels. The implementation remains staging-only; production promotion is not authorized.

## Typography decision

- Display: `"Bodoni 72", Didot, "Bodoni MT", "Times New Roman", serif`.
- Body and interface: `"Avenir Next", Avenir, "Helvetica Neue", Helvetica, Arial, sans-serif`.
- Headline weights were reduced to regular editorial weight.
- Body scale, navigation scale and mobile headline scale were reduced.
- The stack has no external font request, avoiding render delay, tracking exposure and third-party availability risk.

For production brand fidelity, a separately licensed and self-hosted Bodoni-compatible WOFF2 family may replace the system display stack without changing the design tokens.

## Delivered

- Unified the header, navigation, hero, report, methodology and operations surfaces.
- Converted full-dark public operations into a light editorial page.
- Retained dark navy only for live status and governance decision panels.
- Added restrained editorial watermarks and finer dividers without decorative excess.
- Reduced font weight, headline size, card padding and radius across desktop and mobile.
- Preserved JSON rendering, archive search, conversion submission, print and status scripts.
- Preserved responsive behavior from 320px upward.
- Preserved touch targets, focus visibility, reduced-motion behavior and print rules.

## Validation

- `npm test`: PASS — 25 tests, 0 failures.
- `git diff --check`: PASS.
- HTML parser validation: PASS — 4/4 pages.
- CSS block structure and design tokens: PASS.
- JSON parsing: PASS — 3/3 data files.
- Staging HTTP path checks: PASS — all pages, shared assets and archive data returned HTTP 200.

## Safety and release posture

- Scope: `apps/kidults-enterprise-staging` and this sprint report only.
- Production deployment: not performed.
- Production promotion authorization: `false`.
- Data contracts and conversion persistence: unchanged.
- No unrelated artifact directories were added.

## Exact staging preview commands

```bash
cd /opt/intelligence-holdings/staging/kaios-enterprise
git switch main
git pull --ff-only origin main
cd apps/kidults-enterprise-staging
sudo systemctl restart kaios-kidults-editorial-staging.service
sudo systemctl status kaios-kidults-editorial-staging.service --no-pager
```

For a foreground-only local staging preview:

```bash
cd /opt/intelligence-holdings/staging/kaios-enterprise/apps/kidults-enterprise-staging
KAIOS_ENVIRONMENT=staging \
KAIOS_PRODUCTION_PROMOTION_AUTHORIZED=false \
KIDULTS_CONVERSION_DATA_DIR=/opt/intelligence-holdings/staging/data/kidults-conversions \
KIDULTS_CONVERSION_HASH_SECRET_FILE=/opt/intelligence-holdings/staging/secrets/kidults-conversion-hash-secret \
HOST=127.0.0.1 \
PORT=4173 \
node server.mjs
```

## Review gate

Review the main page, Monthly Intelligence, Methodology and Operations Status at 320, 375, 390, 430, 768 and desktop widths. Confirm one coherent Kidults identity throughout, sufficient mobile side margins, readable regular-weight typography and dark-panel restraint before merging.
