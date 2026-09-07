#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildAuditReceipt,
  buildPortalProjection,
  buildSyntheticDataset,
  digest,
  executeSyntheticDataset,
  renderSyntheticPortal,
  runNegativeIsolationTests,
  stableText,
  validateProviderAdapterManifest,
} from './synthetic-platform-validation-v1-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const generatedRoot = path.join(ROOT, 'coordination/kidults/synthetic/generated');
const paths = {
  verticals: path.join(ROOT, 'coordination/kidults/registry/core-verticals.json'),
  providers: path.join(ROOT, 'coordination/kidults/synthetic/launch-cohort-provider-adapters-v1.json'),
  dataset: path.join(generatedRoot, 'synthetic-dataset-120-v1.json'),
  pipeline: path.join(generatedRoot, 'synthetic-pipeline-receipt-v1.json'),
  portal: path.join(generatedRoot, 'synthetic-portal-projection-v1.json'),
  audit: path.join(generatedRoot, 'synthetic-platform-audit-receipt-v1.json'),
};
const generate = process.argv.includes('--generate');
const read = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));

const verticals = await read(paths.verticals);
const providers = await read(paths.providers);
validateProviderAdapterManifest(providers);
const dataset = buildSyntheticDataset(verticals);
const secondDataset = buildSyntheticDataset(verticals);
if (digest(dataset) !== digest(secondDataset)) throw new Error('SPV_DATASET_GENERATION_NONDETERMINISTIC');
const pipeline = executeSyntheticDataset(dataset);
const secondPipeline = executeSyntheticDataset(secondDataset);
if (digest(pipeline) !== digest(secondPipeline)) throw new Error('SPV_PIPELINE_EXECUTION_NONDETERMINISTIC');
const portal = buildPortalProjection(dataset);
const html = renderSyntheticPortal(portal);
if ((html.match(/SYNTHETIC TEST DATA — INTERNAL VALIDATION ONLY/g) ?? []).length !== 122) {
  throw new Error('SPV_PORTAL_NOTICE_NOT_PERSISTENT');
}
const negative = runNegativeIsolationTests(dataset, portal, providers);
const audit = buildAuditReceipt(dataset, pipeline, portal, providers);
const generated = { dataset, pipeline, portal, audit };

if (generate) {
  await fs.mkdir(generatedRoot, { recursive: true });
  await Promise.all(Object.entries(generated).map(([key, value]) => fs.writeFile(paths[key], stableText(value), 'utf8')));
} else {
  for (const [key, value] of Object.entries(generated)) {
    const committed = await fs.readFile(paths[key], 'utf8');
    if (committed !== stableText(value)) throw new Error(`SPV_GENERATED_${key.toUpperCase()}_DRIFT`);
  }
}

console.log('Synthetic platform validation: VERIFIED_PASS');
console.log('Dataset: 8 verticals x 15 records = 120 deterministic synthetic records');
console.log('Pipeline: 120 records x 12 ordered stages = 1440 stage receipts');
console.log(`Dataset digest: ${dataset.dataset_digest}`);
console.log(`Pipeline digest: ${pipeline.pipeline_digest}`);
console.log(`Audit receipt digest: ${audit.receipt_digest}`);
console.log(`Provider adapter foundations: ${providers.adapters.length}; live activations: 0; credentials: 0`);
console.log(`Portal cards: ${portal.cards.length}; persistent synthetic notices: 122`);
console.log(`Negative isolation checks: ${negative.mutation_rejections}; exact replay idempotent: ${negative.exact_replay_idempotent}`);
console.log('Empirical promotion: 0; rights promotion: 0; Production/Public/G5: HOLD');
