#!/usr/bin/env node
import fs from 'node:fs';

const workflowDir = '.github/workflows';
const workflows = fs.readdirSync(workflowDir)
  .filter((name) => name.endsWith('.yml'))
  .map((name) => `${workflowDir}/${name}`);
const legacyPattern = /actions\/artifacts\/9286462549\/zip/;
const legacy = workflows.filter((file) => legacyPattern.test(fs.readFileSync(file, 'utf8')));
if (legacy.length) throw new Error(`HARDCODED_ANCHOR_ARTIFACT:${legacy.join(',')}`);

const expectedConsumers = [
  'kidults-asi-v2-1-preflight-gap-compiler.yml',
  'kidults-product-linked-targeted-asi-queue-v1.yml',
  'kidults-scope-poc-anchor-selection-v1.yml',
  'kidults-product-linked-live-discovery-v2.yml',
  'kidults-asi-source-family-gap-feedback-discovery-v1.yml',
  'kidults-asi-global-open-market-discovery-v1.yml',
  'kidults-asi-global-any-site-hourly-pooling-v1.yml',
  'kidults-asi-global-any-site-hourly-pooling-v2.yml',
  'kidults-asi-self-driving-control-loop-v1.yml',
  'kidults-asi-mission-consumption-v1.yml'
];
for (const name of expectedConsumers) {
  const source = fs.readFileSync(`${workflowDir}/${name}`, 'utf8');
  if (!source.includes('restore-canonical-anchor-artifact-v1.mjs')) throw new Error(`CANONICAL_RESTORE_MISSING:${name}`);
  if (!source.includes('validate-canonical-anchor-extracted-v1.mjs')) throw new Error(`CANONICAL_EXTRACT_VALIDATION_MISSING:${name}`);
}

console.log(JSON.stringify({
  state: 'VERIFIED_PASS',
  consumer_count: expectedConsumers.length,
  hardcoded_artifact_ids: 0,
  canonical_restore_path: true,
  extracted_input_validation: true,
  public_release: 'HOLD',
  production: 'HOLD'
}, null, 2));
