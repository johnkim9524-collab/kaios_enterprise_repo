export function resolveGitHubSourceTraceability({ workflowSha = null, event = null } = {}) {
  const normalizedWorkflowSha = typeof workflowSha === 'string' && workflowSha.trim() ? workflowSha.trim() : null;
  const pullRequestHeadSha = typeof event?.pull_request?.head?.sha === 'string' && event.pull_request.head.sha.trim()
    ? event.pull_request.head.sha.trim()
    : null;
  const sourceSha = pullRequestHeadSha ?? normalizedWorkflowSha;

  return {
    sourceSha,
    workflowSha: normalizedWorkflowSha,
    resolution: pullRequestHeadSha
      ? 'PULL_REQUEST_HEAD'
      : normalizedWorkflowSha
        ? 'WORKFLOW_SHA'
        : 'UNAVAILABLE',
    sourceDiffersFromWorkflow: Boolean(
      pullRequestHeadSha && normalizedWorkflowSha && pullRequestHeadSha !== normalizedWorkflowSha,
    ),
  };
}

export function normalizeEngineeringDiagnosticTraceability(diagnostic, traceability) {
  if (!diagnostic || typeof diagnostic !== 'object' || Array.isArray(diagnostic)) {
    throw new TypeError('engineering diagnostic must be an object');
  }

  const sourceSha = traceability?.sourceSha ?? diagnostic.sourceSha ?? diagnostic.headSha ?? null;
  const workflowSha = diagnostic.workflowSha ?? diagnostic.headSha ?? traceability?.workflowSha ?? null;

  return {
    ...diagnostic,
    headSha: sourceSha,
    sourceSha,
    workflowSha,
    sourceShaResolution: traceability?.resolution ?? 'UNAVAILABLE',
    sourceDiffersFromWorkflow: Boolean(traceability?.sourceDiffersFromWorkflow),
    traceabilityScope: 'ENGINEERING_DIAGNOSTIC_ONLY',
    productionEvidence: false,
    diagnosticsCanRelaxProductionGate: false,
  };
}
