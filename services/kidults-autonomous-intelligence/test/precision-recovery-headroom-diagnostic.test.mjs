import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildPrecisionRecoveryHeadroomDiagnostic } from '../scripts/lib/precision-recovery-headroom-diagnostic.mjs';

test('precision recovery headroom diagnostic classifies healthy, watch and high-utilization runs without changing source behavior', () => {
  const healthy = buildPrecisionRecoveryHeadroomDiagnostic({ status: 'PASS', elapsedSeconds: 60, timeoutSeconds: 120 });
  assert.equal(healthy.headroomStatus, 'HEALTHY');
  assert.equal(healthy.budgetUtilizationPercent, 50);
  assert.equal(healthy.remainingHeadroomSeconds, 60);

  const watch = buildPrecisionRecoveryHeadroomDiagnostic({ status: 'PASS', elapsedSeconds: 90, timeoutSeconds: 120 });
  assert.equal(watch.headroomStatus, 'WATCH');
  assert.equal(watch.budgetUtilizationPercent, 75);

  const high = buildPrecisionRecoveryHeadroomDiagnostic({ status: 'PASS', elapsedSeconds: 110, timeoutSeconds: 120 });
  assert.equal(high.headroomStatus, 'HIGH_UTILIZATION_WATCH');
  assert.equal(high.budgetUtilizationPercent, 91.67);
  assert.equal(high.remainingHeadroomSeconds, 10);
  assert.equal(high.observationalOnly, true);
  assert.equal(high.productionInput, false);
  assert.equal(high.productionEvidence, false);
  assert.equal(high.autoPruningAllowed, false);
  assert.equal(high.sourceBehaviorModified, false);
  assert.equal(high.retryPolicyModified, false);
  assert.equal(high.timeoutPolicyModified, false);
  assert.equal(high.sourceEtiquetteModified, false);
  assert.equal(high.evidenceSemanticsModified, false);
  assert.equal(high.rightsProvenanceModified, false);
  assert.equal(high.productionGateWeakened, false);
});

test('precision recovery headroom diagnostic preserves stage status and clamps negative headroom', () => {
  const timeout = buildPrecisionRecoveryHeadroomDiagnostic({ status: 'TIMEOUT_FAIL_CLOSED', elapsedSeconds: 121, timeoutSeconds: 120 });
  assert.equal(timeout.status, 'TIMEOUT_FAIL_CLOSED');
  assert.equal(timeout.remainingHeadroomSeconds, 0);
  assert.equal(timeout.headroomStatus, 'HIGH_UTILIZATION_WATCH');
});

test('precision recovery headroom diagnostic rejects malformed timing inputs', () => {
  assert.throws(
    () => buildPrecisionRecoveryHeadroomDiagnostic({ elapsedSeconds: -1, timeoutSeconds: 120 }),
    /elapsedSeconds/,
  );
  assert.throws(
    () => buildPrecisionRecoveryHeadroomDiagnostic({ elapsedSeconds: 1, timeoutSeconds: 0 }),
    /timeoutSeconds/,
  );
  assert.throws(
    () => buildPrecisionRecoveryHeadroomDiagnostic({ elapsedSeconds: 'not-a-number', timeoutSeconds: 120 }),
    /elapsedSeconds/,
  );
  assert.throws(
    () => buildPrecisionRecoveryHeadroomDiagnostic({ elapsedSeconds: 1, timeoutSeconds: 'not-a-number' }),
    /timeoutSeconds/,
  );
});

test('engineering quality audit surfaces precision recovery headroom only as runtime diagnostic', () => {
  const auditPath = path.resolve(process.cwd(), 'scripts', 'p0-engineering-quality-audit.mjs');
  const audit = fs.readFileSync(auditPath, 'utf8');
  assert.match(audit, /PRECISION_LATENCY_REL/);
  assert.match(audit, /precisionRecoveryHeadroom/);
  assert.match(audit, /diagnosticsAreProductionEvidence:\s*false/);
  assert.match(audit, /diagnosticsCanRelaxProductionGate:\s*false/);
});
