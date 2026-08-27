import fs from 'node:fs';
import path from 'node:path';
import {
  buildWorkflowInventory,
  validateRequiredEnvironmentBindings
} from './github-trusted-ref-environment-readback-v1.mjs';

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
    privileged_secret_lane: wholeOrDynamicSecretContext || inheritedReusableSecrets,
    privileged_manual_lane: workflowDispatch && (wholeOrDynamicSecretContext || inheritedReusableSecrets)
  };
}

const mutationCases = [
  `on:\n  workflow_dispatch:\njobs:\n  run:\n    env:\n      TOKEN: \${{ secrets.TEST_TOKEN }}`,
  `workflow_dispatch:\nenvironment: staging\nenv:\n  KEY: \${{ secrets.SSH_KEY }}`,
  `on:\n  workflow_dispatch:\njobs:\n  run:\n    env:\n      TOKEN: \${{ secrets['TEST_TOKEN'] }}`,
  `on:\n  workflow_dispatch:\njobs:\n  run:\n    env:\n      ALL_SECRETS: \${{ toJSON(secrets) }}`,
  `on:\n  workflow_dispatch:\njobs:\n  call:\n    uses: owner/repo/.github/workflows/reusable.yml@main\n    secrets: inherit`,
  `on:\n  push:\n    branches: [main]\nenv:\n  TOKEN: \${{ secrets.TEST_TOKEN }}`,
  `on:\n  workflow_run:\n    workflows: [Upstream]\n    types: [completed]\nenv:\n  TOKEN: \${{ secrets.TEST_TOKEN }}`,
  `on:\n  schedule:\n    - cron: '0 0 * * *'\nenv:\n  TOKEN: \${{ secrets.TEST_TOKEN }}`
];
for (const sample of mutationCases) {
  if (!classify(sample).privileged_secret_lane) {
    throw new Error('trigger-independent secret-bearing workflow mutation self-test missed unsafe sample');
  }
}

const negativeCases = [
  `on:\n  pull_request:\npermissions:\n  contents: read`,
  `on:\n  workflow_dispatch:\nenv:\n  MODE: dry-run`,
  `on:\n  push:\n    branches: [main]\nenv:\n  MODE: dry-run`,
  `on:\n  schedule:\n    - cron: '0 0 * * *'\nenv:\n  MODE: read-only`
];
for (const sample of negativeCases) {
  if (classify(sample).privileged_secret_lane) {
    throw new Error('secret-bearing workflow_dispatch inventory rejected negative sample');
  }
}

const files = walk(ROOT);
const findings = [];
for (const file of files) {
  const details = classify(fs.readFileSync(file, 'utf8'));
  if (!details.privileged_secret_lane) continue;
  findings.push({
    workflow: path.relative('.', file).split(path.sep).join('/'),
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
let privilegedExecutionInventory = null;
let privilegedExecutionControlFailures = [];
if (fs.existsSync(REGISTRY)) {
  registry = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
  const actual = findings.map((x) => x.workflow);
  const expected = [...(registry.registered_workflows || [])].sort();
  registryDrift = [
    ...actual.filter((x) => !expected.includes(x)).map((x) => `UNREGISTERED:${x}`),
    ...expected.filter((x) => !actual.includes(x)).map((x) => `STALE_REGISTRY:${x}`)
  ];
  privilegedExecutionInventory = buildWorkflowInventory(process.cwd(), registry);
  privilegedExecutionControlFailures = validateRequiredEnvironmentBindings(privilegedExecutionInventory, registry);
}

const privilegedJobs = privilegedExecutionInventory?.lanes.flatMap((lane) => lane.secret_bearing_jobs) || [];

const result = {
  suite: 'KIDULTS_TRIGGER_INDEPENDENT_SECRET_BEARING_WORKFLOW_INVENTORY_V3',
  workflows_scanned: files.length,
  privileged_secret_lanes: findings.length,
  privileged_manual_lanes: findings.filter((finding) => finding.workflow_dispatch).length,
  mutation_cases_detected: mutationCases.length,
  negative_cases_accepted: negativeCases.length,
  supported_secret_syntaxes: ['DOT_CONTEXT','INDEXED_OR_DYNAMIC_CONTEXT','WHOLE_SECRET_CONTEXT','REUSABLE_SECRETS_INHERIT'],
  findings,
  registry_present: Boolean(registry),
  registry_drift: registryDrift,
  privileged_execution_control_failures: privilegedExecutionControlFailures,
  live_main_sha_guarded_secret_bearing_jobs: privilegedJobs.filter((job) => (
    job.live_main_guard.count === 1
    && job.live_main_guard.contract_valid
    && job.live_main_guard.before_all_provider_secret_steps
  )).length,
  workflow_scope_provider_secret_jobs: privilegedJobs.filter((job) => job.workflow_scope_secret_names.length > 0).length,
  job_scope_provider_secret_jobs: privilegedJobs.filter((job) => job.job_scope_secret_names.length > 0).length,
  step_scoped_provider_secret_jobs: privilegedJobs.filter((job) => job.provider_secrets_step_scoped).length,
  privileged_secret_steps: privilegedJobs.reduce((count, job) => count + job.step_secret_bindings.length, 0),
  security_truth: findings.length === 0 ? 'NO_SECRET_BEARING_LANES' : 'EXTERNAL_CONTROL_PLANE_PROOF_REQUIRED',
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
    console.error(`FAIL trigger-independent secret-bearing registry drift: ${registryDrift.join(', ')}`);
    process.exit(1);
  }
  if (privilegedExecutionControlFailures.length) {
    console.error(`FAIL privileged execution control drift: ${privilegedExecutionControlFailures.join(', ')}`);
    process.exit(1);
  }
  if (registry.issue !== 974 || registry.status !== 'EXTERNAL_APPROVAL_REQUIRED') {
    console.error('FAIL registry must remain explicitly bound to open security issue #974 / EXTERNAL_APPROVAL_REQUIRED');
    process.exit(1);
  }
}
