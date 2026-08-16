import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeEngineeringDiagnosticTraceability,
  resolveGitHubSourceTraceability,
} from '../scripts/lib/github-actions-source-traceability.mjs';

test('pull-request head SHA takes precedence over the workflow merge SHA', () => {
  const traceability = resolveGitHubSourceTraceability({
    workflowSha: 'merge-sha',
    event: { pull_request: { head: { sha: 'source-head-sha' } } },
  });

  assert.deepEqual(traceability, {
    sourceSha: 'source-head-sha',
    workflowSha: 'merge-sha',
    resolution: 'PULL_REQUEST_HEAD',
    sourceDiffersFromWorkflow: true,
  });
});

test('non pull-request runs fall back to the workflow SHA', () => {
  const traceability = resolveGitHubSourceTraceability({ workflowSha: 'dispatch-sha', event: {} });

  assert.deepEqual(traceability, {
    sourceSha: 'dispatch-sha',
    workflowSha: 'dispatch-sha',
    resolution: 'WORKFLOW_SHA',
    sourceDiffersFromWorkflow: false,
  });
});

test('engineering diagnostics preserve workflow SHA while binding headSha to source SHA', () => {
  const traceability = resolveGitHubSourceTraceability({
    workflowSha: 'merge-sha',
    event: { pull_request: { head: { sha: 'source-head-sha' } } },
  });
  const normalized = normalizeEngineeringDiagnosticTraceability(
    { stage: 'STAGE2', headSha: 'merge-sha', partialEvidenceAccepted: false },
    traceability,
  );

  assert.equal(normalized.headSha, 'source-head-sha');
  assert.equal(normalized.sourceSha, 'source-head-sha');
  assert.equal(normalized.workflowSha, 'merge-sha');
  assert.equal(normalized.sourceShaResolution, 'PULL_REQUEST_HEAD');
  assert.equal(normalized.sourceDiffersFromWorkflow, true);
  assert.equal(normalized.traceabilityScope, 'ENGINEERING_DIAGNOSTIC_ONLY');
  assert.equal(normalized.productionEvidence, false);
  assert.equal(normalized.diagnosticsCanRelaxProductionGate, false);
  assert.equal(normalized.partialEvidenceAccepted, false);
});
