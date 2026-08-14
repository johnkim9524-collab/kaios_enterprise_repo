import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const portal = "apps/kidults-enterprise-staging/public/portal";
const errors = [];
const required = [
  `${portal}/assets/hero/racing-roadster-v662.webp`,
  `${portal}/assets/kidult100/footwear-v654.webp`,
  `${portal}/assets/kidult100/camera-v654.webp`,
  `${portal}/assets/kidult100/toys-v654.webp`,
  `${portal}/assets/kidult100/watch-v655.webp`
];

for (const relative of required) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) {
    errors.push(`Missing asset: ${relative}`);
    continue;
  }
  const data = fs.readFileSync(absolute);
  if (data.subarray(0, 4).toString("ascii") !== "RIFF" ||
      data.subarray(8, 12).toString("ascii") !== "WEBP") {
    errors.push(`Not a WebP: ${relative}`);
  }
  if (data.length < 25_000) errors.push(`Asset unexpectedly small: ${relative} (${data.length})`);
}

const assets = fs.readFileSync(path.join(root, `${portal}/components/editorial-assets.js`), "utf8");
const css = fs.readFileSync(path.join(root, `${portal}/components/v662-stability-freeze.css`), "utf8");
const mobile = fs.readFileSync(path.join(root, `${portal}/components/mobile-hero-visibility.css`), "utf8");
const portalJs = fs.readFileSync(path.join(root, `${portal}/portal.js`), "utf8");

for (const marker of [
  'CACHE_REVISION = "visual95"',
  'single-studio-v662-visual95',
  'footwear-v654.webp',
  'camera-v654.webp',
  'toys-v654.webp',
  'watch-v655.webp'
]) if (!assets.includes(marker)) errors.push(`Asset binding marker missing: ${marker}`);

for (const marker of [
  'KIDULTS V662 VISUAL95',
  '#f3f1ec',
  'saturate(.94)',
  'single-studio-v662-visual95'
]) if (!css.includes(marker)) errors.push(`Visual CSS marker missing: ${marker}`);

if (mobile.includes("object-position:right center")) errors.push("Mobile Hero remains right-biased.");
if (!mobile.includes("object-position:center center")) errors.push("Mobile Hero center correction missing.");
if (!portalJs.includes("editorial-assets.js?v=662-visual95")) errors.push("Portal asset module cache revision missing.");

if (errors.length) {
  console.error(`KIDULTS V662 Visual95: FAIL (${errors.length})`);
  errors.forEach(error => console.error(`ERROR: ${error}`));
  process.exit(1);
}
console.log("KIDULTS V662 Visual95: PASS — neutral Hero, balanced Roadster, single-studio K100.");
