# KIDULTS Provider Partnership Portal V4

## Purpose

Create a provider-facing partnership environment directly inside the existing Kidults operating repository without replacing the public production homepage.

## Route

`apps/kidults-enterprise-staging/public/provider/`

Local preview from `apps/kidults-enterprise-staging/public`:

```powershell
npx serve . -l 4190
```

Open:

```text
http://127.0.0.1:4190/provider/
```

## Deployment model

- Deploy from the existing repository branch.
- Keep `kidults.com` production untouched.
- Recommended provider domain: `provider.kidults.com`.
- Configure the Cloudflare Pages project to publish `apps/kidults-enterprise-staging/public`.
- Map the custom domain to the `/provider/` route or create a dedicated Pages project that serves the provider folder as its root.
- Apply Cloudflare Access before distributing the URL externally.

## Security and disclosure

- The portal includes `noindex`, `nofollow`, and `noarchive` directives.
- Integration statuses describe KIDULTS readiness and must not be represented as existing third-party contractual connections.
- Provider data access, attribution, permitted use, retention, and deletion require written agreement.

## QA checklist

- Desktop: 1440px and 1920px.
- Mobile: 320px, 375px, and 430px.
- No horizontal overflow.
- All internal links resolve from `/provider/`.
- Mail links open `partnerships@kidults.com`.
- Reduced-motion preference is respected.
- Cloudflare Access is enabled before outreach.
