# Sprint 20-A8 — Kidults Three-Layer Design System

## Outcome

Sprint 20-A8 establishes one visual system with three clearly separated presentation layers:

- Consumer Light: ivory paper, restrained black typography, warm gold and green accents.
- Intelligence Editorial: navy authority surfaces paired with light, readable research sections.
- Operations Dark: persistent navy monitoring surfaces for quality and release-governance status.

The implementation remains staging-only. Production promotion is not authorized.

## Delivered

- Replaced the Kidults public stylesheet with shared color, type, spacing, radius and responsive tokens.
- Reduced headline scale, visual weight, card padding and border radius across the portal.
- Converted the main intelligence page to a navy editorial hero with light research, archive and conversion surfaces.
- Converted the Monthly Intelligence report and K100 Methodology pages to light reading surfaces beneath navy authority headers.
- Preserved the dedicated dark operations surface and its quality-state severity treatments.
- Preserved all existing JSON rendering, archive search, conversion submission, print and status scripts.
- Added responsive layouts for 320, 340, 375, 390, 430, 620, 768, 900 and desktop widths.
- Added touch-target, focus-visible, reduced-motion and print rules.

## Validation

- `npm test`: PASS — 25 tests, 0 failures.
- `git diff --check`: PASS.
- HTML parser validation: PASS for index, methodology, operations and monthly report pages.
- CSS block structure: PASS — balanced rule blocks.
- JSON parsing: PASS for Kidult 100, Monthly Intelligence and Archive data.
- Staging HTTP path checks: PASS for all four pages, shared assets and archive data.
- Total primary page and shared CSS/JS transfer source: approximately 60 KB before transport compression.

Automated browser screenshots were not generated in the workspace because the local Playwright package has no installed browser binary. Responsive containment is enforced by the shared width, grid-collapse and overflow rules and remains part of the staging visual review gate.

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

Review the main page, Monthly Intelligence, Methodology and Operations Status at 320, 375, 390, 430, 768 and desktop widths. Confirm that light consumer-facing reading surfaces, navy intelligence authority surfaces and dark operations surfaces remain visually distinct before merging.
