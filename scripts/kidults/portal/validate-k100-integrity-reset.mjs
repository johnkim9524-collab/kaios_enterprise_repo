import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const errors = [];

const paths = {
  portalK100: "apps/kidults-enterprise-staging/public/portal/data/kidult100.json",
  canonicalK100: "apps/kidults-enterprise-staging/public/data/portal-k100.json",
  verticals: "apps/kidults-enterprise-staging/public/portal/data/verticals.json",
  manifest: "apps/kidults-enterprise-staging/public/portal/data/v502-manifest.json",
  runtime: "apps/kidults-enterprise-staging/public/portal/components/k100-integrity-reset.js",
  css: "apps/kidults-enterprise-staging/public/portal/components/k100-integrity-reset.css",
  retiredAsset: "apps/kidults-enterprise-staging/public/portal/assets/kidult100/art-toy-v501.webp"
};

function readText(relative) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) {
    errors.push(`Missing required file: ${relative}`);
    return "";
  }
  return fs.readFileSync(absolute, "utf8");
}

function readJson(relative) {
  const text = readText(relative);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    errors.push(`Invalid JSON: ${relative}: ${error.message}`);
    return null;
  }
}

const portalK100 = readJson(paths.portalK100);
const canonicalK100 = readJson(paths.canonicalK100);
const verticals = readJson(paths.verticals);
const manifest = readJson(paths.manifest);
const runtime = readText(paths.runtime);
const css = readText(paths.css);

if (fs.existsSync(path.join(root, paths.retiredAsset))) {
  errors.push("Retired unverified Koala asset still exists in the public portal.");
}

for (const [label, data] of [["portal", portalK100], ["canonical", canonicalK100]]) {
  const items = data?.items ?? [];
  if (items.length !== 4) errors.push(`${label} K100 must contain exactly four public-preview objects.`);
  if (items.some(item => /koala|original art figure/i.test(item.title ?? item.name ?? ""))) {
    errors.push(`${label} K100 still contains an unverified Koala / Original Art Figure.`);
  }
  if (items.some(item => ["art-toy-01", "character-01"].includes(item.id))) {
    errors.push(`${label} K100 still contains a retired unverified Toys object ID.`);
  }
  const footwear = items.find(item => item.id === "footwear-01");
  if ((footwear?.title ?? footwear?.name) !== "Archive Sneaker 01") {
    errors.push(`${label} K100 footwear title must be Archive Sneaker 01.`);
  }
  const ranks = items.map(item => item.rank).sort((a, b) => a - b).join(",");
  if (ranks !== "1,2,3,4") errors.push(`${label} K100 ranks must be exactly 1,2,3,4; found ${ranks}.`);
}

if (portalK100) {
  if (portalK100.asset_standard?.id !== "K100_EDITORIAL_ASSET_V1") {
    errors.push("Portal K100 asset standard is not registered.");
  }
  if (portalK100.asset_standard?.unverified_visual_policy !== "WITHHOLD") {
    errors.push("Portal K100 must withhold unverified visuals.");
  }
  for (const item of portalK100.items ?? []) {
    if (item.visual_role !== "EDITORIAL_INTERPRETATION") {
      errors.push(`${item.id}: visual role must be EDITORIAL_INTERPRETATION.`);
    }
    if (!Number.isFinite(Number(item.display_scale)) || Number(item.display_scale) <= 0) {
      errors.push(`${item.id}: display_scale must be a positive number.`);
    }
  }
}

const toys = verticals?.verticals?.find(item => item.id === "vertical-toys-models");
if (toys?.visual_asset !== null) errors.push("Toys & Models visual_asset must be null.");
if (toys?.visual_status !== "VISUAL_WITHHELD_PENDING_EVIDENCE") {
  errors.push("Toys & Models must declare VISUAL_WITHHELD_PENDING_EVIDENCE.");
}

if (manifest?.display_policy?.featured_slice_count !== 4) {
  errors.push("Manifest featured_slice_count must be 4.");
}
if (manifest?.display_policy?.unverified_visual_policy !== "WITHHOLD") {
  errors.push("Manifest unverified_visual_policy must be WITHHOLD.");
}

for (const marker of [
  "startK100IntegrityReset",
  "updateSliceStatus",
  "--k100-object-scale",
  "KIDULTS_K100_INTEGRITY",
  "selectionCount"
]) {
  if (!runtime.includes(marker)) errors.push(`K100 integrity runtime missing marker: ${marker}`);
}

for (const marker of [
  "grid-template-columns:repeat(4",
  "aspect-ratio:4/3",
  "object-fit:contain",
  "--k100-object-scale",
  "@media(max-width:1240px)",
  "@media(max-width:760px)",
  "@media(max-width:390px)"
]) {
  if (!css.includes(marker)) errors.push(`K100 integrity CSS missing marker: ${marker}`);
}

if (errors.length) {
  console.error(`KIDULTS K100 integrity reset validation: FAIL (${errors.length} error(s))`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

console.log("KIDULTS K100 integrity reset validation: PASS (4 objects, Koala removed, visual policy registered)");
