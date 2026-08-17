import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const DEFAULTS = Object.freeze({
  preflightDir: "artifacts/agci-os/candidate-r2-preflight-r1",
  output: "artifacts/agci-os/golden-dataset-v1-candidate"
});

function parseArgs(argv) {
  const config = { ...DEFAULTS };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--write") continue;
    else if (argument === "--preflight-dir") config.preflightDir = argv[++index];
    else if (argument === "--output") config.output = argv[++index];
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return config;
}

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

function sha(value) {
  return `sha256:${crypto.createHash("sha256").update(stableJson(value)).digest("hex")}`;
}

function tokens(value) {
  return new Set(String(value ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean));
}

function jaccard(left, right) {
  const a = tokens(left);
  const b = tokens(right);
  if (!a.size && !b.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / new Set([...a, ...b]).size;
}

function decade(year) {
  return Number.isFinite(year) ? Math.floor(year / 10) * 10 : null;
}

function recordRef(record) {
  return {
    source_record_id: record.source_record_id,
    source_id: record.source_id,
    source_family: record.source_family,
    source_object_id: record.source_object_id,
    physical_object_candidate_id: record.physical_object_candidate_id,
    canonical_design_candidate_key: record.canonical_design_candidate_key,
    title: record.title,
    maker: record.maker,
    object_type: record.object_type,
    production_year: record.production_year,
    core_domain_hint: record.core_domain_hint,
    provenance_reference: record.provenance_reference,
    rights_state: record.rights_state
  };
}

function transformedView(record, mode) {
  const ref = recordRef(record);
  if (mode === "LOWERCASE_PUNCTUATION_NORMALIZED") {
    return {
      ...ref,
      title: String(ref.title ?? "").normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
      maker: String(ref.maker ?? "").normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
      object_type: String(ref.object_type ?? "").normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
      transformation: mode
    };
  }
  if (mode === "TITLE_AND_MAKER_TOKEN_ORDER_CONTROL") {
    return {
      ...ref,
      title: [...tokens(ref.title)].sort().join(" "),
      maker: [...tokens(ref.maker)].sort().join(" "),
      transformation: mode
    };
  }
  return { ...ref, transformation: "NONE" };
}

function caseRecord({ id, caseClass, left, right, provisionalRelation, difficulty, rationale, controlType = null, variant = null }) {
  return {
    case_id: id,
    case_class: caseClass,
    left,
    right,
    provisional_expected_relation: provisionalRelation,
    label_status: "PROVISIONAL_PENDING_TRACK_B",
    approved_label: null,
    approved_by: null,
    approved_at: null,
    difficulty,
    rationale,
    objective_control_type: controlType,
    representation_variant: variant,
    provenance_coverage: left.provenance_reference && right.provenance_reference ? 1 : 0,
    rights_state_explicit: Boolean(left.rights_state && right.rights_state),
    provider_id_promoted_to_canonical: false,
    auto_merge_authorized: false,
    publication_eligible: false,
    production_eligible: false
  };
}

function pairKey(left, right) {
  return [left.source_record_id, right.source_record_id].sort().join("|");
}

function buildSamePhysical(records) {
  const cases = records.map((record, index) => caseRecord({
    id: `GDV1-SP-${String(index + 1).padStart(3, "0")}`,
    caseClass: "SAME_PHYSICAL_OBJECT_NORMALIZATION_CONTROL",
    left: recordRef(record),
    right: transformedView(record, "LOWERCASE_PUNCTUATION_NORMALIZED"),
    provisionalRelation: "SAME_PHYSICAL_OBJECT",
    difficulty: "CONTROL",
    rationale: "Both sides retain the same exact source-qualified physical-object identity while textual representation is normalized.",
    controlType: "EXACT_SOURCE_IDENTITY",
    variant: "LOWERCASE_PUNCTUATION_NORMALIZED"
  }));
  for (let index = 0; cases.length < 50; index += 1) {
    const record = records[index % records.length];
    cases.push(caseRecord({
      id: `GDV1-SP-${String(cases.length + 1).padStart(3, "0")}`,
      caseClass: "SAME_PHYSICAL_OBJECT_NORMALIZATION_CONTROL",
      left: recordRef(record),
      right: transformedView(record, "TITLE_AND_MAKER_TOKEN_ORDER_CONTROL"),
      provisionalRelation: "SAME_PHYSICAL_OBJECT",
      difficulty: "CONTROL",
      rationale: "Both sides retain the same exact source-qualified physical-object identity while title and maker token order is normalized.",
      controlType: "EXACT_SOURCE_IDENTITY",
      variant: "TITLE_AND_MAKER_TOKEN_ORDER_CONTROL"
    }));
  }
  return cases.slice(0, 50);
}

function buildSameDesignCandidates(records, reviewGroups) {
  const basePairs = [];
  for (const group of reviewGroups) {
    const members = group.source_record_ids.map(id => records.find(record => record.source_record_id === id)).filter(Boolean);
    for (let leftIndex = 0; leftIndex < members.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < members.length; rightIndex += 1) {
        basePairs.push([members[leftIndex], members[rightIndex], group.canonical_design_candidate_key]);
      }
    }
  }
  if (!basePairs.length) throw new Error("No review-required same-design candidate pairs are available.");
  const variants = [
    "FULL_METADATA",
    "TITLE_MAKER_YEAR",
    "TITLE_OBJECT_TYPE_DECADE",
    "MAKER_OBJECT_TYPE_DECADE",
    "TITLE_ONLY_WITH_IDENTITY_REFERENCES"
  ];
  const cases = [];
  for (let index = 0; index < 50; index += 1) {
    const [leftRecord, rightRecord, designKey] = basePairs[index % basePairs.length];
    const variant = variants[index % variants.length];
    cases.push(caseRecord({
      id: `GDV1-SD-${String(index + 1).padStart(3, "0")}`,
      caseClass: "SAME_DESIGN_DIFFERENT_PHYSICAL_OBJECT_CANDIDATE",
      left: { ...recordRef(leftRecord), comparison_view: variant },
      right: { ...recordRef(rightRecord), comparison_view: variant },
      provisionalRelation: "SAME_CANONICAL_DESIGN_DIFFERENT_PHYSICAL_OBJECT",
      difficulty: "HIGH_REVIEW_REQUIRED",
      rationale: `Records share candidate design key '${designKey}' but represent distinct physical-object source IDs. Track B must confirm the canonical-design label before use.`,
      controlType: "REVIEW_GROUP_CANDIDATE",
      variant
    }));
  }
  return cases;
}

function similarityScore(left, right) {
  let score = 0;
  if (left.core_domain_hint === right.core_domain_hint) score += 0.2;
  if (String(left.object_type ?? "").toLowerCase() === String(right.object_type ?? "").toLowerCase()) score += 0.25;
  if (String(left.maker ?? "").toLowerCase() === String(right.maker ?? "").toLowerCase() && left.maker) score += 0.2;
  if (decade(left.production_year) !== null && decade(left.production_year) === decade(right.production_year)) score += 0.15;
  score += 0.1 * jaccard(left.title, right.title);
  score += 0.1 * jaccard(left.maker, right.maker);
  return Number(score.toFixed(6));
}

function buildHardNegatives(records) {
  const pairs = [];
  for (let leftIndex = 0; leftIndex < records.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < records.length; rightIndex += 1) {
      const left = records[leftIndex];
      const right = records[rightIndex];
      if (left.canonical_design_candidate_key === right.canonical_design_candidate_key) continue;
      const score = similarityScore(left, right);
      if (score < 0.2) continue;
      pairs.push({ left, right, score });
    }
  }
  pairs.sort((a, b) => b.score - a.score || pairKey(a.left, a.right).localeCompare(pairKey(b.left, b.right)));
  if (pairs.length < 50) throw new Error(`Only ${pairs.length} hard-negative pairs are available; 50 required.`);
  return pairs.slice(0, 50).map((pair, index) => caseRecord({
    id: `GDV1-HN-${String(index + 1).padStart(3, "0")}`,
    caseClass: "HARD_NEGATIVE_SIMILAR_METADATA",
    left: recordRef(pair.left),
    right: recordRef(pair.right),
    provisionalRelation: "DIFFERENT_CANONICAL_DESIGN",
    difficulty: "HARD",
    rationale: `Metadata similarity score ${pair.score} is high enough to challenge the matcher, while candidate design keys and source-qualified physical identities differ.`,
    controlType: "SIMILAR_METADATA_DIFFERENT_CANDIDATE_KEY",
    variant: `similarity:${pair.score}`
  }));
}

function buildClearNegatives(records) {
  const pairs = [];
  const seen = new Set();
  for (const left of records) {
    for (const right of records) {
      if (left.source_record_id === right.source_record_id) continue;
      if (left.core_domain_hint === right.core_domain_hint) continue;
      const key = pairKey(left, right);
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push({ left, right, score: similarityScore(left, right) });
    }
  }
  pairs.sort((a, b) => a.score - b.score || pairKey(a.left, a.right).localeCompare(pairKey(b.left, b.right)));
  if (pairs.length < 50) throw new Error(`Only ${pairs.length} clear-negative pairs are available; 50 required.`);
  return pairs.slice(0, 50).map((pair, index) => caseRecord({
    id: `GDV1-CN-${String(index + 1).padStart(3, "0")}`,
    caseClass: "CLEAR_NEGATIVE_CROSS_DOMAIN",
    left: recordRef(pair.left),
    right: recordRef(pair.right),
    provisionalRelation: "DIFFERENT_PHYSICAL_OBJECT_AND_DESIGN",
    difficulty: "LOW",
    rationale: `Records come from distinct source-qualified physical identities and different Core Domain hints with low metadata similarity score ${pair.score}.`,
    controlType: "CROSS_DOMAIN_LOW_SIMILARITY",
    variant: `similarity:${pair.score}`
  }));
}

export function buildGoldenDatasetCandidate(preflightDir = DEFAULTS.preflightDir) {
  const universe = readJson(path.resolve(preflightDir, "universe-admission-report.json"));
  const entity = readJson(path.resolve(preflightDir, "entity-resolution-report.json"));
  const run = readJson(path.resolve(preflightDir, "run-manifest.json"));
  const records = [...universe.authority_admission_candidates].sort((a, b) => a.source_record_id.localeCompare(b.source_record_id));
  const cases = [
    ...buildSamePhysical(records),
    ...buildSameDesignCandidates(records, entity.review_groups),
    ...buildHardNegatives(records),
    ...buildClearNegatives(records)
  ];
  const classCounts = {};
  for (const item of cases) classCounts[item.case_class] = (classCounts[item.case_class] ?? 0) + 1;
  const dataset = {
    dataset_id: "golden-dataset-v1-candidate-r1",
    record_type: "golden_dataset_candidate",
    version: "1.0.0",
    status: "LABELING_QUEUE_READY_NOT_APPROVED",
    generated_at: run.generated_at,
    generated_by: "Track A / Golden Dataset Builder",
    source_run_id: run.id,
    source_run_fingerprint: run.run_fingerprint,
    identity_model: [
      "SOURCE_RECORD",
      "PHYSICAL_OBJECT",
      "CANONICAL_DESIGN",
      "MARKET_EVENT",
      "EVIDENCE_ASSERTION"
    ],
    case_count: cases.length,
    case_class_counts: Object.fromEntries(Object.entries(classCounts).sort(([a], [b]) => a.localeCompare(b))),
    provisional_label_count: cases.length,
    approved_label_count: 0,
    rejected_label_count: 0,
    unreviewed_label_count: cases.length,
    provenance_coverage: cases.filter(item => item.provenance_coverage === 1).length / cases.length,
    rights_state_coverage: cases.filter(item => item.rights_state_explicit).length / cases.length,
    provider_id_promoted_to_canonical_count: cases.filter(item => item.provider_id_promoted_to_canonical).length,
    auto_merge_authorized_count: cases.filter(item => item.auto_merge_authorized).length,
    target_accuracy: 0.99,
    measured_accuracy: null,
    measured_accuracy_status: "NOT_AVAILABLE_UNTIL_TRACK_B_LABEL_APPROVAL",
    approval_gate: "TRACK_B_INDEPENDENT_LABEL_REVIEW",
    publication_eligible: false,
    production_eligible: false,
    cases
  };
  dataset.dataset_fingerprint = sha(dataset);

  const queue = {
    queue_id: "golden-dataset-v1-label-review-queue-r1",
    record_type: "golden_dataset_label_review_queue",
    version: "1.0.0",
    status: "READY_FOR_TRACK_B_REVIEW",
    generated_at: run.generated_at,
    dataset_id: dataset.dataset_id,
    dataset_fingerprint: dataset.dataset_fingerprint,
    total_cases: dataset.case_count,
    priority_order: [
      "SAME_DESIGN_DIFFERENT_PHYSICAL_OBJECT_CANDIDATE",
      "HARD_NEGATIVE_SIMILAR_METADATA",
      "SAME_PHYSICAL_OBJECT_NORMALIZATION_CONTROL",
      "CLEAR_NEGATIVE_CROSS_DOMAIN"
    ],
    required_reviewer: "Track B / Rankability and Validation Gate",
    required_actions: [
      "APPROVE_LABEL",
      "CORRECT_LABEL",
      "REJECT_CASE",
      "ADD_REVIEW_NOTE"
    ],
    exit_criteria: {
      approved_or_corrected_cases: 200,
      unresolved_cases: 0,
      critical_auto_merge_errors: 0,
      entity_resolution_accuracy_minimum: 0.99,
      deterministic_rerun: 1
    },
    candidate_r2_authorized: false,
    public_projection: false,
    production_eligible: false
  };
  queue.queue_fingerprint = sha(queue);
  return { dataset, queue };
}

function writeOutputs(outputs, outputDirectory) {
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(path.join(outputDirectory, "golden-dataset-v1-candidate.json"), `${JSON.stringify(outputs.dataset, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(outputDirectory, "label-review-queue.json"), `${JSON.stringify(outputs.queue, null, 2)}\n`, "utf8");
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  const outputs = buildGoldenDatasetCandidate(config.preflightDir);
  if (process.argv.includes("--write")) writeOutputs(outputs, path.resolve(config.output));
  console.log("AGCI-OS Golden Dataset v1 Candidate: LABELING QUEUE READY");
  console.log(`Cases: ${outputs.dataset.case_count}`);
  for (const [key, value] of Object.entries(outputs.dataset.case_class_counts)) console.log(`${key}: ${value}`);
  console.log(`Provenance / rights coverage: ${outputs.dataset.provenance_coverage} / ${outputs.dataset.rights_state_coverage}`);
  console.log("Approved labels: 0");
  console.log("Measured accuracy: NOT_AVAILABLE");
  console.log("Track B review: REQUIRED");
  console.log("Candidate R2: NOT_AUTHORIZED");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
