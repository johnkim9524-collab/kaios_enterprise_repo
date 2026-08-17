import path from "node:path";
import process from "node:process";
import { fingerprint, normalizeUrl, readJson, unique } from "./asi-discovery-common-v1.mjs";

function fail(errors, message) { errors.push(message); }
function verifyFingerprint(value, field = "fingerprint") {
  const copy = structuredClone(value);
  const stored = copy[field];
  delete copy[field];
  return stored === fingerprint(copy);
}

export function validateSourcePrecisionRankingV3(outputDirectory, calibrationDirectory, targetedDirectory) {
  const errors = [];
  const ranking = readJson(path.join(outputDirectory, "source-precision-ranking-v3.json"));
  const buffer = readJson(path.join(outputDirectory, "source-precision-v3-candidate-buffer.json"));
  const top200 = readJson(path.join(outputDirectory, "direct-top200-candidate-queue-v3.json"));
  const dedup = readJson(path.join(outputDirectory, "source-family-deduplication-v3.json"));
  const depth = readJson(path.join(outputDirectory, "scope-role-depth-v3.json"));
  const ledger = readJson(path.join(outputDirectory, "calibration-feature-ledger-v3.json"));
  const residual = readJson(path.join(outputDirectory, "v3-residual-source-gap.json"));
  const manifest = readJson(path.join(outputDirectory, "run-manifest.json"));
  const calibration = readJson(path.join(calibrationDirectory, "track-b-calibration-assessment-400-v2.json"));
  const targeted = readJson(path.join(targetedDirectory, "track-b-targeted-high-authority-top50-pilot-v1-robust-fixed", "targeted-high-authority-top50-assessment-v1.json"));

  if (ranking.version !== "3.0.0" || manifest.version !== "3.0.0") fail(errors, "Ranking v3 outputs must use version 3.0.0.");
  if (ranking.precision_v1_records !== 5391 || manifest.precision_v1_records !== 5391) fail(errors, "Ranking v3 must consume the 5,391-record precision-v1 universe.");
  if (calibration.reviewed_records !== 400 || calibration.unresolved_records !== 0 || ledger.reviewed !== 400) fail(errors, "All 400 calibration labels must be represented.");
  if (targeted.reviewed !== 50 || targeted.relevant !== 50 || targeted.unresolved !== 0) fail(errors, "Targeted reviewed-positive foundation must be 50/50 relevant with zero unresolved.");

  if (ranking.deduplicated_candidate_families !== ranking.records.length || dedup.retained_unique_families !== ranking.records.length) fail(errors, "Candidate-family counts do not reconcile.");
  if (unique(ranking.records.map(record => record.source_family_key)).length !== ranking.records.length) fail(errors, "Selected source_family_key values must be unique.");
  const normalizedUrls = ranking.records.map(record => normalizeUrl(record.endpoint_url) ?? record.endpoint_url);
  if (unique(normalizedUrls).length !== ranking.records.length) fail(errors, "Selected endpoint URLs must be unique after normalization.");
  if (ranking.records.some(record => !record.owner || !record.owner_lineage_state || !(record.candidate_collection_scopes ?? []).length || !(record.explicit_scope_evidence ?? []).length)) fail(errors, "Every selected candidate requires owner/lineage state, Scope assignment and explicit Scope evidence.");
  if (ranking.records.some(record => record.source_pool_promoted !== false || record.acquisition_authorized !== false || record.production !== "HOLD")) fail(errors, "Selected candidate fail-closed boundary violated.");

  const selectedEndpointIds = new Set(ranking.records.map(record => record.endpoint_id));
  const calibrationNegativeIds = calibration.records.filter(record => record.scope_relevance_label === "NOT_RELEVANT").map(record => record.endpoint_id);
  const negativePromotions = calibrationNegativeIds.filter(id => selectedEndpointIds.has(id));
  if (negativePromotions.length) fail(errors, `Exact calibration negatives were promoted: ${negativePromotions.slice(0, 10).join(", ")}`);
  const calibrationDuplicateIds = calibration.records.filter(record => record.generic_code_or_keyword_collision_label === "DUPLICATE_UNDERLYING_WORK").map(record => record.endpoint_id);
  const duplicatePromotions = calibrationDuplicateIds.filter(id => selectedEndpointIds.has(id));
  if (duplicatePromotions.length) fail(errors, `Calibration duplicate-work endpoints were used for padding: ${duplicatePromotions.slice(0, 10).join(", ")}`);

  const targetedPositiveIds = new Set(targeted.records.filter(record => record.scope_relevance_label === "RELEVANT").map(record => record.source_id));
  const retainedTargeted = new Set(ranking.records.filter(record => record.track_b_seed_state === "TRACK_B_TARGETED_TOP50_RELEVANT").map(record => record.source_id));
  const collapsedTargeted = new Set(dedup.records.filter(record => String(record.candidate_id).startsWith("targeted:")).map(record => String(record.candidate_id).slice("targeted:".length)));
  const accountedTargeted = new Set([...retainedTargeted, ...collapsedTargeted]);
  const missingTargeted = [...targetedPositiveIds].filter(id => !accountedTargeted.has(id));
  if (missingTargeted.length) fail(errors, `Track B targeted positives were lost without explicit dedup lineage: ${missingTargeted.join(", ")}`);

  if (buffer.record_count !== Math.min(240, ranking.records.length) || buffer.records.length !== buffer.record_count) fail(errors, "Candidate-buffer count mismatch.");
  const expectedTop200 = Math.min(200, ranking.records.length);
  if (top200.record_count !== expectedTop200 || top200.records.length !== expectedTop200) fail(errors, "Direct Top-200 candidate count mismatch.");
  const shouldBeReady = ranking.records.length >= 200;
  if (manifest.direct_top200_ready !== shouldBeReady || residual.direct_top200_ready !== shouldBeReady || top200.frozen !== shouldBeReady) fail(errors, "Direct Top-200 readiness state is inconsistent.");
  if (residual.direct_top200_family_gap !== Math.max(0, 200 - ranking.records.length)) fail(errors, "Direct Top-200 residual gap mismatch.");
  if (residual.preferred_240_buffer_gap !== Math.max(0, 240 - ranking.records.length)) fail(errors, "Preferred 240-family buffer gap mismatch.");
  if (!shouldBeReady && (residual.generic_broad_discovery_authorized !== false || residual.targeted_residual_discovery_authorized !== true)) fail(errors, "Residual gap must authorize targeted-only recovery, not broad generic discovery.");

  if (depth.scope_count !== 32 || depth.records.length !== 32 || depth.scopes_represented !== 32) fail(errors, "All 32 Collection Scopes must be represented after v3 reranking.");
  if (residual.scopes_without_any_candidate.length !== 0) fail(errors, "No Collection Scope may be empty in the v3 candidate universe.");

  const guardedOutputs = [ranking, buffer, top200, residual];
  for (const output of guardedOutputs) {
    if (output.source_pool_promotions !== 0 || output.acquisition_authorized !== false || output.production !== "HOLD") fail(errors, `${output.id}: fail-closed boundary violated.`);
  }
  if (ranking.candidate_r2 !== "BLOCKED" || residual.candidate_r2 !== "BLOCKED" || manifest.candidate_r2_created !== false || manifest.production !== "HOLD") fail(errors, "Candidate R2 / Production boundary violated.");
  if (manifest.source_pool_promotions !== 0 || manifest.acquisition_authorized !== false) fail(errors, "Run manifest promotion/acquisition boundary violated.");

  for (const value of [ranking, buffer, top200, dedup, depth, ledger, residual]) {
    if (!verifyFingerprint(value)) fail(errors, `${value.id}: fingerprint mismatch.`);
    if (manifest.outputs[pathForRecordType(value.record_type)] === undefined) {
      // Manifest pointer names are validated below by exact fingerprint set.
    }
  }
  if (!verifyFingerprint(manifest, "run_fingerprint")) fail(errors, "Run manifest fingerprint mismatch.");
  const outputFingerprints = new Set(Object.values(manifest.outputs));
  for (const value of [ranking, buffer, top200, dedup, depth, ledger, residual]) if (!outputFingerprints.has(value.fingerprint)) fail(errors, `${value.id}: manifest output fingerprint missing.`);

  return errors;
}

function pathForRecordType() { return ""; }

const outputDirectory = path.resolve(process.argv[2] ?? "");
const calibrationDirectory = path.resolve(process.argv[3] ?? "");
const targetedDirectory = path.resolve(process.argv[4] ?? "");
const errors = validateSourcePrecisionRankingV3(outputDirectory, calibrationDirectory, targetedDirectory);
if (errors.length) {
  console.error(`KIDULTS Source Precision Ranking v3: FAIL (${errors.length})`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}
const manifest = readJson(path.join(outputDirectory, "run-manifest.json"));
console.log("KIDULTS Source Precision Ranking v3: PASS");
console.log(`Candidate families ${manifest.deduplicated_candidate_families}; Direct Top-200 gap ${manifest.residual_top200_gap}; preferred buffer gap ${manifest.residual_240_gap}; Production HOLD`);
