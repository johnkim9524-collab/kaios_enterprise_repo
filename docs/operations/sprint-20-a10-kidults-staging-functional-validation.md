# Sprint 20-A10 — Kidults Staging Functional Integration and Validation

## Objective

Deploy the completed A9 V22 functional portal to the isolated staging runtime, verify live data and conversion behavior end to end, and produce a staging release decision before any visual fine-tuning or production promotion.

## Safety boundary

- staging only
- runtime remains bound to `127.0.0.1:4173`
- data remains under `/opt/intelligence-holdings/staging`
- production application, database, DNS and reverse proxy are not changed
- production promotion remains unauthorized

## Server preparation

```bash
cd /opt/intelligence-holdings/staging/kaios-enterprise
git fetch origin
git checkout main
git pull --ff-only origin main
```

Confirm the deployed revision:

```bash
git rev-parse HEAD
```

Expected A9 baseline or a later main commit:

```text
31c5ab021d8559b00c55128ab65d8decb6c08e51
```

## Runtime installation

Use the existing staging conversion runtime installer:

```bash
chmod +x scripts/staging/install-kidults-editorial-conversion.sh
ROOT_DIR="$PWD" bash scripts/staging/install-kidults-editorial-conversion.sh
```

Then apply the existing live intelligence and quality operations installers when they are not already active:

```bash
chmod +x scripts/staging/install-kidults-live-intelligence-operations.sh
ROOT_DIR="$PWD" bash scripts/staging/install-kidults-live-intelligence-operations.sh

chmod +x scripts/staging/install-kidults-intelligence-quality-alerting.sh
ROOT_DIR="$PWD" bash scripts/staging/install-kidults-intelligence-quality-alerting.sh
```

## Automated validation

```bash
chmod +x scripts/staging/validate-kidults-a10-functional-integration.sh
BASE_URL=http://127.0.0.1:4173 bash scripts/staging/validate-kidults-a10-functional-integration.sh
```

The validator checks:

- `/`
- `/health`
- Kidult 100 JSON
- Monthly Intelligence JSON
- Archive JSON
- Quality Status JSON
- Methodology page
- Operations page
- Conversion API
- local JSON parse validity

## Browser validation

Use the existing SSH tunnel and open:

```text
http://127.0.0.1:4173/
http://127.0.0.1:4173/methodology.html
http://127.0.0.1:4173/operations.html
```

Validate in this order:

1. Kidult 100 records render and metadata is populated.
2. Monthly Intelligence title, issue and summary render.
3. Archive search and report-type filtering work.
4. Hero quality status, score and updated time reflect the public quality payload.
5. Newsletter, waitlist and inquiry forms preserve validation and visible success/error states.
6. Empty, delayed, degraded and unknown status fallbacks remain readable.
7. Desktop layout is usable as the current base.
8. At 320 x 700 there is no horizontal overflow and Hero, cards, menu and forms remain usable.

## Release decision

### Go

- all automated checks pass
- no P0 or P1 functional defects
- all required data surfaces render
- conversion flows work
- desktop and 320 px remain usable

### Conditional Go

- no P0 defects
- minor visual or copy defects remain
- defects are recorded for the next fine-tuning sprint

### No-Go

- data does not render
- conversion handling fails
- quality state is misleading
- horizontal overflow blocks mobile use
- any staging change risks production isolation

## Required evidence

Record:

- deployed commit SHA
- validator output
- service status
- desktop screenshot
- 320 x 700 screenshot
- defects and severity
- final Go / Conditional Go / No-Go decision
