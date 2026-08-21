import fs from 'node:fs';
const p='apps/kidults-enterprise-staging/public/partner-v666/index.html';
const s=fs.readFileSync(p,'utf8');
const required=['V666 Partner Edition','THE GLOBAL STANDARD FOR COLLECTIBLES INTELLIGENCE','Eight Core Verticals','Toys &amp; Models','Watches &amp; Jewelry','Automobiles &amp; Mobility','Fashion &amp; Accessories','Design &amp; Furniture','Technology &amp; Cameras','Gaming / Music / Screen Culture','Cards / Comics / Memorabilia','STRATEGIC DATA COLLABORATION','WHY PARTNER WITH KIDULTS','Platform in development','partnerships@kidults.com','Rights-aware'];
const forbidden=['94.8','500+ Brands','94% Confidence','42 Source Families','Status Operational','Production Ready','LIVE MARKET DATA'];
const missing=required.filter(x=>!s.includes(x));
const present=forbidden.filter(x=>s.includes(x));
if(missing.length||present.length){console.error(JSON.stringify({status:'FAIL',missing,present},null,2));process.exit(1)}
console.log(JSON.stringify({status:'PASS',surface:'V666_PARTNER_EDITION',required:required.length,forbidden_absent:forbidden.length},null,2));