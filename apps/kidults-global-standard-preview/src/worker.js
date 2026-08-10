const LOCKED_SOURCE = "https://raw.githubusercontent.com/johnkim9524-collab/kaios_enterprise_repo/dfe1b0fd47dd3fc5332397106103be12832eb254/apps/kidults-enterprise-staging/public/global-standard.html";

const FINAL_OVERRIDES = `
<style id="kidults-owner-final-visual-lock">
:root{--paper:#f8f6f1!important;--paper-2:#fbfaf7!important;--card:#fbfaf7!important;--ink:#05382c!important;--muted:#5d6862!important;--line:rgba(5,56,44,.115)!important;--serif:Georgia,'Times New Roman',serif!important}
*{box-sizing:border-box!important}
body{margin:0!important;background:#f8f6f1!important;color:var(--ink)!important;overflow-x:hidden!important}
.shell{width:calc(100% - 36px)!important;max-width:none!important;margin:0 auto!important}
header{position:static!important;background:#f8f6f1!important;border-bottom:0!important;backdrop-filter:none!important}
nav{height:84px!important;padding:0 12px!important}
.brand{font-size:49px!important;letter-spacing:-1.8px!important;color:var(--ink)!important}
.brand em{color:var(--ink)!important}
.links{gap:42px!important;font-family:var(--serif)!important;font-size:13px!important}
.live{padding:11px 17px!important;border-color:rgba(5,56,44,.16)!important;color:var(--ink)!important}
.hero{padding:0!important;display:grid!important;grid-template-columns:29.6% 70.4%!important;gap:18px!important;margin-bottom:22px!important}
.hero-copy.panel{background:transparent!important;border:0!important;border-radius:0!important;box-shadow:none!important}
.hero-copy{min-height:368px!important;padding:6px 22px 18px!important;display:flex!important;flex-direction:column!important;justify-content:center!important}
.hero-copy .eyebrow{margin-bottom:34px!important;color:var(--ink)!important}
.hero-copy h1{font-size:clamp(42px,4vw,62px)!important;line-height:1.03!important;letter-spacing:-.04em!important;margin:0 0 18px!important;color:var(--ink)!important}
.hero-copy .rule{width:35px!important;margin:0 0 18px!important}
.lead{font-size:13px!important;line-height:1.55!important;max-width:335px!important;color:#18231f!important;margin:0!important}
.actions{margin-top:26px!important}.btn{padding:10px 16px!important;font-size:10px!important}.btn.primary{background:#064332!important}
.hero-visual{min-height:368px!important;border-radius:14px!important;background:linear-gradient(135deg,#ece8e1,#faf7f1 61%,#ebe7df)!important}
.hero-visual:before,.hero-visual:after{top:-20%!important;height:100%!important;width:15%!important;transform:rotate(17deg)!important;background:rgba(255,255,255,.5)!important}
.hero-visual:before{right:18%!important}.hero-visual:after{right:-5%!important}
.hero-meta{left:28px!important;top:22px!important;color:var(--ink)!important}.hero-copyline{left:28px!important;top:89px!important}.hero-copyline h2{font-size:25px!important}.hero-copyline p{font-size:13px!important}.rights{margin-top:45px!important}
.hero-object{right:2.7%!important;bottom:6%!important;width:68%!important;height:64%!important}.hero-object svg{filter:drop-shadow(0 18px 18px rgba(55,50,44,.16))!important}
.dots{left:28px!important;bottom:18px!important}.hero-rail{display:none!important}
.panel{border-radius:14px!important;border-color:var(--line)!important;background:rgba(255,255,255,.26)!important}
.institutional{margin-bottom:20px!important}.institutional-grid{grid-template-columns:27% 73%!important}.institutional-intro{padding:18px!important}.institutional-intro h3{font-size:27px!important;line-height:1.12!important;margin:19px 30px 27px!important}.institutional-intro .micro{margin-top:0!important}.stage{min-height:145px!important;padding:27px 16px 18px!important}.stage b{font-size:11px!important}.stage p{font-size:9px!important}
.metrics{grid-template-columns:1fr 1fr 1.2fr 1.75fr .95fr .95fr 1.05fr!important;gap:0!important;margin-bottom:20px!important;border:1px solid var(--line)!important;border-radius:14px!important;overflow:hidden!important;background:rgba(255,255,255,.26)!important}.metrics .metric.panel{border:0!important;border-radius:0!important;background:transparent!important;border-right:1px solid var(--line)!important}.metrics .metric:last-child{border-right:0!important}.metric{min-height:132px!important;padding:17px 16px!important}.metric strong{font-size:25px!important;margin:13px 0 7px!important}.metric span{font-size:9px!important}
.k100{grid-template-columns:1.15fr repeat(5,1.16fr) .9fr!important;margin-bottom:20px!important}.k-intro,.rank,.canon{min-height:246px!important;padding:16px 17px!important}.k-intro h3{font-size:31px!important;margin:15px 0 11px!important}.rank h3{font-size:14px!important;min-height:30px!important}.object-art{height:108px!important;margin:6px 0 10px!important;background:transparent!important;border-radius:0!important}.canon{background:rgba(239,229,210,.52)!important}.canon strong{font-size:26px!important;margin-top:43px!important}
.data-row{grid-template-columns:1.05fr 1fr 1.3fr!important;gap:8px!important;margin-bottom:20px!important}.data-card{min-height:176px!important;padding:20px!important}
.governance{margin-bottom:20px!important}.gov{min-height:205px!important;padding:22px 44px!important}.gov h3{font-size:23px!important}
.footer-nav{gap:58px!important;font-size:12px!important;padding:1px 0 17px!important}footer{padding:13px 0 22px!important}
@media(max-width:1100px){.shell{width:calc(100% - 28px)!important}.hero{grid-template-columns:1fr 1.55fr!important}.links{gap:20px!important}.metrics{grid-template-columns:repeat(4,1fr)!important}.k100{grid-template-columns:repeat(3,1fr)!important}.institutional-grid{grid-template-columns:1fr!important}}
@media(max-width:760px){.shell{width:calc(100% - 20px)!important}.links{display:none!important}.brand{font-size:38px!important}.hero{grid-template-columns:1fr!important}.hero-copy{min-height:auto!important;padding:22px 10px 28px!important}.hero-copy h1{font-size:46px!important}.hero-visual{min-height:350px!important}.pipeline,.metrics,.k100,.data-row,.governance{grid-template-columns:1fr!important}}
</style>`;

async function proxyIntelligence(path) {
  const upstream = `https://kidults-autonomous-intelligence.john-kim9524.workers.dev${path}`;
  try {
    const response = await fetch(upstream, { headers: { accept: "application/json" } });
    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "x-kidults-source": path.includes("/preview") ? "preview" : "current"
      }
    });
  } catch (_) {
    return Response.json({ ok: false, mode: "fallback" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/live") {
      const preview = await proxyIntelligence("/v1/intelligence/preview");
      if (preview.ok) return preview;
      return proxyIntelligence("/v1/intelligence/current");
    }

    if (url.pathname === "/v1/intelligence/preview" || url.pathname === "/v1/intelligence/current") {
      return proxyIntelligence(url.pathname);
    }

    if (url.pathname === "/" || url.pathname === "/global-standard") {
      const response = await fetch(LOCKED_SOURCE, { headers: { accept: "text/html" }, cf: { cacheTtl: 0 } });
      let body = await response.text();
      body = body
        .replace("Icon of the moment · Original", "Icon of the moment")
        .replace("const API_BASE='https://kidults-autonomous-intelligence.john-kim9524.workers.dev'", `const API_BASE='${url.origin}'`)
        .replace("</head>", `${FINAL_OVERRIDES}</head>`);
      const headers = new Headers({
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
        "pragma": "no-cache",
        "expires": "0",
        "x-kidults-environment": "poc-preview",
        "x-kidults-design-baseline": "dfe1b0f-owner-locked-light-luxury",
        "x-kidults-production-promotion": "false"
      });
      return new Response(body, { status: response.ok ? 200 : response.status, headers });
    }

    if (url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: "kidults-global-standard-preview",
        environment: "poc-preview",
        source_commit: "dfe1b0fd47dd3fc5332397106103be12832eb254",
        final_design_locked: true,
        production_promotion_authorized: false,
        portal: "/global-standard"
      }, { headers: { "cache-control": "no-store" } });
    }

    return env.ASSETS.fetch(request);
  }
};
