import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const errors = [];
const warnings = [];
const absolute = relative => path.join(root, relative);

function readText(relative) {
  if (!fs.existsSync(absolute(relative))) {
    errors.push(`Missing required file: ${relative}`);
    return "";
  }
  return fs.readFileSync(absolute(relative), "utf8");
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

const requiredFiles = [
  "apps/kidults-enterprise-staging/public/portal/index.html",
  "apps/kidults-enterprise-staging/public/portal/vertical.html",
  "apps/kidults-enterprise-staging/public/portal/object.html",
  "apps/kidults-enterprise-staging/public/portal/portal-v502.css",
  "apps/kidults-enterprise-staging/public/portal/portal.js",
  "apps/kidults-enterprise-staging/public/portal/detail.js",
  "apps/kidults-enterprise-staging/public/portal/components/data-store.js",
  "apps/kidults-enterprise-staging/public/portal/components/renderers.js",
  "apps/kidults-enterprise-staging/public/portal/components/interactions.js",
  "apps/kidults-enterprise-staging/public/portal/components/editorial-assets.js",
  "apps/kidults-enterprise-staging/public/portal/components/mobile-hero-visibility.js",
  "apps/kidults-enterprise-staging/public/portal/components/mobile-hero-visibility.css",
  "apps/kidults-enterprise-staging/public/portal/components/k100-integrity-reset.js",
  "apps/kidults-enterprise-staging/public/portal/components/k100-integrity-reset.css",
  "apps/kidults-enterprise-staging/public/portal/data/v502-manifest.json",
  "apps/kidults-enterprise-staging/public/portal/data/registry-view.json",
  "apps/kidults-enterprise-staging/public/portal/data/verticals.json",
  "apps/kidults-enterprise-staging/public/portal/data/kidult100.json",
  "apps/kidults-enterprise-staging/public/portal/data/portal-release-manifest-v502.json",
  "coordination/kidults/registry/track/index.json",
  "coordination/kidults/registry/track/records/track-c-portal-v502-experience-layer.json",
  "coordination/kidults/registry/mission/records/mission-track-c-v502-registry-consumer.json"
];
for (const relative of requiredFiles) {
  if (!fs.existsSync(absolute(relative))) errors.push(`Missing required file: ${relative}`);
}

const html = readText("apps/kidults-enterprise-staging/public/portal/index.html");
const portalJs = readText("apps/kidults-enterprise-staging/public/portal/portal.js");
const dataStore = readText("apps/kidults-enterprise-staging/public/portal/components/data-store.js");
const renderers = readText("apps/kidults-enterprise-staging/public/portal/components/renderers.js");
const interactions = readText("apps/kidults-enterprise-staging/public/portal/components/interactions.js");
const css = readText("apps/kidults-enterprise-staging/public/portal/portal-v502.css");

for (const marker of [
  'data-release="v502"',
  'portal-v502.css?v=658',
  'portal.js?v=658',
  'racing-roadster-v658-desktop.webp?v=658',
  'id="verticals"',
  'data-vertical-grid',
  'id="search-dialog"',
  'data-registry-ribbon',
  'data-release-baseline'
]) {
  if (!html.includes(marker)) errors.push(`index.html missing V658/V502 marker: ${marker}`);
}

for (const marker of [
  "renderHero",
  "renderRegistryRibbon",
  "renderVerticals",
  "renderReleaseBaseline",
  "setupSearch",
  "setupVerticalFilter",
  "startK100IntegrityReset",
  "startMobileHeroVisibility",
  "startAssetBindingHotfix"
]) {
  if (!portalJs.includes(marker)) errors.push(`portal.js missing integration: ${marker}`);
}
if (!portalJs.includes('mobile-hero-visibility.js?v=658')) errors.push("portal.js does not cache-bust Mobile Hero Visibility at V657.");
if (!portalJs.includes('editorial-assets.js?v=658')) errors.push("portal.js does not cache-bust editorial assets at V657.");
if (!portalJs.includes('renderers.js?v=658')) errors.push("portal.js does not cache-bust renderers at V657.");

for (const marker of ["v502-manifest.json", "registry-view.json", "verticals.json", "portal-release-manifest-v502.json"]) {
  if (!dataStore.includes(marker)) errors.push(`data-store.js missing source: ${marker}`);
}
for (const marker of ["vertical-card", "registry-ribbon", "search-dialog", "detail-hero", "release-baseline"]) {
  if (!css.includes(`.${marker}`)) errors.push(`portal-v502.css missing component style: .${marker}`);
}
if (!renderers.includes("current_observation_order")) errors.push("Vertical renderer must expose current observation order.");
if (!interactions.includes("setupSearch")) errors.push("Search interaction is not implemented.");
if (/Koala Sculpture/i.test([html, renderers, dataStore].join("\n"))) errors.push("Retired temporary Koala remains in V502 code.");

const manifest = readJson("apps/kidults-enterprise-staging/public/portal/data/v502-manifest.json");
const registryView = readJson("apps/kidults-enterprise-staging/public/portal/data/registry-view.json");
const verticalData = readJson("apps/kidults-enterprise-staging/public/portal/data/verticals.json");
const k100 = readJson("apps/kidults-enterprise-staging/public/portal/data/kidult100.json");
const summary = readJson("apps/kidults-enterprise-staging/public/portal/data/portal-summary.json");
const release = readJson("apps/kidults-enterprise-staging/public/portal/data/portal-release-manifest-v502.json");
const trackIndex = readJson("coordination/kidults/registry/track/index.json");
const trackC = readJson("coordination/kidults/registry/track/records/track-c-portal-v502-experience-layer.json");
const blockerC = readJson("coordination/kidults/registry/blocker/records/blocker-track-c-role-acceptance-pending.json");
const missionC = readJson("coordination/kidults/registry/mission/records/mission-track-c-v502-registry-consumer.json");

if (manifest) {
  if (manifest.status !== "RELEASE_CANDIDATE") errors.push("V502 manifest status must be RELEASE_CANDIDATE.");
  if (manifest.production !== false) errors.push("V502 RC must not claim Production.");
  if (manifest.snapshot_id !== "baseline-provider-independent-v1") errors.push("V502 manifest must use the registered baseline snapshot.");
  if (manifest.candidate_snapshot_id !== null) errors.push("V502 must not fabricate a candidate snapshot.");
  if (manifest.assessment_id !== null) errors.push("V502 must not fabricate an assessment.");
  if (manifest.display_policy?.core_vertical_count !== 8) errors.push("V502 must declare eight Core Verticals.");
  if (manifest.display_policy?.featured_slice_count !== 4) errors.push("V6 public slice must declare four objects.");
  if (manifest.display_policy?.unverified_visual_policy !== "WITHHOLD") errors.push("Unverified visuals must be withheld.");
  if (manifest.display_policy?.missing_to_zero !== false) errors.push("V502 must forbid missing-to-zero conversion.");
  if (manifest.experience_label !== "V6 RC") errors.push("V6 label must remain separate from V502 contract.");
}

if (verticalData) {
  const verticals = verticalData.verticals ?? [];
  if (verticals.length !== 8) errors.push(`Expected 8 Core Verticals, found ${verticals.length}.`);
  if (new Set(verticals.map(item => item.id)).size !== verticals.length) errors.push("Core Vertical IDs must be unique.");
  if (verticals.filter(item => item.featured).length !== 5) errors.push("Featured baseline must contain five verticals.");
  if (verticalData.source_snapshot_id !== manifest?.snapshot_id) errors.push("Vertical data and manifest snapshot IDs differ.");
  const orders = verticals.map(item => item.structural_order).sort((a, b) => a - b).join(",");
  if (orders !== "1,2,3,4,5,6,7,8") errors.push("Structural orders must be exactly 1–8.");
  const toys = verticals.find(item => item.id === "vertical-toys-models");
  if (toys?.visual_asset !== null || toys?.visual_status !== "VISUAL_WITHHELD_PENDING_EVIDENCE") {
    errors.push("Toys & Models evidence visual must remain withheld pending evidence.");
  }
}

if (k100) {
  const items = k100.items ?? [];
  if (items.length !== 4) errors.push("V6 Featured Slice must contain exactly four objects.");
  if (k100.snapshot_id !== manifest?.snapshot_id) errors.push("Kidult 100 and manifest snapshot IDs differ.");
  if (k100.asset_standard?.unverified_visual_policy !== "WITHHOLD") errors.push("K100 must withhold unverified visuals.");
  if (items.map(item => item.rank).sort((a, b) => a - b).join(",") !== "1,2,3,4") errors.push("K100 editorial ranks must be 1–4.");
  for (const item of items) {
    if (!item.asset) errors.push(`${item.id}: missing registered asset.`);
    else if (!fs.existsSync(path.join(root, "apps/kidults-enterprise-staging/public/portal", item.asset))) errors.push(`Missing Featured Slice asset: ${item.asset}`);
    if (item.visual_role !== "EDITORIAL_INTERPRETATION") errors.push(`${item.id}: visual role must identify editorial interpretation.`);
  }
  if (items.some(item => /koala|original art figure/i.test(item.title))) errors.push("Retired object appears in K100.");
  if (items.find(item => item.id === "footwear-01")?.title !== "Archive Sneaker 01") errors.push("Footwear must be Archive Sneaker 01.");
}

if (summary?.snapshot_id !== manifest?.snapshot_id) errors.push("Portal summary and manifest snapshot IDs differ.");
if (registryView?.snapshot?.baseline_id !== manifest?.snapshot_id) errors.push("Registry projection baseline does not match manifest.");
if (release?.status !== "RELEASE_CANDIDATE" || release?.production !== false || release?.production_gate !== "HOLD") errors.push("Portal release must remain a non-Production HOLD release candidate.");
if (release?.rollback_target !== "V501") errors.push("V502 must preserve the V501 rollback target.");
const trackCIndex = trackIndex?.records?.find(record => record.id === "track-c-portal-v502-experience-layer");
if (trackCIndex?.status !== "ACTIVE") errors.push("Track C index status must be ACTIVE.");
if (trackC?.role_acceptance !== "APPROVED" || trackC?.status !== "ACTIVE") errors.push("Track C role acceptance is not APPROVED / ACTIVE.");
if (blockerC?.status !== "RESOLVED") errors.push("Track C role-acceptance blocker must be RESOLVED.");
if (missionC?.status !== "IN_PROGRESS") errors.push("Track C V502 mission must be IN_PROGRESS.");

for (const relative of [
  "apps/kidults-enterprise-staging/public/portal/portal.js",
  "apps/kidults-enterprise-staging/public/portal/detail.js",
  "apps/kidults-enterprise-staging/public/portal/components/data-store.js",
  "apps/kidults-enterprise-staging/public/portal/components/renderers.js",
  "apps/kidults-enterprise-staging/public/portal/components/interactions.js",
  "apps/kidults-enterprise-staging/public/portal/components/k100-integrity-reset.js",
  "apps/kidults-enterprise-staging/public/portal/components/mobile-hero-visibility.js"
]) {
  if (/\bundefined\b\s*[:=]/.test(readText(relative))) warnings.push(`${relative}: explicit undefined assignment detected.`);
}

if (errors.length) {
  console.error(`KIDULTS Portal V502 validation: FAIL (${errors.length} error(s), ${warnings.length} warning(s))`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  for (const warning of warnings) console.warn(`WARN: ${warning}`);
  process.exit(1);
}

console.log(`KIDULTS Portal V502 validation: PASS (${requiredFiles.length} required files, 8 verticals, 4 featured objects, V658 cache generation)`);
for (const warning of warnings) console.warn(`WARN: ${warning}`);
