# Sprint 18-F6 — Dual Staging HTTP Runtime

## Objective

Provide the actual isolated HTTP runtimes required by the Week 6 verification scripts.

## Runtime Endpoints

Kidults on `127.0.0.1:18871`:

- `GET /health`
- `GET /api/enterprise/snapshot`
- `GET /api/enterprise/export`
- `GET /portal?viewport=320`

Artfund on `127.0.0.1:18872`:

- `GET /health`
- `GET /api/institutional/snapshot`
- `GET /api/institutional/export`
- `GET /portal?viewport=320`

## Required Environment Additions

```text
KAIOS_STAGING_VIEWER_TOKEN_FILE=/opt/intelligence-holdings/staging/secrets/viewer_token
KAIOS_STAGING_OPERATOR_TOKEN_FILE=/opt/intelligence-holdings/staging/secrets/operator_token
```

## Installation

```bash
chmod +x scripts/staging/install-dual-staging-http-runtime.sh
ROOT_DIR="$PWD" ENV_FILE="$PWD/infrastructure/staging/.env.dual-staging" bash scripts/staging/install-dual-staging-http-runtime.sh
```

## Verification

```bash
systemctl status kaios-kidults-staging.service --no-pager
systemctl status kaios-artfund-staging.service --no-pager
curl -sS http://127.0.0.1:18871/health
curl -sS http://127.0.0.1:18872/health
```

Then run the existing final verification sequence:

```bash
EVIDENCE_DIR=/opt/intelligence-holdings/staging/evidence ENV_FILE="$PWD/infrastructure/staging/.env.dual-staging" bash scripts/staging/verify-dual-staging-runtime.sh
EVIDENCE_DIR=/opt/intelligence-holdings/staging/evidence python3 scripts/staging/finalize-week6-certification.py
```

## Controls

- Services bind only to loopback.
- Viewer export returns 403.
- Unauthenticated premium routes return 401.
- Publication remains disabled.
- Production promotion remains unauthorized.
- Kidults and Artfund run in separate systemd units and ports.
- Portal markup prevents horizontal overflow at 320 px.
