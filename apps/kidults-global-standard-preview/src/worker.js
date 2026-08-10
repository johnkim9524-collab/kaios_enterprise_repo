export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/" || url.pathname === "/global-standard") {
      const assetUrl = new URL("/global-standard.html", url.origin);
      const response = await env.ASSETS.fetch(new Request(assetUrl, request));
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          ...Object.fromEntries(response.headers),
          "cache-control": "no-store",
          "x-kidults-environment": "poc-preview",
          "x-kidults-design-baseline": "final-v1.0-locked",
          "x-kidults-production-promotion": "false"
        }
      });
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
