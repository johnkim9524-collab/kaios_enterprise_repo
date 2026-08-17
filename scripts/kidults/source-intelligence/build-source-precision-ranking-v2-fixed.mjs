import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { fingerprint, writeJsonDirectory } from "./asi-discovery-common-v1.mjs";
import { buildSourcePrecisionRankingV2 } from "./build-source-precision-ranking-v2.mjs";

const root = process.cwd();
const defaultPrecisionInput = path.join(root, "artifacts", "input", "source-relevance-precision-v1");
const defaultPilotInput = path.join(root, "artifacts", "input", "track-b-top50-pilot-v1");
const defaultOutput = path.join(root, "artifacts", "agci-os", "source-precision-ranking-v2");

function parseArgs(argv) {
  const config = { precisionInput: defaultPrecisionInput, pilotInput: defaultPilotInput, output: defaultOutput, write: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--precision-input") config.precisionInput = path.resolve(argv[++index]);
    else if (argument === "--pilot-input") config.pilotInput = path.resolve(argv[++index]);
    else if (argument === "--output") config.output = path.resolve(argv[++index]);
    else if (argument === "--write") config.write = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return config;
}

function stripForBlind(record, rank) {
  return {
    blind_case_id: `v2-blind-${String(rank).padStart(3, "0")}`,
    endpoint_id: record.endpoint_id,
    source_id: record.source_id,
    endpoint_url: record.endpoint_url,
    owner: record.owner,
    channel_type: record.channel_type,
    record_origin: record.record_origin,
    candidate_collection_scopes: record.candidate_collection_scopes,
    assigned_source_roles: record.corrected_source_roles,
    evidence_excerpt: record.evidence_excerpt,
    explicit_scope_evidence: record.explicit_scope_evidence,
    channel_suitability_evidence: record.channel_suitability_evidence ?? [record.channel_type],
    blind_queue_fill_state: record.blind_queue_fill_state ?? "STRICT_V2_GATE",
    rights_state: record.rights_state ?? "UNKNOWN_NOT_INFERRED",
    verification_state: record.verification_state ?? "NOT_VERIFIED",
    underlying_work_key: record.underlying_work_key,
    numeric_ranking_score_visible_to_reviewer: false,
    training_endpoint_excluded: true,
    track_b_scope_relevance_label: null,
    track_b_source_role_label: null,
    track_b_rationale: null,
    track_b_reviewed_at: null,
    qualification_state: "NOT_QUALIFIED",
    acquisition_authorized: false,
    production: "HOLD"
  };
}

function refreshFingerprint(value) {
  delete value.fingerprint;
  value.fingerprint = fingerprint(value);
}

function addUniqueCandidate(record, selected, endpointIds, underlyingKeys) {
  if (endpointIds.has(record.endpoint_id) || underlyingKeys.has(record.underlying_work_key)) return false;
  selected.push(record);
  endpointIds.add(record.endpoint_id);
  underlyingKeys.add(record.underlying_work_key);
  return true;
}

export function buildSourcePrecisionRankingV2Fixed(config = {}) {
  const outputs = buildSourcePrecisionRankingV2(config);
  const ranked = outputs["precision-ranked-universe-v2.json"].records;
  const blind = outputs["blind-top50-input-v2.json"];
  const trainingIds = new Set(ranked
    .filter(record => record.training_state !== "NOT_IN_PILOT_TRAINING_SET")
    .map(record => record.endpoint_id));

  const selected = [];
  const endpointIds = new Set();
  const underlyingKeys = new Set();
  const strictEligible = ranked.filter(record =>
    !trainingIds.has(record.endpoint_id) &&
    !(record.hard_rejection_reasons ?? []).length &&
    (record.explicit_scope_evidence ?? []).length > 0 &&
    record.explicit_channel_suitability === true &&
    !(record.scope_collision_evidence ?? []).length
  );

  for (const record of strictEligible) {
    if (selected.length >= 50) break;
    addUniqueCandidate(record, selected, endpointIds, underlyingKeys);
  }

  if (selected.length < 50) {
    const evidenceHoldFallback = ranked.filter(record =>
      !trainingIds.has(record.endpoint_id) &&
      !(record.hard_rejection_reasons ?? []).length &&
      (record.explicit_scope_evidence ?? []).length > 0 &&
      !(record.scope_collision_evidence ?? []).length &&
      (record.channel_suitability_evidence ?? []).length > 0
    );
    for (const record of evidenceHoldFallback) {
      if (selected.length >= 50) break;
      if (endpointIds.has(record.endpoint_id) || underlyingKeys.has(record.underlying_work_key)) continue;
      record.blind_queue_fill_state = "STRONGEST_AVAILABLE_CHANNEL_EVIDENCE_HOLD_REQUIRES_TRACK_B_REVIEW";
      addUniqueCandidate(record, selected, endpointIds, underlyingKeys);
    }
  }

  if (selected.length !== 50) throw new Error(`Unable to repair blind Top-50 uniqueness; selected ${selected.length}.`);

  blind.records = selected.map((record, index) => stripForBlind(record, index + 1));
  blind.record_count = blind.records.length;
  blind.pilot_training_endpoint_overlap = blind.records.filter(record => trainingIds.has(record.endpoint_id)).length;
  blind.strict_gate_record_count = blind.records.filter(record => record.blind_queue_fill_state === "STRICT_V2_GATE").length;
  blind.evidence_hold_record_count = blind.records.filter(record => record.blind_queue_fill_state !== "STRICT_V2_GATE").length;

  const dedup = outputs["underlying-work-deduplication-report-v1.json"];
  dedup.blind_top50_duplicate_underlying_works = blind.records.length - new Set(blind.records.map(record => record.underlying_work_key)).size;

  const gaps = outputs["precision-v2-gap-report.json"];
  gaps.blind_top_50_records = blind.records.length;
  gaps.blind_top_50_training_overlap = blind.pilot_training_endpoint_overlap;
  gaps.blind_top_50_strict_gate_records = blind.strict_gate_record_count;
  gaps.blind_top_50_evidence_hold_records = blind.evidence_hold_record_count;
  gaps.blind_top_50_license_or_business_records = selected.filter(record => (record.license_business_evidence ?? []).length).length;
  gaps.blind_top_50_known_scope_collisions = selected.filter(record => (record.scope_collision_evidence ?? []).length).length;
  gaps.blind_top_50_duplicate_underlying_works = dedup.blind_top50_duplicate_underlying_works;
  gaps.blind_top_50_explicit_scope_evidence_coverage = selected.filter(record => (record.explicit_scope_evidence ?? []).length).length / selected.length;
  gaps.blind_top_50_channel_suitability_coverage = selected.filter(record => (record.channel_suitability_evidence ?? []).length > 0).length / selected.length;

  for (const [name, value] of Object.entries(outputs)) {
    if (name !== "run-manifest.json") refreshFingerprint(value);
  }

  const manifest = outputs["run-manifest.json"];
  manifest.outputs = Object.fromEntries(Object.entries(outputs)
    .filter(([name]) => name !== "run-manifest.json")
    .map(([name, value]) => [name, value.fingerprint]));
  manifest.blind_top_50_count = blind.records.length;
  manifest.blind_training_overlap = gaps.blind_top_50_training_overlap;
  manifest.blind_strict_gate_count = blind.strict_gate_record_count;
  manifest.blind_evidence_hold_count = blind.evidence_hold_record_count;
  manifest.blind_license_count = gaps.blind_top_50_license_or_business_records;
  manifest.blind_collision_count = gaps.blind_top_50_known_scope_collisions;
  manifest.blind_underlying_duplicate_count = gaps.blind_top_50_duplicate_underlying_works;
  delete manifest.run_fingerprint;
  manifest.run_fingerprint = fingerprint(manifest);
  return outputs;
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  const outputs = buildSourcePrecisionRankingV2Fixed({ precisionInput: config.precisionInput, pilotInput: config.pilotInput });
  if (config.write) writeJsonDirectory(config.output, outputs);
  const manifest = outputs["run-manifest.json"];
  console.log("KIDULTS Source Precision Ranking v2: PASS / UNIQUE BLIND TOP-50");
  console.log(`Input / ranked: ${manifest.input_endpoint_count} / ${manifest.ranked_count}`);
  console.log(`Anchors: ${manifest.anchor_candidate_count}`);
  console.log(`Top-200 / Blind Top-50: ${manifest.top_200_count} / ${manifest.blind_top_50_count}`);
  console.log(`Strict / evidence-hold blind records: ${manifest.blind_strict_gate_count} / ${manifest.blind_evidence_hold_count}`);
  console.log(`Blind overlap / license / collision / duplicate: ${manifest.blind_training_overlap} / ${manifest.blind_license_count} / ${manifest.blind_collision_count} / ${manifest.blind_underlying_duplicate_count}`);
  console.log("Measured precision: NOT_MEASURED — new Track B blind review required");
  console.log("Source Pool promotions: 0; Acquisition: BLOCKED; Production: HOLD");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
