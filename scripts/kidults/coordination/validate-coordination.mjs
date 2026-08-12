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
  for (const id of ["A", "B", "C"]) {
    if (!trackIds.has(id)) errors.push(`Program registry missing Track ${id}`);
  }
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

const roles = parsed.get("coordination/kidults/registry/roles-and-responsibilities.json");
if (roles) {
  const roleIds = new Set(roles.roles?.map((role) => role.role_id));
  for (const id of [
    "program-owner",
    "integration-conductor",
    "track-a-120-score",
    "track-b-rankability",
    "track-c-portal-v502",
    "registry-custodian",
    "snapshot-publisher",
    "qa-release-manager"
  ]) {
    if (!roleIds.has(id)) errors.push(`Role registry missing ${id}`);
  }
}

if (errors.length) {
  console.error("KIDULTS coordination validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`KIDULTS coordination validation passed (${requiredFiles.length} required JSON files).`);
