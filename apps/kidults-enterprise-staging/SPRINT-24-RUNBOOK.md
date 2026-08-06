# KIDULTS Sprint 24 — AI-Assisted Operations

## Objective
Turn every CRM inquiry into a decision-ready case with a governed summary, category, opportunity score, priority, recommended next action and reply draft.

## Governance
- staging/local only
- production promotion remains disabled
- personal email is masked in the dashboard
- automatic sending is disabled
- every reply requires human review
- approval changes are written to a local audit trail
- deterministic governed-rules-v1 fallback requires no external AI service

## Build

```powershell
$env:KAIOS_ENVIRONMENT="staging"
$env:KAIOS_PRODUCTION_PROMOTION_AUTHORIZED="false"
$env:KIDULTS_CONVERSION_DATA_DIR="$PWD\.local-data\conversions"
npm run build:sprint24
npm start
```

Open:

```text
http://127.0.0.1:4190/operations-ai/
```

## Operator commands

```powershell
npm run ai:status
npm run ai:approve -- SUBMISSION_ID
npm run ai:reject -- SUBMISSION_ID
npm run ai:draft -- SUBMISSION_ID
npm run ai:sent -- SUBMISSION_ID
npm run ai:set-draft -- SUBMISSION_ID "Edited reply draft"
npm run ai:build
```

`ai:approve` records approval but does not send email. Open **Review in Gmail**, inspect the recipient and draft, then send manually. After sending, record the outcome with `ai:sent`.

## Acceptance criteria
- all tests pass
- dashboard works at 320px and above without horizontal overflow
- test records score 0 and do not count as pending approval
- no unmasked personal email appears in the dashboard
- no path can send automatically
- approval actions generate audit entries
