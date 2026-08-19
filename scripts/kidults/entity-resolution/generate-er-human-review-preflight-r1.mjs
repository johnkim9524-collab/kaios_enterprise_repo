import fs from 'node:fs/promises';
import path from 'node:path';
import { generateHumanReviewPreflight } from './er-human-review-gate-r1-lib.mjs';

const [datasetPath, outputDirectory, samplingPlanPath = 'coordination/kidults/entity-resolution/empirical-validation-sampling-plan-r1.json', packetContractPath = 'coordination/kidults/entity-resolution/independent-label-review-packet-contract-r1.json', operationalContractPath = 'coordination/kidults/entity-resolution/human-review-gate-operational-contract-r1.json'] = process.argv.slice(2);

if (!datasetPath || !outputDirectory) {
  throw new Error('usage: generate-er-human-review-preflight-r1.mjs <unlabeled-evidence-dataset.json> <new-output-directory> [sampling-plan.json] [packet-contract.json] [operational-contract.json]');
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

const [dataset, samplingPlan, packetContract, operationalContract] = await Promise.all([
  readJson(datasetPath),
  readJson(samplingPlanPath),
  readJson(packetContractPath),
  readJson(operationalContractPath)
]);

const artifacts = generateHumanReviewPreflight(dataset, samplingPlan, packetContract, operationalContract);
await fs.mkdir(outputDirectory, { recursive: false });
const outputs = [
  ['reviewer-packet-a.json', artifacts.packetA],
  ['reviewer-packet-b.json', artifacts.packetB],
  ['holdout-commitment.json', artifacts.holdoutCommitment],
  ['preflight-manifest.json', artifacts.manifest]
];
for (const [name, value] of outputs) {
  await fs.writeFile(path.join(outputDirectory, name), `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
}

console.log(JSON.stringify({
  status: 'PACKETS_AND_HOLDOUT_COMMITMENT_GENERATED_PREFLIGHT_ONLY',
  output_directory: outputDirectory,
  total_cases: artifacts.packetA.case_count,
  blind_cases: artifacts.holdoutCommitment.blind_case_count,
  reviewer_a: 'NOT_ASSIGNED',
  reviewer_b: 'NOT_ASSIGNED',
  labels: 'NOT_COLLECTED',
  partition_commit_sha: null,
  model_freeze_sha: null,
  production: 'HOLD'
}, null, 2));
