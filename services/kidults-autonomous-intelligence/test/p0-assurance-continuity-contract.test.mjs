import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');
const workflowPath = path.join(REPO_ROOT, '.github', 'workflows', 'kidults-p0-assurance-continuity.yml');
const workflow = fs.readFileSync(workflowPath, 'utf8');

test('P0 assurance continuity remains independent of the expected production certification failure', () => {
  assert.match(workflow, /name: Kidults P0 Assurance Continuity/u);
  assert.match(workflow, /SRE and reliability baseline audit/u);
  assert.match(workflow, /node scripts\/p0-sre-readiness-audit\.mjs/u);
  assert.match(workflow, /120 governance baseline audit/u);
  assert.match(workflow, /node scripts\/p0-120-governance-baseline-audit\.mjs/u);
  assert.match(workflow, /npm run quality:audit/u);
  assert.match(workflow, /Upload assurance continuity evidence/u);
});

test('assurance continuity is read-only and does not duplicate data, scoring, provider, or production execution', () => {
  assert.match(workflow, /permissions:\s*\n\s*contents: read/u);
  assert.doesNotMatch(workflow, /kidult100-poc-live/u);
  assert.doesNotMatch(workflow, /kidult100-precision-recovery-live/u);
  assert.doesNotMatch(workflow, /market-adapter-normalize/u);
  assert.doesNotMatch(workflow, /experimental-ranking/u);
  assert.doesNotMatch(workflow, /stage2-right-data-gate/u);
  assert.doesNotMatch(workflow, /wrangler deploy|doctl|ssh /u);
});
