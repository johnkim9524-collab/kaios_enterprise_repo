import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const registryRoot = path.join(root, "coordination", "kidults", "registry");
const errors = [];

function readJson(relative) {
  const file = path.join(root, relative);
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    errors.push(`${relative}: ${error.message}`);
    return null;
  }
}

function assert(condition, message) {
  if (!condition) errors.push(message);
}

const core = readJson("coordination/kidults/registry/core-verticals.json");
const catalog = readJson("coordination/kidults/registry/catalog.json");
const index = readJson("coordination/kidults/registry/trusted-source/index.json");
const run = readJson("coordination/kidults/autonomous/source-discovery/autonomous-source-discovery-r1-20260816.json");
const golden = readJson("coordination/kidults/golden-dataset/golden-dataset-v1-plan.json");

assert(catalog?.registries?.some(entry => entry.registry_key === "trusted-source" && entry.path === "trusted-source/index.json"),
  "Operational Registry catalog must include trusted-source.");
assert(index?.record_count === 8, "Trusted Source Registry must contain exactly eight vertical records.");
assert(index?.production_connection === false, "Trusted Source Registry must not activate Production.");
assert(run?.network_collection_performed === false, "R1 is discovery-only and must not claim network collection.");
assert(run?.credential_used === false, "R1 must not use credentials.");
assert(run?.production_mutation === false, "R1 must not mutate Production.");
assert(run?.candidate_source_count === 24, "R1 must register 24 candidate sources.");

const expectedVerticals = new Set((core?.verticals ?? []).map(item => item.vertical_id));
const actualVerticals = new Set();
const globalSourceIds = new Set();
let sourceCount = 0;
let tier12Count = 0;

for (const ref of index?.records ?? []) {
  const record = readJson(path.join("coordination/kidults/registry/trusted-source", ref.path));
  if (!record) continue;
  actualVerticals.add(record.vertical_id);
  assert(record.source_candidate_count === record.source_candidates?.length,
    `${record.id}: source_candidate_count mismatch.`);
  assert(record.source_candidates?.length >= 3, `${record.id}: at least three source candidates are required.`);
  assert(record.source_candidates?.some(source => source.source_tier <= 2),
    `${record.id}: at least one Tier 1/2 source is required.`);

  for (const source of record.source_candidates ?? []) {
    sourceCount += 1;
    if (source.source_tier <= 2) tier12Count += 1;
    assert(!globalSourceIds.has(source.source_id), `Duplicate source_id: ${source.source_id}`);
    globalSourceIds.add(source.source_id);
    assert(/^https:\/\//.test(source.official_url), `${source.source_id}: official_url must use HTTPS.`);
    assert(Number.isInteger(source.trust_score_provisional) && source.trust_score_provisional >= 0 && source.trust_score_provisional <= 100,
      `${source.source_id}: provisional trust score must be 0–100.`);
    assert(source.score_status === "PROVISIONAL_NOT_TRACK_B_VALIDATED",
      `${source.source_id}: score must remain provisional.`);
    assert(typeof source.rights_state === "string" && source.rights_state.length > 0,
      `${source.source_id}: rights_state is required.`);
    assert(source.commercial_use_state !== "APPROVED", `${source.source_id}: commercial use must not be approved in R1.`);
    assert(typeof source.next_action === "string" && source.next_action.length > 10,
      `${source.source_id}: next_action is required.`);
  }
}

assert(expectedVerticals.size === 8, "Core Vertical Registry must define eight verticals.");
assert(actualVerticals.size === expectedVerticals.size && [...expectedVerticals].every(id => actualVerticals.has(id)),
  "Trusted Source Registry verticals must exactly match the eight Core Verticals.");
assert(sourceCount === 24, `Expected 24 sources; found ${sourceCount}.`);
assert(tier12Count === 24, `All R1 candidates are expected to be Tier 1/2; found ${tier12Count}.`);

const pilot = golden?.phases?.find(phase => phase.phase_id === "PILOT_80");
assert(pilot?.object_target === 80 && pilot?.objects_per_vertical === 10,
  "Golden Dataset pilot must target 80 objects / 10 per vertical.");
assert(pilot?.raw_observation_target >= 5000,
  "Golden Dataset pilot must target at least 5,000 raw observations.");
assert(golden?.quality_gates?.critical_provenance_coverage === 1,
  "Critical provenance coverage must be 100%.");
assert(golden?.quality_gates?.entity_resolution_minimum >= 0.99,
  "Entity resolution target must be at least 99%.");
assert(golden?.quality_gates?.duplicate_contamination_maximum <= 0.01,
  "Duplicate contamination target must be at most 1%.");

if (errors.length) {
  console.error(`KIDULTS Trusted Source Foundation: FAIL (${errors.length})`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

console.log("KIDULTS Trusted Source Foundation: PASS");
console.log(`Verticals: ${actualVerticals.size}`);
console.log(`Candidate sources: ${sourceCount}`);
console.log(`Tier 1/2 sources: ${tier12Count}`);
console.log(`Golden Dataset pilot: ${pilot.object_target} objects / ${pilot.raw_observation_target} raw observations`);
console.log("Production connection: OFF");
