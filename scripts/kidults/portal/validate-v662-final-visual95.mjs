import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const portal = "apps/kidults-enterprise-staging/public/portal";
const errors = [];
const read = p => fs.readFileSync(path.join(root,p),"utf8");
const files = [
  `${portal}/assets/hero/racing-roadster-v662.webp`,
  `${portal}/assets/kidult100/footwear-v654.webp`,
  `${portal}/assets/kidult100/camera-v654.webp`,
  `${portal}/assets/kidult100/toys-v654.webp`,
  `${portal}/assets/kidult100/watch-v655.webp`
];
for (const file of files) {
  const data = fs.readFileSync(path.join(root,file));
  if (data.subarray(0,4).toString("ascii") !== "RIFF" || data.subarray(8,12).toString("ascii") !== "WEBP") errors.push(`${file} is not WebP`);
  if (data.length < 12_000) errors.push(`${file} is unexpectedly small (${data.length})`);
}
const assets=read(`${portal}/components/editorial-assets.js`);
const css=read(`${portal}/components/v662-stability-freeze.css`);
const mobile=read(`${portal}/components/mobile-hero-visibility.css`);
for (const marker of ["CACHE_REVISION = \"visual95\"","footwear-v654.webp","camera-v654.webp","toys-v654.webp","watch-v655.webp","single-studio-v662-visual95"]) if (!assets.includes(marker)) errors.push(`Asset marker missing: ${marker}`);
for (const marker of ["single-studio-v662-visual95","#f2eee8","saturate(.96)","object-fit:contain!important"]) if (!css.includes(marker)) errors.push(`CSS marker missing: ${marker}`);
if (mobile.includes("object-position:right center")) errors.push("Mobile Hero still has right-biased positioning");
if (!mobile.includes("object-fit:contain!important") || !mobile.includes("object-position:center center!important")) errors.push("Mobile Hero final positioning is missing");
if (errors.length) { console.error(`KIDULTS V662 final visual95: FAIL (${errors.length})`); errors.forEach(e=>console.error(`ERROR: ${e}`)); process.exit(1); }
console.log("KIDULTS V662 final visual95: PASS (neutral Hero, single-background K100, desktop/mobile centre corrected)");
