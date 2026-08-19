import fs from 'node:fs/promises';
import path from 'node:path';
import { validateHumanReviewCompletion, verifyHumanReviewPreflight } from './er-human-review-gate-r1-lib.mjs';

const [mode, ...args] = process.argv.slice(2);

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function readContracts(samplingPlanPath, packetContractPath, operationalContractPath) {
  return Promise.all([
    readJson(samplingPlanPath || 'coordination/kidults/entity-resolution/empirical-validation-sampling-plan-r1.json'),
    readJson(packetContractPath || 'coordination/kidults/entity-resolution/independent-label-review-packet-contract-r1.json'),
    readJson(operationalContractPath || 'coordination/kidults/entity-resolution/human-review-gate-operational-contract-r1.json')
  ]);
}

async function readBundle(bundleDirectory) {
  const [packetA, packetB, holdoutCommitment, manifest] = await Promise.all([
    readJson(path.join(bundleDirectory, 'reviewer-packet-a.json')),
    readJson(path.join(bundleDirectory, 'reviewer-packet-b.json')),
    readJson(path.join(bundleDirectory, 'holdout-commitment.json')),
    readJson(path.join(bundleDirectory, 'preflight-manifest.json'))
  ]);
  return { packetA, packetB, holdoutCommitment, manifest };
}

if (mode === 'preflight') {
  const [datasetPath, bundleDirectory, samplingPlanPath, packetContractPath, operationalContractPath] = args;
  if (!datasetPath || !bundleDirectory) throw new Error('usage: validate-er-human-review-gate-r1.mjs preflight <unlabeled-evidence-dataset.json> <bundle-directory> [sampling-plan.json] [packet-contract.json] [operational-contract.json]');
  const [dataset, actual, contracts] = await Promise.all([
    readJson(datasetPath),
    readBundle(bundleDirectory),
    readContracts(samplingPlanPath, packetContractPath, operationalContractPath)
  ]);
  const [samplingPlan, packetContract, operationalContract] = contracts;
  console.log(JSON.stringify(verifyHumanReviewPreflight(dataset, samplingPlan, packetContract, operationalContract, actual), null, 2));
} else if (mode === 'completion') {
  const [bundleDirectory, reviewerRegistryPath, reviewFilePath, adjudicationFilePath, outputPath, operationalContractPath] = args;
  if (!bundleDirectory || !reviewerRegistryPath || !reviewFilePath || !adjudicationFilePath || !outputPath) throw new Error('usage: validate-er-human-review-gate-r1.mjs completion <bundle-directory> <reviewer-registry.json> <review-records.json> <adjudications.json> <new-output-audit.json> [operational-contract.json]');
  const [bundle, reviewerRegistry, reviewFile, adjudicationFile, operationalContract] = await Promise.all([
    readBundle(bundleDirectory),
    readJson(reviewerRegistryPath),
    readJson(reviewFilePath),
    readJson(adjudicationFilePath),
    readJson(operationalContractPath || 'coordination/kidults/entity-resolution/human-review-gate-operational-contract-r1.json')
  ]);
  const audit = validateHumanReviewCompletion({ ...bundle, reviewerRegistry, reviewFile, adjudicationFile, operationalContract });
  await fs.writeFile(outputPath, `${JSON.stringify(audit, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({
    status: audit.audit_state,
    review_records: audit.review_record_count,
    adjudications: audit.adjudication_record_count,
    review_required_mappings: audit.review_required_mapping_count,
    empirical_attestation: audit.empirical_attestation,
    track_b: audit.track_b,
    production: audit.production
  }, null, 2));
} else {
  throw new Error('mode must be preflight or completion');
}
