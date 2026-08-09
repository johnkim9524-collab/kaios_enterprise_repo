import { promises as fs } from 'node:fs';
import path from 'node:path';
import { evaluateTruthDataset } from './lib/truth-layer.mjs';

const root = process.cwd();
const inputPath = process.env.KIDULTS_TRUTH_DATASET
  ? path.resolve(root, process.env.KIDULTS_TRUTH_DATASET)
  : path.join(root, 'fixtures', 'truth-layer', 'golden-sample.json');

const raw = await fs.readFile(inputPath, 'utf8');
const dataset = JSON.parse(raw);
const result = evaluateTruthDataset(dataset);

const report = {
  schemaVersion: '1.0.0',
  generatedAt: new Date().toISOString(),
  sourceDataset: path.relative(root, inputPath).replaceAll('\\', '/'),
  syntheticBaselineOnly: dataset.mode === 'SYNTHETIC_BASELINE',
  liveValidationCertified: dataset.mode === 'LIVE_AUTHORITY' && result.passed,
  ...result,
};

const reportDir = path.join(root, 'reports', 'truth-layer');
await fs.mkdir(reportDir, { recursive: true });
await fs.writeFile(path.join(reportDir, 'truth-gate-latest.json'), JSON.stringify(report, null, 2) + '\n');

console.log(`Truth-layer gate: ${result.passed ? 'PASS' : 'FAIL'}`);
console.log(`Mode: ${dataset.mode}`);
console.log(`Dataset: ${dataset.datasetId}`);
console.log(`Provenance coverage: ${(result.metrics.provenanceCoverage * 100).toFixed(2)}%`);
console.log(`Entity resolution: ${(result.metrics.entityResolutionAccuracy * 100).toFixed(2)}%`);
console.log(`Duplicate contamination: ${(result.metrics.duplicateContamination * 100).toFixed(2)}%`);
console.log(`Stale rejection accuracy: ${(result.metrics.staleRejectionAccuracy * 100).toFixed(2)}%`);
console.log(`Critical assertion mismatches: ${result.metrics.criticalAssertionMismatchCount}`);
console.log(`Live validation certified: ${report.liveValidationCertified}`);
console.log('Report: reports/truth-layer/truth-gate-latest.json');

if (!result.passed) process.exit(1);
