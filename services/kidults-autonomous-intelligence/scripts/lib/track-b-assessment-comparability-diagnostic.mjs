function requireAssessment(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} assessment must be an object`);
  }
  if (!Array.isArray(value.records)) {
    throw new TypeError(`${label} assessment records must be an array`);
  }
}

function indexRecords(records, label) {
  const indexed = new Map();
  for (const record of records) {
    const id = record?.endpoint_id ?? record?.source_id;
    if (typeof id !== 'string' || id.length === 0) {
      throw new TypeError(`${label} assessment record must have endpoint_id or source_id`);
    }
    if (indexed.has(id)) {
      throw new Error(`${label} assessment contains duplicate record id: ${id}`);
    }
    indexed.set(id, record);
  }
  return indexed;
}

function finiteMetric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sorted(values) {
  return [...values].sort();
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function buildTrackBAssessmentComparabilityDiagnostic({ baseline, current } = {}) {
  requireAssessment(baseline, 'baseline');
  requireAssessment(current, 'current');

  const baselineRecords = indexRecords(baseline.records, 'baseline');
  const currentRecords = indexRecords(current.records, 'current');
  const baselineIds = sorted(baselineRecords.keys());
  const currentIds = sorted(currentRecords.keys());
  const sampleIdentical = JSON.stringify(baselineIds) === JSON.stringify(currentIds);
  const reviewContractIdentical = (baseline.review_contract_version ?? null) === (current.review_contract_version ?? null);
  const adjudicationSemanticsIdentical = (baseline.adjudication_semantics_version ?? null) === (current.adjudication_semantics_version ?? null);

  const comparisonProvenanceComplete = [
    baseline.sample_fingerprint,
    current.sample_fingerprint,
    baseline.selection_method_version,
    current.selection_method_version,
    baseline.input_artifact_digest,
    current.input_artifact_digest,
  ].every(nonEmptyString);
  const sampleFingerprintIdentical = comparisonProvenanceComplete
    && baseline.sample_fingerprint === current.sample_fingerprint;
  const selectionMethodIdentical = comparisonProvenanceComplete
    && baseline.selection_method_version === current.selection_method_version;
  const inputArtifactIdentical = comparisonProvenanceComplete
    && baseline.input_artifact_digest === current.input_artifact_digest;

  const evidenceCheckMutations = [];
  for (const id of baselineIds.filter(value => currentRecords.has(value))) {
    const before = baselineRecords.get(id)?.evidence_checks ?? {};
    const after = currentRecords.get(id)?.evidence_checks ?? {};
    for (const key of sorted(new Set([...Object.keys(before), ...Object.keys(after)]))) {
      if (before[key] !== after[key]) {
        evidenceCheckMutations.push({ id, key, before: before[key] ?? null, after: after[key] ?? null });
      }
    }
  }

  const reasons = [];
  if (!sampleIdentical) reasons.push('REVIEW_SAMPLE_CHANGED');
  if (!reviewContractIdentical) reasons.push('REVIEW_CONTRACT_CHANGED');
  if (!adjudicationSemanticsIdentical) reasons.push('ADJUDICATION_SEMANTICS_CHANGED');
  if (!comparisonProvenanceComplete) {
    reasons.push('COMPARISON_PROVENANCE_MISSING');
  } else {
    if (!sampleFingerprintIdentical) reasons.push('SAMPLE_FINGERPRINT_CHANGED');
    if (!selectionMethodIdentical) reasons.push('SELECTION_METHOD_CHANGED');
    if (!inputArtifactIdentical) reasons.push('INPUT_ARTIFACT_CHANGED');
  }
  if (evidenceCheckMutations.length > 0) reasons.push('EVIDENCE_CHECKS_MUTATED_BETWEEN_ASSESSMENTS');

  const baselinePrecision = finiteMetric(baseline.top50_precision);
  const currentPrecision = finiteMetric(current.top50_precision);
  const precisionDelta = baselinePrecision === null || currentPrecision === null
    ? null
    : currentPrecision - baselinePrecision;
  const comparable = reasons.length === 0;

  return {
    status: comparable ? 'COMPARABLE' : 'NOT_COMPARABLE',
    comparable,
    reasons,
    sampleIdentical,
    reviewContractIdentical,
    adjudicationSemanticsIdentical,
    comparisonProvenanceComplete,
    sampleFingerprintIdentical,
    selectionMethodIdentical,
    inputArtifactIdentical,
    evidenceCheckMutations,
    baselinePrecision,
    currentPrecision,
    precisionDelta,
    improvementClaimAllowed: comparable && precisionDelta !== null,
    observationalOnly: true,
    officialTrackBInput: false,
    productionEvidence: false,
    assessmentMutationAllowed: false,
    sourcePoolPromotionAllowed: false,
    acquisitionAuthorizationAllowed: false,
    rightsProvenanceModified: false,
    productionGateWeakened: false,
  };
}
