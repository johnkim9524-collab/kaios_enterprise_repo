import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const fixturePath = path.join(root, "coordination", "kidults", "memory", "fixtures", "memory-foundation-input-v1.json");
const runPath = path.join(root, "coordination", "kidults", "memory", "runs", "memory-foundation-run-r1.json");
const registryRunPath = path.join(root, "coordination", "kidults", "registry", "memory", "records", "memory-foundation-run-r1.json");

const MEMORY_TYPES = new Set([
  "OBSERVATION_MEMORY",
  "ENTITY_MEMORY",
  "MARKET_STATE_MEMORY",
  "DECISION_MEMORY",
  "LEARNING_MEMORY"
]);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
}

function ageDays(runAt, observedAt) {
  return Math.floor((new Date(runAt).getTime() - new Date(observedAt).getTime()) / 86_400_000);
}

function assertionKey(entry) {
  return `${entry.subject_id}|${entry.assertion_type}`;
}

function isValidAt(entry, validAt) {
  const at = new Date(validAt).getTime();
  const from = new Date(entry.valid_from).getTime();
  const to = entry.valid_to ? new Date(entry.valid_to).getTime() : Number.POSITIVE_INFINITY;
  return from <= at && at < to;
}

function buildReplaySnapshot(entries, query) {
  const cutoff = new Date(query.recorded_cutoff).getTime();
  const eligible = entries
    .filter(entry => entry.memory_state !== "REVIEW_REQUIRED")
    .filter(entry => new Date(entry.recorded_at).getTime() <= cutoff)
    .filter(entry => isValidAt(entry, query.valid_at));

  const latestByAssertion = new Map();
  for (const entry of eligible) {
    const key = assertionKey(entry);
    const previous = latestByAssertion.get(key);
    if (!previous) {
      latestByAssertion.set(key, entry);
      continue;
    }
    const previousTime = new Date(previous.recorded_at).getTime();
    const currentTime = new Date(entry.recorded_at).getTime();
    if (
      currentTime > previousTime ||
      (currentTime === previousTime && entry.memory_entry_id.localeCompare(previous.memory_entry_id) > 0)
    ) {
      latestByAssertion.set(key, entry);
    }
  }

  const assertions = [...latestByAssertion.values()]
    .sort((a, b) => assertionKey(a).localeCompare(assertionKey(b)))
    .map(entry => ({
      assertion_key: assertionKey(entry),
      memory_entry_id: entry.memory_entry_id,
      memory_type: entry.memory_type,
      subject_id: entry.subject_id,
      assertion_type: entry.assertion_type,
      value: entry.value,
      valid_from: entry.valid_from,
      valid_to: entry.valid_to,
      recorded_at: entry.recorded_at,
      supersedes: entry.supersedes,
      provenance_reference: entry.provenance_reference,
      rights_state: entry.rights_state
    }));

  return {
    replay_id: query.replay_id,
    valid_at: query.valid_at,
    recorded_cutoff: query.recorded_cutoff,
    assertion_count: assertions.length,
    assertions,
    replay_fingerprint: sha256(stableJson({
      replay_id: query.replay_id,
      valid_at: query.valid_at,
      recorded_cutoff: query.recorded_cutoff,
      assertions
    }))
  };
}

function compareReplays(before, after) {
  const beforeMap = new Map(before.assertions.map(item => [item.assertion_key, item]));
  const afterMap = new Map(after.assertions.map(item => [item.assertion_key, item]));
  const keys = [...new Set([...beforeMap.keys(), ...afterMap.keys()])].sort();
  const changes = [];

  for (const key of keys) {
    const left = beforeMap.get(key) ?? null;
    const right = afterMap.get(key) ?? null;
    if (stableJson(left?.value ?? null) !== stableJson(right?.value ?? null)) {
      changes.push({
        assertion_key: key,
        before_memory_entry_id: left?.memory_entry_id ?? null,
        after_memory_entry_id: right?.memory_entry_id ?? null,
        before_value: left?.value ?? null,
        after_value: right?.value ?? null
      });
    }
  }

  return {
    comparison_id: `${before.replay_id}__to__${after.replay_id}`,
    before_replay_id: before.replay_id,
    after_replay_id: after.replay_id,
    changed_assertion_count: changes.length,
    changes
  };
}

export function buildMemoryFoundation(fixture = readJson(fixturePath)) {
  const seenIds = new Set();
  const admitted = [];
  const quarantined = [];
  const reviewRequired = [];

  for (const raw of [...fixture.entries].sort((a, b) => a.memory_entry_id.localeCompare(b.memory_entry_id))) {
    const reasons = [];

    if (seenIds.has(raw.memory_entry_id)) reasons.push("DUPLICATE_MEMORY_ENTRY_ID");
    seenIds.add(raw.memory_entry_id);

    if (!MEMORY_TYPES.has(raw.memory_type)) reasons.push("UNSUPPORTED_MEMORY_TYPE");
    if (!raw.rights_state) reasons.push("RIGHTS_STATE_MISSING");
    if (!raw.provenance_reference) reasons.push("PROVENANCE_REFERENCE_MISSING");
    if (!raw.freshness_observed_at || ageDays(fixture.run_at, raw.freshness_observed_at) > fixture.freshness_max_age_days) {
      reasons.push("STALE_MEMORY_ENTRY");
    }
    if (!raw.valid_from || !raw.recorded_at) reasons.push("BITEMPORAL_FIELD_MISSING");
    if (raw.valid_to && new Date(raw.valid_to).getTime() <= new Date(raw.valid_from).getTime()) {
      reasons.push("INVALID_VALID_TIME_INTERVAL");
    }

    if (reasons.length) {
      quarantined.push({
        memory_entry_id: raw.memory_entry_id,
        reasons: [...new Set(reasons)].sort(),
        disposition: "QUARANTINED_NOT_MEMORY_ADMITTED",
        index_eligible: false,
        publication_eligible: false,
        production_eligible: false
      });
      continue;
    }

    const identityConflict = Boolean(raw.claimed_subject_id && raw.claimed_subject_id !== raw.subject_id);
    const normalized = {
      memory_entry_id: raw.memory_entry_id,
      memory_type: raw.memory_type,
      subject_id: raw.subject_id,
      claimed_subject_id: raw.claimed_subject_id,
      assertion_type: raw.assertion_type,
      value: raw.value,
      valid_from: raw.valid_from,
      valid_to: raw.valid_to,
      recorded_at: raw.recorded_at,
      freshness_observed_at: raw.freshness_observed_at,
      freshness_state: "CURRENT_AT_ADMISSION",
      supersedes: raw.supersedes,
      source_id: raw.source_id,
      provenance_reference: raw.provenance_reference,
      rights_state: raw.rights_state,
      confidence_state: raw.confidence_state,
      memory_state: identityConflict ? "REVIEW_REQUIRED" : "ACTIVE",
      immutable: true,
      index_eligible: false,
      publication_eligible: false,
      production_eligible: false
    };
    admitted.push(normalized);

    if (identityConflict) {
      reviewRequired.push({
        memory_entry_id: raw.memory_entry_id,
        subject_id: raw.subject_id,
        claimed_subject_id: raw.claimed_subject_id,
        reason: "SUBJECT_IDENTITY_CONFLICT",
        auto_merge: false,
        disposition: "REVIEW_REQUIRED"
      });
    }
  }

  const admittedById = new Map(admitted.map(entry => [entry.memory_entry_id, entry]));
  const supersessionChains = [];
  for (const entry of admitted.filter(item => item.supersedes)) {
    const target = admittedById.get(entry.supersedes);
    if (!target) {
      throw new Error(`${entry.memory_entry_id}: supersedes target '${entry.supersedes}' is not admitted.`);
    }
    if (target.subject_id !== entry.subject_id || target.assertion_type !== entry.assertion_type) {
      throw new Error(`${entry.memory_entry_id}: supersession target must share subject_id and assertion_type.`);
    }
    target.memory_state = "SUPERSEDED_RETAINED";
    supersessionChains.push({
      supersession_id: `supersession:${target.memory_entry_id}->${entry.memory_entry_id}`,
      prior_memory_entry_id: target.memory_entry_id,
      correction_memory_entry_id: entry.memory_entry_id,
      subject_id: entry.subject_id,
      assertion_type: entry.assertion_type,
      overwrite_performed: false,
      prior_entry_retained: true
    });
  }

  const replaySnapshots = fixture.replay_queries.map(query => buildReplaySnapshot(admitted, query));
  const replayComparisons = replaySnapshots.length >= 2
    ? [compareReplays(replaySnapshots[0], replaySnapshots[1])]
    : [];

  const reasonCounts = {};
  for (const record of quarantined) {
    for (const reason of record.reasons) reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
  }

  const memoryTypeCounts = {};
  for (const entry of admitted) memoryTypeCounts[entry.memory_type] = (memoryTypeCounts[entry.memory_type] ?? 0) + 1;

  const provenanceCoverage = admitted.length
    ? admitted.filter(entry => Boolean(entry.provenance_reference)).length / admitted.length
    : 0;
  const rightsCoverage = admitted.length
    ? admitted.filter(entry => Boolean(entry.rights_state)).length / admitted.length
    : 0;
  const bitemporalCoverage = admitted.length
    ? admitted.filter(entry => Boolean(entry.valid_from) && Boolean(entry.recorded_at)).length / admitted.length
    : 0;

  const fingerprintPayload = {
    fixture_id: fixture.fixture_id,
    admitted_entries: admitted,
    quarantined_entries: quarantined,
    review_required: reviewRequired,
    supersession_chains: supersessionChains,
    replay_snapshots: replaySnapshots,
    replay_comparisons: replayComparisons
  };

  return {
    run_id: "memory-foundation-run-r1",
    record_type: "memory_foundation_run",
    version: "1.0.0",
    status: "MEMORY_FOUNDATION_PASS",
    run_mode: "CONTRACT_FIXTURE_ONLY",
    fixture_id: fixture.fixture_id,
    fixture_classification: fixture.fixture_classification,
    generated_at: fixture.run_at,
    created_by: "Track A / AGCI Memory Engine",
    approved_by: null,
    memory_policy_id: "memory-policy-v1",
    storage_model: "APPEND_ONLY_BITEMPORAL",
    deterministic_replay: "PASS",
    fail_closed: true,
    input_entry_count: fixture.entries.length,
    admitted_entry_count: admitted.length,
    quarantined_entry_count: quarantined.length,
    review_required_count: reviewRequired.length,
    supersession_chain_count: supersessionChains.length,
    replay_snapshot_count: replaySnapshots.length,
    memory_type_count: Object.keys(memoryTypeCounts).length,
    memory_type_counts: Object.fromEntries(Object.entries(memoryTypeCounts).sort(([a], [b]) => a.localeCompare(b))),
    provenance_coverage: provenanceCoverage,
    rights_coverage: rightsCoverage,
    bitemporal_coverage: bitemporalCoverage,
    admitted_entries: admitted,
    quarantined_entries: quarantined,
    quarantine_reason_counts: Object.fromEntries(Object.entries(reasonCounts).sort(([a], [b]) => a.localeCompare(b))),
    review_required: reviewRequired,
    supersession_chains: supersessionChains,
    replay_snapshots: replaySnapshots,
    replay_comparisons: replayComparisons,
    temporal_invariants: {
      append_only: true,
      in_place_correction: false,
      prior_truth_retained: true,
      valid_time_and_recorded_time_separated: true,
      same_input_same_cutoff_same_output: true,
      legal_erasure_mode: "AUDITABLE_TOMBSTONE_OR_REDACTION_ONLY"
    },
    boundaries: {
      fixture_entries_in_global_universe: false,
      memory_direct_to_portal: false,
      memory_direct_to_index: false,
      indexes_computed: 0,
      public_projection: false,
      production_mutation: false
    },
    publication_eligible: false,
    production_eligible: false,
    immutable: true,
    run_fingerprint: sha256(stableJson(fingerprintPayload))
  };
}

export function buildMemoryRegistryRun(run) {
  return {
    id: run.run_id,
    record_type: "memory_run",
    version: "1.0.0",
    status: run.status,
    created_at: run.generated_at,
    created_by: run.created_by,
    approved_by: null,
    memory_policy_id: run.memory_policy_id,
    artifact_reference: "coordination/kidults/memory/runs/memory-foundation-run-r1.json",
    run_mode: run.run_mode,
    storage_model: run.storage_model,
    deterministic_replay: run.deterministic_replay,
    input_entry_count: run.input_entry_count,
    admitted_entry_count: run.admitted_entry_count,
    quarantined_entry_count: run.quarantined_entry_count,
    review_required_count: run.review_required_count,
    supersession_chain_count: run.supersession_chain_count,
    replay_snapshot_count: run.replay_snapshot_count,
    memory_type_count: run.memory_type_count,
    provenance_coverage: run.provenance_coverage,
    rights_coverage: run.rights_coverage,
    bitemporal_coverage: run.bitemporal_coverage,
    latest_replay_id: run.replay_snapshots.at(-1)?.replay_id ?? null,
    latest_replay_fingerprint: run.replay_snapshots.at(-1)?.replay_fingerprint ?? null,
    run_fingerprint: run.run_fingerprint,
    fixture_entries_in_global_universe: false,
    public_projection: false,
    indexes_computed: 0,
    publication_eligible: false,
    production_eligible: false,
    mutation_performed: false,
    immutable: true
  };
}

async function main() {
  const run = buildMemoryFoundation();
  const registryRun = buildMemoryRegistryRun(run);
  const writeMode = process.argv.includes("--write");

  if (writeMode) {
    fs.mkdirSync(path.dirname(runPath), { recursive: true });
    fs.mkdirSync(path.dirname(registryRunPath), { recursive: true });
    fs.writeFileSync(runPath, `${JSON.stringify(run, null, 2)}\n`, "utf8");
    fs.writeFileSync(registryRunPath, `${JSON.stringify(registryRun, null, 2)}\n`, "utf8");
    console.log(`Wrote ${path.relative(root, runPath)}`);
    console.log(`Wrote ${path.relative(root, registryRunPath)}`);
    return;
  }

  const currentRun = readJson(runPath);
  const currentRegistryRun = readJson(registryRunPath);
  if (stableJson(currentRun) !== stableJson(run)) {
    console.error("AGCI Memory Foundation run is stale. Run with --write.");
    process.exit(1);
  }
  if (stableJson(currentRegistryRun) !== stableJson(registryRun)) {
    console.error("AGCI Memory Registry run is stale. Run with --write.");
    process.exit(1);
  }

  console.log("AGCI Memory Foundation deterministic replay: PASS");
  console.log(`Input / admitted / quarantined: ${run.input_entry_count} / ${run.admitted_entry_count} / ${run.quarantined_entry_count}`);
  console.log(`Review required: ${run.review_required_count}`);
  console.log(`Supersession chains: ${run.supersession_chain_count}`);
  console.log(`Replay snapshots: ${run.replay_snapshot_count}`);
  console.log(`Memory types: ${run.memory_type_count}`);
  console.log("Indexes: NOT_COMPUTED");
  console.log("Production: HOLD");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
