#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const POLICY_FILES = Object.freeze([
  'coordination/kidults/runtime/kir-modular-architecture-v1.json',
  'coordination/kidults/runtime/kir-control-bridge-modular-architecture-v1.json',
]);
const POLICY_ROOTS = Object.freeze({
  'kidults-kir-modular-architecture-v1': 'scripts/kidults/runtime/kir',
  'kidults-kir-control-bridge-modular-architecture-v1': 'scripts/kidults/runtime/kir-control',
});
const fail = code => { throw new Error(code); };
const req = (value, code) => { if (!value) fail(code); };
const stable = value => JSON.stringify([...value].sort());
const importPattern = /\b(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g;
const dynamicImportPattern = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const requirePattern = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const unresolvedDynamicImportPattern = /\bimport\s*\(/;
const unresolvedRequirePattern = /\brequire\s*\(/;
const networkCallPattern = /(?:\bfetch|(?:globalThis|window|self)\s*(?:\.\s*fetch|\[\s*['"]fetch['"]\s*\]))\s*\(/;

function imports(source) {
  return [importPattern, dynamicImportPattern, requirePattern]
    .flatMap(pattern => [...source.matchAll(pattern)].map(match => match[1]));
}

function nonemptyLines(source) {
  return source.split(/\r?\n/).filter(line => line.trim()).length;
}

function resolveImport(sourceFile, specifier) {
  if (!specifier.startsWith('.')) return null;
  return path.relative(ROOT, path.resolve(ROOT, path.dirname(sourceFile), specifier)).replaceAll('\\', '/');
}

export function validateKirModuleArchitecture({ policy, sources }) {
  const internalRoot = POLICY_ROOTS[policy?.id];
  req(internalRoot && policy?.version === '1.0.0' && policy?.internal_root === internalRoot,
    'KIR_ARCH_POLICY_ID');
  req(Array.isArray(policy.modules) && policy.modules.length > 1, 'KIR_ARCH_MODULES');
  const byId = new Map();
  const byFile = new Map();
  for (const module of policy.modules) {
    req(typeof module?.id === 'string' && module.id, 'KIR_ARCH_MODULE_ID');
    req(typeof module?.file === 'string' && module.file.startsWith(`${internalRoot}/`),
      `KIR_ARCH_MODULE_FILE:${module.id}`);
    req(!byId.has(module.id) && !byFile.has(module.file), `KIR_ARCH_MODULE_DUPLICATE:${module.id}`);
    req(Array.isArray(module.dependencies) && Array.isArray(module.external_imports)
      && Array.isArray(module.builtin_imports), `KIR_ARCH_DEPENDENCY_SCHEMA:${module.id}`);
    req(Number.isSafeInteger(module.max_nonempty_lines) && module.max_nonempty_lines > 0, `KIR_ARCH_SIZE_LIMIT:${module.id}`);
    req(typeof sources[module.file] === 'string', `KIR_ARCH_SOURCE_MISSING:${module.id}`);
    byId.set(module.id, module);
    byFile.set(module.file, module);
  }
  const bridgePolicy = policy.id === 'kidults-kir-control-bridge-modular-architecture-v1';
  if (bridgePolicy) {
    const executor = byId.get('executor');
    const composition = byId.get('composition');
    const kirAdapter = byId.get('kir-adapter');
    const currentSoldAdapter = byId.get('current-sold-adapter');
    req(executor && stable(executor.external_imports) === '[]' && executor.dependencies.includes('ports'),
      'KIR_ARCH_PORT_CONTRACT');
    req(composition && stable(composition.dependencies) === stable(['current-sold-adapter', 'executor', 'kir-adapter'])
      && stable(composition.external_imports) === '[]', 'KIR_ARCH_COMPOSITION_ROOT');
    req(kirAdapter && kirAdapter.dependencies.length === 0
      && stable(kirAdapter.external_imports) === stable(['scripts/kidults/runtime/kir-runtime-kernel-v1.mjs']),
    'KIR_ARCH_KIR_ADAPTER_BOUNDARY');
    req(currentSoldAdapter && currentSoldAdapter.dependencies.length === 0
      && currentSoldAdapter.external_imports.length === 3
      && currentSoldAdapter.external_imports.every(file => file.startsWith('scripts/kidults/market/current-sold-')),
    'KIR_ARCH_CURRENT_SOLD_ADAPTER_BOUNDARY');
    for (const module of policy.modules) {
      if (!['kir-adapter', 'current-sold-adapter'].includes(module.id)) {
        req(module.external_imports.length === 0, `KIR_ARCH_CROSS_DOMAIN_IMPORT:${module.id}`);
      }
    }
  }
  for (const module of policy.modules) {
    const source = sources[module.file];
    req(nonemptyLines(source) <= module.max_nonempty_lines, `KIR_ARCH_MODULE_TOO_LARGE:${module.id}`);
    req(!/\b(?:process\.|console\.|writeFileSync\s*\()/.test(source) && !networkCallPattern.test(source),
      `KIR_ARCH_MODULE_SIDE_EFFECT:${module.id}`);
    req(!unresolvedDynamicImportPattern.test(source) && !unresolvedRequirePattern.test(source),
      `KIR_ARCH_UNRESOLVED_IMPORT:${module.id}`);
    const actualInternal = [];
    const actualExternal = [];
    const actualBuiltins = [];
    for (const specifier of imports(source)) {
      if (specifier.startsWith('node:')) {
        actualBuiltins.push(specifier);
        continue;
      }
      const resolved = resolveImport(module.file, specifier);
      const dependency = byFile.get(resolved);
      if (dependency) actualInternal.push(dependency.id);
      else if (resolved) actualExternal.push(resolved);
      else fail(`KIR_ARCH_PACKAGE_IMPORT_FORBIDDEN:${module.id}`);
    }
    req(stable(actualInternal) === stable(module.dependencies), `KIR_ARCH_DEPENDENCY_DRIFT:${module.id}`);
    req(stable(actualExternal) === stable(module.external_imports), `KIR_ARCH_EXTERNAL_IMPORT_DRIFT:${module.id}`);
    req(stable(actualBuiltins) === stable(module.builtin_imports), `KIR_ARCH_BUILTIN_IMPORT_DRIFT:${module.id}`);
  }

  const visiting = new Set();
  const visited = new Set();
  const visit = id => {
    if (visited.has(id)) return;
    req(!visiting.has(id), `KIR_ARCH_DEPENDENCY_CYCLE:${id}`);
    const module = byId.get(id);
    req(module, `KIR_ARCH_DEPENDENCY_UNKNOWN:${id}`);
    visiting.add(id);
    for (const dependency of module.dependencies) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of byId.keys()) visit(id);

  const entrypoint = sources[policy.public_entrypoint];
  req(typeof entrypoint === 'string', 'KIR_ARCH_ENTRYPOINT_MISSING');
  req(nonemptyLines(entrypoint) <= policy.public_entrypoint_max_nonempty_lines, 'KIR_ARCH_ENTRYPOINT_TOO_LARGE');
  const publicDependencies = imports(entrypoint)
    .map(specifier => resolveImport(policy.public_entrypoint, specifier))
    .map(file => byFile.get(file)?.id)
    .filter(Boolean);
  req(stable(publicDependencies) === stable(policy.public_entrypoint_internal_dependencies), 'KIR_ARCH_ENTRYPOINT_DEPENDENCY_DRIFT');

  for (const [file, source] of Object.entries(sources)) {
    if (file === policy.public_entrypoint || file.startsWith(`${internalRoot}/`)) continue;
    for (const specifier of imports(source)) {
      const resolved = resolveImport(file, specifier);
      req(!resolved?.startsWith(`${internalRoot}/`), `KIR_ARCH_PRIVATE_IMPORT_BYPASS:${file}`);
    }
  }
  const constraints = policy.constraints;
  const psaAuthority = policy.psa_recovery_authority;
  if (policy.id === 'kidults-kir-modular-architecture-v1') {
    req(psaAuthority?.provider_execution === 'DISABLED'
      && psaAuthority?.state_engine === 'scripts/kidults/runtime/kir/state-machine-v1.mjs'
      && psaAuthority?.runtime === policy.public_entrypoint
      && psaAuthority?.controller === 'scripts/kidults/runtime/kir/evaluator-v1.mjs'
      && psaAuthority?.receipt === 'scripts/kidults/runtime/kir/evaluator-v1.mjs'
      && psaAuthority?.truth === 'scripts/kidults/runtime/kir/snapshot-v1.mjs'
      && psaAuthority?.workflow === '.github/workflows/kidults-psa-live-execution-control-v1.yml'
      && psaAuthority?.adapter === 'services/kidults-control-plane/src/psa-cert-verification-adapter.mjs'
      && psaAuthority?.projection_role === 'READ_ONLY'
      && psaAuthority?.automatic_provider_dispatch === false,
    'KIR_ARCH_PSA_SINGLE_AUTHORITY_DRIFT');
  }
  req(constraints?.dependency_cycles_allowed === false, 'KIR_ARCH_CYCLE_POLICY');
  req(constraints?.internal_imports_outside_public_entrypoint_allowed === false, 'KIR_ARCH_PRIVATE_IMPORT_POLICY');
  req(constraints?.module_cli_or_process_side_effects_allowed === false, 'KIR_ARCH_SIDE_EFFECT_POLICY');
  req(constraints?.provider_calls_allowed === false && constraints?.database_writes_allowed === false
    && constraints?.deployment_allowed === false, 'KIR_ARCH_AUTHORITY_POLICY');
  req(constraints?.public_release === 'HOLD' && constraints?.production === 'HOLD'
    && constraints?.g5 === 'HOLD', 'KIR_ARCH_RELEASE_HOLD');
  return {
    id: 'kidults-kir-module-boundary-validation-v1',
    state: 'VERIFIED_PASS',
    module_count: byId.size,
    dependency_cycle: false,
    private_import_bypass: false,
    provider_authority: false,
    database_authority: false,
    ...(bridgePolicy ? { port_contract: true, adapter_isolation: true } : {}),
    production: 'HOLD',
    public: 'HOLD',
    g5: 'HOLD',
  };
}

export function loadKirModuleArchitecture() {
  return loadArchitecturePolicy(POLICY_FILES[0]);
}

export function loadKirControlBridgeArchitecture() {
  return loadArchitecturePolicy(POLICY_FILES[1]);
}

function loadArchitecturePolicy(policyFile) {
  const policy = JSON.parse(fs.readFileSync(path.join(ROOT, policyFile), 'utf8'));
  const sources = {};
  for (const file of [policy.public_entrypoint, ...policy.modules.map(module => module.file)]) {
    sources[file] = fs.readFileSync(path.join(ROOT, file), 'utf8');
  }
  const scan = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) scan(absolute);
      if (entry.isFile() && /\.(?:mjs|js)$/.test(entry.name)) {
        const file = path.relative(ROOT, absolute).replaceAll('\\', '/');
        if (!(file in sources)) sources[file] = fs.readFileSync(absolute, 'utf8');
      }
    }
  };
  for (const root of ['scripts', 'services', 'packages', 'apps', 'tests']) {
    const directory = path.join(ROOT, root);
    if (fs.existsSync(directory)) scan(directory);
  }
  return { policy, sources };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const validations = [loadKirModuleArchitecture(), loadKirControlBridgeArchitecture()]
    .map(validateKirModuleArchitecture);
  process.stdout.write(`${JSON.stringify({
    id: 'kidults-kir-module-boundary-suite-v1',
    state: 'VERIFIED_PASS',
    architecture_count: validations.length,
    module_count: validations.reduce((total, validation) => total + validation.module_count, 0),
    validations,
    provider_authority: false,
    database_authority: false,
    production: 'HOLD',
    public: 'HOLD',
    g5: 'HOLD',
  }, null, 2)}\n`);
}
