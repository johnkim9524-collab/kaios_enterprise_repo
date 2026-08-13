import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const scriptPath = path.join(ROOT, 'scripts', 'kidult100-open-right-data-evidence.mjs');
const workflowPath = path.join(ROOT, '..', '..', '.github', 'workflows', 'kidults-p0-speed-quality.yml');
const script = fs.readFileSync(scriptPath, 'utf8');
const workflow = fs.readFileSync(workflowPath, 'utf8');

function stepBody(name, nextName) {
  const startMarker = `      - name: ${name}`;
  const endMarker = `      - name: ${nextName}`;
  const start = workflow.indexOf(startMarker);
  const end = workflow.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `missing workflow step: ${name}`);
  assert.ok(end > start, `missing workflow boundary after: ${name}`);
  return workflow.slice(start, end);
}

test('Open Right Data collection has a hard stage budget and fail-closed cleanup', () => {
  assert.match(script, /const STAGE_TIMEOUT_MS = 90_000;/);
  assert.match(script, /TIMEOUT_FAIL_CLOSED/);
  assert.match(script, /partialEvidenceAccepted: false/);
  assert.match(script, /staleOutputPurgedBeforeRun: true/);
  assert.match(script, /staleDownstreamPurgedOnFailure: exitCode !== 0/);
  assert.match(script, /process\.exit\(exitCode\)/);
  assert.match(script, /removeFile\(OUT_PATH\);/);
  assert.match(script, /purgeDownstreamEvidence\(\);/);
  assert.match(script, /reports.*engineering-hardening/si);
  assert.match(script, /open-right-data-latency-latest\.json/);
});

test('Open Right Data request and rights boundaries remain unchanged by stage hardening', () => {
  assert.match(script, /const MIN_REQUEST_INTERVAL_MS = 650;/);
  assert.match(script, /const MAX_RETRIES = 4;/);
  assert.match(script, /signal: AbortSignal\.timeout\(15000\)/);
  assert.match(script, /response\.status === 429 \|\| response\.status >= 500/);
  assert.match(script, /rightsMode: 'CC0_STRUCTURED_DATA_ONLY'/);
  assert.match(script, /syntheticEvidenceAllowed: false/);
  assert.match(script, /estimatedMarketEvidenceAllowed: false/);
  assert.match(script, /transactionComparableProduced: false/);
  assert.match(script, /liquidityProduced: false/);
  assert.match(script, /inferredScarcityAllowed: false/);
  assert.match(script, /demandAttentionProxyMayRepresentMarketDemand: false/);
});

test('P0 still treats Open Right Data as a hard step and production certification remains hard', () => {
  const openStage = stepBody(
    'Open CC0 Scarcity + Demand evidence collection',
    'Wikimedia Analytics CC0 demand-attention supplement',
  );
  assert.doesNotMatch(openStage, /continue-on-error:\s*true/);
  assert.match(openStage, /run: node scripts\/kidult100-open-right-data-evidence\.mjs/);

  const production = stepBody(
    'Production 300+ decision-grade Right Data certification gate',
    'Real external open-data operational run + unified preflight',
  );
  assert.doesNotMatch(production, /continue-on-error:\s*true/);
  assert.match(production, /run: node scripts\/kidult100-stage2-right-data-gate\.mjs/);
});
