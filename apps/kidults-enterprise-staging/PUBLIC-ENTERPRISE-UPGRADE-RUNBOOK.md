# KIDULTS Public Enterprise Upgrade Preview

## Purpose
Create a provider- and institution-ready public KIDULTS homepage without replacing the current production root before approval.

## Preview route
`apps/kidults-enterprise-staging/public/public-enterprise-preview/`

## Local preview
```powershell
cd apps\kidults-enterprise-staging\public
npx serve . -l 4190
```

Open:
`http://127.0.0.1:4190/public-enterprise-preview/`

## Included public architecture
- Intelligence
- Research
- Reports
- Archive
- Methodology
- API
- Providers
- Company
- Enterprise Access

## Safety
- Current `public/index.html` is not replaced.
- Existing Provider Portal is preserved and linked.
- Promotion to `kidults.com` root requires visual, mobile, link and content approval.

## QA
- Desktop: 1440 and 1920
- Mobile: 320, 375 and 430
- No horizontal overflow
- All public-to-provider links resolve
- Methodology, report, archive and partnership routes resolve
- Performance and accessibility review before root promotion

## Promotion plan
1. Approve preview.
2. Correct content and route issues.
3. Back up current production root.
4. Promote preview to `public/index.html` in a separate release PR.
5. Validate rollback and production deployment.
