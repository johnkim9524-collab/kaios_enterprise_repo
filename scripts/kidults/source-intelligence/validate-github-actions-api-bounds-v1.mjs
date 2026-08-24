#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const workflowRoot = '.github/workflows';
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const workflowFiles = (root) => {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) return workflowFiles(target);
    return /\.ya?ml$/u.test(entry.name) ? [target] : [];
  }).sort();
};

const lineNumber = (text, index) => text.slice(0, index).split('\n').length;

const inspectWorkflow = (text, source) => {
  const violations = [];
  for (const match of text.matchAll(/--paginate\b/gu)) {
    violations.push({
      source,
      kind: 'UNBOUNDED_PAGINATION',
      line: lineNumber(text, match.index ?? 0)
    });
  }
  return violations;
};

const criticalRunScopedArtifactConsumers = [
  '.github/workflows/kidults-asi-autobalance-steering-overlay-live-v1.yml',
  '.github/workflows/kidults-asi-source-domain-observation-graph-v1.yml',
  '.github/workflows/kidults-asi-common-crawl-host-expansion-v1.yml',
  '.github/workflows/kidults-asi-owned-source-intelligence-graph-v2.yml',
  '.github/workflows/kidults-asi-sharded-source-reserve-v1.yml'
];

const inspectCriticalRunScopedArtifactConsumer = (text, source) => {
  const violations = [];
  for (const match of text.matchAll(/\/actions\/artifacts\?per_page=100/gu)) {
    violations.push({
      source,
      kind: 'CRITICAL_REPOSITORY_WIDE_ARTIFACT_SCAN',
      line: lineNumber(text, match.index ?? 0)
    });
  }
  if (!/\/actions\/workflows\/[^\s"']+\/runs\?branch=main&status=success&per_page=1/u.test(text)) {
    violations.push({source, kind: 'CRITICAL_MAIN_WORKFLOW_RUN_LOOKUP_MISSING', line: 1});
  }
  if (!/\/actions\/runs\/\$\{[^}]+\}\/artifacts\?per_page=100/u.test(text)) {
    violations.push({source, kind: 'CRITICAL_RUN_SCOPED_ARTIFACT_LOOKUP_MISSING', line: 1});
  }
  return violations;
};

const runSelfTest = () => {
  const forbidden = [
    'gh api --paginate "/repos/o/r/actions/runs"',
    'gh api \\\n  --paginate "/repos/o/r/actions/artifacts?per_page=100"'
  ];
  for (const [index, sample] of forbidden.entries()) {
    assert(inspectWorkflow(sample, `self-test-forbidden-${index}`).length === 1, `SELF_TEST_FORBIDDEN_ACCEPTED:${index}`);
  }
  const bounded = [
    'gh api --method GET -f branch=main -f status=success -f per_page=20 "/repos/o/r/actions/workflows/p1.yml/runs"',
    'gh api --method GET "/repos/o/r/actions/artifacts?per_page=100"',
    'gh api --method GET "/repos/o/r/actions/runs/123/artifacts?per_page=100"'
  ].join('\n');
  assert(inspectWorkflow(bounded, 'self-test-bounded').length === 0, 'SELF_TEST_BOUNDED_REJECTED');
  const criticalForbidden = 'gh api "/repos/o/r/actions/artifacts?per_page=100"';
  assert(inspectCriticalRunScopedArtifactConsumer(criticalForbidden, 'self-test-critical-forbidden').some(v => v.kind === 'CRITICAL_REPOSITORY_WIDE_ARTIFACT_SCAN'), 'SELF_TEST_CRITICAL_REPOSITORY_SCAN_ACCEPTED');
  const criticalBounded = 'gh api "/repos/o/r/actions/workflows/p1.yml/runs?branch=main&status=success&per_page=1"\ngh api "/repos/o/r/actions/runs/${RUN_ID}/artifacts?per_page=100"';
  assert(inspectCriticalRunScopedArtifactConsumer(criticalBounded, 'self-test-critical-bounded').length === 0, 'SELF_TEST_CRITICAL_RUN_SCOPED_REJECTED');
  console.log(JSON.stringify({
    id: 'kidults-github-actions-api-bounds-self-test-v1',
    state: 'VERIFIED_PASS',
    unbounded_cases_rejected: forbidden.length,
    bounded_cases_accepted: 4,
    critical_repository_scans_rejected: 1
  }, null, 2));
};

if (process.argv.includes('--self-test')) {
  runSelfTest();
  process.exit(0);
}

assert(fs.existsSync(workflowRoot), `WORKFLOW_ROOT_MISSING:${workflowRoot}`);
const files = workflowFiles(workflowRoot);
const violations = files.flatMap((file) => inspectWorkflow(fs.readFileSync(file, 'utf8'), file));
for (const file of criticalRunScopedArtifactConsumers) {
  assert(fs.existsSync(file), `CRITICAL_WORKFLOW_MISSING:${file}`);
  violations.push(...inspectCriticalRunScopedArtifactConsumer(fs.readFileSync(file, 'utf8'), file));
}
if (violations.length > 0) {
  console.error(JSON.stringify({
    id: 'kidults-github-actions-api-bounds-validation-v1',
    state: 'VERIFIED_FAIL',
    workflow_count: files.length,
    violations
  }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({
  id: 'kidults-github-actions-api-bounds-validation-v1',
  state: 'VERIFIED_PASS',
  workflow_count: files.length,
  unbounded_pagination_count: 0,
  critical_run_scoped_artifact_consumers: criticalRunScopedArtifactConsumers.length,
  critical_repository_wide_artifact_scans: 0
}, null, 2));
