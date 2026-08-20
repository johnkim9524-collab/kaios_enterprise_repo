import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const requiredFiles = [
  "coordination/kidults/registry/program-registry.json",
  "coordination/kidults/registry/roles-and-responsibilities.json",
  "coordination/kidults/registry/operating-cadence.json",
  "coordination/kidults/registry/core-verticals.json",
  "coordination/kidults/registry/snapshot-registry.json",
  "coordination/kidults/registry/decision-registry.json",
  "coordination/kidults/registry/risk-registry.json",
  "coordination/kidults/registry/handoff-registry.json",
  "coordination/kidults/registry/release-registry.json",
  "coordination/kidults/registry/catalog.json",
  "coordination/kidults/registry/program/index.json",
  "coordination/kidults/registry/track/index.json",
  "coordination/kidults/registry/vertical/index.json",
  "coordination/kidults/registry/snapshot/index.json",
  "coordination/kidults/registry/assessment/index.json",
  "coordination/kidults/registry/runtime/index.json",
  "coordination/kidults/registry/release/index.json",
  "coordination/kidults/schemas/workstream-update.schema.json",
  "coordination/kidults/schemas/handoff.schema.json",
  "coordination/kidults/schemas/snapshot-candidate.schema.json",
  "coordination/kidults/schemas/rankability-assessment.schema.json",
  "coordination/kidults/schemas/portal-release-manifest.schema.json"
];

const errors = [];
const parsed = new Map();

for (const relative of requiredFiles) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) {
    errors.push(`Missing required file: ${relative}`);
    continue;
  }
  try {
    parsed.set(relative, JSON.parse(fs.readFileSync(absolute, "utf8")));
  } catch (error) {
    errors.push(`Invalid JSON: ${relative}: ${error.message}`);
  }
}

const program = parsed.get("coordination/kidults/registry/program-registry.json");
if (program) {
  const trackIds = new Set(program.tracks?.map((track) => track.track_id));
  for (const id of ["A", "B", "C", "D", "E"]) {
    if (!trackIds.has(id)) errors.push(`Program registry missing Track ${id}`);
  }
  if (program.program?.canonical_board_issue !== 344) errors.push("Program registry canonical board must be KPMO master #344.");
  if (program.program?.integration_gate_issue !== 238) errors.push("Program registry integration gate must be #238.");
  if ((program.official_books ?? []).join("|") !== "Master Book|Baseline Book|Architecture Book") {
    errors.push("Official Books must remain Master Book, Baseline Book and Architecture Book.");
  }
}

const verticals = parsed.get("coordination/kidults/registry/core-verticals.json");
if (verticals) {
  if (verticals.verticals?.length !== 8) errors.push("Core Vertical registry must contain exactly 8 active verticals.");
  const ids = verticals.verticals?.map((item) => item.vertical_id) ?? [];
  if (new Set(ids).size !== ids.length) errors.push("Core Vertical IDs must be unique.");
}

const trackIndex = parsed.get("coordination/kidults/registry/track/index.json");
if (trackIndex) {
  const operationalTrackIds = new Set(trackIndex.records?.map((track) => track.id));
  for (const id of ["track-a-120-intelligence-factory","track-b-rankability-validation-gate","track-c-portal-v502-experience-layer","track-d-data-platform-production-reliability","track-e-executive-operating-system"]) {
    if (!operationalTrackIds.has(id)) errors.push(`Operational Track Registry missing ${id}`);
  }
  if (trackIndex.record_count !== 5) errors.push(`Operational Track Registry must contain exactly 5 records; found ${trackIndex.record_count}.`);
}

const operationalVerticals = parsed.get("coordination/kidults/registry/vertical/index.json");
if (operationalVerticals?.record_count !== 8) errors.push("Operational Core Vertical Registry must contain exactly 8 records.");

const roles = parsed.get("coordination/kidults/registry/roles-and-responsibilities.json");
if (roles) {
  const roleIds = new Set(roles.roles?.map((role) => role.role_id));
  for (const id of ["program-owner","integration-conductor","track-a-120-score","track-b-rankability","track-c-portal-v502","registry-custodian","snapshot-publisher","qa-release-manager"]) {
    if (!roleIds.has(id)) errors.push(`Role registry missing ${id}`);
  }
}

if (errors.length) {
  console.error("KIDULTS coordination validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`KIDULTS coordination validation passed (${requiredFiles.length} required JSON files; five tracks A-E registered; KPMO master #344 canonical).`);
