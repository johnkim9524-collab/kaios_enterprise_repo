import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { buildDosV1 } from "../dos/build-dos-v1.mjs";
import { buildDosAsiExecutionV1 } from "../dos/build-dos-asi-execution-v1.mjs";
import { readJson, writeJsonDirectory } from "./asi-discovery-common-v1.mjs";
import { runLiveDiscovery } from "./asi-discovery-live-v1.mjs";
import { compileDiscovery } from "./asi-discovery-compiler-v1.mjs";

const root = process.cwd();
const contractPath = path.join(
  root,
  "coordination",
  "kidults",
  "source-intelligence",
  "asi-discovery-batch-001-contract-v1.json"
);
const defaultOutput = path.join(root, "artifacts", "agci-os", "asi-discovery-batch-001");

function parseArgs(argv) {
  const config = {
    output: defaultOutput,
    write: false,
    live: false,
    replay: null,
    target: null
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output") config.output = path.resolve(argv[++index]);
    else if (argument === "--write") config.write = true;
    else if (argument === "--live") config.live = true;
    else if (argument === "--replay") config.replay = path.resolve(argv[++index]);
    else if (argument === "--target") config.target = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (config.live === Boolean(config.replay)) {
    throw new Error("Choose exactly one execution mode: --live or --replay <snapshot>.");
  }
  if (config.target !== null && (!Number.isInteger(config.target) || config.target < 1)) {
    throw new Error("--target must be a positive integer.");
  }
  return config;
}

export function loadDiscoveryInputs() {
  return {
    contract: readJson(contractPath),
    dos: buildDosV1(),
    bridge: buildDosAsiExecutionV1()
  };
}

export function buildFromSnapshot(snapshot, inputs = loadDiscoveryInputs()) {
  return compileDiscovery(snapshot, inputs.contract, inputs.bridge, inputs.dos);
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  const inputs = loadDiscoveryInputs();
  if (config.target !== null) {
    inputs.contract.targets.unique_source_endpoints_minimum = config.target;
  }

  const snapshot = config.live
    ? await runLiveDiscovery(inputs.contract, inputs.bridge)
    : readJson(config.replay);
  const outputs = compileDiscovery(snapshot, inputs.contract, inputs.bridge, inputs.dos);
  if (config.write) writeJsonDirectory(config.output, outputs);

  const manifest = outputs["batch-run-manifest.json"];
  console.log(`KIDULTS ASI Discovery Batch 001: ${manifest.status}`);
  console.log(`Raw / unique endpoints: ${manifest.raw_records} / ${manifest.unique_source_endpoints}`);
  console.log(`Mandatory lane coverage: ${manifest.mandatory_lanes_with_candidate_coverage} / ${manifest.mandatory_lane_count}`);
  console.log(`Deep / preflight / adapter candidates: ${manifest.deep_assessments} / ${manifest.preflight_records} / ${manifest.adapter_contract_candidates}`);
  console.log(`Provider errors: ${manifest.provider_errors}`);
  console.log("Content acquisition: false");
  console.log("KIDULT 500 / KIDULT 100: NOT_COMPUTED");
  console.log("Production: HOLD");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
