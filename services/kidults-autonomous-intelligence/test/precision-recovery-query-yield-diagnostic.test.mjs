import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPrecisionQueryYieldDiagnostic } from '../scripts/lib/precision-query-yield-diagnostic.mjs';

const config = {
  mode: 'KIDULT100_WIKIDATA_PRECISION_RECOVERY',
  source: 'wikidata',
  rightsClass: 'CC0_STRUCTURED_DATA',
  verticals: {
    'cards-comics-memorabilia': ['Amazing Fantasy #15', 'Zero Yield Comic'],
    'toys-models': ['Furby'],
  },
};

const passAudit = {
  mode: 'KIDULT100_WIKIDATA_PRECISION_RECOVERY_AUDIT',
  readiness: { status: 'PASS', authoritativeMeasurementPermitted: true },
  metrics: { rejectedSearchRows: 9 },
};

function candidate(vertical, query, id, title) {
  return {
    candidateKey: `wikidata:${id}`,
    sourceRecordId: id,
    canonicalTitle: title,
    vertical,
    semanticRelevant: true,
    semanticRelevanceDiagnostics: {
      precisionRecovery: { recoveryQuery: query },
    },
  };
}

test('query yield telemetry is bounded, observational, and never a production or Track B assessment input', () => {
  const poc = {
    candidates: [
      candidate('cards-comics-memorabilia', 'Amazing Fantasy #15', 'Q1', 'Amazing Fantasy #15'),
      candidate('cards-comics-memorabilia', 'Amazing Fantasy #15', 'Q2', 'Amazing Fantasy #15 alt'),
      candidate('toys-models', 'Furby', 'Q3', 'Furby'),
      { ...candidate('cards-comics-memorabilia', 'Zero Yield Comic', 'Q4', 'Rejected'), semanticRelevant: false },
    ],
  };
  const result = buildPrecisionQueryYieldDiagnostic({ config, precisionAudit: passAudit, poc, sampleLimit: 1 });

  assert.equal(result.status, 'PASS_OBSERVATIONAL');
  assert.equal(result.authoritativeMeasurementPermitted, true);
  assert.deepEqual(result.scope, ['cards-comics-memorabilia', 'toys-models']);
  assert.deepEqual(result.summary, {
    configuredQueries: 3,
    yieldedQueries: 2,
    zeroYieldQueries: 1,
    recoveredCandidates: 3,
    aggregateRejectedSearchRows: 9,
    rejectionDetailLevel: 'AGGREGATE_ONLY',
  });
  assert.equal(result.byVertical['cards-comics-memorabilia'][0].acceptedSamples.length, 1);
  assert.equal(result.byVertical['cards-comics-memorabilia'][1].zeroAcceptedYield, true);
  assert.equal(result.safety.observationalOnly, true);
  assert.equal(result.safety.productionInput, false);
  assert.equal(result.safety.scoreInput, false);
  assert.equal(result.safety.evidenceCreated, false);
  assert.equal(result.safety.officialTrackBInput, false);
  assert.equal(result.safety.assessmentInput, false);
  assert.equal(result.safety.canUnlockTrackBAssessment, false);
  assert.equal(result.safety.rankabilityAssessmentMutationAllowed, false);
  assert.equal(result.safety.upstreamEvidenceMutationAllowed, false);
  assert.equal(result.safety.autoPruningAllowed, false);
  assert.equal(result.safety.autoOptimizationAllowed, false);
  assert.equal(result.safety.networkRequestsAdded, 0);
  assert.equal(result.safety.partialEvidenceAccepted, false);
  assert.equal(result.safety.unauthorizedScrapingRequested, false);
  assert.equal(result.safety.paidProviderProcurementRequested, false);
  assert.equal(result.safety.contractExecutionRequested, false);
  assert.equal(result.safety.rightsClassificationRelaxed, false);
  assert.equal(result.safety.provenanceRelaxed, false);
  assert.equal(result.safety.productionGateRelaxed, false);
});

test('incomplete precision recovery never analyzes potentially stale POC data', () => {
  const result = buildPrecisionQueryYieldDiagnostic({
    config,
    precisionAudit: {
      mode: 'KIDULT100_WIKIDATA_PRECISION_RECOVERY_AUDIT',
      readiness: { status: 'FAIL_CLOSED_PRECISION_RECOVERY_INCOMPLETE', authoritativeMeasurementPermitted: false, reason: 'MAXLAG' },
    },
    poc: { candidates: [candidate('toys-models', 'Furby', 'Q9', 'Furby')] },
  });
  assert.equal(result.status, 'NOT_MEASURED_PRECISION_RECOVERY_INCOMPLETE');
  assert.equal(result.authoritativeMeasurementPermitted, false);
  assert.equal(result.reason, 'MAXLAG');
  assert.equal('byVertical' in result, false);
  assert.equal(result.safety.partialEvidenceAccepted, false);
  assert.equal(result.safety.officialTrackBInput, false);
  assert.equal(result.safety.canUnlockTrackBAssessment, false);
});

test('invalid or missing inputs remain not measured instead of being inferred', () => {
  const missingAudit = buildPrecisionQueryYieldDiagnostic({ config, precisionAudit: null, poc: { candidates: [] } });
  assert.equal(missingAudit.status, 'NOT_MEASURED_PRECISION_AUDIT_UNAVAILABLE');
  assert.equal(missingAudit.reason, 'PRECISION_AUDIT_UNAVAILABLE_OR_INVALID');
  assert.equal(missingAudit.safety.officialTrackBInput, false);

  const invalidConfig = buildPrecisionQueryYieldDiagnostic({
    config: { ...config, source: 'other' },
    precisionAudit: passAudit,
    poc: { candidates: [] },
  });
  assert.equal(invalidConfig.status, 'NOT_MEASURED_CONFIG_IDENTITY_INVALID');
  assert.equal(invalidConfig.reason, 'PRECISION_RECOVERY_CONFIG_IDENTITY_INVALID');
  assert.equal(invalidConfig.safety.assessmentInput, false);

  const missingPoc = buildPrecisionQueryYieldDiagnostic({ config, precisionAudit: passAudit, poc: null });
  assert.equal(missingPoc.status, 'NOT_MEASURED_POC_UNAVAILABLE');
  assert.equal(missingPoc.reason, 'POC_CANDIDATE_ARRAY_UNAVAILABLE');
  assert.equal(missingPoc.safety.upstreamEvidenceMutationAllowed, false);
});

test('sample limit is clamped and absent aggregate rejection count stays explicit', () => {
  const result = buildPrecisionQueryYieldDiagnostic({
    config,
    precisionAudit: { ...passAudit, metrics: {} },
    poc: { candidates: [candidate('toys-models', 'Furby', 'Q7', 'Furby')] },
    verticals: ['toys-models', 'toys-models', 'not-configured'],
    sampleLimit: 99,
  });
  assert.deepEqual(result.scope, ['toys-models']);
  assert.equal(result.safety.boundedSampleLimit, 5);
  assert.equal(result.summary.aggregateRejectedSearchRows, null);
  assert.equal(result.safety.rankabilityAssessmentMutationAllowed, false);
});
