import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const errors = [];
const read = relative => {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) { errors.push(`Missing required file: ${relative}`); return ""; }
  return fs.readFileSync(file, "utf8");
};

const runtime = read("apps/kidults-enterprise-staging/public/portal/components/mobile-hero-visibility.js");
const css = read("apps/kidults-enterprise-staging/public/portal/components/v658-visual-freeze.css");
const portal = read("apps/kidults-enterprise-staging/public/portal/portal.js");
const manifest = JSON.parse(read("apps/kidults-enterprise-staging/public/portal/data/v502-manifest.json") || "{}");

for (const marker of [
  "startMobileHeroVisibility",
  'ASSET_VERSION = "658"',
  "mobile_asset",
  "fallbackSvgDataUri",
  'fetchPriority = "high"',
  'image.hidden = false',
  'image.removeAttribute("hidden")',
  "KIDULTS_MOBILE_HERO"
]) if (!runtime.includes(marker)) errors.push(`Mobile Hero runtime missing marker: ${marker}`);

for (const marker of [
  'data-hero-asset="racing-roadster-v658"',
  "aspect-ratio:4/3",
  "object-fit:contain!important",
  "object-position:center bottom!important",
  "@media(max-width:390px)"
]) if (!css.includes(marker)) errors.push(`V658 Hero CSS missing marker: ${marker}`);

for (const marker of [
  'mobile-hero-visibility.js?v=658',
  'editorial-assets.js?v=658',
  'renderers.js?v=658'
]) if (!portal.includes(marker)) errors.push(`portal.js missing V658 marker: ${marker}`);

if (manifest.hero?.asset !== "assets/hero/racing-roadster-v658-desktop.webp") errors.push("Desktop Hero asset mismatch.");
if (manifest.hero?.mobile_asset !== "assets/hero/racing-roadster-v658-mobile.webp") errors.push("Mobile Hero asset mismatch.");

if (errors.length) {
  console.error(`KIDULTS Mobile Hero Visibility validation: FAIL (${errors.length} error(s))`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}
console.log("KIDULTS Mobile Hero Visibility validation: PASS (V658 desktop Roadster + mobile full-car 4:3 containment)");
