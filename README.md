# KAIOS Enterprise 1.0

KAIOS is the production repository for the KIDULTS Autonomous Intelligence Operating System.

## What it does

KAIOS runs the KIDULTS platform through:

1. Source collection
2. Signal normalization
3. Score engine
4. Intelligence writing
5. Quality gate
6. Publishing
7. Health monitoring

## Quick start

```bash
python scripts/run_kaios.py
```

Generated outputs:

```text
public/monthly-data.json
public/data/
public/archive/
public/api/status.json
public/api/health.json
```

## GitHub Actions

Included workflows:

```text
.github/workflows/monthly-autopilot.yml
.github/workflows/health-monitor.yml
```

## Cloudflare Pages

Use:

```text
Output directory: public
Build command: python scripts/run_kaios.py
```

## Production setup

1. Create a GitHub repository.
2. Upload this project.
3. Connect the repo to Cloudflare Pages.
4. Add real source endpoints in `config/sources.json`.
5. Add API keys as GitHub Secrets when needed.
6. Enable GitHub Actions.

## Note

This repository is production-structured but uses fallback sample signals until live sources are connected.
