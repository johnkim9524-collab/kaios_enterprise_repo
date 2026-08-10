const FINAL_CSS = `
/* KIDULTS FINAL LIGHT LUXURY EDITORIAL — locked preview projection */
:root{--paper:#f7f4ed!important;--card:#fbf9f4!important;--ink:#0b3227!important;--line:rgba(11,50,39,.13)!important}
body{background:#f7f4ed!important;color:#0b3227!important}
.shell{width:min(calc(100% - 36px),1480px)!important}
header{position:relative!important;background:#f7f4ed!important;backdrop-filter:none!important;border-bottom:0!important}
nav{height:86px!important}
.brand{font-size:48px!important;letter-spacing:-1.8px!important}
.brand em{color:#0b3227!important}
.links{gap:48px!important;font-family:Georgia,'Times New Roman',serif!important;font-size:12px!important}
.live{border-color:rgba(11,50,39,.18)!important;color:#183f31!important;background:rgba(255,255,255,.18)!important}
.hero{grid-template-columns:30% 70%!important;gap:18px!important;padding:0 0 22px!important}
.hero-copy{min-height:520px!important;padding:44px 22px 30px 14px!important;border:0!important;background:transparent!important;border-radius:0!important;justify-content:flex-start!important}
.hero-copy .eyebrow{margin-top:3px!important;margin-bottom:42px!important;color:#0b3227!important}
.hero-copy h1{font-size:clamp(48px,4.1vw,66px)!important;line-height:1.04!important;letter-spacing:-.035em!important;margin:0 0 24px!important}
.hero-copy .rule{width:38px!important;margin:0 0 20px!important}
.lead{font-size:13px!important;line-height:1.55!important;max-width:360px!important;color:#1e312a!important}
.actions{margin-top:28px!important}
.btn{padding:11px 19px!important;font-size:10px!important}
.hero-visual{min-height:520px!important;border-radius:14px!important;background:linear-gradient(135deg,#eeeae2 0%,#f7f3eb 56%,#eee9df 100%)!important}
.hero-copyline{left:30px!important;top:112px!important}
.hero-copyline h2{font-size:25px!important}
.hero-meta{left:28px!important;top:25px!important;color:#173f31!important}
.hero-object{width:68%!important;height:57%!important;right:4%!important;bottom:5%!important}
.hero-object svg{filter:drop-shadow(0 22px 17px rgba(65,56,45,.16))!important}
.hero-rail{display:none!important}
.institutional{border-radius:13px!important;margin-bottom:20px!important}
.institutional-grid{grid-template-columns:27% 73%!important}
.institutional-intro{padding:22px!important}
.institutional-intro h3{font-size:27px!important;line-height:1.08!important;margin:20px 0 26px 30px!important}
.pipeline{grid-template-columns:repeat(5,1fr)!important}
.stage{min-height:170px!important;padding:35px 18px 20px!important}
.stage b{font-size:11px!important}
.stage p{font-size:9px!important;line-height:1.55!important}
.metrics{grid-template-columns:1fr 1fr 1.18fr 1.75fr .95fr .95fr 1.05fr!important;gap:0!important;margin-bottom:20px!important;border:1px solid var(--line)!important;border-radius:13px!important;overflow:hidden!important}
.metric{border:0!important;border-right:1px solid var(--line)!important;border-radius:0!important;background:transparent!important;min-height:138px!important;padding:18px 17px!important}
.metric:last-child{border-right:0!important}
.metric small{font-size:8px!important}
.metric strong{font-size:24px!important}
.confidence-row{margin-top:10px!important}
.k100{grid-template-columns:1.15fr repeat(5,1.17fr) .9fr!important;margin-bottom:20px!important;border-radius:13px!important}
.k-intro,.rank,.canon{min-height:275px!important;padding:17px 18px!important}
.k-intro h3{font-size:28px!important;margin:16px 0 10px!important}
.object-art{height:125px!important;margin:10px 0 12px!important;background:transparent!important}
.rank h3{font-size:14px!important;min-height:31px!important}
.rank-score{font-size:20px!important}
.canon{background:#eee4d0!important}
.canon strong{font-size:27px!important;margin-top:46px!important}
.data-row{grid-template-columns:1.05fr 1fr 1.3fr!important;gap:8px!important;margin-bottom:20px!important}
.data-card{min-height:185px!important;padding:22px!important;border-radius:13px!important}
.data-card h3{font-size:22px!important}
.governance{border-radius:13px!important;margin-bottom:20px!important}
.gov{min-height:220px!important;padding:24px 46px!important}
.footer-nav{gap:62px!important;font-size:12px!important}
footer{padding-top:14px!important}
#kidultsFinalCoverage .coverage-grid{display:flex;gap:34px;align-items:center;margin-top:24px}
#kidultsFinalCoverage .coverage-number{font:500 25px Georgia,'Times New Roman',serif}
#kidultsFinalCoverage .coverage-label{font-size:9px;color:#4f5e57}
#kidultsFinalCoverage .coverage-note{font-size:9px;line-height:1.6;margin-top:30px;color:#26352f}
#kidultsFinalEvidence .evidence-wrap{display:flex;align-items:center;gap:24px;margin-top:16px}
#kidultsFinalEvidence .donut{width:104px;height:104px;border-radius:50%;background:conic-gradient(#174b37 0 42%,#61709a 42% 66%,#b29249 66% 81%,#aaa69c 81% 92%,#d2cdd0 92%);position:relative;flex:0 0 auto}
#kidultsFinalEvidence .donut:after{content:'';position:absolute;inset:19px;border-radius:50%;background:#f7f4ed}
#kidultsFinalEvidence .donut-value{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:2;font:500 16px Georgia,'Times New Roman',serif;text-align:center}
#kidultsFinalEvidence .evidence-legend{flex:1;font-size:9px}
#kidultsFinalEvidence .evidence-legend div{display:flex;justify-content:space-between;margin:6px 0}
@media(max-width:1180px){.hero{grid-template-columns:1fr 1.6fr!important}.metrics{grid-template-columns:repeat(4,1fr)!important}.k100{grid-template-columns:repeat(3,1fr)!important}.institutional-grid{grid-template-columns:1fr!important}}
@media(max-width:760px){.shell{width:calc(100% - 20px)!important}.brand{font-size:36px!important}.hero{grid-template-columns:1fr!important}.hero-copy{min-height:auto!important;padding:28px 16px!important}.hero-copy h1{font-size:49px!important}.hero-visual{min-height:390px!important}.metrics,.k100,.data-row,.governance,.pipeline{grid-template-columns:1fr!important}.metric,.k-intro,.rank,.canon,.gov,.stage{border-right:0!important;border-bottom:1px solid var(--line)!important}.footer-nav{gap:18px!important;flex-wrap:wrap!important}}
`;

const FINAL_SCRIPT = `
(()=>{
 const $=id=>document.getElementById(id);
 const txt=(el,v)=>{if(el)el.textContent=v};
 const fmt=(v)=>{const n=Number(v);if(!Number.isFinite(n))return '—';return n>=1000000?(n/1000000).toFixed(1)+'M+':n.toLocaleString()};
 const normalize=raw=>raw&&raw.payload&&typeof raw.payload==='object'?Object.assign({},raw.payload,raw):raw||{};
 async function finalBind(){
  const metricLabels=document.querySelectorAll('.metric small');
  if(metricLabels[2])metricLabels[2].textContent='DATA POINTS INGESTED';
  try{
   const base='https://kidults-autonomous-intelligence.john-kim9524.workers.dev';
   let r=await fetch(base+'/v1/intelligence/preview',{cache:'no-store'});
   if(!r.ok)r=await fetch(base+'/v1/intelligence/current',{cache:'no-store'});
   if(!r.ok)throw new Error('HTTP '+r.status);
   const d=normalize(await r.json()),h=d.headline||{},g=d.governance||{};
   const third=$('categories');
   txt(third,fmt(h.dataPoints??h.signalsIngested??g.dataPoints??g.signalsIngested));
   if(third&&third.nextElementSibling)third.nextElementSibling.textContent='Signals ingested · Continuously updated';
   const cards=document.querySelectorAll('.data-card');
   if(cards[0]){
    cards[0].id='kidultsFinalCoverage';
    const geo=Array.isArray(d.geography)?d.geography:[];
    const find=(name)=>{const x=geo.find(v=>String(v.name||v.region||v.type||'').toLowerCase().includes(name));return x?(x.value??x.count):null};
    const countries=d.countries??h.countries??find('countr');
    const markets=d.markets??h.markets??find('market');
    const languages=d.languages??h.languages??find('language');
    cards[0].innerHTML='<div class="eyebrow">GLOBAL DATA COVERAGE (ACTIVE INGEST)</div><div class="coverage-grid"><div><div class="coverage-number">'+(countries??'—')+'</div><div class="coverage-label">Countries</div></div><div><div class="coverage-number">'+(markets??'—')+'</div><div class="coverage-label">Markets</div></div><div><div class="coverage-number">'+(languages??'—')+'</div><div class="coverage-label">Languages</div></div></div><div class="coverage-note">Actively collecting. Expanding daily.<br>See coverage map&nbsp;&nbsp;→</div>';
   }
   if(cards[1]){
    cards[1].id='kidultsFinalEvidence';
    const src=Array.isArray(d.sourceComposition)?d.sourceComposition:[];
    const total=h.dataPoints??h.signalsIngested??g.dataPoints??g.signalsIngested;
    const names=['Market Data','Auction Data','News & Media','Social & Sentiment','Other Sources'];
    const vals=names.map((name,i)=>src[i]?(src[i].percent??src[i].value??src[i].count??'—'):'—');
    cards[1].innerHTML='<div class="eyebrow">EVIDENCE SUMMARY (360° VIEW)</div><div class="evidence-wrap"><div class="donut"><div class="donut-value">'+fmt(total)+'</div></div><div class="evidence-legend">'+names.map((n,i)=>'<div><span>'+n+'</span><b>'+vals[i]+(typeof vals[i]==='number'&&vals[i]<=100?'%':'')+'</b></div>').join('')+'</div></div>';
   }
   const connection=$('connection'); if(connection)connection.textContent='● LIVE PREVIEW';
  }catch(e){console.warn('Final preview binding remains fail-closed',e)}
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(finalBind,250));else setTimeout(finalBind,250);
})();
`;

class HeadInjector {
  element(element) {
    element.append(`<style>${FINAL_CSS}</style>`, { html: true });
  }
}
class BodyInjector {
  element(element) {
    element.append(`<script>${FINAL_SCRIPT}</script>`, { html: true });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/" || url.pathname === "/global-standard") {
      const assetUrl = new URL("/global-standard.html", url.origin);
      const response = await env.ASSETS.fetch(new Request(assetUrl, request));
      const transformed = new HTMLRewriter()
        .on("head", new HeadInjector())
        .on("body", new BodyInjector())
        .transform(response);
      return new Response(transformed.body, {
        status: transformed.status,
        statusText: transformed.statusText,
        headers: {
          ...Object.fromEntries(transformed.headers),
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
