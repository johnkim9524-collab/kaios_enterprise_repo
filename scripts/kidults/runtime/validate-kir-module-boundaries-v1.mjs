#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const POLICY_FILE = 'coordination/kidults/runtime/kir-modular-architecture-v1.json';
const INTERNAL_ROOT = 'scripts/kidults/runtime/kir';
const fail = code => { throw new Error(code); };
const req = (value, code) => { if (!value) fail(code); };
const stable = value => JSON.stringify([...value].sort());
const importPattern = /\b(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g;

function imports(source) {
  return [...source.matchAll(importPattern)].map(match => match[1]);
}

function nonemptyLines(source) {
  return source.split(/\r?\n/).filter(line => line.trim()).length;
}

function resolveImport(sourceFile, specifier) {
  if (!specifier.startsWith('.')) return null;
  return path.relative(ROOT, path.resolve(ROOT, path.dirname(sourceFile), specifier)).replaceAll('\\', '/');
}

export function validateKirModuleArchitecture({ policy, sources }) {
  req(policy?.id === 'kidults-kir-modular-architecture-v1' && policy?.version === '1.0.0', 'KIR_ARCH_POLICY_ID');
  req(Array.isArray(policy.modules) && policy.modules.length > 1, 'KIR_ARCH_MODULES');
  const byId = new Map();
  const byFile = new Map();
  for (const module of policy.modules) {
    req(typeof module?.id === 'string' && module.id, 'KIR_ARCH_MODULE_ID');
    req(typeof module?.file === 'string' && module.file.startsWith(`${INTERNAL_ROOT}/`), `KIR_ARCH_MODULE_FILE:${module.id}`);
    req(!byId.has(module.id) && !byFile.has(module.file), `KIR_ARCH_MODULE_DUPLICATE:${module.id}`);
    req(Array.isArray(module.dependencies) && Array.isArray(module.external_imports), `KIR_ARCH_DEPENDENCY_SCHEMA:${module.id}`);
    req(Number.isSafeInteger(module.max_nonempty_lines) && module.max_nonempty_lines > 0, `KIR_ARCH_SIZE_LIMIT:${module.id}`);
    req(typeof sources[module.file] === 'string', `KIR_ARCH_SOURCE_MISSING:${module.id}`);
    byId.set(module.id, module);
    byFile.set(module.file, module);
  }
  for (const module of policy.modules) {
    const source = sources[module.file];
    req(nonemptyLines(source) <= module.max_nonempty_lines, `KIR_ARCH_MODULE_TOO_LARGE:${module.id}`);
    req(!/\b(?:process\.|console\.|writeFileSync\s*\()/.test(source), `KIR_ARCH_MODULE_SIDE_EFFECT:${module.id}`);
    const actualInternal = [];
    const actualExternal = [];
    for (const specifier of imports(source)) {
      if (specifier.startsWith('node:')) continue;
      const resolved = resolveImport(module.file, specifier);
      const dependency = byFile.get(resolved);
      if (dependency) actualInternal.push(dependency.id);
      else if (resolved) actualExternal.push(resolved);
      else fail(`KIR_ARCH_PACKAGE_IMPORT_FORBIDDEN:${module.id}`);
    }
    req(stable(actualInternal) === stable(module.dependencies), `KIR_ARCH_DEPENDENCY_DRIFT:${module.id}`);
    req(stable(actualExternal) === stable(module.external_imports), `KIR_ARCH_EXTERNAL_IMPORT_DRIFT:${module.id}`);
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
    if (file === policy.public_entrypoint || file.startsWith(`${INTERNAL_ROOT}/`)) continue;
    for (const specifier of imports(source)) {
      const resolved = resolveImport(file, specifier);
      req(!resolved?.startsWith(`${INTERNAL_ROOT}/`), `KIR_ARCH_PRIVATE_IMPORT_BYPASS:${file}`);
    }
  }
  const constraints = policy.constraints;
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
    production: 'HOLD',
    public: 'HOLD',
    g5: 'HOLD',
  };
}

export function loadKirModuleArchitecture() {
  const policy = JSON.parse(fs.readFileSync(path.join(ROOT, POLICY_FILE), 'utf8'));
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
  process.stdout.write(`${JSON.stringify(validateKirModuleArchitecture(loadKirModuleArchitecture()), null, 2)}\n`);
}
