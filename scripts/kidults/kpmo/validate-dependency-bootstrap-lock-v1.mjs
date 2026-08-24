import fs from 'node:fs';
import path from 'node:path';

const CONTRACT_PATH = 'coordination/kidults/kpmo/dependency-bootstrap-lock-contract-v1.json';
const WORKFLOW_DIR = '.github/workflows';
const REQUIRED_NODE_FLAGS = ['--ignore-scripts', '--no-audit', '--no-fund'];
const REQUIRED_PIP_FLAGS = ['--disable-pip-version-check', '--require-hashes', '--only-binary=:all:'];
const GOVERNED_NODE_VERSION = '24.19.0';
const GOVERNED_NPM_VERSION = '11.17.0';
const GOVERNED_PACKAGE_MANAGER = `npm@${GOVERNED_NPM_VERSION}`;
const ESTATE_NODE_VERSIONS = ['22.23.2', '24.19.0'];
const GOVERNED_PYTHON_VERSIONS = ['3.11.16', '3.12.14'];
const DOCKER_BASE_REFERENCE = 'python:3.11.16-slim-bookworm';
const DOCKER_BASE_INDEX_DIGEST = 'sha256:2e32f7d302adc1c37428355c1e646897c0c53f4fd60b6a551245fb90ee129f91';

function fail(code, detail = '') {
  throw new Error(`${code}${detail ? `: ${detail}` : ''}`);
}

function requireControl(condition, code, detail = '') {
  if (!condition) fail(code, detail);
}

function activeWorkflowText(text) {
  return text
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');
}

function decodeYamlDoubleQuoted(value) {
  return value
    .replace(/\\x([a-fA-F0-9]{2})/g, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/\\u([a-fA-F0-9]{4})/g, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/\\U([a-fA-F0-9]{8})/g, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/\\([0abtnvfre "\\/])/g, (_match, escaped) => ({
      0: '\0',
      a: '\x07',
      b: '\b',
      t: '\t',
      n: '\n',
      v: '\v',
      f: '\f',
      r: '\r',
      e: '\x1b',
      ' ': ' ',
      '"': '"',
      '\\': '\\',
      '/': '/'
    })[escaped]);
}

function yamlScalarMappings(text) {
  const mappings = [];
  const pattern = /(?:^|[,{\s])(?:"((?:\\.|[^"\n])*)"|'([^'\n]*)'|([A-Za-z0-9_-]+))[ \t]*:[ \t]*(?:"((?:\\.|[^"\n])*)"|'([^'\n]*)'|([^\s,{}\]#]+))/gm;
  for (const match of text.matchAll(pattern)) {
    const key = match[1] !== undefined
      ? decodeYamlDoubleQuoted(match[1])
      : (match[2] ?? match[3]);
    const value = match[4] !== undefined
      ? decodeYamlDoubleQuoted(match[4])
      : (match[5] ?? match[6]);
    mappings.push({ key, value });
  }
  return mappings;
}

function dependencyMap(manifest) {
  return {
    ...(manifest.dependencies || {}),
    ...(manifest.devDependencies || {}),
    ...(manifest.optionalDependencies || {})
  };
}

function validateNpmLock(lockPath, manifestPath, expectedPackageManager, read) {
  const lock = JSON.parse(read(lockPath));
  const manifest = JSON.parse(read(manifestPath));
  requireControl(lock.lockfileVersion === 3, 'NPM_LOCKFILE_VERSION_NOT_3', lockPath);
  requireControl(lock.packages && typeof lock.packages === 'object', 'NPM_PACKAGES_MAP_MISSING', lockPath);
  const root = lock.packages[''] || {};
  requireControl(manifest.packageManager === expectedPackageManager, 'NPM_PACKAGE_MANAGER_CONTRACT_DRIFT', manifestPath);
  requireControl(root.packageManager === expectedPackageManager, 'NPM_LOCK_ROOT_PACKAGE_MANAGER_DRIFT', lockPath);
  requireControl(
    JSON.stringify(dependencyMap(root)) === JSON.stringify(dependencyMap(manifest)),
    'NPM_MANIFEST_LOCK_ROOT_DRIFT',
    lockPath
  );
  let registryEntries = 0;
  for (const [packagePath, entry] of Object.entries(lock.packages)) {
    if (!packagePath || !entry.resolved?.startsWith('https://registry.npmjs.org/')) continue;
    registryEntries += 1;
    requireControl(/^sha512-[A-Za-z0-9+/]+=*$/.test(entry.integrity || ''), 'NPM_REGISTRY_INTEGRITY_MISSING', `${lockPath}:${packagePath}`);
    requireControl(typeof entry.version === 'string' && entry.version.length > 0, 'NPM_RESOLVED_VERSION_MISSING', `${lockPath}:${packagePath}`);
  }
  requireControl(registryEntries > 0, 'NPM_REGISTRY_ENTRY_SET_EMPTY', lockPath);
  return registryEntries;
}

function parseHashedPythonLock(text, { allowEmpty = false } = {}) {
  const logical = [];
  let current = '';
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    current += `${current ? ' ' : ''}${line.replace(/\\$/, '').trim()}`;
    if (!line.endsWith('\\')) {
      logical.push(current);
      current = '';
    }
  }
  requireControl(current === '', 'PYTHON_LOCK_DANGLING_CONTINUATION');
  requireControl(allowEmpty || logical.length > 0, 'PYTHON_LOCK_EMPTY');
  const names = new Set();
  for (const requirement of logical) {
    const match = requirement.match(/^([A-Za-z0-9_.-]+)==([^\s;]+)(?:\s|$)/);
    requireControl(Boolean(match), 'PYTHON_REQUIREMENT_NOT_EXACT', requirement);
    requireControl(/--hash=sha256:[a-f0-9]{64}(?:\s|$)/.test(requirement), 'PYTHON_REQUIREMENT_HASH_MISSING', match?.[1] || requirement);
    names.add(match[1].toLowerCase().replaceAll('_', '-'));
  }
  if (!allowEmpty) {
    for (const direct of ['pytest', 'jsonschema']) {
      requireControl(names.has(direct), 'PYTHON_DIRECT_REQUIREMENT_MISSING_FROM_LOCK', direct);
    }
  }
  return logical.length;
}

function foldYamlRunCommands(text) {
  const lines = text.split('\n');
  const output = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const folded = line.match(/^(\s*(?:-\s+)?run:)\s*>[-+]?\s*$/);
    if (!folded) {
      output.push(line);
      continue;
    }
    const baseIndent = line.match(/^\s*/)[0].length;
    const parts = [];
    while (index + 1 < lines.length) {
      const next = lines[index + 1];
      if (!next.trim()) {
        index += 1;
        continue;
      }
      const indent = next.match(/^\s*/)[0].length;
      if (indent <= baseIndent) break;
      parts.push(next.trim());
      index += 1;
    }
    output.push(`${folded[1]} ${parts.join(' ')}`);
  }
  return output.join('\n');
}

function logicalShellCommands(text) {
  const folded = foldYamlRunCommands(text);
  const continued = folded.replace(/\\\r?\n[ \t]*/g, ' ');
  const commands = [];
  let current = '';
  let quote = '';
  let escaped = false;
  for (let index = 0; index < continued.length; index += 1) {
    const char = continued[index];
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === '\\' && quote !== "'") {
      current += char;
      escaped = true;
      continue;
    }
    if (quote) {
      current += char;
      if (char === quote) quote = '';
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }
    const two = continued.slice(index, index + 2);
    if (char === '\n' || char === ';' || char === '|' || char === '&') {
      if (current.trim()) commands.push(current.trim());
      current = '';
      if (two === '&&' || two === '||') index += 1;
      continue;
    }
    current += char;
  }
  if (current.trim()) commands.push(current.trim());
  return commands;
}

export function validateDependencyBootstrapEstate(snapshot) {
  const contract = JSON.parse(snapshot.contract);
  requireControl(contract.id === 'kidults-dependency-bootstrap-lock-contract-v1', 'CONTRACT_ID_DRIFT');
  requireControl(contract.version === '1.1.0', 'CONTRACT_VERSION_DRIFT');
  requireControl(contract.status === 'ACTIVE_FAIL_CLOSED', 'CONTRACT_NOT_ACTIVE_FAIL_CLOSED');
  requireControl(contract.governing_issue === 976, 'GOVERNING_ISSUE_DRIFT');
  requireControl(contract.node.governed_runtimes.service_and_root.node === GOVERNED_NODE_VERSION, 'CONTRACT_NODE_VERSION_DRIFT');
  requireControl(contract.node.governed_runtimes.service_and_root.npm === GOVERNED_NPM_VERSION, 'CONTRACT_NPM_VERSION_DRIFT');
  requireControl(contract.node.governed_runtimes.browser_qa_tooling.node === GOVERNED_NODE_VERSION, 'CONTRACT_BROWSER_NODE_VERSION_DRIFT');
  requireControl(contract.node.governed_runtimes.browser_qa_tooling.npm === GOVERNED_NPM_VERSION, 'CONTRACT_BROWSER_NPM_VERSION_DRIFT');
  requireControl(contract.node.node_20_governed_install_lanes_allowed === false, 'CONTRACT_NODE_20_GOVERNED_ALLOWANCE_DRIFT');
  requireControl(contract.node.node_20_active_workflows_allowed === false, 'CONTRACT_NODE_20_ESTATE_ALLOWANCE_DRIFT');
  requireControl(contract.node.estate_runtimes.node_22.node === '22.23.2', 'CONTRACT_ESTATE_NODE_22_VERSION_DRIFT');
  requireControl(contract.node.estate_runtimes.node_24.node === '24.19.0', 'CONTRACT_ESTATE_NODE_24_VERSION_DRIFT');
  requireControl(contract.python.governed_versions.ci_primary === '3.11.16', 'CONTRACT_PYTHON_CI_VERSION_DRIFT');
  requireControl(contract.python.governed_versions.release_and_contract === '3.12.14', 'CONTRACT_PYTHON_RELEASE_VERSION_DRIFT');
  requireControl(contract.python.ci_install_lock === 'requirements-ci.lock.txt', 'CONTRACT_PYTHON_CI_LOCK_DRIFT');
  requireControl(contract.python.runtime_install_lock === 'requirements-runtime.lock.txt', 'CONTRACT_PYTHON_RUNTIME_LOCK_DRIFT');
  requireControl(contract.python.runtime_dependency_state === 'STDLIB_ONLY_EMPTY_LOCK', 'CONTRACT_PYTHON_RUNTIME_STATE_DRIFT');
  requireControl(contract.container.base_reference === DOCKER_BASE_REFERENCE, 'CONTRACT_DOCKER_EXACT_TAG_DRIFT');
  requireControl(contract.container.base_index_digest === DOCKER_BASE_INDEX_DIGEST, 'CONTRACT_DOCKER_INDEX_DIGEST_DRIFT');
  requireControl(
    contract.container.digest_kind === 'MULTI_PLATFORM_INDEX_DIGEST_NOT_PLATFORM_MANIFEST_DIGEST',
    'CONTRACT_DOCKER_DIGEST_KIND_DRIFT'
  );

  let npmCiCount = 0;
  let pipInstallCount = 0;
  const governedNodeVersions = {};
  const allNodeVersions = [];
  const governedPythonVersions = {};
  const allPythonVersions = [];
  let setupNodeCount = 0;
  let setupPythonCount = 0;
  for (const [workflowPath, raw] of Object.entries(snapshot.workflows)) {
    const text = activeWorkflowText(raw);
    requireControl(!/(^|[\s;&|])npm\s+install\b/m.test(text), 'MUTABLE_NPM_INSTALL_FORBIDDEN', workflowPath);
    requireControl(!/(^|[\s;&|])npm\s+init\b/m.test(text), 'RUNTIME_NPM_INIT_FORBIDDEN', workflowPath);
    requireControl(!/(^|[\s;&|])npx\b/m.test(text), 'NPX_RUNTIME_RESOLUTION_FORBIDDEN', workflowPath);
    const runtimeMappings = yamlScalarMappings(text);
    const nodeVersions = runtimeMappings.filter(({ key }) => key === 'node-version').map(({ value }) => value);
    const pythonVersions = runtimeMappings.filter(({ key }) => key === 'python-version').map(({ value }) => value);
    const workflowSetupNodeCount = (text.match(/uses:[ \t]*actions\/setup-node@[^\s#]+/g) || []).length;
    const workflowSetupPythonCount = (text.match(/uses:[ \t]*actions\/setup-python@[^\s#]+/g) || []).length;
    setupNodeCount += workflowSetupNodeCount;
    setupPythonCount += workflowSetupPythonCount;
    requireControl(nodeVersions.length === workflowSetupNodeCount, 'ESTATE_SETUP_NODE_VERSION_BINDING_DRIFT', workflowPath);
    requireControl(pythonVersions.length === workflowSetupPythonCount, 'ESTATE_SETUP_PYTHON_VERSION_BINDING_DRIFT', workflowPath);
    allNodeVersions.push(...nodeVersions);
    allPythonVersions.push(...pythonVersions);
    for (const version of nodeVersions) {
      requireControl(ESTATE_NODE_VERSIONS.includes(version), 'ESTATE_NODE_VERSION_ALIAS_OR_UNAPPROVED', `${workflowPath}:${version}`);
    }
    for (const version of pythonVersions) {
      requireControl(GOVERNED_PYTHON_VERSIONS.includes(version), 'ESTATE_PYTHON_VERSION_ALIAS_OR_UNAPPROVED', `${workflowPath}:${version}`);
    }
    const commands = logicalShellCommands(text);
    const npmCommands = commands.filter((command) => /(^|\s)npm\s+ci\b/.test(command));
    const pipCommands = commands.filter((command) => /(?:python(?:3)?\s+-m\s+pip|pip3?)\s+install\b/.test(command));
    if (npmCommands.length) {
      requireControl(nodeVersions.length > 0, 'GOVERNED_NODE_VERSION_MISSING', workflowPath);
      for (const version of nodeVersions) {
        requireControl(version === GOVERNED_NODE_VERSION, 'GOVERNED_NODE_VERSION_ALIAS_OR_UNAPPROVED', `${workflowPath}:${version}`);
        governedNodeVersions[version] = (governedNodeVersions[version] || 0) + 1;
      }
    }
    if (pipCommands.length) {
      requireControl(pythonVersions.length > 0, 'GOVERNED_PYTHON_VERSION_MISSING', workflowPath);
      for (const version of pythonVersions) {
        requireControl(GOVERNED_PYTHON_VERSIONS.includes(version), 'GOVERNED_PYTHON_VERSION_ALIAS_OR_UNAPPROVED', `${workflowPath}:${version}`);
        governedPythonVersions[version] = (governedPythonVersions[version] || 0) + 1;
      }
    }
    for (const command of npmCommands) {
      npmCiCount += 1;
      for (const flag of REQUIRED_NODE_FLAGS) {
        requireControl(command.includes(flag), 'NPM_CI_HARDENING_FLAG_MISSING', `${workflowPath}:${flag}`);
      }
    }
    for (const command of pipCommands) {
      pipInstallCount += 1;
      requireControl(!/pip\s+install\s+--upgrade\s+pip/.test(command), 'PIP_SELF_UPGRADE_FORBIDDEN', workflowPath);
      for (const flag of REQUIRED_PIP_FLAGS) {
        requireControl(command.includes(flag), 'PIP_HASH_ENFORCEMENT_FLAG_MISSING', `${workflowPath}:${flag}`);
      }
    }
  }
  requireControl(npmCiCount > 0, 'NPM_CI_ESTATE_EMPTY');
  requireControl(pipInstallCount > 0, 'PIP_INSTALL_ESTATE_EMPTY');

  const read = (file) => {
    requireControl(Object.hasOwn(snapshot.files, file), 'GOVERNED_FILE_MISSING', file);
    return snapshot.files[file];
  };
  const lockBindings = [
    ['npm-shrinkwrap.json', 'package.json', GOVERNED_PACKAGE_MANAGER],
    ['services/kidults-autonomous-intelligence/package-lock.json', 'services/kidults-autonomous-intelligence/package.json', GOVERNED_PACKAGE_MANAGER],
    ['tooling/kidults-portal-r001-browser-qa/package-lock.json', 'tooling/kidults-portal-r001-browser-qa/package.json', GOVERNED_PACKAGE_MANAGER]
  ];
  let npmRegistryEntries = 0;
  for (const [lockPath, manifestPath, packageManager] of lockBindings) npmRegistryEntries += validateNpmLock(lockPath, manifestPath, packageManager, read);

  const pythonRequirementCount = parseHashedPythonLock(read('requirements-ci.lock.txt'));
  requireControl(/pytest>=8\.0\.0/.test(read('requirements-ci.in')), 'PYTHON_CI_INPUT_PYTEST_MISSING');
  requireControl(/jsonschema==4\.26\.0/.test(read('requirements-ci.in')), 'PYTHON_CI_INPUT_JSONSCHEMA_MISSING');
  requireControl(
    read('requirements-runtime.in').split('\n').every((line) => !line.trim() || line.trim().startsWith('#')),
    'PYTHON_RUNTIME_INPUT_NOT_STDLIB_ONLY'
  );
  const runtimeRequirementCount = parseHashedPythonLock(read('requirements-runtime.lock.txt'), { allowEmpty: true });
  requireControl(runtimeRequirementCount === 0, 'PYTHON_RUNTIME_LOCK_NOT_EMPTY');
  const dockerfile = read('Dockerfile');
  const expectedFrom = `FROM ${DOCKER_BASE_REFERENCE}@${DOCKER_BASE_INDEX_DIGEST} AS runtime`;
  requireControl(dockerfile.split('\n')[0] === expectedFrom, 'DOCKER_BASE_DIGEST_DRIFT');
  requireControl(!/^FROM\s+[^\s@]+(?::[^\s@]+)?\s/m.test(dockerfile), 'MUTABLE_DOCKER_BASE_FORBIDDEN');
  requireControl(dockerfile.includes('COPY requirements-runtime.lock.txt pyproject.toml ./'), 'DOCKER_RUNTIME_PYTHON_LOCK_COPY_MISSING');
  requireControl(!dockerfile.includes('requirements-ci.lock.txt'), 'DOCKER_CI_TEST_LOCK_FORBIDDEN');
  const dockerPipCommands = logicalShellCommands(dockerfile).filter((command) => /python\s+-m\s+pip\s+install\b/.test(command));
  requireControl(dockerPipCommands.length === 1, 'DOCKER_PIP_INSTALL_COUNT_DRIFT');
  for (const flag of REQUIRED_PIP_FLAGS) requireControl(dockerPipCommands[0].includes(flag), 'DOCKER_PIP_HASH_FLAG_MISSING', flag);
  requireControl(dockerPipCommands[0].includes('-r requirements-runtime.lock.txt'), 'DOCKER_RUNTIME_PYTHON_LOCK_INSTALL_MISSING');
  requireControl(!/pip\s+install\s+--upgrade\s+pip/.test(dockerfile), 'DOCKER_PIP_SELF_UPGRADE_FORBIDDEN');

  requireControl(contract.truth_boundary.production === 'HOLD', 'PRODUCTION_HOLD_DRIFT');
  requireControl(contract.truth_boundary.public === 'HOLD', 'PUBLIC_HOLD_DRIFT');
  requireControl(contract.truth_boundary.g5 === 'EXPLICIT_APPROVAL_REQUIRED', 'G5_BOUNDARY_DRIFT');
  requireControl(contract.truth_boundary.empirical_gate_effect === 'NONE', 'EMPIRICAL_GATE_EFFECT_DRIFT');

  const remainingNodeAliasVersions = allNodeVersions
    .filter((version) => !ESTATE_NODE_VERSIONS.includes(version))
    .reduce((counts, version) => ({ ...counts, [version]: (counts[version] || 0) + 1 }), {});
  const remainingPythonAliasVersions = allPythonVersions
    .filter((version) => !GOVERNED_PYTHON_VERSIONS.includes(version))
    .reduce((counts, version) => ({ ...counts, [version]: (counts[version] || 0) + 1 }), {});
  return {
    npmCiCount,
    pipInstallCount,
    npmRegistryEntries,
    pythonRequirementCount,
    runtimeRequirementCount,
    governedNodeVersions,
    governedPythonVersions,
    setupNodeCount,
    setupPythonCount,
    estateNodeVersions: allNodeVersions.reduce((counts, version) => ({ ...counts, [version]: (counts[version] || 0) + 1 }), {}),
    estatePythonVersions: allPythonVersions.reduce((counts, version) => ({ ...counts, [version]: (counts[version] || 0) + 1 }), {}),
    remainingNodeVersionAliases: Object.values(remainingNodeAliasVersions).reduce((sum, count) => sum + count, 0),
    remainingNodeAliasVersions,
    remainingPythonVersionAliases: Object.values(remainingPythonAliasVersions).reduce((sum, count) => sum + count, 0),
    remainingPythonAliasVersions
  };
}

function loadSnapshot() {
  const workflows = {};
  for (const name of fs.readdirSync(WORKFLOW_DIR).filter((name) => /\.ya?ml$/.test(name)).sort()) {
    const file = path.posix.join(WORKFLOW_DIR, name);
    workflows[file] = fs.readFileSync(file, 'utf8');
  }
  const files = {};
  for (const file of [
    'package.json',
    'npm-shrinkwrap.json',
    'services/kidults-autonomous-intelligence/package.json',
    'services/kidults-autonomous-intelligence/package-lock.json',
    'tooling/kidults-portal-r001-browser-qa/package.json',
    'tooling/kidults-portal-r001-browser-qa/package-lock.json',
    'requirements-ci.in',
    'requirements-ci.lock.txt',
    'requirements-runtime.in',
    'requirements-runtime.lock.txt',
    'Dockerfile'
  ]) files[file] = fs.readFileSync(file, 'utf8');
  return { contract: fs.readFileSync(CONTRACT_PATH, 'utf8'), workflows, files };
}

if (process.argv[1]?.endsWith('validate-dependency-bootstrap-lock-v1.mjs')) {
  try {
    const metrics = validateDependencyBootstrapEstate(loadSnapshot());
    console.log(JSON.stringify({
      id: 'kidults-dependency-bootstrap-lock-validation-v1',
      result: 'VERIFIED_PASS',
      scope: 'ACTIVE_WORKFLOW_DEPENDENCY_AND_RUNTIME_BOOTSTRAP',
      ...metrics,
      vulnerability_acceptance: 'NOT_GRANTED_BY_PINNING',
      empirical_gate_effect: 'NONE',
      production: 'HOLD',
      public: 'HOLD',
      g5: 'EXPLICIT_APPROVAL_REQUIRED'
    }, null, 2));
  } catch (error) {
    console.error(`VERIFIED_FAIL ${error.message}`);
    process.exit(1);
  }
}
