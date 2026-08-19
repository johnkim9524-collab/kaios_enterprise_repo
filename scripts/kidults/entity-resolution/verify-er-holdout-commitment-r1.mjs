import fs from 'node:fs/promises';
import { verifyGitFreezeOrder, verifyHoldoutCommitment } from './er-human-review-gate-r1-lib.mjs';

const positional = [];
const options = {};
for (let index = 2; index < process.argv.length; index += 1) {
  const token = process.argv[index];
  if (token.startsWith('--')) {
    const value = process.argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`missing value for ${token}`);
    options[token.slice(2)] = value;
    index += 1;
  } else {
    positional.push(token);
  }
}

const [datasetPath, commitmentPath, samplingPlanPath = 'coordination/kidults/entity-resolution/empirical-validation-sampling-plan-r1.json', packetContractPath = 'coordination/kidults/entity-resolution/independent-label-review-packet-contract-r1.json', operationalContractPath = 'coordination/kidults/entity-resolution/human-review-gate-operational-contract-r1.json'] = positional;
if (!datasetPath || !commitmentPath) {
  throw new Error('usage: verify-er-holdout-commitment-r1.mjs <unlabeled-evidence-dataset.json> <holdout-commitment.json> [sampling-plan.json] [packet-contract.json] [operational-contract.json] [--repo <path> --commitment-repo-path <path> --partition-commit-sha <sha> --model-freeze-sha <sha>]');
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

const [dataset, commitment, samplingPlan, packetContract, operationalContract] = await Promise.all([
  readJson(datasetPath),
  readJson(commitmentPath),
  readJson(samplingPlanPath),
  readJson(packetContractPath),
  readJson(operationalContractPath)
]);

const contentProof = verifyHoldoutCommitment(dataset, samplingPlan, packetContract, operationalContract, commitment);
const gitOptionNames = ['repo', 'commitment-repo-path', 'partition-commit-sha', 'model-freeze-sha'];
const suppliedGitOptions = gitOptionNames.filter((name) => options[name] !== undefined);
if (suppliedGitOptions.length !== 0 && suppliedGitOptions.length !== gitOptionNames.length) throw new Error('all Git freeze-order options must be supplied together');

if (suppliedGitOptions.length === gitOptionNames.length) {
  const freezeProof = verifyGitFreezeOrder({
    repoPath: options.repo,
    commitmentPath: options['commitment-repo-path'],
    commitment,
    partitionCommitSha: options['partition-commit-sha'],
    modelFreezeSha: options['model-freeze-sha']
  });
  console.log(JSON.stringify({ ...contentProof, ...freezeProof }, null, 2));
} else {
  console.log(JSON.stringify(contentProof, null, 2));
}
