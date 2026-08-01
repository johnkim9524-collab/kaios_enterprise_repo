# Sprint 20-A8 — Kidults Global Editorial Design System

## Outcome

Sprint 20-A8 establishes one coherent Kidults Global Editorial identity across consumer discovery, intelligence research, reports, conversion and public operations status.

The final tuning pass removes ordinary dark panels from the light public portal. Standard status, methodology, governance and report-aside surfaces now use restrained champagne paper with gold rules and ink text. Deep navy is reserved for genuine critical or security states, not routine information.

The implementation remains staging-only. Production promotion is not authorized.

## Final visual system

- Canvas: warm ivory editorial paper.
- Raised surfaces: paper white or pale champagne.
- Text: near-black ink with softened secondary copy.
- Accent: muted archival gold, used for rules, labels and primary actions.
- State colors: green for operational, amber for warning and red for critical.
- Shape: square editorial components with minimal radius and no decorative card stacking.
- Shadow: restrained champagne offset only on emphasis panels.

## Typography

- Display: `"Bodoni 72", Didot, "Bodoni MT", "Times New Roman", serif`.
- Body and interface: `"Avenir Next", Avenir, "Helvetica Neue", Helvetica, Arial, sans-serif`.
- Headline weight remains regular.
- Headline, body, label and navigation scales were reduced for a calmer reading rhythm.
- No external font service is requested.

A separately licensed, self-hosted Bodoni-compatible WOFF2 family may replace the system display stack at production brand-finalization without changing the design tokens.

## Delivered

- Unified main portal, Monthly Intelligence, Methodology and Operations Status.
- Replaced routine navy panels with champagne information panels.
- Kept critical alerts visually distinct through explicit red state styling.
- Reduced hero headline size, card padding, border radius and interface weight.
- Standardized thin rules, muted gold actions and secondary paper buttons.
- Preserved archive search, Kidult 100 rendering, conversion submissions and quality status behavior.
- Preserved report print behavior and staging-only release posture.
- Preserved responsive layout from 320px upward with visible left and right card margins.
- Preserved minimum touch targets, visible keyboard focus and reduced-motion support.

## Validation

- `npm test`: PASS — 25 tests, 0 failures.
- CSS block structure: PASS.
- `git diff --check`: PASS.
- JSON parsing: PASS — 3/3 public data files.
- Production files and production services: untouched.

Headless browser capture was not executed in the local Codex runtime because its Playwright browser binary is not installed. The exact staging preview gate below remains required before PR #75 is marked ready.

## Exact staging preview commands

```bash
cd /opt/intelligence-holdings/staging/kaios-enterprise
git switch feat/sprint-20-a8-kidults-three-layer-design-system
git pull --ff-only origin feat/sprint-20-a8-kidults-three-layer-design-system
sudo systemctl restart kaios-kidults-editorial-staging.service
sudo systemctl status kaios-kidults-editorial-staging.service --no-pager
```

If the SSH tunnel is not already open, run this in Windows PowerShell and leave it running:

```powershell
ssh -N -L 4173:127.0.0.1:4173 kaios@146.190.111.173
```

Open:

```text
http://127.0.0.1:4173/?v=a8-final
http://127.0.0.1:4173/reports/monthly-intelligence-2026-08.html?v=a8-final
http://127.0.0.1:4173/methodology.html?v=a8-final
http://127.0.0.1:4173/operations.html?v=a8-final
```

## Review gate

Review all four pages at desktop and at 320px. Confirm:

- no horizontal overflow;
- visible left and right margins around every large card;
- champagne panels feel integrated rather than promotional;
- title hierarchy is elegant but not oversized or heavy;
- dark navy appears only when the Operations page reports a real critical condition;
- archive search and all three conversion forms still respond correctly.

Keep PR #75 in Draft until this visual gate is approved.
