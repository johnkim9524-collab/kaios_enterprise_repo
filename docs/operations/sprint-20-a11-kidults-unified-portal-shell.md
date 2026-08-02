# Sprint 20-A11 — Unified Portal Shell

## Objective

Unify the public Methodology and Intelligence Status pages with the V22 Kidults portal shell.

## Delivered

- shared dark-green V22 editorial shell
- identical Kidults logo treatment
- identical seven-item navigation and order
- restored Markets navigation item
- active-page navigation state
- common footer language
- preserved Methodology content and Status data hooks
- improved contrast and responsive layout
- 320 px mobile navigation and no-horizontal-overflow safeguards

## Validation

```bash
node --test apps/kidults-enterprise-staging/a11-unified-pages.test.mjs
node --check apps/kidults-enterprise-staging/public/assets/quality-status.js
```

## Browser review

Use the staging SSH tunnel and review:

```text
http://127.0.0.1:4173/methodology.html
http://127.0.0.1:4173/operations.html
```

Check desktop and 320 x 700 layouts, menu consistency, active state, Status data rendering and horizontal overflow.

## Safety

Staging only. Production promotion remains unauthorized.
