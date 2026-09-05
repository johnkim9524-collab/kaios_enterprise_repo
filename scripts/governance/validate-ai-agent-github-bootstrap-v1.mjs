#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const root = process.cwd();
const staticOnly = process.argv.slice(2).includes('--static-only');
if (process.argv.slice(2).some((arg) => arg !== '--static-only')) throw new Error('UNKNOWN_ARGUMENT');

const paths = {
  contract: 'coordination/kidults/governance/ai-agent-github-bootstrap-contract-v1.json',
  entrypoint: 'scripts/governance/bootstrap-ai-agent-from-github-v1.mjs',
  verifier: 'scripts/governance/verify-ai-agent-bootstrap-receipt-v1.mjs',
  validator: 'scripts/governance/validate-ai-agent-github-bootstrap-v1.mjs',
  agents: 'AGENTS.md',
  policy: '.github/AI_AGENT_OPERATING_RULES.md',
  copilot: '.github/copilot-instructions.md',
  trackBootstrap: 'coordination/kidults/bootstrap/README.md',
  trackE: 'coordination/kidults/bootstrap/TRACK_E_EXECUTIVE_OS_BOOTSTRAP.md',
  platform: 'coordination/kidults/kpmo/operating-principles-and-resilience-controls-v1.json',
  operatingContract: 'coordination/kidults/governance/ai-agent-operating-rules-v1.json',
  remediationContract: 'coordination/kidults/governance/ai-agent-bootstrap-remediation-sequence-v1.json',
  reportAfterGate: 'coordination/kidults/governance/ai-agent-report-after-remediation-gate-v1.json',
  statusSchema: 'coordination/kidults/governance/ai-agent-status-receipt-schema-v1.json',
  registry: 'coordination/kidults/registry/ai-agent-governance-registry-v1.json',
  generalCi: '.github/workflows/ci-validation.yml',
  governanceCi: '.github/workflows/ai-agent-governance-enforcement-v1.yml',
  remediationCi: '.github/workflows/ai-agent-bootstrap-remediation-enforcement-v1.yml',
  package: 'package.json'
};

const governedClasses = [
  'KPMO', 'TRACK_A', 'TRACK_B', 'TRACK_C', 'TRACK_D', 'TRACK_E', 'RED_TEAM', 'ASI',
  'CODING_AGENTS', 'REVIEW_AGENTS', 'TEST_AGENTS', 'RELEASE_AGENTS',
  'DOCUMENTATION_AGENTS', 'DISCOVERY_AGENTS', 'EVIDENCE_AGENTS', 'GRAPH_AGENTS',
  'PROVIDER_AGENTS', 'RUNTIME_AGENTS', 'SCHEDULED_AGENT_AUTOMATIONS', 'EXTERNAL_MODEL_AGENTS'
];
const acceptedOrigins = [
  'https://github.com/johnkim9524-collab/kaios_enterprise_repo.git',
  'https://github.com/johnkim9524-collab/kaios_enterprise_repo'
];
const requiredDocuments = [
  [paths.contract, 'GITHUB_SOURCE_BOOTSTRAP_TRUST_ANCHOR'],
  [paths.package, 'BOOTSTRAP_PACKAGE_COMMAND'],
  [paths.agents, 'ROOT_REPOSITORY_INSTRUCTIONS'],
  [paths.policy, 'HUMAN_READABLE_AI_POLICY'],
  [paths.platform, 'PLATFORM_CONSTITUTION'],
  [paths.operatingContract, 'AI_MACHINE_CONTRACT'],
  [paths.remediationContract, 'FIX_FIRST_BOOTSTRAP_SEQUENCE'],
  [paths.reportAfterGate, 'REPORT_AFTER_REMEDIATION_GATE'],
  [paths.statusSchema, 'CANONICAL_STATUS_RECEIPT_SCHEMA'],
  [paths.registry, 'GOVERNANCE_SYSTEM_OF_RECORD'],
  [paths.trackBootstrap, 'TRACK_AND_ROLE_STARTUP_ROUTER'],
  [paths.copilot, 'GITHUB_AGENT_ADAPTER']
].map(([documentPath, purpose], index) => ({ order: index + 1, path: documentPath, purpose }));
const mandatoryPhases = [
  'DISCOVER_REPOSITORY_ROOT',
  'VERIFY_CANONICAL_GITHUB_ORIGIN',
  'RESOLVE_WORKING_REF_AND_EXACT_HEAD_SHA',
  'LOAD_CONTRACT_FROM_EXACT_HEAD_GIT_BLOB',
  'VALIDATE_HARDCODED_TRUST_INVARIANTS',
  'LOAD_REQUIRED_DOCUMENTS_FROM_EXACT_HEAD_GIT_BLOBS_IN_ORDER',
  'REJECT_DIRTY_OR_NON_REGULAR_TRUST_FILES',
  'BIND_AGENT_TASK_SESSION_AND_ORCHESTRATOR_NONCE',
  'EMIT_EXCLUSIVE_EXPIRING_RECEIPT_INSIDE_GIT_DIR',
  'INDEPENDENTLY_VERIFY_AND_CONSUME_RECEIPT',
  'ALLOW_ONLY_BOUND_TASK_DISPATCH_AFTER_BOOTSTRAP_VERIFIED'
];
const exactRequiredReceiptFields = [
  'id', 'version', 'state', 'contract', 'agent_id', 'agent_class', 'task_id', 'session_id',
  'parent_agent_id', 'nonce_sha256', 'issued_at', 'expires_at', 'ttl_seconds',
  'canonical_repository', 'origin', 'authority_ref', 'local_authority_sha', 'working_ref',
  'working_sha', 'worktree_state', 'expected_checkout_binding', 'source_attestation',
  'trusted_git', 'committed_documents', 'bootstrap_artifacts', 'dispatch_gate', 'authority_boundary', 'receipt_digest'
];
const exactAuthorityBoundary = {
  repository_worktree_mutation_performed: false,
  git_metadata_receipt_write_performed: true,
  github_write_performed: false,
  orchestrator_nonce_read_performed: true,
  orchestrator_nonce_persisted_or_logged: false,
  other_secret_or_credential_read_performed: false,
  task_authority_granted_by_bootstrap: false,
  merge_authority_granted_by_bootstrap: false,
  promotion_or_release_authority_granted_by_bootstrap: false,
  bound_execution_scope: 'EXACT_COMMITTED_GOVERNANCE_TRUST_CLOSURE',
  full_worktree_immutability_claimed: false,
  production: 'HOLD',
  public_release: 'HOLD'
};
const exactBootstrapAuthority = {
  github_read_allowed: true,
  github_write_allowed: false,
  repository_worktree_mutation_allowed: false,
  git_metadata_receipt_write_allowed: true,
  orchestrator_nonce_read_allowed: true,
  orchestrator_nonce_log_or_persist_allowed: false,
  other_secret_or_credential_read_allowed: false,
  external_spend_or_commitment_allowed: false,
  task_authority_granted: false
};
const exactWorktreeStateKeys = [
  'baseline_algorithm',
  'baseline_digest',
  'require_clean_enforced',
  'status'
];
const exactSourceAttestationFields = [
  'scope',
  'current_github_state_claims_allowed',
  'authority_relationship',
  'remote_ref_presence_does_not_authorize_or_promote',
  'promotion_eligible',
  'github_event',
  'remote'
];
const exactWorktreeBaselinePolicy = {
  algorithm: 'SHA256_GIT_STATUS_INDEX_DIFF_AND_UNTRACKED_CONTENT_V1',
  receipt_field_set: exactWorktreeStateKeys,
  tracked_status_bound: true,
  tracked_index_bound: true,
  tracked_staged_and_unstaged_diffs_bound: true,
  untracked_file_content_bound: true,
  dirty_worktree_allowed_when_clean_not_required: true,
  require_clean_enforces_clean_status_and_no_index_visibility_flags: true,
  baseline_must_remain_stable_during_bootstrap: true,
  baseline_rechecked_immediately_before_consumption: true,
  full_worktree_immutability_claimed: false
};
const repositoryDefenseInDepthBootstrapJobs = [
  {
    workflow: '.github/workflows/ci-validation.yml',
    job: 'validate',
    agent_class: 'RUNTIME_AGENTS',
    first_task_step: 'Reject unbounded GitHub Actions API access'
  },
  {
    workflow: '.github/workflows/ai-agent-governance-enforcement-v1.yml',
    job: 'enforce-ai-agent-governance',
    agent_class: 'KPMO',
    first_task_step: 'Verify exact source SHA, syntax and machine contracts'
  },
  {
    workflow: '.github/workflows/ai-agent-bootstrap-remediation-enforcement-v1.yml',
    job: 'validate-bootstrap-remediation',
    agent_class: 'CODING_AGENTS',
    first_task_step: 'Verify exact source revision'
  },
  {
    workflow: '.github/workflows/ai-agent-report-after-remediation-enforcement-v1.yml',
    job: 'enforce-report-after-remediation',
    agent_class: 'DOCUMENTATION_AGENTS',
    first_task_step: 'Verify exact source revision and contracts'
  },
  {
    workflow: '.github/workflows/kidults-asi-sharded-source-reserve-v1.yml',
    job: 'validate-sharded-source-reserve-contract',
    agent_class: 'ASI',
    first_task_step: 'Validate reserve contract without producer artifact consumption'
  },
  {
    workflow: '.github/workflows/kidults-asi-sharded-source-reserve-v1.yml',
    job: 'rolling-live-reserve',
    agent_class: 'ASI',
    first_task_step: 'Verify exact source, syntax, provenance and autonomous trigger'
  },
  {
    workflow: '.github/workflows/kidults-asi-sharded-source-reserve-v1.yml',
    job: 'capacity-100k-proof',
    agent_class: 'TEST_AGENTS',
    first_task_step: 'Verify exact source'
  },
  {
    workflow: '.github/workflows/kidults-asi-source-fabric-scale-pi1.yml',
    job: 'validate-source-fabric-contract',
    agent_class: 'ASI',
    first_task_step: 'Validate source-fabric contracts without live provider requests'
  },
  {
    workflow: '.github/workflows/kidults-asi-source-fabric-scale-pi1.yml',
    job: 'source-fabric-scale-pi1',
    agent_class: 'ASI',
    first_task_step: 'Verify exact source, syntax and platform principles'
  }
];
const applicationRuntimeExclusions = [
  {
    symbol: 'app/agent.py:KAIOSAgent',
    classification: 'DETERMINISTIC_APPLICATION_PIPELINE',
    reason: 'The class name is historical; this runtime executes collectors, normalizers, scoring, quality gates and publishing without dispatching an AI model agent.',
    may_dispatch_ai_or_model_agents: false,
    does_not_exempt_ai_or_scheduled_workflows: true
  }
];

const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const read = (relativePath, base = root) => fs.readFileSync(path.join(base, relativePath), 'utf8');
const json = (relativePath, base = root) => JSON.parse(read(relativePath, base));
const absoluteJson = (absolutePath) => JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
const stableStringify = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};
const assertWorktreeState = (candidate, label, { expectedStatus = null, requireClean = null } = {}) => {
  assert(candidate && typeof candidate === 'object' && !Array.isArray(candidate), `${label}_NOT_OBJECT`);
  assert(stableStringify(Object.keys(candidate).sort()) === stableStringify([...exactWorktreeStateKeys].sort()), `${label}_EXACT_KEYS`);
  assert(['CLEAN', 'DIRTY'].includes(candidate.status), `${label}_STATUS`);
  assert(candidate.baseline_algorithm === 'SHA256_GIT_STATUS_INDEX_DIFF_AND_UNTRACKED_CONTENT_V1', `${label}_BASELINE_ALGORITHM`);
  assert(/^sha256:[0-9a-f]{64}$/.test(candidate.baseline_digest ?? ''), `${label}_BASELINE_DIGEST`);
  assert(typeof candidate.require_clean_enforced === 'boolean', `${label}_REQUIRE_CLEAN_TYPE`);
  if (expectedStatus !== null) assert(candidate.status === expectedStatus, `${label}_EXPECTED_STATUS`);
  if (requireClean !== null) assert(candidate.require_clean_enforced === requireClean, `${label}_REQUIRE_CLEAN_VALUE`);
};
const assertSourceAttestationAuthorityBoundary = (candidate, label) => {
  assert(candidate && typeof candidate === 'object' && !Array.isArray(candidate), `${label}_NOT_OBJECT`);
  assert(stableStringify(Object.keys(candidate).sort()) === stableStringify([...exactSourceAttestationFields].sort()),
    `${label}_EXACT_KEYS`);
  assert(candidate?.authority_relationship === 'NOT_EVALUATED', `${label}_AUTHORITY_RELATIONSHIP`);
  assert(candidate?.remote_ref_presence_does_not_authorize_or_promote === true, `${label}_REMOTE_REF_BOUNDARY`);
  assert(candidate?.promotion_eligible === false, `${label}_PROMOTION_ELIGIBILITY`);
};
const sha256Hex = (value) => crypto.createHash('sha256').update(value).digest('hex');
const sha256 = (value) => `sha256:${sha256Hex(value)}`;
const resolveTrustedGit = () => {
  const candidates = [
    '/usr/bin/git',
    '/usr/local/bin/git',
    'C:\\Program Files\\Git\\cmd\\git.exe',
    'C:\\Program Files\\Git\\bin\\git.exe'
  ];
  for (const candidate of candidates) {
    try {
      const linkStat = fs.lstatSync(candidate);
      if (!linkStat.isFile() || linkStat.isSymbolicLink()) continue;
      const real = fs.realpathSync(candidate);
      const stat = fs.statSync(real);
      if (!stat.isFile()) continue;
      if (process.platform !== 'win32') {
        if (stat.uid !== 0 || (stat.mode & 0o022) !== 0 || (stat.mode & 0o111) === 0) continue;
        let parent = path.dirname(real);
        let trustedParents = true;
        while (true) {
          const parentLinkStat = fs.lstatSync(parent);
          const parentStat = fs.statSync(parent);
          if (!parentLinkStat.isDirectory() || parentLinkStat.isSymbolicLink()
            || parentStat.uid !== 0 || (parentStat.mode & 0o022) !== 0) {
            trustedParents = false;
            break;
          }
          const next = path.dirname(parent);
          if (next === parent) break;
          parent = next;
        }
        if (!trustedParents) continue;
      } else {
        const programFiles = [process.env.ProgramFiles, process.env['ProgramFiles(x86)']]
          .filter(Boolean)
          .map((value) => path.resolve(value).toLowerCase());
        if (!programFiles.some((base) => real.toLowerCase().startsWith(`${base}${path.sep.toLowerCase()}`))) continue;
      }
      return real;
    } catch {
      // Try the next platform-owned absolute candidate.
    }
  }
  fail('TRUSTED_GIT_EXECUTABLE_UNAVAILABLE');
};
const TRUSTED_GIT = resolveTrustedGit();
const GIT_NULL_DEVICE = process.platform === 'win32' ? 'NUL' : os.devNull;
const trustedGitPath = () => {
  if (process.platform !== 'win32') return '/usr/bin:/bin';
  const gitDir = path.dirname(TRUSTED_GIT);
  const gitRoot = path.resolve(gitDir, '..');
  return [gitDir, gitRoot, path.join(gitRoot, 'mingw64', 'bin'), path.join(gitRoot, 'usr', 'bin')]
    .join(path.delimiter);
};
const gitEnvironment = () => {
  const env = Object.assign(Object.create(null), {
    PATH: trustedGitPath(),
    HOME: GIT_NULL_DEVICE,
    XDG_CONFIG_HOME: GIT_NULL_DEVICE,
    LANG: 'C',
    LC_ALL: 'C',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: GIT_NULL_DEVICE,
    GIT_CONFIG_SYSTEM: GIT_NULL_DEVICE,
    GIT_NO_REPLACE_OBJECTS: '1',
    GIT_NO_LAZY_FETCH: '1',
    GIT_ATTR_NOSYSTEM: '1',
    GIT_OPTIONAL_LOCKS: '0',
    GIT_TERMINAL_PROMPT: '0',
    GIT_LITERAL_PATHSPECS: '1'
  });
  if (process.platform === 'win32') {
    const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
    if (!systemRoot || !path.isAbsolute(systemRoot) || systemRoot.includes('\0')) fail('WINDOWS_SYSTEM_ROOT_UNSAFE');
    env.SystemRoot = path.resolve(systemRoot);
    env.WINDIR = env.SystemRoot;
    env.PATHEXT = '.COM;.EXE;.BAT;.CMD';
    env.PATH = `${trustedGitPath()}${path.delimiter}${path.join(env.SystemRoot, 'System32')}`;
    env.USERPROFILE = GIT_NULL_DEVICE;
    for (const key of ['TEMP', 'TMP']) {
      const value = process.env[key];
      if (value && path.isAbsolute(value) && !value.includes('\0')) env[key] = path.resolve(value);
    }
  }
  return env;
};
const git = (repositoryRoot, args, {
  buffer = false,
  network = 'none',
  allowFile = false,
  timeoutMs = null,
  stdio = ['ignore', 'pipe', 'pipe']
} = {}) => {
  const protocols = [
    '-c', 'protocol.allow=never',
    ...(network === 'https' ? ['-c', 'protocol.https.allow=always'] : []),
    ...(allowFile ? ['-c', 'protocol.file.allow=always'] : [])
  ];
  try {
    return execFileSync(TRUSTED_GIT, [
      '--no-pager',
      '--no-replace-objects',
      '-c', 'core.fsmonitor=false',
      '-c', `core.hooksPath=${GIT_NULL_DEVICE}`,
      '-c', 'core.askPass=',
      '-c', 'credential.helper=',
      '-c', 'credential.interactive=never',
      '-c', 'http.sslVerify=true',
      '-c', 'http.proxy=',
      '-c', 'http.followRedirects=false',
      ...protocols,
      ...(repositoryRoot ? ['-C', repositoryRoot] : []),
      ...args
    ], {
      encoding: buffer ? null : 'utf8',
      stdio,
      env: gitEnvironment(),
      timeout: timeoutMs ?? (network === 'https' ? 20_000 : 30_000),
      maxBuffer: 16 * 1024 * 1024,
      killSignal: 'SIGKILL'
    });
  } catch (error) {
    if (error?.code === 'ETIMEDOUT' || error?.signal === 'SIGKILL') {
      fail(network === 'https' ? 'REMOTE_VERIFICATION_TIMEOUT' : 'GIT_COMMAND_TIMEOUT');
    }
    throw error;
  }
};
const gitText = (repositoryRoot, args, options = {}) => git(repositoryRoot, args, options).trim();
const gitOptional = (repositoryRoot, args, allowedStatuses = [1]) => {
  try {
    return gitText(repositoryRoot, args);
  } catch (error) {
    if (allowedStatuses.includes(error?.status)) return null;
    throw error;
  }
};
const trustedGitEvidence = () => ({
  path: TRUSTED_GIT,
  version: gitText(null, ['--version']),
  binary_sha256: sha256(fs.readFileSync(TRUSTED_GIT))
});
const assertGitObjectIsolation = (repositoryRoot) => {
  const replacements = gitText(repositoryRoot, ['for-each-ref', '--format=%(refname)', 'refs/replace']);
  assert(!replacements, 'GIT_REPLACEMENT_REFS_FORBIDDEN');
  const commonDirRaw = gitText(repositoryRoot, ['rev-parse', '--git-common-dir']);
  const commonDir = fs.realpathSync(path.isAbsolute(commonDirRaw)
    ? commonDirRaw
    : path.resolve(repositoryRoot, commonDirRaw));
  const alternatesPath = path.join(commonDir, 'objects', 'info', 'alternates');
  assert(!(fs.existsSync(alternatesPath) && fs.readFileSync(alternatesPath, 'utf8').trim()), 'GIT_OBJECT_ALTERNATES_FORBIDDEN');
};
const assertSafeRepositoryGitConfig = (repositoryRoot) => {
  const output = git(repositoryRoot, ['config', '--show-scope', '--name-only', '--list', '--no-includes', '--null']);
  const dangerous = (name) => {
    const key = name.toLowerCase();
    return /^include(?:if)?\./.test(key)
      || key.startsWith('credential.')
      || key.startsWith('http.')
      || key.startsWith('url.')
      || key.startsWith('protocol.')
      || key.startsWith('filter.')
      || /^core\.(?:askpass|alternaterefscommand|attributesfile|editor|excludesfile|fsmonitor(?:hookversion)?|gitproxy|hookspath|pager|sshcommand|worktree)$/.test(key)
      || /^remote\..+\.(?:proxy|proxyauthmethod|pushurl|receivepack|uploadpack|vcs)$/.test(key)
      || /^diff\.(?:external|.+\.(?:command|textconv))$/.test(key)
      || /^merge\..+\.driver$/.test(key)
      || /^(?:difftool|mergetool)\..+\.cmd$/.test(key)
      || key.startsWith('pager.')
      || key === 'interactive.difffilter'
      || key === 'sequence.editor'
      || /^gpg\.(?:program|ssh\.program)$/.test(key);
  };
  const entries = output.split('\0');
  if (entries.at(-1) === '') entries.pop();
  assert(entries.length % 2 === 0, 'GIT_CONFIG_ENTRY_UNPARSEABLE');
  for (let index = 0; index < entries.length; index += 2) {
    const [scope, name] = entries.slice(index, index + 2);
    assert(['command', 'local', 'worktree'].includes(scope), `UNEXPECTED_GIT_CONFIG_SCOPE:${scope}`);
    assert(scope === 'command' || !dangerous(name), `UNSAFE_REPOSITORY_GIT_CONFIG_FORBIDDEN:${name}`);
  }
  const originUrls = (gitOptional(repositoryRoot, ['config', '--local', '--get-all', '--null', 'remote.origin.url']) ?? '')
    .split('\0').filter(Boolean);
  assert(originUrls.length === 1 && acceptedOrigins.includes(originUrls[0]), 'CANONICAL_ORIGIN_MISSING_OR_MISMATCHED');
  return originUrls[0];
};
const digestReceipt = (receipt, nonce) => {
  const { receipt_digest: ignored, ...withoutDigest } = receipt;
  void ignored;
  return `hmac-sha256:${crypto.createHmac('sha256', Buffer.from(nonce, 'utf8'))
    .update(stableStringify(withoutDigest), 'utf8')
    .digest('hex')}`;
};
const unkeyedDigestReceipt = (receipt) => {
  const { receipt_digest: ignored, ...withoutDigest } = receipt;
  void ignored;
  return `sha256:${crypto.createHash('sha256').update(stableStringify(withoutDigest), 'utf8').digest('hex')}`;
};

const unquoteYamlScalar = (value) => {
  const trimmed = value.replace(/\s+#.*$/, '').trim();
  if (trimmed.length >= 2 && trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return JSON.parse(trimmed);
  }
  return trimmed;
};

const parseWorkflowJobs = (workflowPath, source) => {
  const lines = source.split(/\r?\n/);
  const jobsLine = lines.findIndex((line) => line === 'jobs:');
  assert(jobsLine !== -1, `WORKFLOW_JOBS_MISSING:${workflowPath}`);
  const jobs = new Map();
  for (let index = jobsLine + 1; index < lines.length;) {
    const jobMatch = lines[index].match(/^  ([A-Za-z0-9_-]+):\s*$/);
    if (!jobMatch) {
      if (/^[^\s#]/.test(lines[index])) break;
      index += 1;
      continue;
    }
    const jobStart = index;
    index += 1;
    while (index < lines.length && !/^  [A-Za-z0-9_-]+:\s*$/.test(lines[index]) && !/^[^\s#]/.test(lines[index])) index += 1;
    const jobLines = lines.slice(jobStart, index);
    const stepsLine = jobLines.findIndex((line) => line === '    steps:');
    const env = {};
    const envLine = jobLines.findIndex((line) => line === '    env:');
    if (envLine !== -1 && (stepsLine === -1 || envLine < stepsLine)) {
      for (let offset = envLine + 1; offset < (stepsLine === -1 ? jobLines.length : stepsLine); offset += 1) {
        const envMatch = jobLines[offset].match(/^      ([A-Za-z_][A-Za-z0-9_]*):\s*(.+?)\s*$/);
        if (envMatch) env[envMatch[1]] = unquoteYamlScalar(envMatch[2]);
        else if (!/^\s*(?:#.*)?$/.test(jobLines[offset])) break;
      }
    }
    const steps = [];
    if (stepsLine !== -1) {
      const stepStarts = [];
      for (let offset = stepsLine + 1; offset < jobLines.length; offset += 1) {
        if (/^      - (?:name|uses|run):/.test(jobLines[offset])) stepStarts.push(offset);
      }
      for (let stepIndex = 0; stepIndex < stepStarts.length; stepIndex += 1) {
        const start = stepStarts[stepIndex];
        const end = stepStarts[stepIndex + 1] ?? jobLines.length;
        const stepLines = jobLines.slice(start, end);
        const stepScalar = (key) => {
          const pattern = new RegExp(`^(?:      - |        )${key}:\\s*(.+?)\\s*$`);
          const match = stepLines.map((line) => line.match(pattern)).find(Boolean);
          return match ? unquoteYamlScalar(match[1]) : null;
        };
        const withValues = {};
        const withLine = stepLines.findIndex((line) => line === '        with:');
        if (withLine !== -1) {
          for (let offset = withLine + 1; offset < stepLines.length; offset += 1) {
            const withMatch = stepLines[offset].match(/^          ([A-Za-z0-9_-]+):\s*(.+?)\s*$/);
            if (withMatch) withValues[withMatch[1]] = unquoteYamlScalar(withMatch[2]);
            else if (!/^\s*(?:#.*)?$/.test(stepLines[offset])) break;
          }
        }
        const runHeader = stepLines.findIndex((line) => /^        run:\s*(?:[|>][-+]?\s*)?$/.test(line));
        const runLines = runHeader === -1
          ? []
          : stepLines.slice(runHeader + 1).filter((line) => /^\s{10,}/.test(line));
        steps.push({
          name: stepScalar('name'),
          uses: stepScalar('uses'),
          if_condition: stepScalar('if'),
          continue_on_error: stepScalar('continue-on-error'),
          with: withValues,
          run: runLines.map((line) => line.slice(10)).join('\n')
        });
      }
    }
    jobs.set(jobMatch[1], { env, steps });
  }
  return jobs;
};

const executableShellCommands = (runBody) => {
  const commands = [];
  let pending = '';
  let heredocDelimiter = null;
  for (const sourceLine of runBody.split(/\r?\n/)) {
    const trimmed = sourceLine.trim();
    if (heredocDelimiter !== null) {
      if (trimmed === heredocDelimiter) heredocDelimiter = null;
      continue;
    }
    if (!trimmed || trimmed.startsWith('#')) continue;
    const combined = pending ? `${pending} ${trimmed}` : trimmed;
    if (/\\\s*$/.test(combined)) {
      pending = combined.replace(/\\\s*$/, '');
    } else {
      commands.push(combined);
      const heredoc = combined.match(/<<-?\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))/);
      heredocDelimiter = heredoc ? (heredoc[1] ?? heredoc[2] ?? heredoc[3]) : null;
      pending = '';
    }
  }
  if (pending) commands.push(pending);
  return commands;
};

const commandStartsInvocation = (command, commandPattern) => new RegExp(
  `^(?:${commandPattern}|[A-Za-z_][A-Za-z0-9_]*=["']?\\$\\(\\s*${commandPattern})(?=\\s|$)`
).test(command);

const isConsumingVerificationAssertion = (command) => {
  if (!commandStartsInvocation(command, String.raw`node\s+(?:-e|--eval)`)) return false;
  const exactComparisons = [
    /\.state\s*(?:===|!==|==|!=)\s*['"]BOOTSTRAP_VERIFIED['"]/,
    /\.consumed\s*(?:===|!==|==|!=)\s*true/,
    /\.task_dispatch_allowed_for_bound_task_session\s*(?:===|!==|==|!=)\s*true/,
    /\.working_sha\s*(?:===|!==|==|!=)\s*(?:process\.env\.EXPECTED_SHA|process\.argv\[\d+\])/
  ];
  return command.includes('JSON.parse(')
    && command.includes('EXPECTED_SHA')
    && exactComparisons.every((pattern) => pattern.test(command))
    && /(?:throw\s+new\s+Error|process\.exit\s*\(\s*1\s*\))/.test(command);
};

const isUnparameterizedFullValidator = (command) => {
  const nodePrefix = `node ${paths.validator}`;
  const npmPrefix = 'npm run validate:agent-bootstrap';
  const prefix = command.startsWith(nodePrefix) ? nodePrefix : command.startsWith(npmPrefix) ? npmPrefix : null;
  if (!prefix) return false;
  const tail = command.slice(prefix.length).trim();
  return tail === ''
    || /^(?:>{1,2}\s*\S+|\|\s*tee\s+\S+)$/.test(tail);
};

const shellArgumentValue = (command, argument) => {
  const escaped = argument.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = command.match(new RegExp(`(?:^|\\s)${escaped}\\s+(?:"([^"]+)"|'([^']+)'|([^\\s)]+))(?=\\s|\\)|$)`));
  return match ? (match[1] ?? match[2] ?? match[3]) : null;
};

const validateDispatchJob = (dispatch, workflows) => {
  const jobs = workflows.get(dispatch.workflow);
  assert(jobs, `DISPATCH_WORKFLOW_MISSING:${dispatch.workflow}`);
  const job = jobs.get(dispatch.job);
  assert(job, `DISPATCH_JOB_MISSING:${dispatch.workflow}:${dispatch.job}`);
  assert(job.env.EXPECTED_SHA === '${{ github.event.pull_request.head.sha || github.sha }}',
    `DISPATCH_EXPECTED_SHA_ENV_INVALID:${dispatch.workflow}:${dispatch.job}`);
  const taskIndex = job.steps.findIndex((step) => step.name === dispatch.first_task_step);
  assert(taskIndex !== -1, `DISPATCH_FIRST_TASK_STEP_MISSING:${dispatch.workflow}:${dispatch.job}:${dispatch.first_task_step}`);
  const checkoutIndex = job.steps.findIndex((step, index) => index < taskIndex
    && step.uses === 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1');
  assert(checkoutIndex !== -1, `DISPATCH_EXACT_CHECKOUT_MISSING:${dispatch.workflow}:${dispatch.job}`);
  const checkout = job.steps[checkoutIndex];
  assert(checkout.with.ref === '${{ env.EXPECTED_SHA }}', `DISPATCH_CHECKOUT_REF_INVALID:${dispatch.workflow}:${dispatch.job}`);
  assert(checkout.with['persist-credentials'] === 'false', `DISPATCH_CHECKOUT_CREDENTIALS_NOT_DISABLED:${dispatch.workflow}:${dispatch.job}`);
  for (const [index, step] of job.steps.slice(0, taskIndex).entries()) {
    assert(step.if_condition === null, `DISPATCH_PRE_TASK_CONDITIONAL_STEP_FORBIDDEN:${dispatch.workflow}:${dispatch.job}:${index}`);
    assert(step.continue_on_error === null || step.continue_on_error === 'false',
      `DISPATCH_PRE_TASK_CONTINUE_ON_ERROR_FORBIDDEN:${dispatch.workflow}:${dispatch.job}:${index}`);
  }
  const gateCommands = job.steps.slice(0, taskIndex).flatMap((step, stepIndex) =>
    executableShellCommands(step.run).map((command, commandIndex) => ({ command, stepIndex, commandIndex })));
  const bootstrapPattern = String.raw`(?:node\s+${paths.entrypoint.replaceAll('/', '\\/')}|npm\s+run\s+agent:bootstrap(?:\s+--)?)(?=\s|$)`;
  const verifierPattern = String.raw`(?:node\s+${paths.verifier.replaceAll('/', '\\/')}|npm\s+run\s+verify:agent-bootstrap(?:\s+--)?)(?=\s|$)`;
  const validatorPattern = String.raw`(?:node\s+${paths.validator.replaceAll('/', '\\/')}|npm\s+run\s+validate:agent-bootstrap(?:\s+--)?)(?=\s|$)`;
  const bootstrapIndex = gateCommands.findIndex(({ command }) => commandStartsInvocation(command, bootstrapPattern));
  const verifierIndex = gateCommands.findIndex(({ command }, index) => index > bootstrapIndex && commandStartsInvocation(command, verifierPattern));
  const verificationAssertionIndex = gateCommands.findIndex(({ command }, index) => index > verifierIndex && isConsumingVerificationAssertion(command));
  const validatorIndex = gateCommands.findIndex(({ command }, index) => index > verificationAssertionIndex && commandStartsInvocation(command, validatorPattern));
  assert(bootstrapIndex !== -1, `DISPATCH_BOOTSTRAP_COMMAND_MISSING:${dispatch.workflow}:${dispatch.job}`);
  assert(verifierIndex !== -1, `DISPATCH_CONSUMING_VERIFIER_COMMAND_MISSING_OR_OUT_OF_ORDER:${dispatch.workflow}:${dispatch.job}`);
  assert(verificationAssertionIndex !== -1, `DISPATCH_VERIFICATION_RESULT_ASSERTION_MISSING_OR_OUT_OF_ORDER:${dispatch.workflow}:${dispatch.job}`);
  assert(validatorIndex !== -1, `DISPATCH_FULL_VALIDATOR_COMMAND_MISSING_OR_OUT_OF_ORDER:${dispatch.workflow}:${dispatch.job}`);
  const nonceIndex = gateCommands.findIndex(({ command }, index) => index <= bootstrapIndex
    && /^(?:export\s+)?KIDULTS_BOOTSTRAP_NONCE=/.test(command));
  assert(nonceIndex !== -1, `DISPATCH_NONCE_ASSIGNMENT_MISSING:${dispatch.workflow}:${dispatch.job}`);
  const bootstrapCommand = gateCommands[bootstrapIndex].command;
  const verifierCommand = gateCommands[verifierIndex].command;
  const verificationAssertionCommand = gateCommands[verificationAssertionIndex].command;
  const validatorCommand = gateCommands[validatorIndex].command;
  assert(/(?:^|\s)--require-clean(?=\s|$)/.test(bootstrapCommand), `DISPATCH_BOOTSTRAP_REQUIRE_CLEAN_MISSING:${dispatch.workflow}:${dispatch.job}`);
  const bootstrapAssignment = bootstrapCommand.match(/^([A-Za-z_][A-Za-z0-9_]*)=/)?.[1] ?? null;
  const verifierAssignment = verifierCommand.match(/^([A-Za-z_][A-Za-z0-9_]*)=/)?.[1] ?? null;
  assert(bootstrapAssignment, `DISPATCH_BOOTSTRAP_RESULT_NOT_CAPTURED:${dispatch.workflow}:${dispatch.job}`);
  assert(verifierAssignment, `DISPATCH_VERIFIER_RESULT_NOT_CAPTURED:${dispatch.workflow}:${dispatch.job}`);
  assert(new RegExp(`["']?\\$${verifierAssignment}["']?\\s*$`).test(verificationAssertionCommand),
    `DISPATCH_ASSERTION_NOT_BOUND_TO_VERIFIER_RESULT:${dispatch.workflow}:${dispatch.job}`);
  for (const [label, command] of [['BOOTSTRAP', bootstrapCommand], ['VERIFIER', verifierCommand]]) {
    for (const argument of ['--agent-id', '--agent-class', '--task-id', '--session-id', '--expected-sha']) {
      assert(command.includes(argument), `DISPATCH_${label}_BINDING_MISSING:${dispatch.workflow}:${dispatch.job}:${argument}`);
    }
    assert(new RegExp(`--agent-class\\s+(?:["']?)${dispatch.agent_class}(?:["']?)(?=\\s|$)`).test(command),
      `DISPATCH_${label}_AGENT_CLASS_MISMATCH:${dispatch.workflow}:${dispatch.job}`);
  }
  for (const argument of ['--agent-id', '--agent-class', '--task-id', '--session-id', '--expected-sha']) {
    assert(shellArgumentValue(bootstrapCommand, argument) === shellArgumentValue(verifierCommand, argument),
      `DISPATCH_BINDING_VALUE_MISMATCH:${dispatch.workflow}:${dispatch.job}:${argument}`);
  }
  assert(verifierCommand.includes('--receipt'), `DISPATCH_VERIFIER_RECEIPT_MISSING:${dispatch.workflow}:${dispatch.job}`);
  assert(/(?:^|\s)--consume(?=\s|["')]|$)/.test(verifierCommand), `DISPATCH_VERIFIER_CONSUME_MISSING:${dispatch.workflow}:${dispatch.job}`);
  assert(isUnparameterizedFullValidator(validatorCommand), `DISPATCH_VALIDATOR_NOT_FULL:${dispatch.workflow}:${dispatch.job}`);
};

assert(fs.realpathSync(gitText(null, ['rev-parse', '--show-toplevel'])) === fs.realpathSync(root), 'VALIDATOR_MUST_RUN_FROM_REPOSITORY_ROOT');
assertSafeRepositoryGitConfig(root);
assertGitObjectIsolation(root);

for (const relativePath of Object.values(paths)) {
  assert(fs.existsSync(path.join(root, relativePath)), `MISSING:${relativePath}`);
}

const contract = json(paths.contract);
assert(contract.id === 'kidults-ai-agent-github-bootstrap-contract-v1', 'CONTRACT_ID');
assert(contract.version === '1.3.0', 'CONTRACT_VERSION');
assert(contract.status === 'MANDATORY_FAIL_CLOSED', 'CONTRACT_STATUS');
assert(contract.effective_after === 'MERGE_TO_MAIN', 'CONTRACT_EFFECTIVE_AFTER');
assert(contract.scope === 'ALL_AI_AGENT_INSTANCES_AND_AGENT_DISPATCHING_AUTOMATIONS', 'CONTRACT_SCOPE');
assert(contract.canonical_repository?.slug === 'johnkim9524-collab/kaios_enterprise_repo', 'CANONICAL_REPOSITORY');
assert(contract.canonical_repository?.remote_name === 'origin', 'CANONICAL_REMOTE');
assert(contract.canonical_repository?.authority_ref === 'refs/heads/main', 'CANONICAL_AUTHORITY_REF');
assert(stableStringify(contract.canonical_repository?.accepted_origin_urls) === stableStringify(acceptedOrigins), 'CANONICAL_HTTPS_ORIGINS_EXACT');
assert(contract.canonical_repository?.origin_must_match === true, 'CANONICAL_ORIGIN_MATCH_REQUIRED');
assert(stableStringify(contract.required_documents) === stableStringify(requiredDocuments), 'EXACT_REQUIRED_DOCUMENT_SET_AND_ORDER');
assert(stableStringify(contract.mandatory_phases) === stableStringify(mandatoryPhases), 'EXACT_MANDATORY_PHASE_ORDER');
assert(stableStringify(contract.required_receipt_fields) === stableStringify(exactRequiredReceiptFields), 'EXACT_REQUIRED_RECEIPT_FIELDS');
assert(stableStringify(contract.inheritance?.applies_to) === stableStringify(governedClasses), 'EXACT_GOVERNED_AGENT_CLASSES');
assert(contract.bootstrap_entrypoint?.path === paths.entrypoint, 'ENTRYPOINT_PATH');
assert(contract.bootstrap_entrypoint?.validator_path === paths.validator, 'VALIDATOR_PATH');
assert(contract.bootstrap_entrypoint?.receipt_verifier_path === paths.verifier, 'VERIFIER_PATH');
assert(contract.bootstrap_entrypoint?.package_command ===
  `KIDULTS_BOOTSTRAP_NONCE=<orchestrator-nonce> npm run agent:bootstrap -- --agent-id <agent-id> --agent-class <class> --task-id <task-id> --session-id <session-id> --expected-sha <sha>`,
'BOOTSTRAP_PACKAGE_COMMAND_EXPECTED_SHA_REQUIRED');
assert(contract.trust_model?.required_documents_are_read_from_exact_head_git_blobs === true, 'COMMITTED_BLOB_TRUST_REQUIRED');
assert(contract.trust_model?.local_expected_sha_is_binding_only_not_github_provenance === true, 'LOCAL_EXPECTED_SHA_NOT_PROVENANCE');
assert(contract.trust_model?.github_event_context_binding_is_not_cryptographic_or_current_state_proof === true, 'GITHUB_CONTEXT_NOT_CURRENT_STATE_PROOF');
assert(contract.trust_model?.current_github_state_requires_authenticated_remote_working_ref_verification === true, 'CURRENT_GITHUB_STATE_REMOTE_REQUIRED');
assert(contract.trust_model?.repository_bootstrap_is_not_a_cryptographic_agent_identity === true, 'BOOTSTRAP_NOT_AGENT_IDENTITY');
assert(contract.trust_model?.external_orchestrator_must_supply_nonce_and_verify_then_consume_receipt === true, 'EXTERNAL_ORCHESTRATOR_NONCE_GATE');
assert(contract.trust_model?.full_root_of_trust_requires_an_external_pinned_or_protected_base_launcher === true, 'PINNED_BASE_LAUNCHER_REQUIRED');
assert(contract.trust_model?.clean_github_actions_checkout_alone_is_a_full_root_of_trust === false, 'CLEAN_CHECKOUT_ROOT_OF_TRUST_ESCALATION');
assert(contract.trust_model?.target_revision_must_be_treated_as_data_by_the_root_launcher === true, 'TARGET_REVISION_MUST_BE_DATA');
assert(contract.trust_model?.exact_committed_governance_trust_closure_is_bound === true, 'EXACT_GOVERNANCE_CLOSURE_REQUIRED');
assert(contract.trust_model?.full_worktree_immutability_is_claimed === false, 'FULL_WORKTREE_IMMUTABILITY_ESCALATION');
assert(contract.trust_model?.git_child_process_environment_is_minimal_and_excludes_orchestrator_nonce === true, 'GIT_CHILD_ENVIRONMENT_ISOLATION');
assert(contract.trust_model?.repository_git_config_with_execution_or_transport_overrides_is_rejected === true, 'REPOSITORY_GIT_CONFIG_ISOLATION');
assert(contract.trust_model?.trusted_git_executable_and_parent_directories_are_platform_constrained === true, 'TRUSTED_GIT_PLATFORM_CONSTRAINT');
assert(contract.trust_model?.trusted_git_evidence_is_inventory_not_root_of_trust === true, 'TRUSTED_GIT_EVIDENCE_BOUNDARY');
assert(contract.trust_model?.local_git_transport_is_default_deny_and_partial_clone_lazy_fetch_is_forbidden === true, 'LOCAL_TRANSPORT_AND_LAZY_FETCH_BOUNDARY');
assert(contract.trust_model?.already_started_node_process_preexec_environment_is_sanitized_by_repository_code === false, 'PREEXEC_ENVIRONMENT_BOUNDARY');
assert(contract.trust_model?.protected_launcher_must_sanitize_preexec_loader_and_node_environment === true, 'PROTECTED_LAUNCHER_ENVIRONMENT_REQUIREMENT');
assert(contract.trust_model?.windows_full_executable_acl_authenticode_and_process_tree_parity_requires_protected_launcher === true, 'WINDOWS_TRUSTED_GIT_BOUNDARY');
assert(contract.identity_and_replay_policy?.orchestrator_nonce_required === true, 'NONCE_REQUIRED');
assert(contract.identity_and_replay_policy?.nonce_minimum_bytes === 32, 'NONCE_MINIMUM_BYTES');
assert(contract.identity_and_replay_policy?.maximum_ttl_seconds === 1800, 'TTL_MAXIMUM');
assert(contract.identity_and_replay_policy?.one_time_consumption_required === true, 'ONE_TIME_CONSUMPTION');
assert(contract.identity_and_replay_policy?.one_time_consumption_scope === 'REPOSITORY_GIT_DIR', 'ONE_TIME_CONSUMPTION_SCOPE');
assert(contract.identity_and_replay_policy?.external_dispatcher_requires_durable_protected_nonce_store === true, 'EXTERNAL_DURABLE_NONCE_STORE_REQUIRED');
assert(contract.identity_and_replay_policy?.receipt_integrity_algorithm === 'HMAC_SHA256_WITH_ORCHESTRATOR_NONCE', 'RECEIPT_INTEGRITY_ALGORITHM');
assert(contract.identity_and_replay_policy?.unkeyed_receipt_digest_allowed === false, 'UNKEYED_RECEIPT_DIGEST_ALLOWED');
assert(contract.identity_and_replay_policy?.generated_receipt_filename_is_fixed_length_digest === true, 'RECEIPT_FIXED_DIGEST_FILENAME_REQUIRED');
assert(contract.identity_and_replay_policy?.expiry_rechecked_immediately_before_consumption === true, 'EXPIRY_RECHECK_BEFORE_CONSUMPTION');
assert(contract.github_provenance_policy?.local_expected_sha_establishes_github_provenance === false, 'EXPECTED_SHA_PROVENANCE_ESCALATION');
assert(contract.github_provenance_policy?.local_checkout_scope === 'LOCAL_COMMIT_BOUND', 'LOCAL_CHECKOUT_SCOPE');
assert(contract.github_provenance_policy?.github_event_context_scope === 'GITHUB_CONTEXT_BOUND', 'GITHUB_CONTEXT_SCOPE');
assert(contract.github_provenance_policy?.github_event_context_establishes_current_github_state === false, 'GITHUB_CONTEXT_CURRENT_STATE_ESCALATION');
assert(contract.github_provenance_policy?.github_actions_repository_must_match === true, 'GITHUB_REPOSITORY_CONTEXT_REQUIRED');
assert(contract.github_provenance_policy?.github_event_sha_must_match_working_sha === true, 'GITHUB_EVENT_SHA_BINDING_REQUIRED');
assert(contract.github_provenance_policy?.pull_request_target_head_execution_allowed === false, 'PULL_REQUEST_TARGET_EXECUTION_ALLOWED');
assert(contract.github_provenance_policy?.remote_verification_requires_authority_ref_and_exact_working_branch_ref === true, 'REMOTE_WORKING_REF_REQUIRED');
assert(contract.github_provenance_policy?.detached_head_remote_working_ref_attestation_allowed === false, 'DETACHED_REMOTE_ATTESTATION_ALLOWED');
assert(contract.github_provenance_policy?.current_github_state_claim_without_attestation_allowed === false, 'UNATTESTED_CURRENT_GITHUB_CLAIM_ALLOWED');
assert(contract.github_provenance_policy?.remote_verification_uses_canonical_https_url_without_credential_helpers === true, 'CANONICAL_REMOTE_URL_REQUIRED');
assert(contract.github_provenance_policy?.remote_attestation_scope === 'TLS_SERVER_IDENTITY_AND_EXACT_REF_STATE', 'REMOTE_ATTESTATION_SCOPE');
assert(stableStringify(contract.github_provenance_policy?.source_attestation_required_fields) ===
  stableStringify(exactSourceAttestationFields), 'SOURCE_ATTESTATION_REQUIRED_FIELDS_EXACT');
assert(contract.github_provenance_policy?.remote_authority_relationship_evaluation === 'NOT_EVALUATED', 'REMOTE_AUTHORITY_RELATIONSHIP_BOUNDARY');
assert(contract.github_provenance_policy?.remote_ref_presence_does_not_authorize_or_promote === true, 'REMOTE_REF_DOES_NOT_AUTHORIZE_OR_PROMOTE');
assert(contract.github_provenance_policy?.bootstrap_promotion_eligible === false, 'BOOTSTRAP_PROMOTION_ELIGIBILITY_ESCALATION');
assert(contract.github_provenance_policy?.promotion_requires_separate_protected_gate === true, 'PROMOTION_SEPARATE_GATE_REQUIRED');
assert(stableStringify(contract.worktree_baseline_policy) === stableStringify(exactWorktreeBaselinePolicy), 'EXACT_WORKTREE_BASELINE_POLICY');
assert(contract.task_dispatch_gate?.independent_receipt_verification_required === true, 'INDEPENDENT_VERIFICATION_REQUIRED');
assert(contract.task_dispatch_gate?.receipt_consumption_required === true, 'RECEIPT_CONSUMPTION_REQUIRED');
assert(contract.task_dispatch_gate?.receipt_alone_grants_task_authority === false, 'RECEIPT_ALONE_GRANTS_AUTHORITY');
assert(contract.task_dispatch_gate?.non_consuming_audit_state_grants_task_authority === false, 'NON_CONSUMING_AUDIT_GRANTS_AUTHORITY');
assert(contract.task_dispatch_gate?.external_expected_sha_required === true, 'EXTERNAL_EXPECTED_SHA_REQUIRED');
assert(contract.task_dispatch_gate?.expected_sha_must_equal_working_sha === true, 'EXPECTED_SHA_WORKING_SHA_BINDING_REQUIRED');
assert(contract.task_dispatch_gate?.expected_sha_match_state_must_be_true === true, 'EXPECTED_SHA_MATCH_STATE_REQUIRED');
assert(contract.task_dispatch_gate?.missing_invalid_expired_or_replayed_behavior === 'REJECT_TASK_DISPATCH', 'DISPATCH_FAIL_CLOSED');
assert(contract.inheritance?.every_agent_instance_must_emit_own_receipt === true, 'PER_AGENT_RECEIPT');
assert(contract.inheritance?.parent_receipt_may_replace_child_receipt === false, 'PARENT_RECEIPT_REPLACEMENT');
assert(contract.inheritance?.agent_self_exemption_allowed === false, 'SELF_EXEMPTION');
assert(contract.dispatcher_integration?.repository_dispatchers_must_invoke_bootstrap_and_verifier_before_agent_logic === true, 'REPOSITORY_DISPATCHER_GATE');
assert(contract.dispatcher_integration?.external_dispatchers_must_implement_equivalent_gate === true, 'EXTERNAL_DISPATCHER_GATE');
assert(stableStringify(contract.dispatcher_integration?.repository_instruction_convergence_points) === stableStringify([
  paths.agents,
  paths.copilot
]), 'EXACT_REPOSITORY_INSTRUCTION_CONVERGENCE_POINTS');
assert(stableStringify(contract.dispatcher_integration?.actual_ai_model_dispatch_jobs) === '[]', 'ACTUAL_AI_MODEL_DISPATCH_JOBS_MUST_BE_EMPTY');
assert(contract.dispatcher_integration?.repository_defense_in_depth_bootstrap_jobs_are_ai_or_model_dispatchers === false,
  'DEFENSE_IN_DEPTH_BOOTSTRAP_JOBS_MISCLASSIFIED_AS_AI_DISPATCHERS');
assert(stableStringify(contract.dispatcher_integration?.repository_defense_in_depth_bootstrap_jobs) === stableStringify(repositoryDefenseInDepthBootstrapJobs),
  'EXACT_REPOSITORY_DEFENSE_IN_DEPTH_BOOTSTRAP_JOBS');
assert(contract.dispatcher_integration?.defense_in_depth_registration_reclassifies_job_as_ai_agent === false,
  'DEFENSE_IN_DEPTH_REGISTRATION_RECLASSIFIES_JOB');
assert(stableStringify(contract.dispatcher_integration?.application_runtime_exclusions) === stableStringify(applicationRuntimeExclusions), 'EXACT_APPLICATION_RUNTIME_EXCLUSIONS');
assert(!Object.hasOwn(contract.dispatcher_integration ?? {}, 'known_python_convergence_point'), 'LEGACY_APP_AGENT_CONVERGENCE_POINT_FORBIDDEN');
assert(contract.dispatcher_integration?.external_dispatch_without_verified_capability_is_forbidden_after_activation === true, 'EXTERNAL_DISPATCH_CAPABILITY_REQUIRED');
assert(stableStringify(contract.bootstrap_authority) === stableStringify(exactBootstrapAuthority), 'EXACT_BOOTSTRAP_AUTHORITY');
assert(stableStringify(contract.receipt_authority_boundary) === stableStringify(exactAuthorityBoundary), 'EXACT_CONTRACT_RECEIPT_AUTHORITY_BOUNDARY');
for (const condition of [
  'TRUSTED_GIT_EXECUTABLE_UNAVAILABLE',
  'GIT_REPLACEMENT_REFS_FORBIDDEN',
  'GIT_OBJECT_ALTERNATES_FORBIDDEN',
  'INDEX_VISIBILITY_FLAGS_FORBIDDEN_WHEN_CLEAN_REQUIRED',
  'UNSAFE_REPOSITORY_GIT_CONFIG_FORBIDDEN',
  'UNEXPECTED_GIT_CONFIG_SCOPE',
  'GIT_COMMAND_TIMEOUT',
  'EXPECTED_CHECKOUT_SHA_REQUIRED',
  'RECEIPT_DIGEST_MISMATCH',
  'RECEIPT_FILENAME_BINDING_MISMATCH',
  'WORKTREE_BASELINE_CHANGED_DURING_BOOTSTRAP',
  'CURRENT_WORKTREE_BASELINE_CHANGED',
  'TRUSTED_GIT_EVIDENCE_MISMATCH',
  'REMOTE_VERIFICATION_TIMEOUT',
  'REMOTE_REF_SHA_UNRESOLVED',
  'BOOTSTRAP_RECEIPT_EXPIRED'
]) assert(contract.fail_closed_conditions?.includes(condition), `GIT_TRUST_FAIL_CLOSED_CONDITION_MISSING:${condition}`);

const requiredReceiptFields = new Set(contract.required_receipt_fields);
for (const field of [
  'agent_id', 'agent_class', 'task_id', 'session_id', 'nonce_sha256', 'issued_at', 'expires_at',
  'working_sha', 'source_attestation', 'trusted_git', 'committed_documents', 'bootstrap_artifacts', 'receipt_digest'
]) assert(requiredReceiptFields.has(field), `REQUIRED_RECEIPT_FIELD:${field}`);

const packageJson = json(paths.package);
assert(packageJson.scripts?.['agent:bootstrap'] === `node ${paths.entrypoint}`, 'PACKAGE_BOOTSTRAP_COMMAND');
assert(packageJson.scripts?.['verify:agent-bootstrap'] === `node ${paths.verifier}`, 'PACKAGE_VERIFIER_COMMAND');
assert(packageJson.scripts?.['validate:agent-bootstrap'] === `node ${paths.validator}`, 'PACKAGE_VALIDATOR_COMMAND');

const agents = read(paths.agents);
const policy = read(paths.policy);
const copilot = read(paths.copilot);
const trackBootstrap = read(paths.trackBootstrap);
for (const [label, body] of [['AGENTS', agents], ['POLICY', policy], ['COPILOT', copilot], ['TRACK_BOOTSTRAP', trackBootstrap]]) {
  for (const marker of [paths.contract, 'KIDULTS_BOOTSTRAP_NONCE', 'BOOTSTRAP_VERIFIED']) {
    assert(body.includes(marker), `${label}_MARKER:${marker}`);
  }
}
for (const body of [agents, policy, copilot]) {
  assert(body.includes('BOOTSTRAP_PREREQUISITES_SATISFIED'), 'MISSING_PREREQUISITE_STATE_DISCLOSURE');
  assert(body.includes('verify:agent-bootstrap'), 'MISSING_INDEPENDENT_VERIFIER_COMMAND');
}
assert(trackBootstrap.includes(paths.trackE), 'TRACK_E_BOOTSTRAP_NOT_REGISTERED');

const operating = json(paths.operatingContract);
const remediation = json(paths.remediationContract);
const reportAfterGate = json(paths.reportAfterGate);
const statusSchema = json(paths.statusSchema);
const registry = json(paths.registry);
assert(operating.version === '1.7.0', 'OPERATING_CONTRACT_VERSION');
assert(operating.enforcement?.bootstrap_independent_verification_and_consumption_required === true, 'OPERATING_INDEPENDENT_VERIFICATION');
assert(operating.enforcement?.local_expected_sha_establishes_github_provenance === false, 'OPERATING_LOCAL_SHA_PROVENANCE');
assert(remediation.version === '1.2.0', 'REMEDIATION_VERSION');
assert(remediation.independent_verification_and_one_time_consumption_required === true, 'REMEDIATION_CONSUMPTION');
for (const agentClass of governedClasses) assert(remediation.bootstrap_inheritance?.[agentClass] === true, `REMEDIATION_CLASS:${agentClass}`);
assert(reportAfterGate.id === 'kidults-ai-agent-report-after-remediation-gate-v1', 'REPORT_AFTER_REMEDIATION_GATE_ID');
assert(statusSchema.$id === 'https://kidults.internal/schemas/ai-agent-status-receipt-v1.json', 'STATUS_RECEIPT_SCHEMA_ID');
assert(registry.version === '1.7.0', 'REGISTRY_VERSION');
assert(registry.registered_policy?.github_bootstrap_receipt_verifier_path === paths.verifier, 'REGISTRY_VERIFIER');
assert(stableStringify(registry.mandatory_inheritance?.applies_to) === stableStringify(governedClasses), 'REGISTRY_AGENT_CLASSES');
assert(registry.mandatory_inheritance?.independent_receipt_verification_required === true, 'REGISTRY_INDEPENDENT_VERIFICATION');
assert(registry.mandatory_inheritance?.one_time_receipt_consumption_required === true, 'REGISTRY_ONE_TIME_CONSUMPTION');
assert(stableStringify(registry.dispatcher_integration?.actual_ai_model_dispatch_jobs) === stableStringify(contract.dispatcher_integration.actual_ai_model_dispatch_jobs),
  'REGISTRY_ACTUAL_AI_MODEL_DISPATCH_JOBS_DRIFT');
assert(registry.dispatcher_integration?.repository_defense_in_depth_bootstrap_jobs_are_ai_or_model_dispatchers === false,
  'REGISTRY_DEFENSE_IN_DEPTH_DISPATCH_CLASSIFICATION');
assert(stableStringify(registry.dispatcher_integration?.repository_defense_in_depth_bootstrap_jobs) ===
  stableStringify(contract.dispatcher_integration.repository_defense_in_depth_bootstrap_jobs),
  'REGISTRY_DEFENSE_IN_DEPTH_BOOTSTRAP_JOBS_DRIFT');
assert(stableStringify(registry.dispatcher_integration?.application_runtime_exclusions) === stableStringify(contract.dispatcher_integration.application_runtime_exclusions),
  'REGISTRY_APPLICATION_EXCLUSIONS_DRIFT');

const workflowPaths = [...new Set(repositoryDefenseInDepthBootstrapJobs.map((dispatch) => dispatch.workflow))];
const parsedWorkflows = new Map(workflowPaths.map((workflowPath) => {
  const absolutePath = path.join(root, workflowPath);
  assert(fs.existsSync(absolutePath), `DISPATCH_WORKFLOW_MISSING:${workflowPath}`);
  return [workflowPath, parseWorkflowJobs(workflowPath, fs.readFileSync(absolutePath, 'utf8'))];
}));
for (const dispatch of repositoryDefenseInDepthBootstrapJobs) validateDispatchJob(dispatch, parsedWorkflows);
const spoofWorkflowPath = '.github/workflows/marker-spoof-negative.yml';
const spoofDispatch = {
  workflow: spoofWorkflowPath,
  job: 'spoof',
  agent_class: 'TEST_AGENTS',
  first_task_step: 'First task'
};
const spoofWorkflow = `jobs:
  spoof:
    env:
      EXPECTED_SHA: \${{ github.event.pull_request.head.sha || github.sha }}
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
        with:
          ref: \${{ env.EXPECTED_SHA }}
          persist-credentials: false
      - name: Marker-only gate
        run: |
          echo "node ${paths.entrypoint} --require-clean --agent-id spoof --agent-class TEST_AGENTS --task-id spoof --session-id spoof --expected-sha spoof"
          node - <<'NODE'
          node ${paths.verifier} --receipt spoof --agent-id spoof --agent-class TEST_AGENTS --task-id spoof --session-id spoof --expected-sha spoof --consume
          node ${paths.validator}
          NODE
      - name: First task
        run: echo task
`;
let markerOnlySpoofRejected = false;
try {
  validateDispatchJob(spoofDispatch, new Map([[spoofWorkflowPath, parseWorkflowJobs(spoofWorkflowPath, spoofWorkflow)]]));
} catch (error) {
  markerOnlySpoofRejected = error?.message?.startsWith('DISPATCH_BOOTSTRAP_COMMAND_MISSING:') ?? false;
}
assert(markerOnlySpoofRejected, 'DISPATCH_MARKER_ONLY_SPOOF_NOT_REJECTED');

const staticResult = {
  id: 'kidults-ai-agent-github-bootstrap-static-validation-v1',
  version: '1.3.0',
  state: 'STATIC_VERIFIED_PASS',
  required_documents_validated: requiredDocuments.length,
  governed_agent_classes_validated: governedClasses.length,
  actual_ai_model_dispatch_jobs_validated: 0,
  repository_defense_in_depth_bootstrap_jobs_validated: repositoryDefenseInDepthBootstrapJobs.length,
  marker_only_dispatch_spoof_rejected: markerOnlySpoofRejected,
  trusted_git: trustedGitEvidence(),
  git_replacement_refs_rejected: true,
  git_object_alternates_rejected: true,
  unsafe_repository_git_config_rejected: true,
  nonce_keyed_receipt_hmac_required: true
};
if (staticOnly) {
  console.log(JSON.stringify(staticResult, null, 2));
  process.exit(0);
}

const workingSha = gitText(root, ['rev-parse', 'HEAD']).toLowerCase();
const unique = `${process.pid}-${Date.now()}-${crypto.randomBytes(5).toString('hex')}`;
const nonce = crypto.randomBytes(32).toString('base64url');
const baseEnv = { ...gitEnvironment(), KIDULTS_BOOTSTRAP_NONCE: nonce };
if (process.platform === 'win32') {
  for (const key of ['ProgramFiles', 'ProgramFiles(x86)']) {
    if (process.env[key]) baseEnv[key] = process.env[key];
  }
}
delete baseEnv.KIDULTS_TRUSTED_GIT_PATH;
for (const name of ['GITHUB_ACTIONS', 'GITHUB_REPOSITORY', 'GITHUB_SHA', 'GITHUB_EVENT_NAME', 'GITHUB_EVENT_PATH', 'KIDULTS_BOOTSTRAP_EXPECTED_SHA']) {
  delete baseEnv[name];
}
const run = (script, args, env = baseEnv, cwd = root) => execFileSync(process.execPath, [script, ...args], {
  cwd,
  env,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
  timeout: 30_000,
  maxBuffer: 16 * 1024 * 1024,
  killSignal: 'SIGKILL'
});
const expectFailure = (script, args, expectedReason, env = baseEnv, cwd = root) => {
  const label = `${script}:${args.join(' ')}`;
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30_000,
    maxBuffer: 16 * 1024 * 1024,
    killSignal: 'SIGKILL'
  });
  assert(!result.error, `NEGATIVE_TEST_SUBPROCESS_ERROR:${label}:${result.error?.code ?? result.error?.message}`);
  assert(result.signal === null, `NEGATIVE_TEST_SUBPROCESS_SIGNAL:${label}:${result.signal}`);
  assert(result.status === 1, `NEGATIVE_TEST_EXIT_STATUS_INVALID:${label}:${result.status}`);
  const output = `${result.stderr ?? ''}${result.stdout ?? ''}`;
  const escapedReason = expectedReason.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const detailSuffix = expectedReason.endsWith(':') ? '[^\\r\\n]+' : '(?::[^\\r\\n]+)?';
  assert(new RegExp(`^Error: ${escapedReason}${detailSuffix}\\r?$`, 'm').test(result.stderr ?? ''),
    `NEGATIVE_TEST_WRONG_REASON:${label}:${expectedReason}`);
  return output;
};
const bindings = {
  agentId: `validator-agent-${unique}`,
  agentClass: 'TEST_AGENTS',
  taskId: `validator-task-${unique}`,
  sessionId: `validator-session-${unique}`
};
const bootstrapArgs = [
  '--agent-id', bindings.agentId,
  '--agent-class', bindings.agentClass,
  '--task-id', bindings.taskId,
  '--session-id', bindings.sessionId,
  '--expected-sha', workingSha
];
expectFailure(paths.entrypoint, bootstrapArgs.slice(0, -2), 'EXPECTED_CHECKOUT_SHA_REQUIRED');
const bootstrapResult = JSON.parse(run(paths.entrypoint, bootstrapArgs));
assert(bootstrapResult.state === 'BOOTSTRAP_PREREQUISITES_SATISFIED', 'RUNTIME_BOOTSTRAP_STATE');
assert(bootstrapResult.source_scope === 'LOCAL_COMMIT_BOUND', 'LOCAL_EXPECTED_SHA_ESCALATED_TO_GITHUB_PROVENANCE');
assert(/^receipt-[0-9a-f]{64}\.json$/.test(path.basename(bootstrapResult.receipt_path)),
  'RUNTIME_RECEIPT_FILENAME_NOT_FIXED_DIGEST');
const receipt = absoluteJson(bootstrapResult.receipt_path);
assert(receipt.version === '1.3.0', 'RUNTIME_RECEIPT_VERSION');
assert(stableStringify(Object.keys(receipt).sort()) === stableStringify([...exactRequiredReceiptFields].sort()), 'RUNTIME_RECEIPT_EXACT_KEYS');
assert(stableStringify(receipt.authority_boundary) === stableStringify(exactAuthorityBoundary), 'RUNTIME_RECEIPT_EXACT_AUTHORITY_BOUNDARY');
assert(stableStringify(Object.keys(receipt.trusted_git ?? {}).sort()) === stableStringify(['binary_sha256', 'path', 'version']), 'RUNTIME_TRUSTED_GIT_EXACT_KEYS');
assert(stableStringify(receipt.trusted_git) === stableStringify(trustedGitEvidence()), 'RUNTIME_TRUSTED_GIT_EVIDENCE');
assertWorktreeState(receipt.worktree_state, 'RUNTIME_WORKTREE_STATE', { requireClean: false });
assertSourceAttestationAuthorityBoundary(receipt.source_attestation, 'RUNTIME_SOURCE_ATTESTATION');
assert(!stableStringify(receipt).includes(nonce), 'RAW_NONCE_PRESENT_IN_RUNTIME_RECEIPT');
assert(receipt.expected_checkout_binding?.matched === true, 'EXPECTED_SHA_BINDING_NOT_RECORDED');
assert(receipt.expected_checkout_binding?.establishes_github_provenance === false, 'EXPECTED_SHA_PROVENANCE_ESCALATION_RUNTIME');
assert(receipt.dispatch_gate?.task_execution_allowed_from_this_receipt_alone === false, 'RECEIPT_ALONE_OPENED_GATE');

const verifyArgs = [
  '--receipt', bootstrapResult.receipt_path,
  '--agent-id', bindings.agentId,
  '--agent-class', bindings.agentClass,
  '--task-id', bindings.taskId,
  '--session-id', bindings.sessionId,
  '--expected-sha', workingSha
];
const auditResult = JSON.parse(run(paths.verifier, verifyArgs));
assert(auditResult.state === 'BOOTSTRAP_AUDIT_VERIFIED' && auditResult.consumed === false, 'NON_CONSUMING_AUDIT_RESULT');
assert(auditResult.task_dispatch_allowed_for_bound_task_session === false, 'NON_CONSUMING_AUDIT_OPENED_GATE');
assert(stableStringify(auditResult.authority_boundary) === stableStringify(exactAuthorityBoundary), 'NON_CONSUMING_AUDIT_EXACT_AUTHORITY_BOUNDARY');
const dispatchResult = JSON.parse(run(paths.verifier, [...verifyArgs, '--consume']));
assert(dispatchResult.state === 'BOOTSTRAP_VERIFIED' && dispatchResult.consumed === true, 'CONSUMING_VERIFICATION_RESULT');
assert(dispatchResult.task_dispatch_allowed_for_bound_task_session === true, 'CONSUMING_VERIFICATION_DID_NOT_OPEN_BOUND_GATE');
assert(stableStringify(dispatchResult.authority_boundary) === stableStringify(exactAuthorityBoundary), 'CONSUMING_VERIFICATION_EXACT_AUTHORITY_BOUNDARY');
expectFailure(paths.verifier, [...verifyArgs, '--consume'], 'BOOTSTRAP_NONCE_REPLAY');
const alternateReplayBindings = {
  ...bindings,
  taskId: `validator-replay-task-${unique}`,
  sessionId: `validator-replay-session-${unique}`
};
const alternateReplayBootstrap = JSON.parse(run(paths.entrypoint, [
  '--agent-id', alternateReplayBindings.agentId,
  '--agent-class', alternateReplayBindings.agentClass,
  '--task-id', alternateReplayBindings.taskId,
  '--session-id', alternateReplayBindings.sessionId,
  '--expected-sha', workingSha
]));
expectFailure(paths.verifier, [
  '--receipt', alternateReplayBootstrap.receipt_path,
  '--agent-id', alternateReplayBindings.agentId,
  '--agent-class', alternateReplayBindings.agentClass,
  '--task-id', alternateReplayBindings.taskId,
  '--session-id', alternateReplayBindings.sessionId,
  '--expected-sha', workingSha,
  '--consume'
], 'BOOTSTRAP_NONCE_REPLAY');
expectFailure(paths.entrypoint, bootstrapArgs, 'BOOTSTRAP_RECEIPT_ALREADY_EXISTS');
expectFailure(paths.verifier, verifyArgs, 'RECEIPT_DIGEST_MISMATCH', {
  ...baseEnv,
  KIDULTS_BOOTSTRAP_NONCE: crypto.randomBytes(32).toString('base64url')
});
const outsideReceiptOutput = expectFailure(paths.verifier, [
  '--receipt', path.join(root, 'AGENTS.md'),
  '--agent-id', bindings.agentId,
  '--agent-class', bindings.agentClass,
  '--task-id', bindings.taskId,
  '--session-id', bindings.sessionId,
  '--expected-sha', workingSha
], 'RECEIPT_PATH_OUTSIDE_CONTROLLED_DIRECTORY');
assert(outsideReceiptOutput.includes('RECEIPT_PATH_OUTSIDE_CONTROLLED_DIRECTORY'), 'ARBITRARY_RECEIPT_PATH_REJECTION_REASON');

const tamperNonce = crypto.randomBytes(32).toString('base64url');
const tamperEnv = { ...baseEnv, KIDULTS_BOOTSTRAP_NONCE: tamperNonce };
const tamperBindings = {
  agentId: `tamper-agent-${unique}`,
  taskId: `tamper-task-${unique}`,
  sessionId: `tamper-session-${unique}`
};
const tamperBootstrap = JSON.parse(run(paths.entrypoint, [
  '--agent-id', tamperBindings.agentId,
  '--agent-class', 'TEST_AGENTS',
  '--task-id', tamperBindings.taskId,
  '--session-id', tamperBindings.sessionId,
  '--expected-sha', workingSha
], tamperEnv));
const tamperedReceipt = absoluteJson(tamperBootstrap.receipt_path);
tamperedReceipt.committed_documents.pop();
tamperedReceipt.receipt_digest = unkeyedDigestReceipt(tamperedReceipt);
fs.writeFileSync(tamperBootstrap.receipt_path, `${JSON.stringify(tamperedReceipt, null, 2)}\n`, { mode: 0o600 });
const unkeyedTamperOutput = expectFailure(paths.verifier, [
  '--receipt', tamperBootstrap.receipt_path,
  '--agent-id', tamperBindings.agentId,
  '--agent-class', 'TEST_AGENTS',
  '--task-id', tamperBindings.taskId,
  '--session-id', tamperBindings.sessionId,
  '--expected-sha', workingSha
], 'RECEIPT_DIGEST_MISMATCH', tamperEnv);
assert(unkeyedTamperOutput.includes('RECEIPT_DIGEST_MISMATCH'), 'UNKEYED_RECEIPT_TAMPER_REJECTION_REASON');
tamperedReceipt.receipt_digest = digestReceipt(tamperedReceipt, tamperNonce);
fs.writeFileSync(tamperBootstrap.receipt_path, `${JSON.stringify(tamperedReceipt, null, 2)}\n`, { mode: 0o600 });
const keyedTamperOutput = expectFailure(paths.verifier, [
  '--receipt', tamperBootstrap.receipt_path,
  '--agent-id', tamperBindings.agentId,
  '--agent-class', 'TEST_AGENTS',
  '--task-id', tamperBindings.taskId,
  '--session-id', tamperBindings.sessionId,
  '--expected-sha', workingSha
], 'RECEIPT_REQUIRED_DOCUMENT_SET_OR_ORDER_MISMATCH', tamperEnv);
assert(keyedTamperOutput.includes('RECEIPT_REQUIRED_DOCUMENT_SET_OR_ORDER_MISMATCH'), 'KEYED_RECEIPT_TAMPER_SEMANTIC_REJECTION_REASON');

const expiryNonce = crypto.randomBytes(32).toString('base64url');
const expiryEnv = { ...baseEnv, KIDULTS_BOOTSTRAP_NONCE: expiryNonce };
const expiryBindings = {
  agentId: `expiry-agent-${unique}`,
  taskId: `expiry-task-${unique}`,
  sessionId: `expiry-session-${unique}`
};
const expiryBootstrap = JSON.parse(run(paths.entrypoint, [
  '--agent-id', expiryBindings.agentId,
  '--agent-class', 'TEST_AGENTS',
  '--task-id', expiryBindings.taskId,
  '--session-id', expiryBindings.sessionId,
  '--expected-sha', workingSha
], expiryEnv));
const expiredReceipt = absoluteJson(expiryBootstrap.receipt_path);
expiredReceipt.issued_at = '2000-01-01T00:00:00.000Z';
expiredReceipt.expires_at = '2000-01-01T00:01:00.000Z';
expiredReceipt.ttl_seconds = 60;
expiredReceipt.receipt_digest = digestReceipt(expiredReceipt, expiryNonce);
fs.writeFileSync(expiryBootstrap.receipt_path, `${JSON.stringify(expiredReceipt, null, 2)}\n`, { mode: 0o600 });
const expiryOutput = expectFailure(paths.verifier, [
  '--receipt', expiryBootstrap.receipt_path,
  '--agent-id', expiryBindings.agentId,
  '--agent-class', 'TEST_AGENTS',
  '--task-id', expiryBindings.taskId,
  '--session-id', expiryBindings.sessionId,
  '--expected-sha', workingSha
], 'BOOTSTRAP_RECEIPT_EXPIRED', expiryEnv);
assert(expiryOutput.includes('BOOTSTRAP_RECEIPT_EXPIRED'), 'EXPIRY_REJECTION_REASON');

const tempParent = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-agent-bootstrap-negative-'));
const tempRoot = path.join(tempParent, 'worktree');
let tempWorktreeAdded = false;
try {
  git(root, ['worktree', 'add', '--detach', '--quiet', tempRoot, workingSha], {
    stdio: ['ignore', 'pipe', 'pipe']
  });
  tempWorktreeAdded = true;
  fs.appendFileSync(path.join(tempRoot, paths.agents), '\nUNCOMMITTED_TRUST_MUTATION\n');
  const dirtyOutput = expectFailure(paths.entrypoint, [
    '--agent-id', `dirty-agent-${unique}`,
    '--agent-class', 'TEST_AGENTS',
    '--task-id', `dirty-task-${unique}`,
    '--session-id', `dirty-session-${unique}`,
    '--expected-sha', workingSha
  ], 'TRUST_PATH_DIFFERS_FROM_COMMITTED_HEAD', {
    ...baseEnv,
    KIDULTS_BOOTSTRAP_NONCE: crypto.randomBytes(32).toString('base64url')
  }, tempRoot);
  assert(dirtyOutput.includes('TRUST_PATH_DIFFERS_FROM_COMMITTED_HEAD'), 'DIRTY_TRUST_FILE_REJECTION_REASON');
} finally {
  if (tempWorktreeAdded) {
    git(root, ['worktree', 'remove', '--force', tempRoot], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
  }
  fs.rmSync(tempParent, { recursive: true, force: true });
}

const isolationParent = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-agent-git-isolation-negative-'));
const isolationRoot = path.join(isolationParent, 'repository');
try {
  git(null, ['clone', '--no-local', '--quiet', root, isolationRoot], {
    allowFile: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  git(isolationRoot, ['remote', 'set-url', 'origin', acceptedOrigins[0]]);
  const isolatedSha = gitText(isolationRoot, ['rev-parse', 'HEAD']).toLowerCase();
  let isolatedBranch = gitText(isolationRoot, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (isolatedBranch === 'HEAD') {
    isolatedBranch = `isolation-${unique}`;
    git(isolationRoot, ['checkout', '--quiet', '-b', isolatedBranch, isolatedSha]);
  }
  const isolatedArgs = [
    '--require-clean',
    '--agent-id', `isolation-agent-${unique}`,
    '--agent-class', 'TEST_AGENTS',
    '--task-id', `isolation-task-${unique}`,
    '--session-id', `isolation-session-${unique}`,
    '--expected-sha', isolatedSha
  ];
  const isolatedNonce = crypto.randomBytes(32).toString('base64url');
  const isolatedEnv = { ...baseEnv, KIDULTS_BOOTSTRAP_NONCE: isolatedNonce };
  const isolatedBootstrap = JSON.parse(run(paths.entrypoint, isolatedArgs, isolatedEnv, isolationRoot));
  const isolatedReceipt = absoluteJson(isolatedBootstrap.receipt_path);
  assert(isolatedReceipt.version === '1.3.0', 'ISOLATION_RECEIPT_VERSION');
  assert(stableStringify(Object.keys(isolatedReceipt).sort()) === stableStringify([...exactRequiredReceiptFields].sort()), 'ISOLATION_RECEIPT_EXACT_KEYS');
  assert(stableStringify(isolatedReceipt.authority_boundary) === stableStringify(exactAuthorityBoundary), 'ISOLATION_RECEIPT_EXACT_AUTHORITY_BOUNDARY');
  assertWorktreeState(isolatedReceipt.worktree_state, 'ISOLATION_WORKTREE_STATE', { expectedStatus: 'CLEAN', requireClean: true });
  assertSourceAttestationAuthorityBoundary(isolatedReceipt.source_attestation, 'ISOLATION_SOURCE_ATTESTATION');
  assert(!stableStringify(isolatedReceipt).includes(isolatedNonce), 'RAW_NONCE_PRESENT_IN_VALID_RECEIPT');
  const isolatedVerifyArgs = [
    '--receipt', isolatedBootstrap.receipt_path,
    '--agent-id', `isolation-agent-${unique}`,
    '--agent-class', 'TEST_AGENTS',
    '--task-id', `isolation-task-${unique}`,
    '--session-id', `isolation-session-${unique}`,
    '--expected-sha', isolatedSha
  ];
  const isolatedAudit = JSON.parse(run(paths.verifier, isolatedVerifyArgs, isolatedEnv, isolationRoot));
  assert(isolatedAudit.state === 'BOOTSTRAP_AUDIT_VERIFIED' && isolatedAudit.consumed === false, 'ISOLATION_AUDIT_STATE');

  const wrongBasenameReceiptPath = path.join(path.dirname(isolatedBootstrap.receipt_path), `wrong-basename-${unique}.json`);
  fs.copyFileSync(isolatedBootstrap.receipt_path, wrongBasenameReceiptPath, fs.constants.COPYFILE_EXCL);
  try {
    expectFailure(paths.verifier, [
      '--receipt', wrongBasenameReceiptPath,
      ...isolatedVerifyArgs.slice(2)
    ], 'RECEIPT_FILENAME_BINDING_MISMATCH', isolatedEnv, isolationRoot);
  } finally {
    fs.rmSync(wrongBasenameReceiptPath, { force: true });
  }

  const baselineMutationPath = path.join(isolationRoot, 'README.md');
  const baselineMutationOriginal = fs.readFileSync(baselineMutationPath);
  try {
    fs.appendFileSync(baselineMutationPath, `\nNON_GOVERNANCE_BASELINE_MUTATION_${unique}\n`);
    expectFailure(paths.verifier, isolatedVerifyArgs, 'CURRENT_WORKTREE_BASELINE_CHANGED', isolatedEnv, isolationRoot);
  } finally {
    fs.writeFileSync(baselineMutationPath, baselineMutationOriginal);
  }

  const hostileParent = path.join(isolationParent, 'hostile-environment');
  const hostileHome = path.join(hostileParent, 'home');
  const hostileBin = path.join(hostileParent, 'bin');
  const hostileMarker = path.join(hostileParent, 'untrusted-git-executed');
  fs.mkdirSync(hostileHome, { recursive: true });
  fs.mkdirSync(hostileBin, { recursive: true });
  fs.writeFileSync(path.join(hostileHome, '.gitconfig'), '[core]\n\tworktree = /hostile-global-config\n', 'utf8');
  const hostileGit = path.join(hostileBin, process.platform === 'win32' ? 'git.cmd' : 'git');
  if (process.platform === 'win32') {
    fs.writeFileSync(hostileGit, `@echo hostile>"${hostileMarker}"\r\n@exit /b 97\r\n`, 'utf8');
  } else {
    fs.writeFileSync(hostileGit, `#!/bin/sh\nprintf hostile > '${hostileMarker.replaceAll("'", "'\\''")}'\nexit 97\n`, { mode: 0o755 });
    fs.chmodSync(hostileGit, 0o755);
  }
  const hostileNonce = crypto.randomBytes(32).toString('base64url');
  const hostileEnv = {
    ...isolatedEnv,
    PATH: hostileBin,
    HOME: hostileHome,
    XDG_CONFIG_HOME: hostileHome,
    KIDULTS_BOOTSTRAP_NONCE: hostileNonce,
    KIDULTS_TRUSTED_GIT_PATH: hostileGit,
    GIT_DIR: path.join(hostileParent, 'not-a-git-dir'),
    GIT_WORK_TREE: path.join(hostileParent, 'not-a-worktree'),
    GIT_INDEX_FILE: path.join(hostileParent, 'hostile-index'),
    GIT_OBJECT_DIRECTORY: path.join(hostileParent, 'hostile-objects'),
    GIT_ALTERNATE_OBJECT_DIRECTORIES: path.join(hostileParent, 'hostile-alternates'),
    GIT_REPLACE_REF_BASE: 'refs/hostile-replacements/',
    GIT_NO_LAZY_FETCH: '0',
    GIT_ALLOW_PROTOCOL: 'file:https',
    GIT_CEILING_DIRECTORIES: isolationRoot,
    GIT_CONFIG_COUNT: '2',
    GIT_CONFIG_KEY_0: 'core.worktree',
    GIT_CONFIG_VALUE_0: path.join(hostileParent, 'config-worktree'),
    GIT_CONFIG_KEY_1: 'core.fsmonitor',
    GIT_CONFIG_VALUE_1: hostileGit,
    GIT_ASKPASS: hostileGit,
    SSH_ASKPASS: hostileGit,
    GIT_SSH: hostileGit,
    GIT_SSH_COMMAND: hostileGit,
    HTTP_PROXY: 'http://127.0.0.1:9',
    HTTPS_PROXY: 'http://127.0.0.1:9',
    ALL_PROXY: 'http://127.0.0.1:9',
    NO_PROXY: '*',
    GIT_SSL_CAINFO: path.join(hostileParent, 'hostile-ca.pem'),
    SSL_CERT_FILE: path.join(hostileParent, 'hostile-ca.pem'),
    CURL_CA_BUNDLE: path.join(hostileParent, 'hostile-ca.pem')
  };
  const hostileBindings = {
    agentId: `hostile-env-agent-${unique}`,
    taskId: `hostile-env-task-${unique}`,
    sessionId: `hostile-env-session-${unique}`
  };
  const hostileBootstrap = JSON.parse(run(paths.entrypoint, [
    '--require-clean',
    '--agent-id', hostileBindings.agentId,
    '--agent-class', 'TEST_AGENTS',
    '--task-id', hostileBindings.taskId,
    '--session-id', hostileBindings.sessionId,
    '--expected-sha', isolatedSha
  ], hostileEnv, isolationRoot));
  assert(!fs.existsSync(hostileMarker), 'HOSTILE_PATH_OR_GIT_CONFIG_EXECUTED_DURING_BOOTSTRAP');
  const hostileReceipt = absoluteJson(hostileBootstrap.receipt_path);
  assert(!stableStringify(hostileReceipt).includes(hostileNonce), 'RAW_NONCE_PRESENT_IN_HOSTILE_ENV_RECEIPT');
  const hostileAudit = JSON.parse(run(paths.verifier, [
    '--receipt', hostileBootstrap.receipt_path,
    '--agent-id', hostileBindings.agentId,
    '--agent-class', 'TEST_AGENTS',
    '--task-id', hostileBindings.taskId,
    '--session-id', hostileBindings.sessionId,
    '--expected-sha', isolatedSha
  ], hostileEnv, isolationRoot));
  assert(hostileAudit.state === 'BOOTSTRAP_AUDIT_VERIFIED', 'HOSTILE_ENVIRONMENT_VERIFIER_AUDIT_STATE');
  assert(!fs.existsSync(hostileMarker), 'HOSTILE_PATH_OR_GIT_CONFIG_EXECUTED_DURING_VERIFICATION');

  const maximumIdentifier = `m${'x'.repeat(127)}`;
  const maximumNonce = crypto.randomBytes(32).toString('base64url');
  const maximumEnv = { ...isolatedEnv, KIDULTS_BOOTSTRAP_NONCE: maximumNonce };
  const maximumBootstrap = JSON.parse(run(paths.entrypoint, [
    '--require-clean',
    '--agent-id', maximumIdentifier,
    '--agent-class', 'TEST_AGENTS',
    '--task-id', maximumIdentifier,
    '--session-id', maximumIdentifier,
    '--expected-sha', isolatedSha
  ], maximumEnv, isolationRoot));
  assert(Buffer.byteLength(path.basename(maximumBootstrap.receipt_path), 'utf8') <= 255, 'MAXIMUM_IDENTIFIER_RECEIPT_FILENAME_TOO_LONG');
  const maximumAudit = JSON.parse(run(paths.verifier, [
    '--receipt', maximumBootstrap.receipt_path,
    '--agent-id', maximumIdentifier,
    '--agent-class', 'TEST_AGENTS',
    '--task-id', maximumIdentifier,
    '--session-id', maximumIdentifier,
    '--expected-sha', isolatedSha
  ], maximumEnv, isolationRoot));
  assert(maximumAudit.state === 'BOOTSTRAP_AUDIT_VERIFIED', 'MAXIMUM_IDENTIFIER_AUDIT_STATE');

  git(isolationRoot, ['update-ref', `refs/replace/${isolatedSha}`, isolatedSha]);
  const replacementOutput = expectFailure(paths.entrypoint, isolatedArgs, 'GIT_REPLACEMENT_REFS_FORBIDDEN', isolatedEnv, isolationRoot);
  assert(replacementOutput.includes('GIT_REPLACEMENT_REFS_FORBIDDEN'), 'GIT_REPLACEMENT_REF_REJECTION_REASON');
  expectFailure(paths.verifier, isolatedVerifyArgs, 'GIT_REPLACEMENT_REFS_FORBIDDEN', isolatedEnv, isolationRoot);
  git(isolationRoot, ['update-ref', '-d', `refs/replace/${isolatedSha}`]);

  const isolatedCommonDirRaw = gitText(isolationRoot, ['rev-parse', '--git-common-dir']);
  const isolatedCommonDir = path.isAbsolute(isolatedCommonDirRaw)
    ? isolatedCommonDirRaw
    : path.resolve(isolationRoot, isolatedCommonDirRaw);
  const alternatesPath = path.join(isolatedCommonDir, 'objects', 'info', 'alternates');
  fs.mkdirSync(path.dirname(alternatesPath), { recursive: true });
  fs.writeFileSync(alternatesPath, `${path.join(root, '.git', 'objects')}\n`, 'utf8');
  const alternatesOutput = expectFailure(paths.entrypoint, isolatedArgs, 'GIT_OBJECT_ALTERNATES_FORBIDDEN', isolatedEnv, isolationRoot);
  assert(alternatesOutput.includes('GIT_OBJECT_ALTERNATES_FORBIDDEN'), 'GIT_OBJECT_ALTERNATES_REJECTION_REASON');
  expectFailure(paths.verifier, isolatedVerifyArgs, 'GIT_OBJECT_ALTERNATES_FORBIDDEN', isolatedEnv, isolationRoot);
  fs.rmSync(alternatesPath, { force: true });

  git(isolationRoot, ['update-index', '--skip-worktree', paths.agents]);
  const hiddenIndexOutput = expectFailure(paths.entrypoint, isolatedArgs, 'INDEX_VISIBILITY_FLAGS_FORBIDDEN_WHEN_CLEAN_REQUIRED', isolatedEnv, isolationRoot);
  assert(hiddenIndexOutput.includes('INDEX_VISIBILITY_FLAGS_FORBIDDEN_WHEN_CLEAN_REQUIRED'), 'INDEX_VISIBILITY_REJECTION_REASON');
  expectFailure(paths.verifier, isolatedVerifyArgs, 'CURRENT_WORKTREE_BASELINE_CHANGED', isolatedEnv, isolationRoot);
  git(isolationRoot, ['update-index', '--no-skip-worktree', paths.agents]);

  const hostileConfigCases = [
    ['include.path', path.join(isolationParent, 'untrusted-include')],
    ['credential.helper', `!${hostileGit}`],
    ['http.proxy', 'http://127.0.0.1:9'],
    ['url.https://evil.invalid/.insteadof', 'https://github.com/'],
    ['protocol.file.allow', 'always'],
    ['filter.evil.process', hostileGit],
    ['core.askpass', hostileGit],
    ['core.alternaterefscommand', hostileGit],
    ['core.hookspath', hostileParent],
    ['core.sshcommand', hostileGit],
    ['remote.origin.uploadpack', hostileGit],
    ['diff.evil.textconv', hostileGit],
    ['merge.evil.driver', hostileGit],
    ['pager.status', hostileGit],
    ['gpg.program', hostileGit]
  ];
  for (const [configKey, configValue] of hostileConfigCases) {
    try {
      git(isolationRoot, ['config', '--local', configKey, configValue]);
      expectFailure(paths.entrypoint, isolatedArgs, 'UNSAFE_REPOSITORY_GIT_CONFIG_FORBIDDEN:', isolatedEnv, isolationRoot);
      expectFailure(paths.verifier, isolatedVerifyArgs, 'UNSAFE_REPOSITORY_GIT_CONFIG_FORBIDDEN:', isolatedEnv, isolationRoot);
      assert(!fs.existsSync(hostileMarker), `UNSAFE_GIT_CONFIG_EXECUTED:${configKey}`);
    } finally {
      gitOptional(isolationRoot, ['config', '--local', '--unset-all', configKey], [1, 5]);
    }
  }

  const restoreCanonicalOrigin = () => {
    gitOptional(isolationRoot, ['config', '--local', '--unset-all', 'remote.origin.url'], [1, 5]);
    git(isolationRoot, ['config', '--local', '--add', 'remote.origin.url', acceptedOrigins[0]]);
  };
  try {
    git(isolationRoot, ['config', '--local', '--unset-all', 'remote.origin.url']);
    expectFailure(paths.entrypoint, isolatedArgs, 'CANONICAL_ORIGIN_MISSING_OR_MISMATCHED', isolatedEnv, isolationRoot);
    expectFailure(paths.verifier, isolatedVerifyArgs, 'CANONICAL_ORIGIN_MISSING_OR_MISMATCHED', isolatedEnv, isolationRoot);
  } finally {
    restoreCanonicalOrigin();
  }
  try {
    git(isolationRoot, ['config', '--local', '--unset-all', 'remote.origin.url']);
    git(isolationRoot, ['config', '--local', '--add', 'remote.origin.url', 'git@github.com:johnkim9524-collab/kaios_enterprise_repo.git']);
    expectFailure(paths.entrypoint, isolatedArgs, 'CANONICAL_ORIGIN_MISSING_OR_MISMATCHED', isolatedEnv, isolationRoot);
    expectFailure(paths.verifier, isolatedVerifyArgs, 'CANONICAL_ORIGIN_MISSING_OR_MISMATCHED', isolatedEnv, isolationRoot);
  } finally {
    restoreCanonicalOrigin();
  }
  try {
    git(isolationRoot, ['config', '--local', '--add', 'remote.origin.url', acceptedOrigins[1]]);
    expectFailure(paths.entrypoint, isolatedArgs, 'CANONICAL_ORIGIN_MISSING_OR_MISMATCHED', isolatedEnv, isolationRoot);
    expectFailure(paths.verifier, isolatedVerifyArgs, 'CANONICAL_ORIGIN_MISSING_OR_MISMATCHED', isolatedEnv, isolationRoot);
  } finally {
    restoreCanonicalOrigin();
  }

  git(isolationRoot, ['checkout', '--detach', '--quiet', isolatedSha]);
  try {
    expectFailure(paths.entrypoint, [...isolatedArgs, '--require-remote'], 'REMOTE_WORKING_REF_REQUIRED_FOR_DETACHED_HEAD', {
      ...isolatedEnv,
      KIDULTS_BOOTSTRAP_NONCE: crypto.randomBytes(32).toString('base64url')
    }, isolationRoot);
  } finally {
    git(isolationRoot, ['checkout', '--quiet', isolatedBranch]);
  }

  const originalIsolatedReceiptText = fs.readFileSync(isolatedBootstrap.receipt_path, 'utf8');
  const expectSignedReceiptTamper = (mutate, expectedReason) => {
    const candidate = JSON.parse(originalIsolatedReceiptText);
    mutate(candidate);
    candidate.receipt_digest = digestReceipt(candidate, isolatedNonce);
    fs.writeFileSync(isolatedBootstrap.receipt_path, `${JSON.stringify(candidate, null, 2)}\n`, { mode: 0o600 });
    try {
      expectFailure(paths.verifier, isolatedVerifyArgs, expectedReason, isolatedEnv, isolationRoot);
    } finally {
      fs.writeFileSync(isolatedBootstrap.receipt_path, originalIsolatedReceiptText, { mode: 0o600 });
    }
  };
  expectSignedReceiptTamper((candidate) => { candidate.unexpected_top_level = true; }, 'RECEIPT_FIELD_SET_MISMATCH');
  expectSignedReceiptTamper((candidate) => { delete candidate.dispatch_gate; }, 'RECEIPT_FIELD_SET_MISMATCH');
  expectSignedReceiptTamper((candidate) => { candidate.authority_boundary.unexpected = false; }, 'AUTHORITY_BOUNDARY_FIELD_SET_MISMATCH');
  expectSignedReceiptTamper((candidate) => { candidate.authority_boundary.production = 'OPEN'; }, 'AUTHORITY_BOUNDARY_FIELD_SET_MISMATCH');
  expectSignedReceiptTamper((candidate) => { candidate.authority_boundary.production = isolatedNonce; }, 'RAW_NONCE_PRESENT_IN_RECEIPT');
  expectSignedReceiptTamper((candidate) => { candidate.trusted_git.binary_sha256 = `sha256:${'0'.repeat(64)}`; }, 'TRUSTED_GIT_EVIDENCE_MISMATCH');
  expectSignedReceiptTamper((candidate) => {
    candidate.source_attestation = {
      scope: 'REMOTE_WORKING_REF_ATTESTED',
      current_github_state_claims_allowed: true,
      authority_relationship: 'NOT_EVALUATED',
      remote_ref_presence_does_not_authorize_or_promote: true,
      promotion_eligible: false,
      github_event: null,
      remote: {
        authority_sha: isolatedSha,
        working_ref: 'refs/heads/not-the-bound-working-ref',
        working_sha: isolatedSha
      }
    };
  }, 'REMOTE_ATTESTATION_INVALID');
} finally {
  fs.rmSync(isolationParent, { recursive: true, force: true });
}

fs.rmSync(bootstrapResult.receipt_path, { force: true });
fs.rmSync(alternateReplayBootstrap.receipt_path, { force: true });
fs.rmSync(tamperBootstrap.receipt_path, { force: true });
fs.rmSync(expiryBootstrap.receipt_path, { force: true });
if (dispatchResult.consumption_marker) fs.rmSync(dispatchResult.consumption_marker, { force: true });

console.log(JSON.stringify({
  id: 'kidults-ai-agent-github-bootstrap-validation-v1',
  version: '1.3.0',
  state: 'VERIFIED_PASS',
  canonical_repository: contract.canonical_repository.slug,
  working_sha: workingSha,
  required_documents_validated: requiredDocuments.length,
  governed_agent_classes_validated: governedClasses.length,
  negative_controls_verified: [
    'EXPECTED_CHECKOUT_SHA_REQUIRED',
    'LOCAL_EXPECTED_SHA_NOT_GITHUB_PROVENANCE',
    'RECEIPT_ALONE_DOES_NOT_OPEN_TASK_GATE',
    'NON_CONSUMING_AUDIT_STATE_DISTINCT_FROM_DISPATCH_VERIFICATION',
    'ONE_TIME_CONSUMPTION_AND_REPLAY_REJECTION',
    'NONCE_REUSE_ACROSS_DISTINCT_RECEIPTS_REJECTION',
    'UNKEYED_RECEIPT_TAMPER_REJECTION',
    'RECEIPT_REQUIRED_DOCUMENT_SET_TAMPER_REJECTION',
    'EXCLUSIVE_RECEIPT_NO_OVERWRITE',
    'NONCE_BINDING',
    'ARBITRARY_RECEIPT_PATH_REJECTION',
    'EXPIRY_REJECTION',
    'DIRTY_TRUST_FILE_REJECTION',
    'GIT_REPLACEMENT_REF_REJECTION',
    'VERIFIER_GIT_REPLACEMENT_REF_REJECTION',
    'GIT_OBJECT_ALTERNATES_REJECTION',
    'VERIFIER_GIT_OBJECT_ALTERNATES_REJECTION',
    'INDEX_VISIBILITY_FLAGS_REJECTION',
    'VERIFIER_INDEX_VISIBILITY_BASELINE_REJECTION',
    'HOSTILE_PATH_AND_GIT_ENVIRONMENT_ISOLATION',
    'MAXIMUM_IDENTIFIER_RECEIPT_FILENAME_BOUND',
    'RECEIPT_FILENAME_BINDING_REJECTION',
    'CURRENT_WORKTREE_BASELINE_CHANGE_REJECTION',
    'WORKTREE_BASELINE_EXACT_SHAPE_AND_DIGEST_ALGORITHM',
    'SOURCE_ATTESTATION_NO_AUTHORITY_OR_PROMOTION',
    'UNSAFE_REPOSITORY_GIT_CONFIG_CATEGORY_REJECTION',
    'VERIFIER_UNSAFE_REPOSITORY_GIT_CONFIG_CATEGORY_REJECTION',
    'PARTIAL_CLONE_LAZY_FETCH_ENVIRONMENT_OVERRIDE_ISOLATION',
    'MISSING_NON_HTTPS_AND_DUPLICATE_ORIGIN_REJECTION',
    'VERIFIER_ORIGIN_REJECTION',
    'DETACHED_HEAD_REMOTE_ATTESTATION_REJECTION',
    'EXACT_RECEIPT_FIELD_SET_REJECTION',
    'EXACT_AUTHORITY_BOUNDARY_REJECTION',
    'RAW_NONCE_PERSISTENCE_REJECTION',
    'TRUSTED_GIT_EVIDENCE_TAMPER_REJECTION',
    'REMOTE_ATTESTATION_SHAPE_REJECTION',
    'NEGATIVE_SUBPROCESS_REASON_AND_EXIT_BINDING'
  ],
  production: 'HOLD',
  public_release: 'HOLD'
}, null, 2));
