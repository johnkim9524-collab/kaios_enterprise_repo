const DEFAULT_VERTICALS = Object.freeze([
  'cards-comics-memorabilia',
  'toys-models',
]);

function recoveryQuery(candidate) {
  return candidate?.semanticRelevanceDiagnostics?.precisionRecovery?.recoveryQuery || null;
}

function sampleCandidate(candidate) {
  return {
    candidateKey: candidate.candidateKey || null,
    sourceRecordId: candidate.sourceRecordId || null,
    canonicalTitle: candidate.canonicalTitle || null,
    disposition: 'RECOVERED_RELEVANT',
  };
}

export function buildPrecisionQueryYieldDiagnostic({
  config,
  precisionAudit,
  poc,
  verticals = DEFAULT_VERTICALS,
  sampleLimit = 3,
}) {
  if (!precisionAudit || precisionAudit.mode !== 'KIDULT100_WIKIDATA_PRECISION_RECOVERY_AUDIT') {
    return {
      status: 'NOT_MEASURED_PRECISION_AUDIT_UNAVAILABLE',
      authoritativeMeasurementPermitted: false,
      reason: 'PRECISION_AUDIT_UNAVAILABLE_OR_INVALID',
      safety: buildSafety(sampleLimit),
    };
  }

  if (precisionAudit.readiness?.status !== 'PASS' || precisionAudit.readiness?.authoritativeMeasurementPermitted !== true) {
    return {
      status: 'NOT_MEASURED_PRECISION_RECOVERY_INCOMPLETE',
      authoritativeMeasurementPermitted: false,
      reason: precisionAudit.readiness?.reason || precisionAudit.readiness?.status || 'PRECISION_RECOVERY_NOT_AUTHORITATIVE',
      safety: buildSafety(sampleLimit),
    };
  }

  if (config?.mode !== 'KIDULT100_WIKIDATA_PRECISION_RECOVERY' || config?.source !== 'wikidata' || config?.rightsClass !== 'CC0_STRUCTURED_DATA') {
    return {
      status: 'NOT_MEASURED_CONFIG_IDENTITY_INVALID',
      authoritativeMeasurementPermitted: false,
      reason: 'PRECISION_RECOVERY_CONFIG_IDENTITY_INVALID',
      safety: buildSafety(sampleLimit),
    };
  }

  if (!Array.isArray(poc?.candidates)) {
    return {
      status: 'NOT_MEASURED_POC_UNAVAILABLE',
      authoritativeMeasurementPermitted: false,
      reason: 'POC_CANDIDATE_ARRAY_UNAVAILABLE',
      safety: buildSafety(sampleLimit),
    };
  }

  const boundedSampleLimit = Math.max(1, Math.min(5, Number(sampleLimit) || 3));
  const selectedVerticals = [...new Set(verticals)].filter((vertical) => Array.isArray(config.verticals?.[vertical]));
  const telemetryByVertical = {};
  let configuredQueries = 0;
  let yieldedQueries = 0;
  let recoveredCandidates = 0;

  for (const vertical of selectedVerticals) {
    const queryTelemetry = [];
    for (const query of config.verticals[vertical]) {
      const accepted = poc.candidates.filter((candidate) => (
        candidate?.vertical === vertical
        && candidate?.semanticRelevant === true
        && recoveryQuery(candidate) === query
      ));
      configuredQueries += 1;
      recoveredCandidates += accepted.length;
      if (accepted.length > 0) yieldedQueries += 1;
      queryTelemetry.push({
        query,
        acceptedRelevantCandidates: accepted.length,
        zeroAcceptedYield: accepted.length === 0,
        acceptedSamples: accepted.slice(0, boundedSampleLimit).map(sampleCandidate),
      });
    }
    telemetryByVertical[vertical] = queryTelemetry;
  }

  return {
    status: 'PASS_OBSERVATIONAL',
    authoritativeMeasurementPermitted: true,
    reason: null,
    scope: selectedVerticals,
    summary: {
      configuredQueries,
      yieldedQueries,
      zeroYieldQueries: configuredQueries - yieldedQueries,
      recoveredCandidates,
      aggregateRejectedSearchRows: Number.isFinite(Number(precisionAudit.metrics?.rejectedSearchRows))
        ? Number(precisionAudit.metrics.rejectedSearchRows)
        : null,
      rejectionDetailLevel: 'AGGREGATE_ONLY',
    },
    byVertical: telemetryByVertical,
    safety: buildSafety(boundedSampleLimit),
  };
}

function buildSafety(sampleLimit) {
  return {
    observationalOnly: true,
    productionInput: false,
    scoreInput: false,
    evidenceCreated: false,
    officialTrackBInput: false,
    assessmentInput: false,
    canUnlockTrackBAssessment: false,
    rankabilityAssessmentMutationAllowed: false,
    upstreamEvidenceMutationAllowed: false,
    candidateMutationAllowed: false,
    sourceSelectionMutationAllowed: false,
    autoPruningAllowed: false,
    autoOptimizationAllowed: false,
    networkRequestsAdded: 0,
    boundedSampleLimit: Math.max(1, Math.min(5, Number(sampleLimit) || 3)),
    partialEvidenceAccepted: false,
    unauthorizedScrapingRequested: false,
    paidProviderProcurementRequested: false,
    contractExecutionRequested: false,
    rightsClassificationRelaxed: false,
    provenanceRelaxed: false,
    productionGateRelaxed: false,
  };
}
