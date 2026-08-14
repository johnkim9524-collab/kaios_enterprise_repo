import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(__dirname, '../scripts/kidult100-precision-recovery-live.mjs'), 'utf8');

test('same-run accepted-candidate reuse preserves serial official-API fallback and fail-closed evidence boundaries', () => {
  assert.match(source, /pacingMode: 'SERIAL_SERVER_DRIVEN_BACKPRESSURE'/);
  assert.match(source, /incompleteTraceOrUnresolvedCandidateFallsBackToOfficialApi: true/);
  assert.match(source, /sameRunAcceptedCandidateReuseCreatesEvidence: false/);
  assert.match(source, /sourceIdentityMutationAllowed: false/);
  assert.match(source, /syntheticEvidenceCreated: false/);
  assert.match(source, /marketEvidenceCreated: false/);
  assert.match(source, /unauthorizedScrapingRequested: false/);
  assert.match(source, /paidProviderProcurementRequested: false/);
  assert.match(source, /productionGateRelaxed: false/);
});
