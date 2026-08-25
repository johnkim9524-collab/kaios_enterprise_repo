#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const workflowDir = path.resolve('.github/workflows');
const allowedUnbounded = new Set([
  'ci-validation.yml',
  'kpmo-exact-head-ci-supersession-v1.yml',
  'solo-owner-preflight.yml'
]);

function eventBlock(source) {
  const lines = source.split(/\r?\n/);
  const start = lines.findIndex((line) => /^  pull_request(?:_target)?:\s*$/.test(line));
  if (start < 0) return null;
  const block = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^  [A-Za-z_][\w-]*:\s*/.test(lines[index])) break;
    if (/^[^\s#]/.test(lines[index])) break;
    block.push(lines[index]);
  }
  return block;
}

const files = fs.readdirSync(workflowDir)
  .filter((name) => /\.ya?ml$/.test(name))
  .sort();
const violations = [];
let prWorkflows = 0;
let bounded = 0;
let protectedUnbounded = 0;

for (const file of files) {
  const source = fs.readFileSync(path.join(workflowDir, file), 'utf8');
  const block = eventBlock(source);
  if (!block) continue;
  prWorkflows += 1;
  const hasBound = block.some((line) => /^    paths(?:-ignore)?:\s*$/.test(line));
  if (hasBound) {
    bounded += 1;
    continue;
  }
  if (allowedUnbounded.has(file)) {
    protectedUnbounded += 1;
    continue;
  }
  violations.push({ file, kind: 'UNBOUNDED_PULL_REQUEST_TRIGGER' });
}

for (const required of allowedUnbounded) {
  if (!files.includes(required)) violations.push({ file: required, kind: 'MISSING_PROTECTED_WORKFLOW' });
}

const receipt = {
  id: 'kpmo-pr-impact-routing-v1',
  state: violations.length ? 'VERIFIED_FAIL' : 'VERIFIED_PASS',
  workflow_count: files.length,
  pull_request_workflow_count: prWorkflows,
  bounded_pull_request_workflow_count: bounded,
  protected_unbounded_workflow_count: protectedUnbounded,
  protected_unbounded_allowlist: [...allowedUnbounded].sort(),
  violations
};
console.log(JSON.stringify(receipt, null, 2));
if (violations.length) process.exit(1);
