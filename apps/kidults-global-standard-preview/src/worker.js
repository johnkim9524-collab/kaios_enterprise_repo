export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/" || url.pathname === "/global-standard") {
      const assetUrl = new URL("/global-standard.html?rev=561657d", url.origin);
      const response = await env.ASSETS.fetch(new Request(assetUrl, request));
      const headers = new Headers(response.headers);
      headers.set("cache-control", "no-store, no-cache, must-revalidate, max-age=0");
      headers.set("pragma", "no-cache");
      headers.set("expires", "0");
      headers.set("x-kidults-environment", "poc-preview");
      headers.set("x-kidults-design-baseline", "final-v1.0-locked");
      headers.set("x-kidults-preview-revision", "561657d");
      headers.set("x-kidults-production-promotion", "false");
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    }

    if (url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: "kidults-global-standard-preview",
        environment: "poc-preview",
        preview_revision: "561657d",
        final_design_locked: true,
        production_promotion_authorized: false,
        portal: "/global-standard"
      }, { headers: { "cache-control": "no-store" } });
    }

    return env.ASSETS.fetch(request);
  }
};
