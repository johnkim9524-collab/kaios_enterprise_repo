export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/live") {
      const upstreams = [
        "https://kidults-autonomous-intelligence.john-kim9524.workers.dev/v1/intelligence/preview",
        "https://kidults-autonomous-intelligence.john-kim9524.workers.dev/v1/intelligence/current"
      ];
      for (const upstream of upstreams) {
        try {
          const response = await fetch(upstream, { headers: { accept: "application/json" } });
          if (response.ok) {
            const body = await response.text();
            return new Response(body, {
              status: 200,
              headers: {
                "content-type": "application/json; charset=utf-8",
                "cache-control": "no-store",
                "x-kidults-source": upstream.includes("/preview") ? "preview" : "current"
              }
            });
          }
        } catch (_) {}
      }
      return Response.json({ ok: false, mode: "fallback" }, { status: 503, headers: { "cache-control": "no-store" } });
    }

    if (url.pathname === "/" || url.pathname === "/global-standard") {
      const assetUrl = new URL("/global-standard.html", url.origin);
      const response = await env.ASSETS.fetch(new Request(assetUrl, request));
      const headers = new Headers(response.headers);
      headers.set("cache-control", "no-store, no-cache, must-revalidate, max-age=0");
      headers.set("pragma", "no-cache");
      headers.set("expires", "0");
      headers.set("x-kidults-environment", "poc-preview");
      headers.set("x-kidults-design-baseline", "owner-approved-final-2026-08-10");
      headers.set("x-kidults-production-promotion", "false");
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    }

    if (url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: "kidults-global-standard-preview",
        environment: "poc-preview",
        final_design_locked: true,
        production_promotion_authorized: false,
        portal: "/global-standard"
      }, { headers: { "cache-control": "no-store" } });
    }

    return env.ASSETS.fetch(request);
  }
};
