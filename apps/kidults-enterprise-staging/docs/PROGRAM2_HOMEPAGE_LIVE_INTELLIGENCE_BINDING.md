# Program 2 — Homepage Live Intelligence Binding

## Objective
Bind the governed portal bridge output to visible homepage status metrics without allowing the browser to authorize production publication.

## Runtime contract
The homepage reads:

`public/public-enterprise-preview/api/v1/governed-intelligence.json`

Expected schema:

`kidults.portal-bridge.v1`

The browser displays only governed publication counts and state:

- publish candidates
- held for review
- executive feed
- production state
- governed update time

Held details remain governed and production authorization remains upstream. The homepage cannot promote content to production.

## Validation
From `apps\kidults-enterprise-staging`:

```powershell
git fetch origin
git checkout feat/kidults-program2-homepage-live-intelligence-binding

Remove-Item .local-data -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force .local-data | Out-Null
Copy-Item examples\collector-input.sample.json .local-data\collector-input.json -Force

npm run build:sprint27b
npm start
```

Expected baseline: 85 tests passed, 0 failed.

Review:

`http://127.0.0.1:4190/public-enterprise-preview/?data=preview`

The governed metrics strip should appear directly below LIVE INTELLIGENCE. With the current sample dataset, production state should remain REVIEW and held count should be non-zero.

## Deployment boundary
Local and staging preview only. Live production promotion remains disabled unless upstream governance explicitly authorizes it.
