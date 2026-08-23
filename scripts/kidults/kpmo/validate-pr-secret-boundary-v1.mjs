import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('.github/workflows');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    if (/\.ya?ml$/i.test(entry.name)) return [full];
    return [];
  });
}

function activeText(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('#'))
    .map((line) => line.replace(/\s+#.*$/, ''))
    .join('\n');
}

function violationsFor(text) {
  const active = activeText(text);
  const hasPullRequestTrigger = /^\s*pull_request\s*:/mi.test(active);
  if (!hasPullRequestTrigger) return [];

  // Fail closed on any active GitHub expression that references the secrets
  // context, rather than only dot notation. This covers dot/indexed/dynamic
  // access and whole-context forms such as toJSON(secrets).
  const hasSecretContextExpression = /\$\{\{[^}]*\bsecrets\b[^}]*\}\}/i.test(active);
  // A reusable workflow can also inherit the caller's secrets without an
  // explicit `${{ secrets.NAME }}` expression in the caller workflow.
  const hasInheritedSecrets = /^\s*secrets\s*:\s*inherit\s*$/mi.test(active);

  const findings = [];
  if (hasSecretContextExpression) findings.push('pull-request-secret-context-reference');
  if (hasInheritedSecrets) findings.push('pull-request-secrets-inherit');
  return findings;
}

const mutationCases = [
  `on:\n  pull_request:\njobs:\n  test:\n    env:\n      TOKEN: \${{ secrets.TEST_TOKEN }}`,
  `on:\n  pull_request:\njobs:\n  test:\n    env:\n      TOKEN: \${{ secrets['TEST_TOKEN'] }}`,
  `on:\n  pull_request:\njobs:\n  test:\n    env:\n      TOKEN: \${{ secrets[\"TEST_TOKEN\"] }}`,
  `on:\n  pull_request:\njobs:\n  test:\n    env:\n      ALL_SECRETS: \${{ toJSON(secrets) }}`,
  `on:\n  pull_request:\njobs:\n  delegate:\n    uses: ./.github/workflows/reusable.yml\n    secrets: inherit`,
];
const negativeCases = [
  `on:\n  pull_request:\npermissions:\n  contents: read`,
  `on:\n  workflow_dispatch:\nenv:\n  TOKEN: \${{ secrets.TEST_TOKEN }}`,
  `# pull_request:\nworkflow_dispatch:\nenv:\n  TOKEN: \${{ secrets.TEST_TOKEN }}`,
  `on:\n  workflow_dispatch:\njobs:\n  delegate:\n    uses: ./.github/workflows/reusable.yml\n    secrets: inherit`,
];
for (const sample of mutationCases) {
  if (!violationsFor(sample).length) throw new Error(`PR-secret boundary mutation self-test missed unsafe sample: ${sample}`);
}
for (const sample of negativeCases) {
  if (violationsFor(sample).length) throw new Error(`PR-secret boundary negative self-test rejected safe sample: ${sample}`);
}

const files = walk(ROOT);
const findings = [];
for (const file of files) {
  const violations = violationsFor(fs.readFileSync(file, 'utf8'));
  if (violations.length) findings.push({ file: path.relative('.', file), violations });
}

const result = {
  suite: 'KIDULTS_PR_SECRET_BOUNDARY_V2',
  workflows_scanned: files.length,
  unsafe_workflows: findings.length,
  policy: 'PULL_REQUEST_WORKFLOWS_MUST_BE_SECRETLESS',
  secret_syntax_coverage: ['DOT', 'INDEXED_OR_DYNAMIC', 'WHOLE_CONTEXT', 'REUSABLE_INHERIT'],
  mutation_cases_detected: mutationCases.length,
  negative_cases_accepted: negativeCases.length,
  findings,
  result: findings.length === 0 ? 'PASS' : 'FAIL',
  secret_material_read: false,
  credential_activation: 'NONE',
  empirical_gate_effect: 'NONE',
  production: 'HOLD',
  public: 'HOLD',
  g5: 'EXPLICIT_APPROVAL_REQUIRED',
};
console.log(JSON.stringify(result, null, 2));
if (findings.length) process.exit(1);
