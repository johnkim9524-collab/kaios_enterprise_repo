import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const master = "apps/kidults-enterprise-staging/public/portal/assets/hero/racing-roadster-v660-master.webp";
const retiredMobile = "apps/kidults-enterprise-staging/public/portal/assets/hero/racing-roadster-v658-mobile.webp";
const cssPath = "apps/kidults-enterprise-staging/public/portal/components/v658-visual-freeze.css";
const errors = [];

for (const file of [master, cssPath]) {
  if (!fs.existsSync(path.join(root, file))) errors.push(`Missing ${file}`);
}
if (fs.existsSync(path.join(root, retiredMobile))) errors.push("Retired second/mobile Roadster image still exists.");

const read = p => fs.readFileSync(path.join(root, p), "utf8");
const portal = read("apps/kidults-enterprise-staging/public/portal/portal.js");
const assets = read("apps/kidults-enterprise-staging/public/portal/components/editorial-assets.js");
const mobile = read("apps/kidults-enterprise-staging/public/portal/components/mobile-hero-visibility.js");
const css = read(cssPath);
const manifest = JSON.parse(read("apps/kidults-enterprise-staging/public/portal/data/v502-manifest.json"));

for (const marker of ["mobile-hero-visibility.js", "editorial-assets.js", "renderers.js"]) {
  if (!portal.includes(marker)) errors.push(`portal missing ${marker}`);
}
for (const marker of ["racing-roadster-v660-master.webp", "ROADSTER_KEY = \"racing-roadster-v660\"", "museum-editorial-v660"]) {
  if (!assets.includes(marker)) errors.push(`asset runtime missing ${marker}`);
}
if (assets.includes("racing-roadster-v658-mobile.webp") || mobile.includes("mobile_asset")) {
  errors.push("A second mobile-specific Roadster remains registered.");
}
for (const marker of [
  'data-hero-asset="racing-roadster-v660"',
  "object-fit:cover!important",
  "object-position:right center!important",
  "aspect-ratio:4/3",
  'data-image-format="museum-editorial-v660"'
]) {
  if (!css.includes(marker)) errors.push(`CSS missing ${marker}`);
}
if (manifest.hero?.asset !== "assets/hero/racing-roadster-v660-master.webp") errors.push("Manifest canonical asset mismatch.");
if (Object.prototype.hasOwnProperty.call(manifest.hero ?? {}, "mobile_asset")) errors.push("Manifest still contains mobile_asset.");

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("KIDULTS V660 final visual freeze: PASS (one Roadster master, responsive Hero, unified K100 4:3 framing)");
