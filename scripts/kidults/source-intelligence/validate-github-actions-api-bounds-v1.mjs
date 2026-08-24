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
  const addMatches = (kind, regex) => {
    for (const match of text.matchAll(regex)) {
      violations.push({ source, kind, line: lineNumber(text, match.index ?? 0) });
    }
  };

  addMatches('UNBOUNDED_PAGINATION', /--paginate\b/gu);
  addMatches(
    'REPOSITORY_WIDE_ARTIFACT_ENUMERATION',
    /\/actions\/artifacts(?:\?|["'\s])/gu
  );

  const fixedRetry = /for\s+ATTEMPT\s+in\s+\$\(seq\b[\s\S]{0,2400}?\bgh\s+api\b[\s\S]{0,2400}?\bsleep\s+\d+/u.exec(text);
  if (fixedRetry) {
    violations.push({
      source,
      kind: 'FIXED_GH_API_RETRY_LOOP',
      line: lineNumber(text, fixedRetry.index)
    });
  }
  return violations;
};

const runSelfTest = () => {
  const forbidden = [
    'gh api --paginate "/repos/o/r/actions/runs"',
    'gh api "/repos/o/r/actions/artifacts?per_page=100"',
    'for ATTEMPT in $(seq 1 12); do\n  gh api "/repos/o/r/actions/runs"\n  sleep 15\ndone'
  ];
  for (const [index, sample] of forbidden.entries()) {
    assert(inspectWorkflow(sample, `self-test-forbidden-${index}`).length > 0, `SELF_TEST_FORBIDDEN_ACCEPTED:${index}`);
  }
  const bounded = [
    'gh api --method GET -f branch=main -f status=success -f per_page=20 "/repos/o/r/actions/workflows/p1.yml/runs"',
    'gh api --method GET "/repos/o/r/actions/runs/123/artifacts?per_page=100"'
  ].join('\n');
  assert(inspectWorkflow(bounded, 'self-test-bounded').length === 0, 'SELF_TEST_BOUNDED_REJECTED');
  console.log(JSON.stringify({
    id: 'kidults-github-actions-api-bounds-self-test-v1',
    state: 'VERIFIED_PASS',
    forbidden_cases_rejected: forbidden.length,
    bounded_cases_accepted: 2
  }, null, 2));
};

if (process.argv.includes('--self-test')) {
  runSelfTest();
  process.exit(0);
}

assert(fs.existsSync(workflowRoot), `WORKFLOW_ROOT_MISSING:${workflowRoot}`);
const files = workflowFiles(workflowRoot);
const violations = files.flatMap((file) => inspectWorkflow(fs.readFileSync(file, 'utf8'), file));
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
  repository_wide_artifact_enumeration_count: 0,
  fixed_gh_api_retry_loop_count: 0
}, null, 2));
