import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { fingerprint, writeJsonDirectory } from "./asi-discovery-common-v1.mjs";
import { buildSourcePrecisionRankingV2Fixed } from "./build-source-precision-ranking-v2-fixed.mjs";

const root = process.cwd();
const defaultPrecisionInput = path.join(root, "artifacts", "input", "source-relevance-precision-v1");
const defaultPilotInput = path.join(root, "artifacts", "input", "track-b-top50-pilot-v1");
const defaultOutput = path.join(root, "artifacts", "agci-os", "source-precision-ranking-v2-final");

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

function refreshFingerprint(value) {
  delete value.fingerprint;
  value.fingerprint = fingerprint(value);
}

export function buildSourcePrecisionRankingV2Final(config = {}) {
  const outputs = buildSourcePrecisionRankingV2Fixed(config);
  const blind = outputs["blind-top50-input-v2.json"];
  const gaps = outputs["precision-v2-gap-report.json"];

  gaps.blind_top_50_explicit_scope_evidence_coverage = blind.records
    .filter(record => (record.explicit_scope_evidence ?? []).length > 0).length / blind.records.length;
  gaps.blind_top_50_channel_suitability_coverage = blind.records
    .filter(record => (record.channel_suitability_evidence ?? []).length > 0).length / blind.records.length;
  refreshFingerprint(gaps);

  const manifest = outputs["run-manifest.json"];
  manifest.outputs["precision-v2-gap-report.json"] = gaps.fingerprint;
  delete manifest.run_fingerprint;
  manifest.run_fingerprint = fingerprint(manifest);
  return outputs;
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  const outputs = buildSourcePrecisionRankingV2Final({ precisionInput: config.precisionInput, pilotInput: config.pilotInput });
  if (config.write) writeJsonDirectory(config.output, outputs);
  const manifest = outputs["run-manifest.json"];
  const gaps = outputs["precision-v2-gap-report.json"];
  console.log("KIDULTS Source Precision Ranking v2: FINAL STRUCTURAL PASS / BLIND REVIEW PENDING");
  console.log(`Input / ranked: ${manifest.input_endpoint_count} / ${manifest.ranked_count}`);
  console.log(`Top-200 / Blind Top-50: ${manifest.top_200_count} / ${manifest.blind_top_50_count}`);
  console.log(`Strict / evidence-hold: ${manifest.blind_strict_gate_count} / ${manifest.blind_evidence_hold_count}`);
  console.log(`Overlap / license / collision / duplicate: ${manifest.blind_training_overlap} / ${manifest.blind_license_count} / ${manifest.blind_collision_count} / ${manifest.blind_underlying_duplicate_count}`);
  console.log(`Scope / channel evidence coverage: ${gaps.blind_top_50_explicit_scope_evidence_coverage} / ${gaps.blind_top_50_channel_suitability_coverage}`);
  console.log("Empirical precision: NOT_MEASURED — Track B blind review required");
  console.log("Source Pool promotions: 0; Acquisition: BLOCKED; Production: HOLD");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
