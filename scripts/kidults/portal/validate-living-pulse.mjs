import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const errors = [];

function read(relative) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) {
    errors.push(`Missing required file: ${relative}`);
    return "";
  }
  return fs.readFileSync(absolute, "utf8");
}

function readJson(relative) {
  const text = read(relative);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    errors.push(`Invalid JSON: ${relative}: ${error.message}`);
    return null;
  }
}

const componentPath = "apps/kidults-enterprise-staging/public/portal/components/living-pulse.js";
const stylePath = "apps/kidults-enterprise-staging/public/portal/components/living-pulse.css";
const contractPath = "apps/kidults-enterprise-staging/public/portal/data/living-pulse-contract.json";
const portalPath = "apps/kidults-enterprise-staging/public/portal/portal.js";
const dataStorePath = "apps/kidults-enterprise-staging/public/portal/components/data-store.js";

const component = read(componentPath);
const style = read(stylePath);
const contract = readJson(contractPath);
const portal = read(portalPath);
const dataStore = read(dataStorePath);

for (const marker of [
  "startLivingPulse",
  "resolveFreshness",
  "setInterval",
  "localStorage",
  "registry.freshness",
  "No approved change detected",
  "NOT_AVAILABLE"
]) {
  if (!component.includes(marker)) errors.push(`Living Pulse component missing marker: ${marker}`);
}

for (const marker of [
  ".living-pulse",
  ".living-pulse__panel",
  ".living-object-state",
  ".living-freshness-badge",
  "@media(max-width:760px)",
  "prefers-reduced-motion"
]) {
  if (!style.includes(marker)) errors.push(`Living Pulse stylesheet missing marker: ${marker}`);
}

if (!portal.includes('import { startLivingPulse } from "./components/living-pulse.js";')) {
  errors.push("portal.js does not import the Living Pulse component.");
}
if (!portal.includes("startLivingPulse({")) {
  errors.push("portal.js does not start the Living Pulse engine.");
}
if (!dataStore.includes("living-pulse-contract.json")) {
  errors.push("data-store.js does not load the Living Pulse contract.");
}

if (contract) {
  if (contract.status !== "ACTIVE") errors.push("Living Pulse contract must be ACTIVE.");
  if (Number(contract.poll_interval_ms) < 30_000) errors.push("Living Pulse polling must not be faster than 30 seconds.");
  if (Number(contract.clock_interval_ms) < 15_000) errors.push("Living Pulse clock refresh must not be faster than 15 seconds.");

  const expectedStates = ["FRESH", "CURRENT", "STALE", "WAITING", "NOT_AVAILABLE"];
  for (const state of expectedStates) {
    if (!contract.allowed_states?.includes(state)) errors.push(`Living Pulse contract missing state: ${state}`);
  }

  if (contract.truth_policy?.claim_live_when_stale !== false) {
    errors.push("Living Pulse must not claim LIVE when Registry data is stale.");
  }
  if (contract.truth_policy?.invent_relative_time !== false) {
    errors.push("Living Pulse must not invent relative timestamps.");
  }
  if (contract.truth_policy?.missing_to_zero !== false) {
    errors.push("Living Pulse must preserve missing-value states.");
  }
}

for (const prohibited of ["127 Sources", "2m ago", "Today's Changes +3"]) {
  if ([component, portal, dataStore].some(text => text.includes(prohibited))) {
    errors.push(`Hardcoded demo value is prohibited: ${prohibited}`);
  }
}

if (errors.length) {
  console.error(`KIDULTS Living Pulse validation: FAIL (${errors.length} error(s))`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

console.log("KIDULTS Living Pulse validation: PASS");
console.log(`Engine: ${contract.engine_id} ${contract.version}`);
console.log(`Polling: ${contract.poll_interval_ms}ms`);
console.log(`States: ${contract.allowed_states.join(", ")}`);
