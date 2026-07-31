# Sprint 20-A4 — Kidults Methodology and Conversion

## Objective

Publish the K100 methodology and replace browser-only conversion storage with an isolated, durable staging service.

## Delivered

- Public K100-0.9 methodology page
- Same-origin `POST /api/conversions`
- Append-only server persistence
- Separate non-PII audit log
- Newsletter, enterprise waitlist, and inquiry handling
- Required privacy consent
- 24-hour type-and-email deduplication
- Per-IP rate limiting
- Honeypot filtering
- Request-size, field-length, and type validation
- Static-site security headers
- 320 px responsive support

## Staging isolation

- Runtime binds to `127.0.0.1:4173`.
- Data stays under `/opt/intelligence-holdings/staging`.
- Production promotion is explicitly false.
- No production service, database, domain, or reverse proxy is changed.

## Automated verification

```bash
node --test apps/kidults-enterprise-staging/server.test.mjs
node --check apps/kidults-enterprise-staging/server.mjs
node --check apps/kidults-enterprise-staging/public/assets/app.js
```

## Installation

Stop the temporary Python preview first, then run:

```bash
cd /opt/intelligence-holdings/staging/kaios-enterprise
chmod +x scripts/staging/install-kidults-editorial-conversion.sh
ROOT_DIR="$PWD" bash scripts/staging/install-kidults-editorial-conversion.sh
```

## Smoke test

```bash
curl -sS http://127.0.0.1:4173/health
curl -sS -X POST http://127.0.0.1:4173/api/conversions \
  -H 'Content-Type: application/json' \
  --data '{"type":"newsletter","email":"qa@example.com","organization":"","interest":"","consent":true,"consent_version":"2026-08","website":""}'
sudo wc -l /opt/intelligence-holdings/staging/data/kidults-conversions/conversion-submissions.jsonl
sudo wc -l /opt/intelligence-holdings/staging/data/kidults-conversions/conversion-audit.jsonl
```

## Browser verification

Use the existing SSH tunnel and open:

```text
http://127.0.0.1:4173/
http://127.0.0.1:4173/methodology.html
```

Validate desktop and 320 x 700 mobile layouts. Submit each conversion form once and confirm the visible success state.
