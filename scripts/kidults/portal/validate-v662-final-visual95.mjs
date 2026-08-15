import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const portal = "apps/kidults-enterprise-staging/public/portal";
const errors = [];
const requiredWebP = [
  `${portal}/assets/hero/racing-roadster-v662.webp`,
  `${portal}/assets/kidult100/footwear-v654.webp`,
  `${portal}/assets/kidult100/camera-v654.webp`,
  `${portal}/assets/kidult100/toys-v654.webp`,
  `${portal}/assets/kidult100/watch-v655.webp`
];

for (const relative of requiredWebP) {
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

const svgPath = path.join(root, `${portal}/assets/hero/racing-roadster-v666.svg`);
if (!fs.existsSync(svgPath)) errors.push("Missing V666 Hero surface SVG.");
const svg = fs.existsSync(svgPath) ? fs.readFileSync(svgPath, "utf8") : "";
const assets = fs.readFileSync(path.join(root, `${portal}/components/editorial-assets.js`), "utf8");
const css = fs.readFileSync(path.join(root, `${portal}/components/v662-stability-freeze.css`), "utf8");
const closure = fs.readFileSync(path.join(root, `${portal}/components/v666-experience-closure.css`), "utf8");
const mobile = fs.readFileSync(path.join(root, `${portal}/components/mobile-hero-visibility.css`), "utf8");
const portalJs = fs.readFileSync(path.join(root, `${portal}/portal.js`), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, `${portal}/data/v502-manifest.json`), "utf8"));

for (const marker of [
  'CACHE_REVISION = "visual95"',
  'VISUAL_SYSTEM = "single-studio-v662-visual95"',
  'HERO_VISUAL_SYSTEM = "single-surface-v666"',
  'ROADSTER_KEY = "racing-roadster-v666"',
  'ROADSTER_SOURCE = "assets/hero/racing-roadster-v666.svg?v=666"',
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
]) if (!css.includes(marker)) errors.push(`Visual95 baseline CSS marker missing: ${marker}`);

for (const marker of [
  'KIDULTS Portal V666',
  '--v666-hero-surface:#f4f2ee',
  'background:transparent!important',
  'border-top:0!important'
]) if (!closure.includes(marker)) errors.push(`V666 closure CSS marker missing: ${marker}`);

for (const marker of ['viewBox="0 0 1600 900"', 'href="racing-roadster-v662.webp', '#f4f2ee']) {
  if (!svg.includes(marker)) errors.push(`V666 Hero SVG marker missing: ${marker}`);
}

if (mobile.includes("object-position:right center")) errors.push("Mobile Hero remains right-biased.");
if (!mobile.includes("object-position:center center")) errors.push("Mobile Hero center correction missing.");
for (const marker of [
  'editorial-assets.js?v=666',
  'mobile-hero-visibility.js?v=666',
  'homepage-structure.js?v=666',
  'dataset.portalHotfix = "v666"'
]) if (!portalJs.includes(marker)) errors.push(`Portal V666 integration marker missing: ${marker}`);

if (manifest.hero?.asset !== "assets/hero/racing-roadster-v666.svg") errors.push("Manifest active Hero asset mismatch.");
if (manifest.hero?.production_status !== "HOLD") errors.push("Hero Production status must remain HOLD.");

if (errors.length) {
  console.error(`KIDULTS V662 Visual95 baseline → V666 closure: FAIL (${errors.length})`);
  errors.forEach(error => console.error(`ERROR: ${error}`));
  process.exit(1);
}
console.log("KIDULTS V662 Visual95 baseline → V666 closure: PASS — neutral one-surface Hero, balanced Roadster, single-studio K100, Production HOLD.");
