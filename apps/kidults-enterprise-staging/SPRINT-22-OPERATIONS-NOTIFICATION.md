# Kidults Sprint 22 — Operations Notification

## Objective

Complete the operational path from Contact, Newsletter, Waitlist, and Inquiry submission to a reviewable Gmail notification delivered to `partnerships@kidults.com`.

## Included

- append-only conversion persistence remains unchanged
- non-PII audit trail remains unchanged
- Gmail SMTP notification dispatcher
- exactly-once delivery state by submission ID
- retry-safe failure handling
- one-shot and continuous watch commands
- integrated Sprint 22 build and test command

## Security model

- no Gmail password or app password is committed
- the SMTP app password is supplied only through environment variables
- accepted conversions are persisted before notification dispatch
- SMTP failure never deletes or mutates the accepted conversion
- audit events do not contain the sender email address
- production promotion remains unauthorized

## Required environment

```text
KAIOS_ENVIRONMENT=staging
KAIOS_PRODUCTION_PROMOTION_AUTHORIZED=false
KIDULTS_CONVERSION_DATA_DIR=<absolute path to conversion data directory>
KIDULTS_NOTIFICATION_ENABLED=true
KIDULTS_SMTP_USERNAME=partnerships@kidults.com
KIDULTS_SMTP_APP_PASSWORD=<Google app password without spaces>
KIDULTS_NOTIFICATION_RECIPIENT=partnerships@kidults.com
```

Optional:

```text
KIDULTS_SMTP_HOST=smtp.gmail.com
KIDULTS_SMTP_PORT=465
KIDULTS_SMTP_TIMEOUT_MS=15000
KIDULTS_NOTIFICATION_INTERVAL_MS=30000
```

## Commands

Run from `apps/kidults-enterprise-staging`.

```powershell
npm run build:sprint22
npm run notify:once
npm run notify:watch
```

`notify:once` checks all accepted submissions and sends only those not recorded in `notification-state.json`.

`notify:watch` repeats the same safe check every 30 seconds by default.

## Google Workspace prerequisite

The Workspace account must have two-step verification enabled and a Google app password created for this runtime. Store the app password only in the deployment secret store or the current PowerShell session. Do not place it in source control, `.env` files committed to Git, screenshots, issue comments, or pull-request descriptions.

## Acceptance criteria

- Contact, Newsletter, Waitlist, and Inquiry submissions remain persistently recorded
- each accepted submission produces at most one successful Gmail notification
- failed notifications remain eligible for retry
- success and failure create non-PII audit events
- all Node tests pass
- Sprint 21 intelligence and operations builds still pass
- staging only; production promotion remains false
