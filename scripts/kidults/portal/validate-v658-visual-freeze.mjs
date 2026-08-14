import fs from "node:fs";
import path from "node:path";
const root=process.cwd();
const required=[
  "apps/kidults-enterprise-staging/public/portal/assets/hero/racing-roadster-v658-desktop.webp",
  "apps/kidults-enterprise-staging/public/portal/assets/hero/racing-roadster-v658-mobile.webp",
  "apps/kidults-enterprise-staging/public/portal/components/v658-visual-freeze.css"
];
const errors=[];
for(const file of required){if(!fs.existsSync(path.join(root,file)))errors.push(`Missing ${file}`)}
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const index=read("apps/kidults-enterprise-staging/public/portal/index.html");
const portal=read("apps/kidults-enterprise-staging/public/portal/portal.js");
const assets=read("apps/kidults-enterprise-staging/public/portal/components/editorial-assets.js");
const css=read("apps/kidults-enterprise-staging/public/portal/components/v658-visual-freeze.css");
const manifest=JSON.parse(read("apps/kidults-enterprise-staging/public/portal/data/v502-manifest.json"));
for(const marker of ["v658-visual-freeze.css?v=658","portal.js?v=658"]){if(!index.includes(marker))errors.push(`index missing ${marker}`)}
for(const marker of ["mobile-hero-visibility.js?v=658","editorial-assets.js?v=658","renderers.js?v=658"]){if(!portal.includes(marker))errors.push(`portal missing ${marker}`)}
for(const marker of ["racing-roadster-v658-desktop.webp","racing-roadster-v658-mobile.webp","museum-editorial-v658"]){if(!assets.includes(marker))errors.push(`asset runtime missing ${marker}`)}
for(const marker of ["object-fit:contain!important","object-position:center bottom!important","aspect-ratio:4/3","object-fit:cover!important"]){if(!css.includes(marker))errors.push(`CSS missing ${marker}`)}
if(manifest.hero.asset!=="assets/hero/racing-roadster-v658-desktop.webp")errors.push("manifest desktop asset mismatch");
if(manifest.hero.mobile_asset!=="assets/hero/racing-roadster-v658-mobile.webp")errors.push("manifest mobile asset mismatch");
if(errors.length){console.error(errors.join("\n"));process.exit(1)}
console.log("KIDULTS V658 visual freeze: PASS");
