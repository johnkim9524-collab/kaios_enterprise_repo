import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const errors = [];
const warnings = [];
const portalRoot = "apps/kidults-enterprise-staging/public/portal";
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

function validateWebP(relative) {
  const file = absolute(relative);
  if (!fs.existsSync(file)) {
    errors.push(`Missing canonical WebP: ${relative}`);
    return;
  }
  const data = fs.readFileSync(file);
  if (data.length < 40_000) errors.push(`Canonical WebP is unexpectedly small: ${data.length} bytes.`);
  if (data.subarray(0, 4).toString("ascii") !== "RIFF") errors.push("Canonical Roadster is not a RIFF file.");
  if (data.subarray(8, 12).toString("ascii") !== "WEBP") errors.push("Canonical Roadster is not a WebP file.");
}

const requiredFiles = [
  `${portalRoot}/index.html`,
  `${portalRoot}/workspace.html`,
  `${portalRoot}/vertical.html`,
  `${portalRoot}/object.html`,
  `${portalRoot}/portal-v502.css`,
  `${portalRoot}/portal.js`,
  `${portalRoot}/workspace-page.js`,
  `${portalRoot}/workspace-page.css`,
  `${portalRoot}/detail.js`,
  `${portalRoot}/components/data-store.js`,
  `${portalRoot}/components/renderers.js`,
  `${portalRoot}/components/interactions.js`,
  `${portalRoot}/components/editorial-assets.js`,
  `${portalRoot}/components/homepage-structure.js`,
  `${portalRoot}/components/v662-stability-freeze.css`,
  `${portalRoot}/components/mobile-hero-visibility.js`,
  `${portalRoot}/components/mobile-hero-visibility.css`,
  `${portalRoot}/components/k100-integrity-reset.js`,
  `${portalRoot}/components/k100-integrity-reset.css`,
  `${portalRoot}/assets/hero/racing-roadster-v662.webp`,
  `${portalRoot}/data/v502-manifest.json`,
  `${portalRoot}/data/registry-view.json`,
  `${portalRoot}/data/verticals.json`,
  `${portalRoot}/data/kidult100.json`,
  `${portalRoot}/data/portal-release-manifest-v502.json`,
  "coordination/kidults/registry/track/index.json",
  "coordination/kidults/registry/track/records/track-c-portal-v502-experience-layer.json",
  "coordination/kidults/registry/mission/records/mission-track-c-v502-registry-consumer.json"
];
for (const relative of requiredFiles) {
  if (!fs.existsSync(absolute(relative))) errors.push(`Missing required file: ${relative}`);
}

const html = readText(`${portalRoot}/index.html`);
const workspaceHtml = readText(`${portalRoot}/workspace.html`);
const portalJs = readText(`${portalRoot}/portal.js`);
const workspacePage = readText(`${portalRoot}/workspace-page.js`);
const dataStore = readText(`${portalRoot}/components/data-store.js`);
const renderers = readText(`${portalRoot}/components/renderers.js`);
const interactions = readText(`${portalRoot}/components/interactions.js`);
const homepage = readText(`${portalRoot}/components/homepage-structure.js`);
const editorialAssets = readText(`${portalRoot}/components/editorial-assets.js`);
const v662Css = readText(`${portalRoot}/components/v662-stability-freeze.css`);
const css = readText(`${portalRoot}/portal-v502.css`);

for (const marker of [
  'data-release="v502"',
  'data-homepage-structure="v662"',
  'portal.js?v=662',
  'v662-stability-freeze.css?v=662',
  'racing-roadster-v662.webp?v=662',
  'data-hero-asset="racing-roadster-v662"',
  'href="workspace.html"',
  'id="verticals"',
  'data-vertical-grid',
  'id="search-dialog"',
  'data-registry-ribbon',
  'data-release-baseline'
]) {
  if (!html.includes(marker)) errors.push(`index.html missing V662/V502 marker: ${marker}`);
}

for (const marker of [
  'workspace-page.css?v=662',
  'workspace-page.js?v=662',
  'data-workspace-context',
  'data-workspace-mount'
]) {
  if (!workspaceHtml.includes(marker)) errors.push(`workspace.html missing V662 marker: ${marker}`);
}
if (workspaceHtml.includes("workspace-page-intro")) errors.push("Workspace still contains the retired duplicate introduction.");

for (const marker of [
  "renderHero",
  "renderRegistryRibbon",
  "renderVerticals",
  "renderReleaseBaseline",
  "setupSearch",
  "setupVerticalFilter",
  "startK100IntegrityReset",
  "startMobileHeroVisibility",
  "startAssetBindingHotfix",
  "startHomepageStructure",
  'homepage-structure.js?v=662',
  'mobile-hero-visibility.js?v=662',
  'editorial-assets.js?v=662',
  'renderers.js?v=662'
]) {
  if (!portalJs.includes(marker)) errors.push(`portal.js missing V662 integration: ${marker}`);
}
for (const retired of ["startCopilot", "startCompareEngine", "startDecisionEngine", "startWorkspace"]) {
  if (portalJs.includes(retired)) errors.push(`Homepage must not mount dedicated Workspace runtime: ${retired}`);
}

for (const marker of [
  "startCopilot({ data, contract: data.copilot })",
  "startCompareEngine({ data, contract: data.compare })",
  "startDecisionEngine({ data, contract: data.decision })",
  "startWorkspace({ data, contract: data.workspace })"
]) {
  if (!workspacePage.includes(marker)) errors.push(`Dedicated Workspace runtime missing: ${marker}`);
}

for (const marker of ["v502-manifest.json", "registry-view.json", "verticals.json", "portal-release-manifest-v502.json"]) {
  if (!dataStore.includes(marker)) errors.push(`data-store.js missing source: ${marker}`);
}
for (const marker of ["vertical-card", "registry-ribbon", "search-dialog", "detail-hero", "release-baseline"]) {
  if (!css.includes(`.${marker}`)) errors.push(`portal-v502.css missing component style: .${marker}`);
}
if (!renderers.includes("current_observation_order")) errors.push("Vertical renderer must expose current observation order.");
if (!interactions.includes("setupSearch")) errors.push("Search interaction is not implemented.");
if (!homepage.includes('main.dataset.finalStructure = "v662"')) errors.push("Homepage structure is not frozen at V662.");
for (const marker of [
  'ROADSTER_KEY = "racing-roadster-v662"',
  'racing-roadster-v662.webp',
  'museum-editorial-v662'
]) {
  if (!editorialAssets.includes(marker)) errors.push(`V662 asset runtime missing: ${marker}`);
}
for (const marker of [
  'data-hero-asset="racing-roadster-v662"',
  'data-image-format="museum-editorial-v662"',
  "object-fit:contain!important",
  "aspect-ratio:4/3",
  "@media(max-width:340px)"
]) {
  if (!v662Css.includes(marker)) errors.push(`V662 stability CSS missing: ${marker}`);
}
if (/Koala Sculpture/i.test([html, renderers, dataStore].join("\n"))) errors.push("Retired temporary Koala remains in V502 code.");

const manifest = readJson(`${portalRoot}/data/v502-manifest.json`);
const registryView = readJson(`${portalRoot}/data/registry-view.json`);
const verticalData = readJson(`${portalRoot}/data/verticals.json`);
const k100 = readJson(`${portalRoot}/data/kidult100.json`);
const summary = readJson(`${portalRoot}/data/portal-summary.json`);
const release = readJson(`${portalRoot}/data/portal-release-manifest-v502.json`);
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
  if (manifest.hero?.asset !== "assets/hero/racing-roadster-v662.webp") errors.push("Manifest canonical Roadster asset mismatch.");
  if (!(manifest.routes ?? []).some(route => route.id === "workspace" && route.path === "workspace.html")) {
    errors.push("Manifest does not register the dedicated Workspace route.");
  }
}

validateWebP(`${portalRoot}/assets/hero/racing-roadster-v662.webp`);
for (const retired of [
  "racing-roadster-v654.webp",
  "racing-roadster-v658-desktop.webp",
  "racing-roadster-v660-master.webp",
  "racing-roadster-v658-mobile.webp"
]) {
  if (fs.existsSync(absolute(`${portalRoot}/assets/hero/${retired}`))) errors.push(`Retired Roadster still exists: ${retired}`);
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
    else if (!fs.existsSync(path.join(root, portalRoot, item.asset))) errors.push(`Missing Featured Slice asset: ${item.asset}`);
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
  `${portalRoot}/portal.js`,
  `${portalRoot}/workspace-page.js`,
  `${portalRoot}/detail.js`,
  `${portalRoot}/components/data-store.js`,
  `${portalRoot}/components/renderers.js`,
  `${portalRoot}/components/interactions.js`,
  `${portalRoot}/components/k100-integrity-reset.js`,
  `${portalRoot}/components/mobile-hero-visibility.js`
]) {
  if (/\bundefined\b\s*[:=]/.test(readText(relative))) warnings.push(`${relative}: explicit undefined assignment detected.`);
}

if (errors.length) {
  console.error(`KIDULTS Portal V502/V662 validation: FAIL (${errors.length} error(s), ${warnings.length} warning(s))`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  for (const warning of warnings) console.warn(`WARN: ${warning}`);
  process.exit(1);
}

console.log(`KIDULTS Portal V502/V662 validation: PASS (${requiredFiles.length} required files, one verified Roadster, 8 verticals, 4 featured objects)`);
for (const warning of warnings) console.warn(`WARN: ${warning}`);
