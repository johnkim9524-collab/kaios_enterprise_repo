import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('.github/workflows');
const REGISTRY = 'coordination/kidults/kpmo/secret-bearing-workflow-dispatch-registry-v1.json';
const enforceRegistry = process.argv.includes('--enforce-registry') || fs.existsSync(REGISTRY);

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

function classify(text) {
  const active = activeText(text);
  const workflowDispatch = /^\s*workflow_dispatch\s*:/mi.test(active);
  const dotSecretNames = [...active.matchAll(/\$\{\{\s*secrets\.([A-Za-z0-9_]+)\s*\}\}/g)].map((m) => m[1]);
  const indexedSecretAccess = /\$\{\{[^}]*\bsecrets\s*\[[^\]]+\][^}]*\}\}/i.test(active);
  const wholeOrDynamicSecretContext = /\$\{\{[^}]*\bsecrets\b[^}]*\}\}/i.test(active);
  const inheritedReusableSecrets = /^\s*secrets\s*:\s*inherit\s*$/mi.test(active);
  const secretNames = [
    ...dotSecretNames,
    ...(indexedSecretAccess ? ['INDEXED_SECRET_ACCESS'] : []),
    ...(wholeOrDynamicSecretContext && dotSecretNames.length === 0 && !indexedSecretAccess ? ['SECRET_CONTEXT_EXPRESSION'] : []),
    ...(inheritedReusableSecrets ? ['INHERITED_REUSABLE_WORKFLOW_SECRETS'] : [])
  ];
  const environmentDeclared = /^\s*environment\s*:/mi.test(active);
  const explicitMainRefGuard = /github\.ref\s*==\s*['"]refs\/heads\/main['"]/.test(active)
    || /GITHUB_REF[^\n]*refs\/heads\/main/.test(active);
  return {
    workflow_dispatch: workflowDispatch,
    secret_names: [...new Set(secretNames)].sort(),
    indexed_secret_access: indexedSecretAccess,
    secret_context_expression: wholeOrDynamicSecretContext,
    inherited_reusable_secrets: inheritedReusableSecrets,
    environment_declared: environmentDeclared,
    explicit_main_ref_guard: explicitMainRefGuard,
    privileged_manual_lane: workflowDispatch && (wholeOrDynamicSecretContext || inheritedReusableSecrets)
  };
}

const mutationCases = [
  `on:\n  workflow_dispatch:\njobs:\n  run:\n    env:\n      TOKEN: \${{ secrets.TEST_TOKEN }}`,
  `workflow_dispatch:\nenvironment: staging\nenv:\n  KEY: \${{ secrets.SSH_KEY }}`,
  `on:\n  workflow_dispatch:\njobs:\n  run:\n    env:\n      TOKEN: \${{ secrets['TEST_TOKEN'] }}`,
  `on:\n  workflow_dispatch:\njobs:\n  run:\n    env:\n      ALL_SECRETS: \${{ toJSON(secrets) }}`,
  `on:\n  workflow_dispatch:\njobs:\n  call:\n    uses: owner/repo/.github/workflows/reusable.yml@main\n    secrets: inherit`
];
for (const sample of mutationCases) {
  if (!classify(sample).privileged_manual_lane) {
    throw new Error('secret-bearing workflow_dispatch mutation self-test missed unsafe sample');
  }
}

const negativeCases = [
  `on:\n  pull_request:\npermissions:\n  contents: read`,
  `on:\n  workflow_dispatch:\nenv:\n  MODE: dry-run`,
  `on:\n  push:\n    branches: [main]\nenv:\n  TOKEN: \${{ secrets.TEST_TOKEN }}`,
  `on:\n  push:\n    branches: [main]\njobs:\n  call:\n    uses: owner/repo/.github/workflows/reusable.yml@main\n    secrets: inherit`
];
for (const sample of negativeCases) {
  if (classify(sample).privileged_manual_lane) {
    throw new Error('secret-bearing workflow_dispatch inventory rejected negative sample');
  }
}

const files = walk(ROOT);
const findings = [];
for (const file of files) {
  const details = classify(fs.readFileSync(file, 'utf8'));
  if (!details.privileged_manual_lane) continue;
  findings.push({
    workflow: path.relative('.', file),
    secret_names: details.secret_names,
    indexed_secret_access: details.indexed_secret_access,
    secret_context_expression: details.secret_context_expression,
    inherited_reusable_secrets: details.inherited_reusable_secrets,
    environment_declared: details.environment_declared,
    explicit_main_ref_guard: details.explicit_main_ref_guard,
    security_state: details.environment_declared
      ? 'ENVIRONMENT_PRESENT_EXTERNAL_POLICY_NOT_PROVEN_BY_REPOSITORY'
      : 'REPOSITORY_SECRET_SCOPE_OR_ENVIRONMENT_NOT_DECLARED',
    disposition: 'EXTERNAL_CONTROL_PLANE_PROOF_REQUIRED'
  });
}
findings.sort((a, b) => a.workflow.localeCompare(b.workflow));

let registry = null;
let registryDrift = [];
if (fs.existsSync(REGISTRY)) {
  registry = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
  const actual = findings.map((x) => x.workflow);
  const expected = [...(registry.registered_workflows || [])].sort();
  registryDrift = [
    ...actual.filter((x) => !expected.includes(x)).map((x) => `UNREGISTERED:${x}`),
    ...expected.filter((x) => !actual.includes(x)).map((x) => `STALE_REGISTRY:${x}`)
  ];
}

const result = {
  suite: 'KIDULTS_SECRET_BEARING_WORKFLOW_DISPATCH_INVENTORY_V2',
  workflows_scanned: files.length,
  privileged_manual_lanes: findings.length,
  mutation_cases_detected: mutationCases.length,
  negative_cases_accepted: negativeCases.length,
  supported_secret_syntaxes: ['DOT_CONTEXT','INDEXED_OR_DYNAMIC_CONTEXT','WHOLE_SECRET_CONTEXT','REUSABLE_SECRETS_INHERIT'],
  findings,
  registry_present: Boolean(registry),
  registry_drift: registryDrift,
  security_truth: findings.length === 0 ? 'NO_SECRET_BEARING_MANUAL_LANES' : 'EXTERNAL_CONTROL_PLANE_PROOF_REQUIRED',
  secret_material_read: false,
  credential_activation: 'NONE',
  production: 'HOLD',
  public: 'HOLD',
  g5: 'EXPLICIT_APPROVAL_REQUIRED'
};
console.log(JSON.stringify(result, null, 2));

if (enforceRegistry) {
  if (!registry) {
    console.error(`FAIL registry missing: ${REGISTRY}`);
    process.exit(1);
  }
  if (registryDrift.length) {
    console.error(`FAIL secret-bearing dispatch registry drift: ${registryDrift.join(', ')}`);
    process.exit(1);
  }
  if (registry.issue !== 974 || registry.status !== 'EXTERNAL_APPROVAL_REQUIRED') {
    console.error('FAIL registry must remain explicitly bound to open security issue #974 / EXTERNAL_APPROVAL_REQUIRED');
    process.exit(1);
  }
}
