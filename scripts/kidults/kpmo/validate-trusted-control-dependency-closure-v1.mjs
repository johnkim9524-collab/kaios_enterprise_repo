import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const aggregatePath = 'scripts/kidults/kpmo/run-full-value-chain-redteam-suite-v1.mjs';
const orchestratorPath = 'coordination/kidults/kpmo/full-value-chain-redteam-orchestrator-v1.json';

const fail = message => {
  console.error(`FAIL trusted-control dependency-closure selftest: ${message}`);
  process.exit(1);
};

const read = file => {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) fail(`missing dependency ${file}`);
  return fs.readFileSync(file, 'utf8');
};

const topLevelScriptRefs = text => new Set(
  [...text.matchAll(/['"](scripts\/[A-Za-z0-9_./-]+\.(?:mjs|py))['"]/g)].map(match => match[1])
);

const executableRefsFromJson = (text, label) => {
  let parsed;
  try { parsed = JSON.parse(text); } catch (error) { fail(`${label} invalid JSON: ${error.message}`); }
  const refs = new Set();
  const walk = value => {
    if (typeof value === 'string') {
      if (/^scripts\/[A-Za-z0-9_./-]+\.(?:mjs|js|cjs|py|sh)$/.test(value)) refs.add(value);
      return;
    }
    if (Array.isArray(value)) { for (const item of value) walk(item); return; }
    if (value && typeof value === 'object') for (const item of Object.values(value)) walk(item);
  };
  walk(parsed);
  return refs;
};

const resolveExecutableDependency = (currentPath, relativeRef) => {
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(currentPath), relativeRef));
  if (!resolved.startsWith('scripts/')) throw new Error(`dependency escaped governed scripts root: ${currentPath} -> ${relativeRef}`);
  return resolved;
};

const repositoryDependencyRefs = (text, currentPath) => {
  const executable = new Set();
  const semantic = new Set();
  for (const match of text.matchAll(/['"](scripts\/[A-Za-z0-9_./-]+\.(?:mjs|js|cjs|py|sh))['"]/g)) executable.add(match[1]);
  const relativePatterns = [
    /\bfrom\s+['"](\.{1,2}\/[^'"]+\.(?:mjs|js|cjs))['"]/g,
    /\bimport\s+['"](\.{1,2}\/[^'"]+\.(?:mjs|js|cjs))['"]/g,
    /\bimport\s*\(\s*['"](\.{1,2}\/[^'"]+\.(?:mjs|js|cjs))['"]\s*\)/g,
    /\brequire\s*\(\s*['"](\.{1,2}\/[^'"]+\.(?:mjs|js|cjs))['"]\s*\)/g
  ];
  for (const pattern of relativePatterns) {
    for (const match of text.matchAll(pattern)) {
      try { executable.add(resolveExecutableDependency(currentPath, match[1])); }
      catch (error) { fail(error.message); }
    }
  }
  for (const match of text.matchAll(/['"]((?:coordination|apps|services)\/[A-Za-z0-9_./-]+\.(?:json|ya?ml))['"]/g)) semantic.add(match[1]);
  for (const match of text.matchAll(/path\.join\(\s*root\s*,([\s\S]*?)\)/g)) {
    const segments = [...match[1].matchAll(/['"]([^'"]+)['"]/g)].map(item => item[1]);
    if (!segments.length) continue;
    const candidate = path.posix.normalize(path.posix.join(...segments));
    if (/^(?:coordination|apps|services)\/.+\.(?:json|ya?ml)$/.test(candidate)) semantic.add(candidate);
  }
  return { executable, semantic };
};

const aggregate = read(aggregatePath);
const orchestrator = read(orchestratorPath);
const literalRefs = topLevelScriptRefs(aggregate);
const dynamicRefs = executableRefsFromJson(orchestrator, 'canonical orchestrator');
const seedRefs = new Set([...literalRefs, ...dynamicRefs]);
const closure = new Set(seedRefs);
const executableClosure = new Set(seedRefs);
const semanticClosure = new Set();
const queue = [...closure].sort();

while (queue.length) {
  const ref = queue.shift();
  const content = read(ref);
  const deps = repositoryDependencyRefs(content, ref);
  for (const child of [...deps.executable].sort()) {
    read(child);
    if (!closure.has(child)) {
      closure.add(child);
      executableClosure.add(child);
      queue.push(child);
    }
  }
  for (const candidate of [...deps.semantic].sort()) {
    if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) continue;
    if (!closure.has(candidate)) {
      closure.add(candidate);
      semanticClosure.add(candidate);
      queue.push(candidate);
    }
  }
}

const mandatoryDiscoveries = [
  'scripts/kidults/kpmo/validate-operating-principles-resilience-v1.mjs',
  'scripts/kidults/source-intelligence/test-source-admission-record-v1.mjs',
  'scripts/kidults/projection/validate-projection-dry-run-v1.mjs',
  'scripts/kidults/audit/rfc3339-v1.mjs',
  'scripts/kidults/portal/runtime/projection-store.js',
  'scripts/kidults/portal/runtime/proof-product-admission.js',
  'scripts/kidults/portal/runtime/proof-product-schema-validator.js',
  'scripts/kidults/portal/trusted-portal-runtime-parity-v1.mjs',
  'coordination/kidults/audit/pre-partner-adversarial-fixtures-v2.json',
  'coordination/kidults/audit/unified-audit-control-plane-v1.json',
  'coordination/kidults/kpmo/epistemic-causal-integrity-controls-v1.json'
];
for (const expected of mandatoryDiscoveries) if (!closure.has(expected)) fail(`closure missed mandatory trust dependency ${expected}`);

// Mutation probes construct fake paths from fragments so this validator cannot
// rediscover its own test fixtures as real repository dependencies.
const fakeDynamic = ['scripts', 'probe-dynamic.mjs'].join('/');
const dynamicMutationProbe = executableRefsFromJson(JSON.stringify({ nested: { validator: fakeDynamic } }), 'dynamic probe');
if (!dynamicMutationProbe.has(fakeDynamic)) fail('dynamic-ref mutation probe failed');

const fakeChild = ['scripts', 'probe-child.mjs'].join('/');
const fakeRelativeHelper = ['.', 'probe-helper.js'].join('/');
const fakeParent = ['scripts', 'kidults', 'kpmo', 'probe-parent.mjs'].join('/');
const fakeResolvedHelper = ['scripts', 'kidults', 'kpmo', 'probe-helper.js'].join('/');
const dependencyMutationProbe = repositoryDependencyRefs([
  `run('${fakeChild}')`,
  `import helper from '${fakeRelativeHelper}';`,
  "const fixture = 'coordination/kidults/audit/pre-partner-adversarial-fixtures-v2.json';",
  "const causal = path.join(root, 'coordination', 'kidults', 'kpmo', 'epistemic-causal-integrity-controls-v1.json');"
].join('\n'), fakeParent);
for (const expected of [fakeChild, fakeResolvedHelper]) if (!dependencyMutationProbe.executable.has(expected)) fail(`transitive executable mutation probe missed ${expected}`);
for (const expected of ['coordination/kidults/audit/pre-partner-adversarial-fixtures-v2.json', 'coordination/kidults/kpmo/epistemic-causal-integrity-controls-v1.json']) if (!dependencyMutationProbe.semantic.has(expected)) fail(`semantic dependency mutation probe missed ${expected}`);

const fakePortalParent = ['scripts','kidults','portal','probe-parent.mjs'].join('/');
const fakeEscape = ['..','..','..','apps','kidults-enterprise-staging','public','portal-r001','projection-store.js'].join('/');
let escapeRejected = false;
try { resolveExecutableDependency(fakePortalParent, fakeEscape); }
catch { escapeRejected = true; }
if (!escapeRejected) fail('cross-tree executable escape mutation probe was not rejected');

const trustedParity = read('scripts/kidults/portal/trusted-portal-runtime-parity-v1.mjs');
for (const marker of [
  'apps/kidults-enterprise-staging/public/portal-r001/projection-store.js',
  'apps/kidults-enterprise-staging/public/portal-r001/proof-product-admission.js',
  'apps/kidults-enterprise-staging/public/portal-r001/proof-product-schema-validator.js',
  'TRUSTED_PORTAL_RUNTIME_PARITY_MISMATCH'
]) if (!trustedParity.includes(marker)) fail(`parity validator missing governed deployment marker ${marker}`);

console.log(JSON.stringify({
  suite: 'KIDULTS_TRUSTED_CONTROL_DEPENDENCY_CLOSURE_SELFTEST_V2',
  result: 'PASS',
  literal_seed_refs: literalRefs.size,
  dynamic_seed_refs: dynamicRefs.size,
  seed_refs: seedRefs.size,
  transitive_executable_refs: executableClosure.size,
  semantic_control_refs: semanticClosure.size,
  total_trust_dependency_refs: closure.size,
  mandatory_discoveries_proven: mandatoryDiscoveries.length,
  cross_tree_executable_escape: 'REJECTED',
  portal_runtime_owner: 'SCRIPTS_GOVERNED_ROOT',
  portal_runtime_deployment_parity: 'SHA256_FAIL_CLOSED',
  mutation_probes: 6,
  empirical_gate_effect: 'NONE',
  external_partner_ingestion: 'HOLD',
  production: 'HOLD',
  public: 'HOLD',
  g5: 'EXPLICIT_APPROVAL_REQUIRED'
}, null, 2));
