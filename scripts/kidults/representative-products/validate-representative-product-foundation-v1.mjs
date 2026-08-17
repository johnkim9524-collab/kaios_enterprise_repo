import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  fingerprint,
  readJson,
  stableJson,
  unique
} from "../source-intelligence/asi-discovery-common-v1.mjs";
import { buildRepresentativeProductFoundationV1 } from "./build-representative-product-foundation-v1.mjs";

const REQUIRED_FILES = [
  "category-representative-product-registry-v1.json",
  "representative-product-gap-matrix-v1.json",
  "representative-product-evidence-plan-v1.json",
  "representative-product-asi-expansion-queue-v1.json",
  "representative-product-engine-alignment-v1.json",
  "representative-product-source-sufficiency-driver-v1.json",
  "run-manifest.json"
];

function fail(errors, message) {
  errors.push(message);
}

function validateFingerprints(outputs, errors) {
  for (const [name, value] of Object.entries(outputs)) {
    if (name === "run-manifest.json") continue;
    const copy = structuredClone(value);
    const stored = copy.fingerprint;
    delete copy.fingerprint;
    if (stored !== fingerprint(copy)) fail(errors, `${name}: fingerprint mismatch.`);
  }
  const manifest = outputs["run-manifest.json"];
  const copy = structuredClone(manifest);
  const stored = copy.run_fingerprint;
  delete copy.run_fingerprint;
  if (stored !== fingerprint(copy)) fail(errors, "run-manifest.json: run fingerprint mismatch.");
}

export function validateRepresentativeProductFoundationV1(directory) {
  const errors = [];
  const outputs = {};
  for (const name of REQUIRED_FILES) {
    const file = path.join(directory, name);
    if (!fs.existsSync(file)) fail(errors, `Missing output: ${name}`);
    else outputs[name] = readJson(file);
  }
  if (errors.length) return errors;

  const expected = buildRepresentativeProductFoundationV1();
  for (const name of REQUIRED_FILES) {
    if (stableJson(outputs[name]) !== stableJson(expected[name])) {
      fail(errors, `${name}: output differs from deterministic recomputation.`);
    }
  }

  const registry = outputs["category-representative-product-registry-v1.json"];
  const gaps = outputs["representative-product-gap-matrix-v1.json"];
  const evidence = outputs["representative-product-evidence-plan-v1.json"];
  const expansion = outputs["representative-product-asi-expansion-queue-v1.json"];
  const alignment = outputs["representative-product-engine-alignment-v1.json"];
  const sourceDriver = outputs["representative-product-source-sufficiency-driver-v1.json"];
  const manifest = outputs["run-manifest.json"];

  if (registry.category_count !== 8 || registry.collection_scope_count !== 32 || registry.named_anchor_product_count !== 160) {
    fail(errors, "Registry must contain 8 categories, 32 Collection Scopes and 160 named anchors.");
  }
  if (registry.representative_qualified_product_count !== 0 || registry.anonymous_product_records !== 0) {
    fail(errors, "Initial registry must contain zero anonymous and zero Representative Qualified products.");
  }
  if (registry.records.length !== 160 || unique(registry.records.map(record => record.representative_product_id)).length !== 160) {
    fail(errors, "Representative Product IDs must be unique and total 160.");
  }
  const categoryCounts = new Map();
  const scopeCounts = new Map();
  for (const record of registry.records) {
    categoryCounts.set(record.category_id, (categoryCounts.get(record.category_id) ?? 0) + 1);
    scopeCounts.set(record.collection_scope_id, (scopeCounts.get(record.collection_scope_id) ?? 0) + 1);
    if (!record.maker_or_brand || !record.product_name || !record.collection_scope_id || !record.selection_rationale) {
      fail(errors, `${record.representative_product_id}: named product fields are incomplete.`);
    }
    if (record.selection_state !== "ANCHOR_DEFINED"
      || record.canonical_identity_state !== "NOT_RESOLVED"
      || record.representative_qualification_state !== "NOT_STARTED") {
      fail(errors, `${record.representative_product_id}: initial state boundary is invalid.`);
    }
    if (record.minimum_validated_evidence_assertions < 32 || record.minimum_market_observations < 60) {
      fail(errors, `${record.representative_product_id}: v2 Evidence target is below the approved floor.`);
    }
    if (record.source_pool_promoted !== false
      || record.acquisition_authorized !== false
      || record.index_eligible !== false
      || record.portal_eligible !== false
      || record.production !== "HOLD") {
      fail(errors, `${record.representative_product_id}: fail-closed boundary violated.`);
    }
  }
  if ([...categoryCounts.values()].some(count => count !== 20) || categoryCounts.size !== 8) {
    fail(errors, "Each category must contain exactly 20 named anchor products.");
  }
  if ([...scopeCounts.values()].some(count => count !== 5) || scopeCounts.size !== 32) {
    fail(errors, "Each Collection Scope must contain exactly five named anchor products.");
  }

  if (gaps.current_named_anchor_products !== 160 || gaps.total_named_product_gap !== 7840
    || gaps.representative_qualified_products !== 0 || gaps.total_qualified_product_gap !== 8000) {
    fail(errors, "Representative Product gap totals are invalid.");
  }
  if (gaps.global_market_poc_product_gate !== "FAIL") {
    fail(errors, "Global Market PoC product gate must remain FAIL.");
  }

  if (evidence.named_product_count !== 160 || evidence.records.length !== 160
    || evidence.planned_validated_evidence_assertions !== 6320
    || evidence.planned_market_observations !== 18240) {
    fail(errors, "Named-anchor Evidence plan totals are invalid.");
  }
  if (evidence.executable_collection_work_items !== 0
    || evidence.records.some(record => record.collection_state !== "HOLD_CANONICAL_IDENTITY_SOURCE_AND_RIGHTS_GATES")) {
    fail(errors, "No executable Evidence collection work may exist before product and Source gates.");
  }
  if (unique(evidence.records.map(record => record.representative_product_id)).length !== 160) {
    fail(errors, "Every Evidence plan record must link to one unique named product.");
  }

  if (expansion.scope_work_items !== 32 || expansion.records.length !== 32
    || expansion.current_named_anchors !== 160
    || expansion.total_named_product_gap !== 7840
    || expansion.total_planned_candidate_slots !== 7840) {
    fail(errors, "ASI named-product expansion queue totals are invalid.");
  }
  for (const record of expansion.records) {
    if (record.current_named_anchors !== 5 || record.minimum_named_product_floor !== 250 || record.named_product_gap !== 245) {
      fail(errors, `${record.collection_scope_id}: expected 5 anchors and a 245-product gap.`);
    }
    if (record.sequential_waves.reduce((sum, wave) => sum + wave.candidate_target, 0) !== 245) {
      fail(errors, `${record.collection_scope_id}: sequential waves must fill the entire named-product gap.`);
    }
    if (record.broad_generic_discovery !== "CLOSED" || record.acquisition_authorized !== false || record.production !== "HOLD") {
      fail(errors, `${record.collection_scope_id}: ASI expansion boundary violated.`);
    }
  }

  const requiredEngines = [
    "DECISION_OPERATING_SYSTEM",
    "COLLECTION_SCOPE_ENGINE",
    "AUTONOMOUS_SOURCE_INTELLIGENCE",
    "CANONICAL_IDENTITY_ENGINE",
    "EVIDENCE_ENGINE",
    "MARKET_ENGINE",
    "MEMORY_ENGINE",
    "PROVIDER_FUSION_ENGINE",
    "ADAPTIVE_COLLECTION_CADENCE_ENGINE",
    "SOURCE_SUFFICIENCY_ENGINE",
    "TRACK_B_VALIDATION",
    "INDEX_AND_PORTAL_PROJECTION"
  ];
  if (alignment.engines.length !== requiredEngines.length
    || requiredEngines.some(engine => !alignment.engines.some(record => record.engine === engine))) {
    fail(errors, "All required engines must be aligned to the Representative Product Registry.");
  }
  if (alignment.engines.some(record => record.blocked_without_product_registry !== true)) {
    fail(errors, "Every product-dependent engine must fail closed without Representative Product linkage.");
  }

  const totalEvidence = sourceDriver.categories.reduce((sum, record) => sum + record.target_validated_evidence_assertions, 0);
  const totalMarket = sourceDriver.categories.reduce((sum, record) => sum + record.target_market_observations, 0);
  if (sourceDriver.categories.length !== 8 || totalEvidence !== 316000 || totalMarket !== 912000) {
    fail(errors, "Source Sufficiency driver must use the approved 316,000 / 912,000 full-floor targets.");
  }
  if (sourceDriver.categories.some(record => record.evidence_roles_per_product !== 7
    || record.current_named_anchor_products !== 20
    || record.current_representative_qualified_products !== 0)) {
    fail(errors, "Source Sufficiency category drivers are not aligned to named products and seven Source roles.");
  }

  if (manifest.status !== "PASS_NAMED_PRODUCT_ANCHORS_EVIDENCE_AND_ENGINE_ALIGNMENT_ACTIVE"
    || manifest.categories !== 8
    || manifest.collection_scopes !== 32
    || manifest.named_anchor_products !== 160
    || manifest.named_product_gap_to_floor !== 7840
    || manifest.planned_anchor_validated_evidence_assertions !== 6320
    || manifest.planned_anchor_market_observations !== 18240
    || manifest.full_floor_validated_evidence_assertions !== 316000
    || manifest.full_floor_market_observations !== 912000
    || manifest.anonymous_product_evidence_work_items !== 0
    || manifest.acquisition_authorized !== false
    || manifest.production !== "HOLD") {
    fail(errors, "Run manifest status, totals or fail-closed boundaries are invalid.");
  }

  validateFingerprints(outputs, errors);
  return errors;
}

const directory = path.resolve(process.argv[2] ?? "");
const errors = validateRepresentativeProductFoundationV1(directory);
if (errors.length) {
  console.error(`KIDULTS Representative Product Foundation v1: FAIL (${errors.length})`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}
const manifest = readJson(path.join(directory, "run-manifest.json"));
console.log("KIDULTS Representative Product Foundation v1: PASS");
console.log(`Categories / Scopes / named anchors: ${manifest.categories} / ${manifest.collection_scopes} / ${manifest.named_anchor_products}`);
console.log(`Named gap / qualified products: ${manifest.named_product_gap_to_floor} / ${manifest.representative_qualified_products}`);
console.log(`Anchor Evidence / Market plan: ${manifest.planned_anchor_validated_evidence_assertions} / ${manifest.planned_anchor_market_observations}`);
console.log(`Full floor Evidence / Market target: ${manifest.full_floor_validated_evidence_assertions} / ${manifest.full_floor_market_observations}`);
console.log("Anonymous Evidence work items: 0; Acquisition: BLOCKED; Production: HOLD");
