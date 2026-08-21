import fs from 'node:fs';

const policyPath = 'coordination/kidults/kpmo/github-actions-node24-estate-policy-v1.json';
const guardPath = '.github/workflows/kpmo-node24-estate-guard-v1.yml';
const migratorPath = 'scripts/kidults/kpmo/github-actions-node24-estate-v1.mjs';
const dependabotPath = '.github/dependabot.yml';

const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
const guard = fs.readFileSync(guardPath, 'utf8');
const migrator = fs.readFileSync(migratorPath, 'utf8');
const dependabot = fs.readFileSync(dependabotPath, 'utf8');

const required = [
  policy.policy_id === 'KIDULTS_GITHUB_ACTIONS_NODE24_ESTATE_POLICY_V1',
  policy.governing_issue === 933,
  policy.required_runtime_floor === 'NODE24_SAFE_ACTION_RUNTIME',
  policy.explicit_node20_runtime === 'FORBIDDEN',
  policy.unsecure_node20_optout === 'FORBIDDEN',
  policy.aggregate_binding_required === true,
  policy.truth_boundary?.empirical_gate_effect === 'NONE',
  policy.truth_boundary?.production === 'HOLD',
  policy.truth_boundary?.public === 'HOLD',
  policy.truth_boundary?.g5 === 'EXPLICIT_APPROVAL_REQUIRED',
  guard.includes('github-actions-node24-estate-v1.mjs --check'),
  guard.includes('actions/checkout@v7'),
  guard.includes('actions/setup-node@v7'),
  guard.includes("node-version: '24'"),
  migrator.includes('ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION'),
  migrator.includes('mutation_cases_detected'),
  dependabot.includes('package-ecosystem: github-actions'),
  dependabot.includes('interval: weekly')
];

if (required.some((value) => !value)) throw new Error('Node24 estate policy binding incomplete');
console.log(JSON.stringify({
  suite: 'KIDULTS_GITHUB_ACTIONS_NODE24_POLICY_BINDING_V1',
  result: 'PASS',
  governing_issue: 933,
  aggregate_binding: 'REQUIRED',
  dependency_lifecycle: 'DEPENDABOT_GITHUB_ACTIONS_WEEKLY',
  empirical_gate_effect: 'NONE',
  production: 'HOLD',
  public: 'HOLD',
  g5: 'EXPLICIT_APPROVAL_REQUIRED'
}, null, 2));
