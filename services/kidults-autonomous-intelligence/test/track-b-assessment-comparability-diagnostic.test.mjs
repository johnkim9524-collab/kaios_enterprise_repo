import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTrackBAssessmentComparabilityDiagnostic } from '../scripts/lib/track-b-assessment-comparability-diagnostic.mjs';

function assessment(overrides = {}) {
  return {
    review_contract_version: 'v1',
    adjudication_semantics_version: 'blind-evidence-only-v1',
    sample_fingerprint: 'sha256:sample-a',
    selection_method_version: 'blind-top50-selection-v1',
    input_artifact_digest: 'sha256:input-a',
    top50_precision: 0.7,
    records: [
      { endpoint_id: 'A', evidence_checks: { scope: true, role: true } },
      { source_id: 'B', evidence_checks: { scope: false, role: true } },
    ],
    ...overrides,
  };
}

test('Track B precision comparison is allowed only for identical sample, provenance, and adjudication semantics', () => {
  const result = buildTrackBAssessmentComparabilityDiagnostic({
    baseline: assessment(),
    current: assessment({ top50_precision: 0.8 }),
  });

  assert.equal(result.status, 'COMPARABLE');
  assert.equal(result.comparable, true);
  assert.deepEqual(result.reasons, []);
  assert.equal(result.sampleIdentical, true);
  assert.equal(result.reviewContractVersionComplete, true);
  assert.equal(result.reviewContractIdentical, true);
  assert.equal(result.adjudicationSemanticsVersionComplete, true);
  assert.equal(result.adjudicationSemanticsIdentical, true);
  assert.equal(result.comparisonProvenanceComplete, true);
  assert.equal(result.sampleFingerprintIdentical, true);
  assert.equal(result.selectionMethodIdentical, true);
  assert.equal(result.inputArtifactIdentical, true);
  assert.deepEqual(result.evidenceCheckMutations, []);
  assert.equal(result.precisionDelta, 0.10000000000000009);
  assert.equal(result.improvementClaimAllowed, true);
  assert.equal(result.observationalOnly, true);
  assert.equal(result.officialTrackBInput, false);
  assert.equal(result.productionEvidence, false);
  assert.equal(result.assessmentMutationAllowed, false);
  assert.equal(result.sourcePoolPromotionAllowed, false);
  assert.equal(result.acquisitionAuthorizationAllowed, false);
  assert.equal(result.rightsProvenanceModified, false);
  assert.equal(result.productionGateWeakened, false);
});

test('sample, contract, or adjudication changes fail closed for precision-improvement claims', () => {
  const result = buildTrackBAssessmentComparabilityDiagnostic({
    baseline: assessment(),
    current: assessment({
      review_contract_version: 'v2',
      adjudication_semantics_version: 'heuristic-repair-v2',
      records: [{ endpoint_id: 'A', evidence_checks: { scope: true, role: true } }],
      top50_precision: 1,
    }),
  });

  assert.equal(result.comparable, false);
  assert.deepEqual(result.reasons, [
    'REVIEW_SAMPLE_CHANGED',
    'REVIEW_CONTRACT_CHANGED',
    'ADJUDICATION_SEMANTICS_CHANGED',
  ]);
  assert.equal(result.improvementClaimAllowed, false);
});

test('comparison provenance must be explicit and identical before precision improvement may be claimed', () => {
  const missing = buildTrackBAssessmentComparabilityDiagnostic({
    baseline: assessment({ sample_fingerprint: undefined }),
    current: assessment({ top50_precision: 0.9 }),
  });
  assert.equal(missing.comparable, false);
  assert.deepEqual(missing.reasons, ['COMPARISON_PROVENANCE_MISSING']);
  assert.equal(missing.comparisonProvenanceComplete, false);
  assert.equal(missing.improvementClaimAllowed, false);

  const changed = buildTrackBAssessmentComparabilityDiagnostic({
    baseline: assessment(),
    current: assessment({
      sample_fingerprint: 'sha256:sample-b',
      selection_method_version: 'targeted-high-authority-v3',
      input_artifact_digest: 'sha256:input-b',
      top50_precision: 1,
    }),
  });
  assert.equal(changed.comparable, false);
  assert.deepEqual(changed.reasons, [
    'SAMPLE_FINGERPRINT_CHANGED',
    'SELECTION_METHOD_CHANGED',
    'INPUT_ARTIFACT_CHANGED',
  ]);
  assert.equal(changed.comparisonProvenanceComplete, true);
  assert.equal(changed.sampleFingerprintIdentical, false);
  assert.equal(changed.selectionMethodIdentical, false);
  assert.equal(changed.inputArtifactIdentical, false);
  assert.equal(changed.improvementClaimAllowed, false);
});

test('changing evidence checks inside an otherwise identical blind sample makes results non-comparable', () => {
  const result = buildTrackBAssessmentComparabilityDiagnostic({
    baseline: assessment({ top50_precision: 'not-measured' }),
    current: assessment({
      top50_precision: 1,
      records: [
        { endpoint_id: 'A', evidence_checks: { scope: true, role: false, channel: true } },
        { source_id: 'B', evidence_checks: { scope: true, role: true } },
      ],
    }),
  });

  assert.equal(result.comparable, false);
  assert.deepEqual(result.reasons, ['EVIDENCE_CHECKS_MUTATED_BETWEEN_ASSESSMENTS']);
  assert.deepEqual(result.evidenceCheckMutations, [
    { id: 'A', key: 'channel', before: null, after: true },
    { id: 'A', key: 'role', before: true, after: false },
    { id: 'B', key: 'scope', before: false, after: true },
  ]);
  assert.equal(result.baselinePrecision, null);
  assert.equal(result.currentPrecision, 1);
  assert.equal(result.precisionDelta, null);
  assert.equal(result.improvementClaimAllowed, false);
});

test('missing review or adjudication versions fail closed even when other provenance is explicit', () => {
  const baseline = assessment({ review_contract_version: undefined, adjudication_semantics_version: '   ', records: [] });
  const current = assessment({ review_contract_version: undefined, adjudication_semantics_version: undefined, records: [], top50_precision: undefined });
  const result = buildTrackBAssessmentComparabilityDiagnostic({ baseline, current });

  assert.equal(result.comparable, false);
  assert.deepEqual(result.reasons, [
    'REVIEW_CONTRACT_VERSION_MISSING',
    'ADJUDICATION_SEMANTICS_VERSION_MISSING',
  ]);
  assert.equal(result.reviewContractVersionComplete, false);
  assert.equal(result.reviewContractIdentical, false);
  assert.equal(result.adjudicationSemanticsVersionComplete, false);
  assert.equal(result.adjudicationSemanticsIdentical, false);
  assert.equal(result.comparisonProvenanceComplete, true);
  assert.equal(result.currentPrecision, null);
  assert.equal(result.precisionDelta, null);
  assert.equal(result.improvementClaimAllowed, false);
});

test('malformed or duplicate assessment inputs fail closed', () => {
  assert.throws(() => buildTrackBAssessmentComparabilityDiagnostic(), /baseline assessment must be an object/);
  assert.throws(() => buildTrackBAssessmentComparabilityDiagnostic({ baseline: {}, current: assessment() }), /baseline assessment records must be an array/);
  assert.throws(() => buildTrackBAssessmentComparabilityDiagnostic({ baseline: assessment({ records: [{}] }), current: assessment() }), /endpoint_id or source_id/);
  assert.throws(() => buildTrackBAssessmentComparabilityDiagnostic({
    baseline: assessment({ records: [{ endpoint_id: 'A' }, { endpoint_id: 'A' }] }),
    current: assessment(),
  }), /duplicate record id: A/);
  assert.throws(() => buildTrackBAssessmentComparabilityDiagnostic({ baseline: assessment(), current: [] }), /current assessment must be an object/);
});
