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
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    fail(`${label} invalid JSON: ${error.message}`);
  }
  const refs = new Set();
  const walk = value => {
    if (typeof value === 'string') {
      if (/^scripts\/[A-Za-z0-9_./-]+\.(?:mjs|js|cjs|py|sh)$/.test(value)) refs.add(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (value && typeof value === 'object') {
      for (const item of Object.values(value)) walk(item);
    }
  };
  walk(parsed);
  return refs;
};

const repositoryDependencyRefs = (text, currentPath) => {
  const executable = new Set();
  const semantic = new Set();
  for (const match of text.matchAll(/['"](scripts\/[A-Za-z0-9_./-]+\.(?:mjs|js|cjs|py|sh))['"]/g)) {
    executable.add(match[1]);
  }
  const relativePatterns = [
    /\bfrom\s+['"](\.{1,2}\/[^'"]+\.(?:mjs|js|cjs))['"]/g,
    /\bimport\s+['"](\.{1,2}\/[^'"]+\.(?:mjs|js|cjs))['"]/g,
    /\bimport\s*\(\s*['"](\.{1,2}\/[^'"]+\.(?:mjs|js|cjs))['"]\s*\)/g,
    /\brequire\s*\(\s*['"](\.{1,2}\/[^'"]+\.(?:mjs|js|cjs))['"]\s*\)/g
  ];
  for (const pattern of relativePatterns) {
    for (const match of text.matchAll(pattern)) {
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(currentPath), match[1]));
      if (!resolved.startsWith('scripts/')) fail(`dependency escaped scripts/: ${currentPath} -> ${match[1]}`);
      executable.add(resolved);
    }
  }
  for (const match of text.matchAll(/['"]((?:coordination|apps|services)\/[A-Za-z0-9_./-]+\.(?:json|ya?ml))['"]/g)) {
    semantic.add(match[1]);
  }
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
  'coordination/kidults/audit/pre-partner-adversarial-fixtures-v2.json',
  'coordination/kidults/audit/unified-audit-control-plane-v1.json',
  'coordination/kidults/kpmo/epistemic-causal-integrity-controls-v1.json'
];
for (const expected of mandatoryDiscoveries) {
  if (!closure.has(expected)) fail(`closure missed mandatory trust dependency ${expected}`);
}

const dynamicMutationProbe = executableRefsFromJson(JSON.stringify({ nested: { validator: 'scripts/probe-dynamic.mjs' } }), 'dynamic probe');
if (!dynamicMutationProbe.has('scripts/probe-dynamic.mjs')) fail('dynamic-ref mutation probe failed');

const dependencyMutationProbe = repositoryDependencyRefs([
  "run('scripts/probe-child.mjs')",
  "import helper from './probe-helper.js';",
  "const fixture = 'coordination/kidults/audit/pre-partner-adversarial-fixtures-v2.json';",
  "const causal = path.join(root, 'coordination', 'kidults', 'kpmo', 'epistemic-causal-integrity-controls-v1.json');"
].join('\n'), 'scripts/kidults/kpmo/probe-parent.mjs');
for (const expected of ['scripts/probe-child.mjs', 'scripts/kidults/kpmo/probe-helper.js']) {
  if (!dependencyMutationProbe.executable.has(expected)) fail(`transitive executable mutation probe missed ${expected}`);
}
for (const expected of ['coordination/kidults/audit/pre-partner-adversarial-fixtures-v2.json', 'coordination/kidults/kpmo/epistemic-causal-integrity-controls-v1.json']) {
  if (!dependencyMutationProbe.semantic.has(expected)) fail(`semantic dependency mutation probe missed ${expected}`);
}

console.log(JSON.stringify({
  suite: 'KIDULTS_TRUSTED_CONTROL_DEPENDENCY_CLOSURE_SELFTEST_V1',
  result: 'PASS',
  literal_seed_refs: literalRefs.size,
  dynamic_seed_refs: dynamicRefs.size,
  seed_refs: seedRefs.size,
  transitive_executable_refs: executableClosure.size,
  semantic_control_refs: semanticClosure.size,
  total_trust_dependency_refs: closure.size,
  mandatory_discoveries_proven: mandatoryDiscoveries.length,
  mutation_probes: 5,
  empirical_gate_effect: 'NONE',
  external_partner_ingestion: 'HOLD',
  production: 'HOLD',
  public: 'HOLD',
  g5: 'EXPLICIT_APPROVAL_REQUIRED'
}, null, 2));
