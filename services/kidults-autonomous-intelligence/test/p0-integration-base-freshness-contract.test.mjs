import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const workflowCandidates = [
  path.resolve(process.cwd(), '../../.github/workflows/kidults-p0-hardening-branch-dispatch.yml'),
  path.resolve(process.cwd(), '.github/workflows/kidults-p0-hardening-branch-dispatch.yml'),
];

const workflowPath = workflowCandidates.find((candidate) => existsSync(candidate));
assert.ok(workflowPath, 'P0 hardening branch-dispatch workflow must exist');
const workflow = readFileSync(workflowPath, 'utf8');

test('production-readiness P0 dispatch remains fail-closed when hardening branch is behind main', () => {
  assert.match(workflow, /compare\/main\.\.\.\$HEAD_SHA/);
  assert.match(workflow, /behind_by/);
  assert.match(workflow, /integrationBaseFresh/);
  assert.match(workflow, /if \[ "\$behind" -ne 0 \]/);
  assert.match(workflow, /synchronize the branch before dispatching another production-readiness P0 run/);

  const freshnessGate = workflow.indexOf('Verify integration base freshness before P0 dispatch');
  const p0Dispatch = workflow.indexOf('Dispatch existing P0 workflow on hardening branch');
  assert.ok(freshnessGate >= 0 && p0Dispatch > freshnessGate, 'freshness gate must precede P0 dispatch');
});

test('integration drift diagnostic preserves evidence and governance safety claims', () => {
  assert.match(workflow, /integration-base-drift\.json/);
  assert.match(workflow, /partialEvidenceAccepted:false/);
  assert.match(workflow, /evidenceSemanticsModified:false/);
  assert.match(workflow, /rightsProvenanceModified:false/);
  assert.match(workflow, /productionGateWeakened:false/);
  assert.doesNotMatch(workflow, /continue-on-error:\s*true/);
});

test('integration reconciliation diagnostic keeps exact overlap scope visible without automatic resolution', () => {
  assert.match(workflow, /integration-reconciliation-diagnostic\.json/);
  assert.match(workflow, /mainChangedFileCount/);
  assert.match(workflow, /headChangedFileCount/);
  assert.match(workflow, /overlapChangedFileCount/);
  assert.match(workflow, /sensitiveOverlapCount/);
  assert.match(workflow, /overlapFiles/);
  assert.match(workflow, /sensitiveOverlapFiles/);
  assert.match(workflow, /OWNER_LED_CONFLICT_AWARE_RECONCILIATION/);
  assert.match(workflow, /automaticMergeAttempted:false/);
  assert.match(workflow, /automaticConflictResolutionAttempted:false/);
  assert.match(workflow, /governanceSemanticResolutionAttempted:false/);
});
