import crypto from 'node:crypto';

const round = (value, digits = 4) => Number(value.toFixed(digits));
const ratio = (numerator, denominator) => denominator === 0 ? 1 : numerator / denominator;

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function fingerprintTruthDataset(dataset) {
  const material = {
    schemaVersion: dataset.schemaVersion,
    datasetId: dataset.datasetId,
    mode: dataset.mode,
    records: dataset.records,
  };
  return crypto.createHash('sha256').update(stableJson(material)).digest('hex');
}

export function evaluateTruthDataset(dataset, policy = {}) {
  const records = Array.isArray(dataset?.records) ? dataset.records : [];
  const thresholds = {
    provenanceCoverageMin: policy.provenanceCoverageMin ?? 1,
    entityResolutionMin: policy.entityResolutionMin ?? 0.99,
    duplicateContaminationMax: policy.duplicateContaminationMax ?? 0.01,
    staleRejectionAccuracyMin: policy.staleRejectionAccuracyMin ?? 1,
    criticalAssertionMismatchMax: policy.criticalAssertionMismatchMax ?? 0,
  };

  const requiredProvenance = records.filter((record) => record.critical !== false);
  const provenanceComplete = requiredProvenance.filter((record) =>
    Boolean(record.sourceId) && Boolean(record.observedAt) && Boolean(record.evidenceRef) && Boolean(record.payloadHash),
  ).length;

  const resolvable = records.filter((record) => record.expectedEntityId);
  const correctlyResolved = resolvable.filter((record) => record.resolvedEntityId === record.expectedEntityId).length;

  const accepted = records.filter((record) => record.actualDisposition === 'ACCEPT');
  const contaminatedDuplicates = accepted.filter((record) => Boolean(record.duplicateOf)).length;

  const staleExpectedReject = records.filter((record) => record.expectedDisposition === 'REJECT_STALE');
  const staleCorrect = staleExpectedReject.filter((record) => record.actualDisposition === 'REJECT_STALE').length;

  const criticalAssertions = records.flatMap((record) =>
    (Array.isArray(record.assertions) ? record.assertions : [])
      .filter((assertion) => assertion.critical !== false)
      .map((assertion) => ({ record, assertion })),
  );
  const criticalAssertionMismatches = criticalAssertions.filter(({ assertion }) =>
    stableJson(assertion.expected) !== stableJson(assertion.actual),
  );

  const dispositionMismatches = records.filter((record) => record.expectedDisposition !== record.actualDisposition);

  const metrics = {
    provenanceCoverage: round(ratio(provenanceComplete, requiredProvenance.length)),
    entityResolutionAccuracy: round(ratio(correctlyResolved, resolvable.length)),
    duplicateContamination: round(ratio(contaminatedDuplicates, accepted.length)),
    staleRejectionAccuracy: round(ratio(staleCorrect, staleExpectedReject.length)),
    criticalAssertionMismatchCount: criticalAssertionMismatches.length,
    dispositionMismatchCount: dispositionMismatches.length,
    recordCount: records.length,
    acceptedCount: accepted.length,
  };

  const checks = {
    provenanceCoverage: metrics.provenanceCoverage >= thresholds.provenanceCoverageMin,
    entityResolution: metrics.entityResolutionAccuracy >= thresholds.entityResolutionMin,
    duplicateContamination: metrics.duplicateContamination <= thresholds.duplicateContaminationMax,
    staleRejection: metrics.staleRejectionAccuracy >= thresholds.staleRejectionAccuracyMin,
    criticalAssertions: metrics.criticalAssertionMismatchCount <= thresholds.criticalAssertionMismatchMax,
    dispositions: metrics.dispositionMismatchCount === 0,
  };

  const passed = Object.values(checks).every(Boolean);
  return {
    datasetId: String(dataset?.datasetId || 'unknown-dataset'),
    mode: String(dataset?.mode || 'UNKNOWN'),
    fingerprint: fingerprintTruthDataset(dataset),
    thresholds,
    metrics,
    checks,
    passed,
    failures: [
      ...dispositionMismatches.map((record) => ({
        code: 'DISPOSITION_MISMATCH',
        observationId: record.observationId,
        expected: record.expectedDisposition,
        actual: record.actualDisposition,
      })),
      ...criticalAssertionMismatches.map(({ record, assertion }) => ({
        code: 'CRITICAL_ASSERTION_MISMATCH',
        observationId: record.observationId,
        field: assertion.field,
        expected: assertion.expected,
        actual: assertion.actual,
      })),
    ],
  };
}
