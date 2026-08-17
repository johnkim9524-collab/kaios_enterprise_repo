import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fingerprint, readJson } from "./asi-discovery-common-v1.mjs";

export const WAVE_OUTPUT_FILES = Object.freeze([
  "asi-sufficiency-calibration-wave-001-assessments.json",
  "lane-survival-and-yield-v1.json",
  "source-family-resolution-v1.json",
  "global-diversity-and-concentration-v1.json",
  "source-attrition-taxonomy-v1.json",
  "source-sufficiency-empirical-calibration-candidate-v1.json",
  "next-autonomous-source-work-wave-v1.json"
]);

function jsonSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

export function normalizeWaveOutputsInMemory(rawOutputs) {
  const outputs = {};
  for (const name of WAVE_OUTPUT_FILES) {
    const value = jsonSafe(rawOutputs[name]);
    delete value.fingerprint;
    value.fingerprint = fingerprint(value);
    outputs[name] = value;
  }
  const manifest = jsonSafe(rawOutputs["run-manifest.json"]);
  manifest.outputs = Object.fromEntries(WAVE_OUTPUT_FILES.map(name => [name, outputs[name].fingerprint]));
  delete manifest.run_fingerprint;
  manifest.run_fingerprint = fingerprint(manifest);
  outputs["run-manifest.json"] = manifest;
  return outputs;
}

export function normalizeWaveOutputDirectory(directory) {
  const raw = {};
  for (const name of [...WAVE_OUTPUT_FILES, "run-manifest.json"]) {
    raw[name] = readJson(path.join(directory, name));
  }
  const outputs = normalizeWaveOutputsInMemory(raw);
  for (const [name, value] of Object.entries(outputs)) {
    fs.writeFileSync(path.join(directory, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
  }
  return outputs;
}

const directory = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (directory) {
  const outputs = normalizeWaveOutputDirectory(directory);
  console.log("ASI Wave 001 serialized fingerprints: NORMALIZED");
  console.log(`Assessment fingerprint: ${outputs[WAVE_OUTPUT_FILES[0]].fingerprint}`);
  console.log(`Run fingerprint: ${outputs["run-manifest.json"].run_fingerprint}`);
}
