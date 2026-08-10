const FINAL_OVERRIDES = `
<style id="kidults-final-visual-lock">
:root{--paper:#f8f6f1!important;--panel:#fbfaf7!important;--ink:#05382c!important;--line:rgba(5,56,44,.115)!important}
body{background:var(--paper)!important}
.page{width:min(calc(100% - 54px),1480px)!important}
header{height:78px!important}
.brand{font-size:46px!important;letter-spacing:-1.5px!important}
.links{gap:54px!important;font-size:12px!important}
.live{padding:10px 16px!important;border-color:rgba(5,56,44,.16)!important}
.hero{grid-template-columns:30.2% 69.8%!important;gap:16px!important;margin-bottom:18px!important}
.hero-copy{min-height:342px!important;padding:2px 18px 10px 20px!important;justify-content:center!important}
.hero-copy .eyebrow{margin-bottom:29px!important;font-size:8px!important}
.hero-copy h1{font-size:42px!important;line-height:1.055!important;letter-spacing:-.035em!important;margin-bottom:17px!important}
.lead{font-size:12px!important;line-height:1.55!important;max-width:330px!important}
.actions{margin-top:24px!important}
.btn{padding:9px 15px!important;font-size:9px!important}
.hero-visual{min-height:342px!important;border-radius:12px!important;background:linear-gradient(135deg,#f2efea 0%,#fbfaf6 57%,#ece8e1 100%)!important}
.hero-meta{left:26px!important;top:20px!important;font-size:8px!important}
.hero-title{left:26px!important;top:82px!important}
.hero-title h2{font-size:23px!important;letter-spacing:-.02em!important}
.hero-title p{font-size:12px!important}
.rights{margin-top:41px!important}
.car-stage{right:1.5%!important;bottom:3%!important;width:67%!important;height:66%!important;filter:drop-shadow(0 20px 16px rgba(55,50,44,.13))!important}
.dots{left:26px!important;bottom:16px!important}
.institutional{grid-template-columns:27% 73%!important;margin-bottom:17px!important;border-radius:12px!important}
.inst-intro{padding:15px 17px!important}
.inst-intro h2{font-size:24px!important;line-height:1.12!important;margin:18px 28px 23px!important}
.pipeline .stage{min-height:128px!important;padding:23px 14px 14px!important}
.stage b{font-size:10px!important}.stage p{font-size:8px!important}
.metrics{margin-bottom:17px!important;border-radius:12px!important}
.metric{min-height:118px!important;padding:15px 14px!important}
.metric strong{font-size:22px!important;margin:11px 0 6px!important}
.metric span{font-size:8px!important}
.k100{margin-bottom:17px!important;border-radius:12px!important}
.kintro,.rank,.canon{min-height:224px!important;padding:14px 15px!important}
.kintro h2{font-size:28px!important;margin:13px 0 10px!important}
.obj{height:96px!important;margin:4px 0 8px!important}
.canon strong{font-size:24px!important;margin-top:38px!important}
.data-row{gap:8px!important;margin-bottom:17px!important}
.data-card{min-height:164px!important;padding:18px!important}
.coverage{margin-top:20px!important;gap:28px!important}.coverage b{font-size:22px!important}
.donut{width:92px!important;height:92px!important}.donut:after{inset:17px!important}
.methods{margin-top:13px!important}.method{padding:11px 6px!important}
.gov-row{margin-bottom:17px!important;border-radius:12px!important}.gov{min-height:184px!important;padding:19px 36px!important}
.gov h2{font-size:20px!important}.gov p,.gov li{font-size:8px!important}
.footer-nav{gap:51px!important;font-size:11px!important;padding-bottom:14px!important}
footer{padding:11px 0 18px!important}
@media(max-width:1100px){.page{width:calc(100% - 28px)!important}.hero-copy h1{font-size:38px!important}.links{gap:24px!important}}
@media(max-width:760px){.page{width:calc(100% - 20px)!important}.hero{grid-template-columns:1fr!important}.hero-copy h1{font-size:42px!important}.hero-visual{min-height:330px!important}.pipeline,.metrics,.k100,.data-row,.gov-row{grid-template-columns:1fr!important}}
</style>`;

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
      let body = await response.text();
      body = body.replace("</head>", `${FINAL_OVERRIDES}</head>`);
      const headers = new Headers(response.headers);
      headers.set("content-type", "text/html; charset=utf-8");
      headers.set("cache-control", "no-store, no-cache, must-revalidate, max-age=0");
      headers.set("pragma", "no-cache");
      headers.set("expires", "0");
      headers.set("x-kidults-environment", "poc-preview");
      headers.set("x-kidults-design-baseline", "owner-approved-final-2026-08-10");
      headers.set("x-kidults-production-promotion", "false");
      return new Response(body, { status: response.status, statusText: response.statusText, headers });
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
