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
const css = read(`${portalRoot}/components/mobile-hero-visibility.css`);
const portal = read(`${portalRoot}/portal.js`);
const editorial = read(`${portalRoot}/components/editorial-assets.js`);
const workflow = read(".github/workflows/kidults-portal-v502-validate.yml");

for (const marker of [
  'const VERSION = "2.1.0"',
  'const ASSET_VERSION = "658"',
  'image.hidden = false',
  'image.removeAttribute("hidden")',
  'card.dataset.mobileHeroState',
  'KIDULTS_MOBILE_HERO'
]) {
  if (!runtime.includes(marker)) errors.push(`Hero runtime missing marker: ${marker}`);
}

for (const marker of [
  '.moment-image[data-hero-image]',
  'display:block!important',
  'visibility:visible!important',
  'aspect-ratio:4/3!important',
  'object-fit:cover!important',
  'object-position:right center!important',
  '@media(max-width:360px)'
]) {
  if (!css.includes(marker)) errors.push(`Hero CSS missing marker: ${marker}`);
}

if (!portal.includes('mobile-hero-visibility.js?v=658')) errors.push("portal.js does not load V658 mobile Hero runtime.");
if (!portal.includes('editorial-assets.js?v=658')) errors.push("portal.js does not load V658 editorial asset binding.");
if (!portal.includes('renderers.js?v=658')) errors.push("portal.js does not cache-bust V658 renderers.");
if (portal.indexOf("startAssetBindingHotfix();") > portal.indexOf("startMobileHeroVisibility({ manifest: data.manifest });")) {
  errors.push("Roadster binding must run before Mobile Hero Visibility.");
}
if (!editorial.includes('racing-roadster-v655.js?v=658')) errors.push("Editorial runtime is not connected to the V658 Roadster bundle.");
if (!editorial.includes('ROADSTER_KEY = "racing-roadster-v658"')) errors.push("Editorial runtime does not identify the V658 Roadster master.");

const fragments = [
  "racing-roadster-v655-part1.js",
  "racing-roadster-v655-part2.js",
  "racing-roadster-v655-part3a.js",
  "racing-roadster-v655-part3b.js"
].map(name => read(`${portalRoot}/components/assets/${name}`));
const encoded = fragments.map((source, index) => {
  const match = source.match(/export default ["']([A-Za-z0-9+/=]+)["'];/);
  if (!match) {
    errors.push(`Roadster fragment ${index + 1} is invalid.`);
    return "";
  }
  return match[1];
}).join("");
if (encoded) {
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length < 25000) errors.push(`Roadster master is unexpectedly small: ${bytes.length} bytes.`);
  if (bytes.subarray(0, 4).toString("ascii") !== "RIFF" || bytes.subarray(8, 12).toString("ascii") !== "WEBP") {
    errors.push("Roadster master is not a valid WebP payload.");
  }
}

if (!workflow.includes("node --check apps/kidults-enterprise-staging/public/portal/components/mobile-hero-visibility.js")) {
  errors.push("Workflow does not syntax-check Mobile Hero Visibility.");
}
if (!workflow.includes("node scripts/kidults/portal/validate-mobile-hero-visibility.mjs")) {
  errors.push("Workflow does not run Mobile Hero Visibility validation.");
}

if (errors.length) {
  console.error(`KIDULTS Mobile Hero Visibility validation: FAIL (${errors.length} error(s))`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

console.log("KIDULTS Mobile Hero Visibility validation: PASS (V658 Roadster master, full-car 4:3 mobile framing)");
