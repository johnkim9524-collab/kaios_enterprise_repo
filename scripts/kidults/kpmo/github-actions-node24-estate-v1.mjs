import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('.github/workflows');
const mode = process.argv.includes('--migrate') ? 'migrate' : 'check';

const replacements = [
  [/actions\/checkout@v[1-4](?!\d)/g, 'actions/checkout@v7'],
  [/actions\/setup-node@v[1-4](?!\d)/g, 'actions/setup-node@v7'],
  [/actions\/setup-python@v[1-5](?!\d)/g, 'actions/setup-python@v7'],
  [/actions\/upload-artifact@v[1-5](?!\d)/g, 'actions/upload-artifact@v6'],
  [/actions\/download-artifact@v[1-6](?!\d)/g, 'actions/download-artifact@v7'],
  [/actions\/cache@v[1-4](?!\d)/g, 'actions/cache@v5'],
  [/actions\/github-script@v[1-7](?!\d)/g, 'actions/github-script@v8'],
  [/actions\/setup-go@v[1-5](?!\d)/g, 'actions/setup-go@v6'],
  [/actions\/setup-java@v[1-4](?!\d)/g, 'actions/setup-java@v5'],
  [/(node-version\s*:\s*)['"]?20(?:\.x)?['"]?/g, "$1'24'"],
  [/Set up Node\.js 20/g, 'Set up Node.js 24'],
  [/Setup Node\.js 20/g, 'Setup Node.js 24'],
];

const forbidden = [
  { id: 'checkout-pre-node24', re: /actions\/checkout@v[1-4](?!\d)/ },
  { id: 'setup-node-pre-node24', re: /actions\/setup-node@v[1-4](?!\d)/ },
  { id: 'setup-python-node20', re: /actions\/setup-python@v[1-5](?!\d)/ },
  { id: 'upload-artifact-node20', re: /actions\/upload-artifact@v[1-5](?!\d)/ },
  { id: 'download-artifact-node20', re: /actions\/download-artifact@v[1-6](?!\d)/ },
  { id: 'cache-node20', re: /actions\/cache@v[1-4](?!\d)/ },
  { id: 'github-script-node20', re: /actions\/github-script@v[1-7](?!\d)/ },
  { id: 'setup-go-node20', re: /actions\/setup-go@v[1-5](?!\d)/ },
  { id: 'setup-java-node20', re: /actions\/setup-java@v[1-4](?!\d)/ },
  { id: 'explicit-node20-runtime', re: /node-version\s*:\s*['"]?20(?:\.x)?['"]?/ },
  { id: 'unsecure-node-optout', re: /ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION/ },
];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    if (/\.ya?ml$/i.test(entry.name)) return [full];
    return [];
  });
}

function migrateText(input) {
  return replacements.reduce((text, [re, replacement]) => text.replace(re, replacement), input);
}

function violationsFor(text) {
  return forbidden.filter(({ re }) => re.test(text)).map(({ id }) => id);
}

// Fail closed if the transform or detectors stop working.
const mutationCases = [
  'uses: actions/checkout@v4',
  'uses: actions/setup-node@v4\nwith:\n  node-version: 20',
  'uses: actions/setup-python@v5',
  'uses: actions/upload-artifact@v4',
  'uses: actions/download-artifact@v4',
  'uses: actions/cache@v4',
  'uses: actions/github-script@v7',
  'uses: actions/setup-go@v5',
  'uses: actions/setup-java@v4',
  'env:\n  ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION: true',
];
for (const sample of mutationCases) {
  if (violationsFor(sample).length === 0) throw new Error(`guard mutation missed: ${sample}`);
  const migrated = migrateText(sample);
  if (!sample.includes('ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION') && violationsFor(migrated).length !== 0) {
    throw new Error(`migration mutation did not close: ${sample} -> ${migrated}`);
  }
}

const files = walk(ROOT);
let changed = 0;
const findings = [];
for (const file of files) {
  const before = fs.readFileSync(file, 'utf8');
  if (mode === 'migrate') {
    const after = migrateText(before);
    if (after !== before) {
      fs.writeFileSync(file, after);
      changed += 1;
    }
  }
}

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const violations = violationsFor(text);
  if (violations.length) findings.push({ file: path.relative('.', file), violations });
}

const result = {
  suite: 'KIDULTS_GITHUB_ACTIONS_NODE24_ESTATE_V1',
  mode,
  workflows_scanned: files.length,
  workflows_changed: changed,
  mutation_cases_detected: mutationCases.length,
  findings,
  result: findings.length === 0 ? 'PASS' : 'FAIL',
  empirical_gate_effect: 'NONE',
  production: 'HOLD',
  public: 'HOLD',
  g5: 'EXPLICIT_APPROVAL_REQUIRED',
};
console.log(JSON.stringify(result, null, 2));
if (findings.length) process.exit(1);
