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
const masterPath = "apps/kidults-enterprise-staging/public/portal/assets/hero/racing-roadster-v660-master.webp";
const retiredMobilePath = "apps/kidults-enterprise-staging/public/portal/assets/hero/racing-roadster-v658-mobile.webp";

for (const marker of [
  "startMobileHeroVisibility",
  'ASSET_VERSION = "660"',
  "canonicalSource",
  "fallbackSvgDataUri",
  'fetchPriority = "high"',
  'image.hidden = false',
  'image.removeAttribute("hidden")',
  "KIDULTS_MOBILE_HERO"
]) if (!runtime.includes(marker)) errors.push(`Mobile Hero runtime missing marker: ${marker}`);

if (runtime.includes("mobile_asset")) errors.push("Mobile Hero runtime still contains a second mobile-specific Roadster source.");

for (const marker of [
  'data-hero-asset="racing-roadster-v660"',
  "aspect-ratio:4/3",
  "object-fit:cover!important",
  "object-position:right center!important",
  "@media(max-width:390px)"
]) if (!css.includes(marker)) errors.push(`V660 Hero CSS missing marker: ${marker}`);

for (const marker of [
  "mobile-hero-visibility.js",
  "editorial-assets.js",
  "renderers.js"
]) if (!portal.includes(marker)) errors.push(`portal.js missing Hero integration: ${marker}`);

if (!fs.existsSync(path.join(root, masterPath))) errors.push("Canonical V660 Roadster master is missing.");
if (fs.existsSync(path.join(root, retiredMobilePath))) errors.push("Retired second/mobile Roadster image still exists.");
if (manifest.hero?.asset !== "assets/hero/racing-roadster-v660-master.webp") errors.push("Canonical Hero asset mismatch.");
if (Object.prototype.hasOwnProperty.call(manifest.hero ?? {}, "mobile_asset")) errors.push("Manifest still registers a second mobile-specific Roadster.");

if (errors.length) {
  console.error(`KIDULTS Mobile Hero Visibility validation: FAIL (${errors.length} error(s))`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}
console.log("KIDULTS Mobile Hero Visibility validation: PASS (one V660 Roadster master, desktop and mobile responsive framing)");
