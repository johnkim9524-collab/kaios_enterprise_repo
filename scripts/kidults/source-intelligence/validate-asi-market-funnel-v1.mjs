#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { simulateMarketFunnel } from "./simulate-asi-market-funnel-v1.mjs";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../..");
const read = relative => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
const topology = read("coordination/kidults/source-intelligence/asi-market-funnel-engine-mesh-v1.json");
const schema = read("coordination/kidults/source-intelligence/asi-market-funnel-event-v1.schema.json");
const queues = read("coordination/kidults/source-intelligence/asi-queue-and-partition-contract-v1.json");
const policy = read("coordination/kidults/source-intelligence/asi-purpose-specific-admission-policy-v1.json");
const program = read("coordination/kidults/source-intelligence/autonomous-source-intelligence-program-v1.json");

const errors = [];
const assert = (condition, message) => { if (!condition) errors.push(message); };
const unique = values => new Set(values).size === values.length;
const clone = value => structuredClone(value);

function contractErrors(t = topology, q = queues, p = policy) {
  const found = [];
  const check = (condition, code) => { if (!condition) found.push(code); };
  const stages = t.asi_funnel?.stages ?? [];
  const fleets = stages.flatMap(stage => stage.engine_fleets ?? []);
  check(t.architecture_rule === "ONE_POLICY_CONTROL_PLANE_MANY_INDEPENDENT_DATA_PLANE_ENGINE_FLEETS", "ARCHITECTURE_RULE_MISMATCH");
  check(t.asi_funnel?.engine_fleet_contract_count === 25 && fleets.length === 25 && unique(fleets), "ASI_FLEET_COUNT_OR_UNIQUENESS_MISMATCH");
  check(stages.find(stage => stage.stage_id === "F0_GLOBAL_MARKET_SENSING")?.engine_fleets?.length === 12, "DISCOVERY_FLEET_COUNT_MISMATCH");
  check(stages.find(stage => stage.stage_id === "F1_SOURCE_IDENTITY_AND_CLASSIFICATION")?.engine_fleets?.length === 4, "CLASSIFICATION_FLEET_COUNT_MISMATCH");
  check(stages.find(stage => stage.stage_id === "F2_SOURCE_QUALIFICATION_ANALYSIS")?.engine_fleets?.length === 7, "ANALYSIS_FLEET_COUNT_MISMATCH");
  check(stages.find(stage => stage.stage_id === "F3_SOURCE_PORTFOLIO_DECISION")?.engine_fleets?.length === 2, "DECISION_FLEET_COUNT_MISMATCH");
  check(t.downstream_market_funnel?.engine_role_count === 23, "DOWNSTREAM_ENGINE_ROLE_COUNT_MISMATCH");
  check(t.control_plane?.may_process_market_data === false, "CONTROL_PLANE_MUST_NOT_ANALYZE_MARKET_DATA");
  check(t.partition_contract?.fixed_worker_count === null && t.partition_contract?.elastic_worker_instances === true, "WORKER_COUNT_MUST_BE_ELASTIC");
  check(t.partition_contract?.global_lock_allowed === false && t.partition_contract?.global_batch_barrier_allowed === false, "GLOBAL_SERIALIZATION_PROHIBITION_MISSING");
  check(t.anti_bottleneck_invariants?.includes("NO_SYNCHRONOUS_ENGINE_TO_ENGINE_DATA_CALL"), "ASYNC_ENGINE_BOUNDARY_MISSING");
  check(t.anti_bottleneck_invariants?.includes("EACH_QUEUE_HAS_LEASE_RETRY_DLQ_REPLAY_AND_CIRCUIT_BREAKER"), "QUEUE_RESILIENCE_INVARIANT_MISSING");
  check(q.delivery_semantics === "AT_LEAST_ONCE" && q.consumer_semantics === "IDEMPOTENT", "DELIVERY_OR_IDEMPOTENCY_MISMATCH");
  check(q.required_queue_controls?.includes("DEAD_LETTER_QUEUE") && q.required_queue_controls?.includes("REPLAY") && q.required_queue_controls?.includes("OUTBOX"), "QUEUE_CONTROL_SET_INCOMPLETE");
  check(q.forbidden_patterns?.includes("GLOBAL_QUEUE_FOR_ALL_STAGES") && q.forbidden_patterns?.includes("SYNCHRONOUS_ENGINE_CHAIN"), "FORBIDDEN_QUEUE_PATTERN_SET_INCOMPLETE");
  check(p.purposes?.every(purpose => purpose.unknown_rights_decision === "HOLD"), "UNKNOWN_RIGHTS_MUST_HOLD_ALL_PURPOSES");
  check(p.prohibited_substitutions?.includes("MUSEUM_PRESENCE_FOR_DEMAND") && p.prohibited_substitutions?.includes("LISTING_FOR_SOLD_TRANSACTION"), "MARKET_SEMANTIC_GUARDS_MISSING");
  return found;
}

for (const message of contractErrors()) errors.push(message);

const requiredEventFields = ["event_id", "event_type", "event_version", "producer_engine", "idempotency_key", "partition", "input_snapshot_ref", "payload_hash", "rights_state", "freshness_state", "payload"];
assert(schema.$schema === "https://json-schema.org/draft/2020-12/schema", "Event schema must declare JSON Schema 2020-12.");
assert(requiredEventFields.every(field => schema.required.includes(field)), "Event schema required field set is incomplete.");
assert(schema.properties.partition.required.length === 6 && unique(schema.properties.partition.required), "Event partition must require six unique dimensions.");
assert(program.source_intelligence_engines.length === 11 && unique(program.source_intelligence_engines.map(item => item.engine)), "Program must expose one canonical 11-domain ASI taxonomy.");
assert(program.canonical_engine_taxonomy?.execution_fleet_contract_count === 25, "Program must bind the 25-fleet topology.");

const output = simulateMarketFunnel();
assert(output.status === "DETERMINISTIC_ENGINE_MESH_PREFLIGHT_PASS_RUNTIME_NOT_DEPLOYED", "Simulation status mismatch.");
assert(output.engine_fleet_contract_count === 25 && output.downstream_engine_role_count === 23, "Simulation engine counts mismatch.");
assert(output.admitted_source_count === 1 && output.held_source_count === 2, "Purpose admission result mismatch.");
assert(output.isolated_dead_letter_count === 1 && output.unrelated_sources_continued_after_failure === true, "Failure isolation preflight failed.");
assert(output.institutional_context_promoted_to_market_transaction === false, "Institutional context must not become market transaction evidence.");
assert(output.events.every(event => /^sha256:[a-f0-9]{64}$/.test(event.payload_hash)), "Every event must have a valid payload hash.");
assert(unique(output.events.map(event => event.idempotency_key)), "Synthetic event idempotency keys must be unique.");
assert(output.public_projection_authorized === false && output.production === "HOLD", "Simulation must preserve publication and Production holds.");

const mutations = [
  ["single-discovery-fleet", (t, q, p) => { t.asi_funnel.stages[0].engine_fleets = ["ONE_ENGINE"]; }],
  ["single-classifier", (t, q, p) => { t.asi_funnel.stages[1].engine_fleets = ["ONE_CLASSIFIER"]; }],
  ["control-plane-analysis", (t, q, p) => { t.control_plane.may_process_market_data = true; }],
  ["fixed-workers", (t, q, p) => { t.partition_contract.fixed_worker_count = 1; }],
  ["global-lock", (t, q, p) => { t.partition_contract.global_lock_allowed = true; }],
  ["sync-engine-chain", (t, q, p) => { t.anti_bottleneck_invariants = t.anti_bottleneck_invariants.filter(value => value !== "NO_SYNCHRONOUS_ENGINE_TO_ENGINE_DATA_CALL"); }],
  ["no-dlq", (t, q, p) => { q.required_queue_controls = q.required_queue_controls.filter(value => value !== "DEAD_LETTER_QUEUE"); }],
  ["no-outbox", (t, q, p) => { q.required_queue_controls = q.required_queue_controls.filter(value => value !== "OUTBOX"); }],
  ["unknown-rights-pass", (t, q, p) => { p.purposes[0].unknown_rights_decision = "PASS"; }],
  ["museum-for-demand", (t, q, p) => { p.prohibited_substitutions = p.prohibited_substitutions.filter(value => value !== "MUSEUM_PRESENCE_FOR_DEMAND"); }]
];

for (const [name, mutate] of mutations) {
  const t = clone(topology), q = clone(queues), p = clone(policy);
  mutate(t, q, p);
  assert(contractErrors(t, q, p).length > 0, `Negative control did not fail closed: ${name}`);
}

if (errors.length) {
  console.error(`KIDULTS ASI Market Funnel: FAIL (${errors.length})`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("KIDULTS ASI Market Funnel: PASS");
console.log("Canonical ASI domains / independent fleets / downstream roles: 11 / 25 / 23");
console.log(`Negative controls: ${mutations.length}/10 PASS`);
console.log("Failure isolation / purpose-specific rights / market semantics: PASS");
console.log("Validation mode: STRUCTURE_AND_DETERMINISTIC_EVENT_PREFLIGHT_NO_DURABLE_RUNTIME_CLAIM");
console.log("Production: HOLD");
