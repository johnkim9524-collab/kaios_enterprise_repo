import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('.github/workflows');
const POLICY_VERSION = '1.0';

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    if (/\.ya?ml$/i.test(entry.name)) return [full];
    return [];
  });
}

function activeLines(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+#.*$/, '').trimEnd())
    .filter((line) => line.trim() && !line.trimStart().startsWith('#'));
}

function containsDirectGitPush(line) {
  let candidate = line.trim();
  if (/^run:\s*/i.test(candidate)) candidate = candidate.replace(/^run:\s*/i, '');
  if (/^-\s*/.test(candidate)) candidate = candidate.replace(/^-\s*/, '');
  return /^(?:git\s+push)\b/i.test(candidate)
    || /(?:&&|\|\||;)\s*git\s+push\b/i.test(candidate);
}

function containsDirectRepositoryApiMutation(line) {
  let candidate = line.trim();
  if (/^run:\s*/i.test(candidate)) candidate = candidate.replace(/^run:\s*/i, '');
  return /^(?:gh\s+api)\b.*\/repos\/[^\s]+\/(?:contents|git\/refs|git\/commits)\b/i.test(candidate)
    || /(?:&&|\|\||;)\s*gh\s+api\b.*\/repos\/[^\s]+\/(?:contents|git\/refs|git\/commits)\b/i.test(candidate);
}

function violationsFor(text) {
  const lines = activeLines(text);
  const findings = [];
  if (lines.some((line) => /^\s*contents:\s*write\s*$/i.test(line))) findings.push('contents-write');
  if (lines.some((line) => /^\s*permissions:\s*write-all\s*$/i.test(line))) findings.push('permissions-write-all');
  if (lines.some(containsDirectGitPush)) findings.push('direct-git-push');
  if (lines.some(containsDirectRepositoryApiMutation)) findings.push('direct-github-repository-mutation-api');
  return [...new Set(findings)];
}

const mutationCases = [
  ['permissions:\n  contents: write', 'contents-write'],
  ['permissions: write-all', 'permissions-write-all'],
  ['run: git push origin HEAD:main', 'direct-git-push'],
  ['run: git add x && git push', 'direct-git-push'],
  ['run: gh api --method POST /repos/acme/repo/git/refs', 'direct-github-repository-mutation-api'],
];
const negativeCases = [
  "run: echo 'Repository mutation did not occur; no direct push was performed.'",
  "run: echo 'git push is forbidden by policy'",
];
for (const [sample, expected] of mutationCases) {
  const found = violationsFor(sample);
  if (!found.includes(expected)) throw new Error(`workflow mutation guard self-test missed ${expected}: ${sample}`);
}
for (const sample of negativeCases) {
  const found = violationsFor(sample);
  if (found.length) throw new Error(`workflow mutation guard false-positive self-test: ${sample} -> ${found.join(',')}`);
}

const files = walk(ROOT);
const findings = [];
for (const file of files) {
  const violations = violationsFor(fs.readFileSync(file, 'utf8'));
  if (violations.length) findings.push({ file: path.relative('.', file), violations });
}

const result = {
  suite: 'KIDULTS_WORKFLOW_REPOSITORY_MUTATION_BOUNDARY_V1',
  policy_version: POLICY_VERSION,
  workflows_scanned: files.length,
  mutation_cases_detected: mutationCases.length,
  negative_cases_rejected: negativeCases.length,
  policy: 'NO_DIRECT_REPOSITORY_MUTATION_FROM_GITHUB_ACTIONS',
  findings,
  result: findings.length === 0 ? 'PASS' : 'FAIL',
  empirical_gate_effect: 'NONE',
  production: 'HOLD',
  public: 'HOLD',
  g5: 'EXPLICIT_APPROVAL_REQUIRED',
};
console.log(JSON.stringify(result, null, 2));
if (findings.length) process.exit(1);
