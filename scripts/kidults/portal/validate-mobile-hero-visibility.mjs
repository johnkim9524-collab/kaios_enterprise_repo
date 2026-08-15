import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const errors = [];
const read = relative => {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) {
    errors.push(`Missing required file: ${relative}`);
    return "";
  }
  return fs.readFileSync(file, "utf8");
};

const portalRoot = "apps/kidults-enterprise-staging/public/portal";
const runtime = read(`${portalRoot}/components/mobile-hero-visibility.js`);
const mobileCss = read(`${portalRoot}/components/mobile-hero-visibility.css`);
const stabilityCss = read(`${portalRoot}/components/v662-stability-freeze.css`);
const portal = read(`${portalRoot}/portal.js`);
const editorial = read(`${portalRoot}/components/editorial-assets.js`);
const manifest = JSON.parse(read(`${portalRoot}/data/v502-manifest.json`) || "{}");
const canonicalPath = `${portalRoot}/assets/hero/racing-roadster-v662.webp`;

for (const marker of [
  "startMobileHeroVisibility",
  'ASSET_VERSION = "662"',
  'HERO_KEY = "racing-roadster-v662"',
  "canonicalSource",
  "fallbackSvgDataUri",
  'fetchPriority = "high"',
  'image.hidden = false',
  'image.removeAttribute("hidden")',
  "KIDULTS_MOBILE_HERO"
]) {
  if (!runtime.includes(marker)) errors.push(`Mobile Hero runtime missing marker: ${marker}`);
}
if (runtime.includes("mobile_asset")) errors.push("Mobile Hero runtime still contains a second mobile-specific Roadster source.");

for (const marker of [
  'data-hero-asset="racing-roadster-v662"',
  "single-studio-v662-visual95",
  "aspect-ratio:4/3",
  "object-fit:contain!important",
  "object-position:center center!important",
  "@media(max-width:768px)",
  "@media(max-width:340px)"
]) {
  if (!stabilityCss.includes(marker)) errors.push(`V662 Visual95 Hero CSS missing marker: ${marker}`);
}
for (const marker of [
  "@media(max-width:768px)",
  "@media(max-width:390px)",
  "@media(max-width:360px)",
  "object-fit:contain!important",
  "object-position:center center!important"
]) {
  if (!mobileCss.includes(marker)) errors.push(`Mobile support CSS missing marker: ${marker}`);
}
if (mobileCss.includes("object-position:right center")) errors.push("Mobile Hero remains right-biased.");

for (const marker of [
  'mobile-hero-visibility.js?v=662-visual95-final',
  'editorial-assets.js?v=662-visual95-final',
  'homepage-structure.js?v=662-visual95-final',
  'renderers.js?v=665'
]) {
  if (!portal.includes(marker)) errors.push(`portal.js missing Visual95 Hero integration: ${marker}`);
}
for (const marker of [
  'ROADSTER_KEY = "racing-roadster-v662"',
  'CACHE_REVISION = "visual95"',
  'ASSET_QUERY = `${ASSET_VERSION}-${CACHE_REVISION}-${FINAL_TUNE_REVISION}`',
  'racing-roadster-v662.webp?v=${ASSET_QUERY}',
  'museum-editorial-v662',
  'single-studio-v662-visual95'
]) {
  if (!editorial.includes(marker)) errors.push(`Editorial Visual95 asset binding missing marker: ${marker}`);
}

const absoluteCanonical = path.join(root, canonicalPath);
if (!fs.existsSync(absoluteCanonical)) {
  errors.push("Canonical V662 Roadster is missing.");
} else {
  const data = fs.readFileSync(absoluteCanonical);
  if (data.subarray(0, 4).toString("ascii") !== "RIFF") errors.push("Canonical Roadster is not RIFF.");
  if (data.subarray(8, 12).toString("ascii") !== "WEBP") errors.push("Canonical Roadster is not WEBP.");
  if (data.length < 40_000) errors.push(`Canonical Roadster is unexpectedly small: ${data.length} bytes.`);
}
for (const retired of [
  "racing-roadster-v654.webp",
  "racing-roadster-v658-desktop.webp",
  "racing-roadster-v660-master.webp",
  "racing-roadster-v658-mobile.webp"
]) {
  if (fs.existsSync(path.join(root, `${portalRoot}/assets/hero/${retired}`))) errors.push(`Retired Roadster still exists: ${retired}`);
}
if (manifest.hero?.asset !== "assets/hero/racing-roadster-v662.webp") errors.push("Canonical Hero asset mismatch.");
if (Object.prototype.hasOwnProperty.call(manifest.hero ?? {}, "mobile_asset")) errors.push("Manifest still registers a second mobile-specific Roadster.");

if (errors.length) {
  console.error(`KIDULTS Mobile Hero Visibility validation: FAIL (${errors.length} error(s))`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}
console.log("KIDULTS Mobile Hero Visibility validation: PASS (Visual95 cache generation, one verified Roadster, centered full-image desktop and mobile framing)");
