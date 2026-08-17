import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const fixturePath = path.join(root, "coordination", "kidults", "engine-v2", "fixtures", "foundation-preflight-input-v1.json");
const outputPath = path.join(root, "coordination", "kidults", "engine-v2", "runs", "engine-foundation-preflight-r1.json");
const quarantinePath = path.join(root, "coordination", "kidults", "registry", "raw-quarantine", "records", "raw-quarantine-preflight-r1.json");

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

function normalizeToken(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function canonicalKey(record) {
  return [normalizeToken(record.maker), normalizeToken(record.title), String(record.production_year ?? "unknown")].join("|");
}

function ageDays(runAt, observedAt) {
  return Math.floor((new Date(runAt).getTime() - new Date(observedAt).getTime()) / 86_400_000);
}

function eventType(record) {
  if (record.record_kind === "TRANSACTION" && record.sale_status === "SOLD") return "SOLD_TRANSACTION";
  if (record.record_kind === "LISTING") return "LISTING";
  return null;
}

export function buildFoundationPreflight(fixture = readJson(fixturePath)) {
  const seenSourceKeys = new Set();
  const admitted = [];
  const quarantined = [];
  const reviewRequired = [];

  for (const record of [...fixture.records].sort((a, b) => a.record_id.localeCompare(b.record_id))) {
    const sourceKey = `${record.provider_id}:${record.provider_record_id}`;
    const reasons = [];

    if (seenSourceKeys.has(sourceKey)) reasons.push("DUPLICATE_SOURCE_RECORD");
    if (!record.rights_state) reasons.push("RIGHTS_STATE_MISSING");
    if (!record.provenance_reference) reasons.push("PROVENANCE_REFERENCE_MISSING");
    if (ageDays(fixture.run_at, record.observed_at) > fixture.freshness_max_age_days) reasons.push("STALE_OBSERVATION");

    if (reasons.length) {
      quarantined.push({
        record_id: record.record_id,
        source_key: sourceKey,
        reasons: [...new Set(reasons)].sort(),
        disposition: "QUARANTINED_NOT_INDEX_ELIGIBLE"
      });
      continue;
    }

    seenSourceKeys.add(sourceKey);
    const computedCanonicalKey = canonicalKey(record);
    const identityState = record.claimed_canonical_key && record.claimed_canonical_key !== computedCanonicalKey
      ? "REVIEW_REQUIRED"
      : "CANDIDATE_KEY_ONLY";
    const normalized = {
      record_id: record.record_id,
      source_key: sourceKey,
      provider_id: record.provider_id,
      provider_record_id: record.provider_record_id,
      record_kind: record.record_kind,
      provider_category: record.provider_category,
      title: record.title,
      maker: record.maker,
      object_type: record.object_type,
      production_year: record.production_year,
      observed_at: record.observed_at,
      event_at: record.event_at,
      rights_state: record.rights_state,
      provenance_reference: record.provenance_reference,
      sale_status: record.sale_status,
      price: record.price,
      currency: record.currency,
      canonical_candidate_key: computedCanonicalKey,
      identity_state: identityState,
      market_event_type: eventType(record),
      index_eligible: false,
      publication_eligible: false,
      production_eligible: false
    };
    admitted.push(normalized);
    if (identityState === "REVIEW_REQUIRED") {
      reviewRequired.push({
        record_id: record.record_id,
        claimed_canonical_key: record.claimed_canonical_key,
        computed_canonical_key: computedCanonicalKey,
        reason: "CLAIMED_CANONICAL_KEY_CONFLICT",
        auto_merge: false
      });
    }
  }

  const marketEvents = admitted
    .filter(record => record.market_event_type)
    .map(record => ({
      market_event_id: `market-event:${record.source_key}`,
      source_record_id: record.record_id,
      canonical_candidate_key: record.canonical_candidate_key,
      event_type: record.market_event_type,
      event_at: record.event_at,
      price: record.price,
      currency: record.currency,
      listing_is_sale: false,
      publication_eligible: false
    }));

  const entityKeys = [...new Set(admitted.map(record => record.canonical_candidate_key))].sort();
  const evidenceGraph = {
    source_record_nodes: admitted.length,
    canonical_candidate_nodes: entityKeys.length,
    evidence_assertion_nodes: admitted.length,
    market_event_nodes: marketEvents.length,
    total_nodes: admitted.length + entityKeys.length + admitted.length + marketEvents.length,
    source_to_assertion_edges: admitted.length,
    assertion_to_entity_edges: admitted.length,
    source_to_market_event_edges: marketEvents.length,
    market_event_to_entity_edges: marketEvents.length,
    total_edges: admitted.length * 2 + marketEvents.length * 2
  };

  const marketGraph = {
    entity_nodes: entityKeys.length,
    event_nodes: marketEvents.length,
    sold_transaction_nodes: marketEvents.filter(event => event.event_type === "SOLD_TRANSACTION").length,
    listing_nodes: marketEvents.filter(event => event.event_type === "LISTING").length,
    event_to_entity_edges: marketEvents.length,
    listing_is_sale: false,
    market_metrics_verified: 0
  };

  const grouped = new Map();
  for (const record of admitted) {
    const key = record.canonical_candidate_key;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(record);
  }
  const discoveredClusters = [...grouped.entries()]
    .filter(([, records]) => records.length >= fixture.cluster_test_minimum_observations)
    .map(([key, records], index) => ({
      cluster_id: `fixture-cluster-${String(index + 1).padStart(3, "0")}`,
      cluster_state: "DISCOVERED",
      canonical_candidate_key: key,
      observation_count: records.length,
      source_family_count: new Set(records.map(record => record.provider_id)).size,
      recommended_label: "Fixture Fashion Cluster",
      autonomous_recommendation: true,
      human_approval_required: true,
      approved_vertical_id: null,
      public_promotion: false
    }));

  const stageResults = [
    ["OBSERVE", "PASS"],
    ["COLLECT", "PASS"],
    ["QUARANTINE", "PASS"],
    ["NORMALIZE", "PASS"],
    ["RESOLVE_ENTITIES", reviewRequired.length ? "PASS_WITH_REVIEW" : "PASS"],
    ["VALIDATE_RIGHTS_PROVENANCE_FRESHNESS", "PASS_FAIL_CLOSED"],
    ["BUILD_EVIDENCE_GRAPH", "PASS"],
    ["BUILD_MARKET_GRAPH", "PASS"],
    ["DETECT_CLUSTERS", discoveredClusters.length ? "PASS_DISCOVERY_ONLY" : "PASS_NO_CLUSTER"],
    ["ASSESS", "SKIPPED_NO_TRACK_B_ASSESSMENT"],
    ["GENERATE_INDEXES", "SKIPPED_INSUFFICIENT_EVIDENCE"],
    ["PROJECT", "PASS_FAIL_CLOSED"],
    ["MONITOR", "READY"]
  ].map(([stage, status], order) => ({ order: order + 1, stage, status }));

  const fingerprintPayload = {
    fixture_id: fixture.fixture_id,
    admitted_record_ids: admitted.map(record => record.record_id),
    quarantined,
    review_required: reviewRequired,
    market_events: marketEvents,
    evidence_graph: evidenceGraph,
    market_graph: marketGraph,
    discovered_clusters: discoveredClusters,
    stage_results: stageResults
  };

  return {
    run_id: "engine-foundation-preflight-r1",
    run_mode: "CONTRACT_FIXTURE_ONLY",
    fixture_id: fixture.fixture_id,
    fixture_classification: fixture.fixture_classification,
    generated_at: fixture.run_at,
    engine_contract_id: "engine-agci-os-v2-contract-v1",
    autonomous_operating_contract_id: "autonomous-operating-contract-v1",
    state: "FOUNDATION_PREFLIGHT_PASS",
    deterministic: true,
    fail_closed: true,
    input_record_count: fixture.records.length,
    admitted_record_count: admitted.length,
    quarantined_record_count: quarantined.length,
    manual_review_count: reviewRequired.length,
    admitted_records: admitted,
    quarantined_records: quarantined,
    review_required: reviewRequired,
    market_events: marketEvents,
    evidence_graph: evidenceGraph,
    market_graph: marketGraph,
    cluster_discovery: {
      test_threshold_only: fixture.cluster_test_minimum_observations,
      production_threshold_status: "NOT_CALIBRATED",
      discovered_count: discoveredClusters.length,
      clusters: discoveredClusters,
      approved_dynamic_vertical_count: 0
    },
    index_generation: {
      vertical_intelligence: "NOT_COMPUTED",
      kidult_500: "NOT_COMPUTED",
      kidult_100: "NOT_COMPUTED",
      reason: "CONTRACT_FIXTURE_ONLY_AND_NO_APPROVED_DYNAMIC_VERTICAL"
    },
    stage_results: stageResults,
    invariants: {
      missing_to_zero: false,
      provider_to_portal_direct_path: false,
      provider_to_index_direct_path: false,
      listing_is_sale: false,
      unsupported_metric_fabrication: false,
      autonomous_public_vertical_promotion: false,
      production_mutation: false
    },
    publication_eligible: false,
    production_eligible: false,
    run_fingerprint: sha256(stableJson(fingerprintPayload))
  };
}

export function buildQuarantineReport(run) {
  const reasonCounts = {};
  for (const record of run.quarantined_records) {
    for (const reason of record.reasons) reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
  }
  return {
    id: "raw-quarantine-preflight-r1",
    record_type: "raw_quarantine_report",
    version: "1.0.0",
    status: "PASS_FAIL_CLOSED",
    created_at: run.generated_at,
    created_by: "Track A / Raw Quarantine Engine",
    approved_by: null,
    run_id: run.run_id,
    fixture_classification: run.fixture_classification,
    input_record_count: run.input_record_count,
    quarantined_record_count: run.quarantined_record_count,
    admitted_record_count: run.admitted_record_count,
    reason_counts: Object.fromEntries(Object.entries(reasonCounts).sort(([a], [b]) => a.localeCompare(b))),
    quarantined_records: run.quarantined_records,
    index_eligible_quarantined_records: 0,
    publication_eligible: false,
    production_eligible: false,
    mutation_performed: false,
    report_fingerprint: sha256(stableJson({
      run_id: run.run_id,
      quarantined_records: run.quarantined_records,
      reason_counts: reasonCounts
    }))
  };
}

function comparable(value) {
  return stableJson(value);
}

async function main() {
  const run = buildFoundationPreflight();
  const quarantine = buildQuarantineReport(run);
  if (process.argv.includes("--write")) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.mkdirSync(path.dirname(quarantinePath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(run, null, 2)}\n`, "utf8");
    fs.writeFileSync(quarantinePath, `${JSON.stringify(quarantine, null, 2)}\n`, "utf8");
    console.log(`Wrote ${path.relative(root, outputPath)}`);
    console.log(`Wrote ${path.relative(root, quarantinePath)}`);
    return;
  }
  const currentRun = readJson(outputPath);
  const currentQuarantine = readJson(quarantinePath);
  if (comparable(currentRun) !== comparable(run)) {
    console.error("Engine v2 preflight output is stale. Run with --write.");
    process.exit(1);
  }
  if (comparable(currentQuarantine) !== comparable(quarantine)) {
    console.error("Raw Quarantine preflight report is stale. Run with --write.");
    process.exit(1);
  }
  console.log("AGCI-OS Engine v2 deterministic preflight: PASS");
  console.log(`Input: ${run.input_record_count}`);
  console.log(`Admitted: ${run.admitted_record_count}`);
  console.log(`Quarantined: ${run.quarantined_record_count}`);
  console.log(`Review required: ${run.manual_review_count}`);
  console.log(`Market events: ${run.market_events.length}`);
  console.log(`Discovered clusters: ${run.cluster_discovery.discovered_count}`);
  console.log("Indexes: NOT_COMPUTED");
  console.log("Production: HOLD");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
