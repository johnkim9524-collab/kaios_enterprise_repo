import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { fingerprint, writeJsonDirectory } from "./asi-discovery-common-v1.mjs";
import { buildTrackBTargetedTop50PilotRobust } from "./build-track-b-targeted-high-authority-top50-pilot-v1-robust.mjs";

const root = process.cwd();
const defaultInput = path.join(root, "artifacts", "agci-os", "targeted-high-authority-source-expansion-v1");
const defaultOutput = path.join(root, "artifacts", "agci-os", "track-b-targeted-high-authority-top50-pilot-v1-robust-fixed");

function parseArgs(argv) {
  const config = { input: defaultInput, output: defaultOutput, write: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--input") config.input = path.resolve(argv[++index]);
    else if (argument === "--output") config.output = path.resolve(argv[++index]);
    else if (argument === "--write") config.write = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return config;
}

export function buildTrackBTargetedTop50PilotRobustFixed({ inputDirectory = defaultInput } = {}) {
  const outputs = buildTrackBTargetedTop50PilotRobust({ inputDirectory });
  const manifest = outputs["run-manifest.json"];
  delete manifest.run_fingerprint;
  manifest.run_fingerprint = fingerprint(manifest);
  return outputs;
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  const outputs = buildTrackBTargetedTop50PilotRobustFixed({ inputDirectory: config.input });
  if (config.write) writeJsonDirectory(config.output, outputs);
  const run = outputs["run-manifest.json"];
  console.log("KIDULTS Track B Targeted High-Authority Top-50 Pilot v1.1 Fixed: COMPLETE");
  console.log(`Reviewed / Relevant / Not relevant: ${run.reviewed} / ${run.relevant} / ${run.not_relevant}`);
  console.log(`Measured Top-50 precision: ${run.top50_precision.toFixed(3)} / required ${run.required_top50_precision.toFixed(3)}`);
  console.log(`Ranking gate: ${run.ranking_gate}`);
  console.log("Final 400-case + direct Top-200 review: INCOMPLETE");
  console.log("Source Pool promotions: 0; Acquisition: BLOCKED; Production: HOLD");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
