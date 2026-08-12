import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const portalRoot = path.join(root, "apps", "kidults-enterprise-staging", "public", "portal");
const errors = [];
const warnings = [];

function file(relative) {
  return path.join(root, relative);
}

function readText(relative) {
  const absolute = file(relative);
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
  "apps/kidults-enterprise-staging/public/portal/data/v502-manifest.json",
  "apps/kidults-enterprise-staging/public/portal/data/registry-view.json",
  "apps/kidults-enterprise-staging/public/portal/data/verticals.json",
  "apps/kidults-enterprise-staging/public/portal/data/portal-release-manifest-v502.json",
  "coordination/kidults/registry/track/index.json",
  "coordination/kidults/registry/track/records/track-c-portal-v502-experience-layer.json",
  "coordination/kidults/registry/mission/records/mission-track-c-v502-registry-consumer.json",
  "coordination/kidults/registry/work-queue/records/work-track-c-build-v502-release-candidate.json"
];

for (const relative of requiredFiles) {
  if (!fs.existsSync(file(relative))) errors.push(`Missing required file: ${relative}`);
}

const html = readText("apps/kidults-enterprise-staging/public/portal/index.html");
const portalJs = readText("apps/kidults-enterprise-staging/public/portal/portal.js");
const dataStore = readText("apps/kidults-enterprise-staging/public/portal/components/data-store.js");
const renderers = readText("apps/kidults-enterprise-staging/public/portal/components/renderers.js");
const interactions = readText("apps/kidults-enterprise-staging/public/portal/components/interactions.js");
const css = readText("apps/kidults-enterprise-staging/public/portal/portal-v502.css");

for (const marker of [
  'data-release="v502"',
  'portal-v502.css?v=651',
  'portal.js?v=651',
  'id="verticals"',
  'data-vertical-grid',
  'id="search-dialog"',
  'data-registry-ribbon',
  'data-release-baseline'
]) {
  if (!html.includes(marker)) errors.push(`index.html missing V502 marker: ${marker}`);
}

for (const marker of [
  "renderHero",
  "renderRegistryRibbon",
  "renderVerticals",
  "renderReleaseBaseline",
  "setupSearch",
  "setupVerticalFilter"
]) {
  if (!portalJs.includes(marker)) errors.push(`portal.js missing integration: ${marker}`);
}

for (const marker of [
  "v502-manifest.json",
  "registry-view.json",
  "verticals.json",
  "portal-release-manifest-v502.json"
]) {
  if (!dataStore.includes(marker)) errors.push(`data-store.js missing source: ${marker}`);
}

for (const marker of ["vertical-card", "registry-ribbon", "search-dialog", "detail-hero", "release-baseline"]) {
  if (!css.includes(`.${marker}`)) errors.push(`portal-v502.css missing component style: .${marker}`);
}

if (!renderers.includes("current_observation_order")) {
  errors.push("Vertical renderer must expose current observation order.");
}
if (!interactions.includes("setupSearch")) {
  errors.push("Search interaction is not implemented.");
}
if (/Koala Sculpture/i.test([html, renderers, dataStore].join("\n"))) {
  errors.push("Retired temporary Koala editorial object remains in V502 code.");
}

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
  if (manifest.display_policy?.missing_to_zero !== false) errors.push("V502 must forbid missing-to-zero conversion.");
  if (manifest.experience_label !== "V6 RC") errors.push("V6 experience label must remain separate from the V502 data contract.");
}

if (verticalData) {
  const verticals = verticalData.verticals ?? [];
  if (verticals.length !== 8) errors.push(`Expected 8 Core Verticals, found ${verticals.length}.`);
  const ids = verticals.map(item => item.id);
  if (new Set(ids).size !== ids.length) errors.push("Core Vertical IDs must be unique.");
  const featured = verticals.filter(item => item.featured);
  if (featured.length !== 5) errors.push(`Expected dynamic Featured 5 baseline, found ${featured.length}.`);
  if (verticalData.source_snapshot_id !== manifest?.snapshot_id) errors.push("Vertical data and V502 manifest snapshot IDs differ.");
  const orders = verticals.map(item => item.structural_order).sort((a, b) => a - b);
  if (orders.join(",") !== "1,2,3,4,5,6,7,8") errors.push("Structural orders must be exactly 1–8.");
  for (const item of verticals) {
    if (!Number.isFinite(item.right_data_coverage_pct)) errors.push(`${item.id}: missing numeric Right Data Coverage.`);
    if (!Number.isFinite(item.demand_evidence_pct)) errors.push(`${item.id}: missing numeric Demand Evidence.`);
    if (!Array.isArray(item.representative_scope) || item.representative_scope.length < 4) errors.push(`${item.id}: insufficient representative scope.`);
  }
}

if (k100) {
  if (k100.items?.length !== 5) errors.push("V502 Featured Slice must contain exactly five public-preview objects.");
  if (k100.snapshot_id !== manifest?.snapshot_id) errors.push("Kidult 100 and V502 manifest snapshot IDs differ.");
  for (const item of k100.items ?? []) {
    const assetPath = path.join(portalRoot, item.asset);
    if (!fs.existsSync(assetPath)) errors.push(`Missing Featured Slice asset: ${item.asset}`);
  }
  if ((k100.items ?? []).some(item => /koala/i.test(item.title))) errors.push("Temporary Koala object must not appear in V502.");
}

if (summary?.snapshot_id !== manifest?.snapshot_id) errors.push("Portal summary and V502 manifest snapshot IDs differ.");
if (registryView?.snapshot?.baseline_id !== manifest?.snapshot_id) errors.push("Registry projection baseline does not match V502 manifest.");
if (release) {
  if (release.status !== "RELEASE_CANDIDATE") errors.push("Portal release manifest must be RELEASE_CANDIDATE.");
  if (release.production !== false) errors.push("Portal release manifest must remain non-Production.");
  if (release.production_gate !== "HOLD") errors.push("Portal release manifest must remain HOLD until gates pass.");
  if (release.rollback_target !== "V501") errors.push("V502 RC must preserve V501 rollback target.");
}

if (trackIndex) {
  const trackCIndex = trackIndex.records?.find(record => record.id === "track-c-portal-v502-experience-layer");
  if (trackCIndex?.status !== "ACTIVE") errors.push("Track C index status must be ACTIVE.");
}
if (trackC?.role_acceptance !== "APPROVED" || trackC?.status !== "ACTIVE") {
  errors.push("Track C role acceptance is not registered as APPROVED / ACTIVE.");
}
if (blockerC?.status !== "RESOLVED") errors.push("Track C role-acceptance blocker must be RESOLVED.");
if (missionC?.status !== "IN_PROGRESS") errors.push("Track C V502 mission must be IN_PROGRESS.");

for (const relative of [
  "apps/kidults-enterprise-staging/public/portal/portal.js",
  "apps/kidults-enterprise-staging/public/portal/detail.js",
  "apps/kidults-enterprise-staging/public/portal/components/data-store.js",
  "apps/kidults-enterprise-staging/public/portal/components/renderers.js",
  "apps/kidults-enterprise-staging/public/portal/components/interactions.js"
]) {
  const text = readText(relative);
  if (/\bundefined\b\s*[:=]/.test(text)) warnings.push(`${relative}: explicit undefined assignment detected.`);
}

if (errors.length) {
  console.error(`KIDULTS Portal V502 validation: FAIL (${errors.length} error(s), ${warnings.length} warning(s))`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  for (const warning of warnings) console.warn(`WARN: ${warning}`);
  process.exit(1);
}

console.log(`KIDULTS Portal V502 validation: PASS (${requiredFiles.length} required files, 8 verticals, 5 featured objects)`);
for (const warning of warnings) console.warn(`WARN: ${warning}`);
