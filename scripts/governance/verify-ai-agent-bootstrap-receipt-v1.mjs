#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const CONTRACT_PATH = 'coordination/kidults/governance/ai-agent-github-bootstrap-contract-v1.json';
const REPOSITORY_SLUG = 'johnkim9524-collab/kaios_enterprise_repo';
const REMOTE_NAME = 'origin';
const AUTHORITY_REF = 'refs/heads/main';
const MAX_TTL_SECONDS = 1800;
const ACCEPTED_ORIGINS = [
  'https://github.com/johnkim9524-collab/kaios_enterprise_repo.git',
  'https://github.com/johnkim9524-collab/kaios_enterprise_repo'
];
const REPOSITORY_DEFENSE_IN_DEPTH_BOOTSTRAP_JOBS = [
  ['.github/workflows/ci-validation.yml', 'validate', 'RUNTIME_AGENTS', 'Reject unbounded GitHub Actions API access'],
  ['.github/workflows/ai-agent-governance-enforcement-v1.yml', 'enforce-ai-agent-governance', 'KPMO', 'Verify exact source SHA, syntax and machine contracts'],
  ['.github/workflows/ai-agent-bootstrap-remediation-enforcement-v1.yml', 'validate-bootstrap-remediation', 'CODING_AGENTS', 'Verify exact source revision'],
  ['.github/workflows/ai-agent-report-after-remediation-enforcement-v1.yml', 'enforce-report-after-remediation', 'DOCUMENTATION_AGENTS', 'Verify exact source revision and contracts'],
  ['.github/workflows/kidults-asi-sharded-source-reserve-v1.yml', 'validate-sharded-source-reserve-contract', 'ASI', 'Validate reserve contract without producer artifact consumption'],
  ['.github/workflows/kidults-asi-sharded-source-reserve-v1.yml', 'rolling-live-reserve', 'ASI', 'Verify exact source, syntax, provenance and autonomous trigger'],
  ['.github/workflows/kidults-asi-sharded-source-reserve-v1.yml', 'capacity-100k-proof', 'TEST_AGENTS', 'Verify exact source'],
  ['.github/workflows/kidults-asi-source-fabric-scale-pi1.yml', 'validate-source-fabric-contract', 'ASI', 'Validate source-fabric contracts without live provider requests'],
  ['.github/workflows/kidults-asi-source-fabric-scale-pi1.yml', 'source-fabric-scale-pi1', 'ASI', 'Verify exact source, syntax and platform principles']
].map(([workflow, job, agent_class, first_task_step]) => ({ workflow, job, agent_class, first_task_step }));
const GOVERNED_CLASSES = [
  'KPMO', 'TRACK_A', 'TRACK_B', 'TRACK_C', 'TRACK_D', 'TRACK_E', 'RED_TEAM', 'ASI',
  'CODING_AGENTS', 'REVIEW_AGENTS', 'TEST_AGENTS', 'RELEASE_AGENTS',
  'DOCUMENTATION_AGENTS', 'DISCOVERY_AGENTS', 'EVIDENCE_AGENTS', 'GRAPH_AGENTS',
  'PROVIDER_AGENTS', 'RUNTIME_AGENTS', 'SCHEDULED_AGENT_AUTOMATIONS', 'EXTERNAL_MODEL_AGENTS'
];
const REQUIRED_DOCUMENTS = [
  [CONTRACT_PATH, 'GITHUB_SOURCE_BOOTSTRAP_TRUST_ANCHOR'],
  ['package.json', 'BOOTSTRAP_PACKAGE_COMMAND'],
  ['AGENTS.md', 'ROOT_REPOSITORY_INSTRUCTIONS'],
  ['.github/AI_AGENT_OPERATING_RULES.md', 'HUMAN_READABLE_AI_POLICY'],
  ['coordination/kidults/kpmo/operating-principles-and-resilience-controls-v1.json', 'PLATFORM_CONSTITUTION'],
  ['coordination/kidults/governance/ai-agent-operating-rules-v1.json', 'AI_MACHINE_CONTRACT'],
  ['coordination/kidults/governance/ai-agent-bootstrap-remediation-sequence-v1.json', 'FIX_FIRST_BOOTSTRAP_SEQUENCE'],
  ['coordination/kidults/governance/ai-agent-report-after-remediation-gate-v1.json', 'REPORT_AFTER_REMEDIATION_GATE'],
  ['coordination/kidults/governance/ai-agent-status-receipt-schema-v1.json', 'CANONICAL_STATUS_RECEIPT_SCHEMA'],
  ['coordination/kidults/registry/ai-agent-governance-registry-v1.json', 'GOVERNANCE_SYSTEM_OF_RECORD'],
  ['coordination/kidults/bootstrap/README.md', 'TRACK_AND_ROLE_STARTUP_ROUTER'],
  ['.github/copilot-instructions.md', 'GITHUB_AGENT_ADAPTER']
].map(([documentPath, purpose], index) => ({ order: index + 1, path: documentPath, purpose }));
const BOOTSTRAP_ARTIFACT_PATHS = [
  'scripts/governance/bootstrap-ai-agent-from-github-v1.mjs',
  'scripts/governance/validate-ai-agent-github-bootstrap-v1.mjs',
  'scripts/governance/verify-ai-agent-bootstrap-receipt-v1.mjs'
];
const MANDATORY_PHASES = [
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
const REQUIRED_RECEIPT_FIELDS = [
  'id', 'version', 'state', 'contract', 'agent_id', 'agent_class', 'task_id', 'session_id',
  'parent_agent_id', 'nonce_sha256', 'issued_at', 'expires_at', 'ttl_seconds',
  'canonical_repository', 'origin', 'authority_ref', 'local_authority_sha', 'working_ref',
  'working_sha', 'worktree_state', 'expected_checkout_binding', 'source_attestation',
  'trusted_git', 'committed_documents', 'bootstrap_artifacts', 'dispatch_gate', 'authority_boundary', 'receipt_digest'
];
const WORKTREE_BASELINE_ALGORITHM = 'SHA256_GIT_STATUS_INDEX_DIFF_AND_UNTRACKED_CONTENT_V1';
const WORKTREE_STATE_FIELDS = Object.freeze([
  'baseline_algorithm', 'baseline_digest', 'require_clean_enforced', 'status'
]);
const SOURCE_ATTESTATION_FIELDS = Object.freeze([
  'scope',
  'current_github_state_claims_allowed',
  'authority_relationship',
  'remote_ref_presence_does_not_authorize_or_promote',
  'promotion_eligible',
  'github_event',
  'remote'
]);
const WORKTREE_BASELINE_POLICY = Object.freeze({
  algorithm: WORKTREE_BASELINE_ALGORITHM,
  receipt_field_set: WORKTREE_STATE_FIELDS,
  tracked_status_bound: true,
  tracked_index_bound: true,
  tracked_staged_and_unstaged_diffs_bound: true,
  untracked_file_content_bound: true,
  dirty_worktree_allowed_when_clean_not_required: true,
  require_clean_enforces_clean_status_and_no_index_visibility_flags: true,
  baseline_must_remain_stable_during_bootstrap: true,
  baseline_rechecked_immediately_before_consumption: true,
  full_worktree_immutability_claimed: false
});
const FAIL_CLOSED_CONDITIONS = Object.freeze([
  'NOT_INSIDE_GIT_REPOSITORY',
  'CANONICAL_ORIGIN_MISSING_OR_MISMATCHED',
  'TRUSTED_GIT_EXECUTABLE_UNAVAILABLE',
  'GIT_REPLACEMENT_REFS_FORBIDDEN',
  'GIT_OBJECT_ALTERNATES_FORBIDDEN',
  'UNSAFE_REPOSITORY_GIT_CONFIG_FORBIDDEN',
  'UNEXPECTED_GIT_CONFIG_SCOPE',
  'GIT_COMMAND_TIMEOUT',
  'WORKING_SHA_UNRESOLVED',
  'EXPECTED_CHECKOUT_SHA_REQUIRED',
  'EXPECTED_CHECKOUT_SHA_INVALID',
  'EXPECTED_CHECKOUT_SHA_MISMATCH',
  'CLEAN_WORKTREE_REQUIRED',
  'WORKTREE_PATH_ENCODING_INVALID',
  'WORKTREE_PATH_ESCAPES_REPOSITORY',
  'WORKTREE_BASELINE_UNSUPPORTED_FILE_TYPE',
  'WORKTREE_FILE_CHANGED_DURING_HASH',
  'WORKTREE_BASELINE_CHANGED_DURING_BOOTSTRAP',
  'CURRENT_WORKTREE_BASELINE_CHANGED',
  'RECEIPT_WORKTREE_STATE_INVALID',
  'COMMITTED_TRUST_BLOB_MISSING_OR_NON_REGULAR',
  'TRUST_PATH_DIFFERS_FROM_COMMITTED_HEAD',
  'INDEX_VISIBILITY_FLAGS_FORBIDDEN_WHEN_CLEAN_REQUIRED',
  'CANONICAL_GITHUB_REPOSITORY_ENV_MISMATCH',
  'GITHUB_EVENT_CHECKOUT_SHA_MISMATCH',
  'PULL_REQUEST_TARGET_BOOTSTRAP_FORBIDDEN',
  'REMOTE_VERIFICATION_TIMEOUT',
  'REMOTE_REF_UNAVAILABLE_WHEN_REQUIRED',
  'REMOTE_REF_UNAVAILABLE_DURING_VERIFICATION',
  'REMOTE_REF_RESPONSE_AMBIGUOUS',
  'REMOTE_REF_SHA_UNRESOLVED',
  'REMOTE_WORKING_REF_REQUIRED_FOR_DETACHED_HEAD',
  'REMOTE_WORKING_REF_SHA_MISMATCH',
  'ORCHESTRATOR_NONCE_REQUIRED_MIN_32_BYTES',
  'BOOTSTRAP_RECEIPT_ALREADY_EXISTS',
  'RECEIPT_FIELD_SET_MISMATCH',
  'RAW_NONCE_PRESENT_IN_RECEIPT',
  'RECEIPT_DIGEST_MISMATCH',
  'TRUSTED_GIT_EVIDENCE_MISMATCH',
  'BOOTSTRAP_RECEIPT_EXPIRED',
  'RECEIPT_DIRECTORY_MISSING',
  'RECEIPT_ID_OR_VERSION_INVALID',
  'RECEIPT_FILENAME_BINDING_MISMATCH',
  'RECEIPT_EXPECTED_SHA_BINDING_INVALID',
  'SOURCE_ATTESTATION_FIELD_SET_MISMATCH',
  'SOURCE_ATTESTATION_AUTHORITY_BOUNDARY_INVALID',
  'AUTHORITY_BOUNDARY_FIELD_SET_MISMATCH',
  'RAW_NONCE_PRESENT_IN_CONSUMPTION_MARKER',
  'BOOTSTRAP_NONCE_REPLAY',
  'AGENT_CLASS_NOT_GOVERNED',
  'PARENT_AGENT_ID_BINDING_MISMATCH'
]);
const BOOTSTRAP_AUTHORITY = Object.freeze({
  github_read_allowed: true,
  github_write_allowed: false,
  repository_worktree_mutation_allowed: false,
  git_metadata_receipt_write_allowed: true,
  orchestrator_nonce_read_allowed: true,
  orchestrator_nonce_log_or_persist_allowed: false,
  other_secret_or_credential_read_allowed: false,
  external_spend_or_commitment_allowed: false,
  task_authority_granted: false
});
const RECEIPT_AUTHORITY_BOUNDARY = Object.freeze({
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
});

const fail = (code, detail = '') => { throw new Error(detail ? `${code}:${detail}` : code); };
const sha256Hex = (value) => crypto.createHash('sha256').update(value).digest('hex');
const sha256 = (value) => `sha256:${sha256Hex(value)}`;
const stableStringify = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};
const containsRawMaterial = (value, needle) => {
  if (typeof value === 'string') return value.includes(needle);
  if (Array.isArray(value)) return value.some((item) => containsRawMaterial(item, needle));
  if (value && typeof value === 'object') {
    return Object.entries(value).some(([key, item]) => key.includes(needle) || containsRawMaterial(item, needle));
  }
  return false;
};

const resolveTrustedGit = () => {
  const candidates = [
    '/usr/bin/git',
    '/usr/local/bin/git',
    'C:\\Program Files\\Git\\cmd\\git.exe',
    'C:\\Program Files\\Git\\bin\\git.exe'
  ].filter(Boolean);
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
    HOME: os.devNull,
    XDG_CONFIG_HOME: os.devNull,
    LANG: 'C',
    LC_ALL: 'C',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: os.devNull,
    GIT_CONFIG_SYSTEM: os.devNull,
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
    env.USERPROFILE = os.devNull;
    for (const key of ['TEMP', 'TMP']) {
      const value = process.env[key];
      if (value && path.isAbsolute(value) && !value.includes('\0')) env[key] = path.resolve(value);
    }
  }
  return env;
};

const parseArgs = (argv) => {
  const options = {
    receipt: null,
    agentId: null,
    agentClass: null,
    taskId: null,
    sessionId: null,
    parentAgentId: null,
    expectedSha: null,
    consume: false
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--receipt') options.receipt = argv[++i];
    else if (arg === '--agent-id') options.agentId = argv[++i];
    else if (arg === '--agent-class') options.agentClass = argv[++i];
    else if (arg === '--task-id') options.taskId = argv[++i];
    else if (arg === '--session-id') options.sessionId = argv[++i];
    else if (arg === '--parent-agent-id') options.parentAgentId = argv[++i];
    else if (arg === '--expected-sha') options.expectedSha = argv[++i];
    else if (arg === '--consume') options.consume = true;
    else fail('UNKNOWN_ARGUMENT', arg);
  }
  for (const [name, value] of [
    ['RECEIPT', options.receipt],
    ['AGENT_ID', options.agentId],
    ['AGENT_CLASS', options.agentClass],
    ['TASK_ID', options.taskId],
    ['SESSION_ID', options.sessionId],
    ['EXPECTED_SHA', options.expectedSha]
  ]) if (!value) fail(`${name}_REQUIRED`);
  const identifier = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
  for (const [name, value] of [
    ['AGENT_ID', options.agentId],
    ['TASK_ID', options.taskId],
    ['SESSION_ID', options.sessionId]
  ]) if (!identifier.test(value)) fail(`${name}_INVALID`);
  if (options.parentAgentId && !identifier.test(options.parentAgentId)) fail('PARENT_AGENT_ID_INVALID');
  if (!GOVERNED_CLASSES.includes(options.agentClass)) fail('AGENT_CLASS_NOT_GOVERNED', options.agentClass);
  if (!/^[0-9a-f]{40}$/i.test(options.expectedSha)) fail('EXPECTED_SHA_INVALID');
  return options;
};

const git = (root, args, { buffer = false, network = 'none', allowFile = false, timeoutMs = null } = {}) => {
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
      '-c', `core.hooksPath=${os.devNull}`,
      '-c', 'core.askPass=',
      '-c', 'credential.helper=',
      '-c', 'credential.interactive=never',
      '-c', 'http.sslVerify=true',
      '-c', 'http.proxy=',
      '-c', 'http.followRedirects=false',
      ...protocols,
      ...(root ? ['-C', root] : []),
      ...args
    ], {
      encoding: buffer ? null : 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
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
const gitText = (root, args, options = {}) => git(root, args, options).trim();
const gitOptional = (root, args, allowedStatuses = [1]) => {
  try {
    return gitText(root, args);
  } catch (error) {
    if (allowedStatuses.includes(error?.status)) return null;
    throw error;
  }
};

const splitNullBuffer = (value) => {
  const parts = [];
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== 0) continue;
    if (index > start) parts.push(value.subarray(start, index));
    start = index + 1;
  }
  if (start !== value.length) fail('WORKTREE_PATH_ENCODING_INVALID');
  return parts;
};

const updateFramedHash = (hash, label, value) => {
  const data = Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8');
  const length = Buffer.alloc(8);
  length.writeBigUInt64BE(BigInt(data.length));
  hash.update(Buffer.from(`${label}\0`, 'utf8'));
  hash.update(length);
  hash.update(data);
};

const baselinePath = (root, rawPath) => {
  const relativePath = rawPath.toString('utf8');
  if (!Buffer.from(relativePath, 'utf8').equals(rawPath) || relativePath.includes('\0') || path.isAbsolute(relativePath)) {
    fail('WORKTREE_PATH_ENCODING_INVALID');
  }
  const absoluteRoot = path.resolve(root);
  const absolute = path.resolve(root, relativePath);
  if (absolute === absoluteRoot || !absolute.startsWith(`${absoluteRoot}${path.sep}`)) {
    fail('WORKTREE_PATH_ESCAPES_REPOSITORY');
  }
  return { absolute, relativePath };
};

const hashUntrackedEntry = (hash, root, rawPath) => {
  const { absolute } = baselinePath(root, rawPath);
  let before;
  try {
    before = fs.lstatSync(absolute);
  } catch {
    fail('WORKTREE_FILE_CHANGED_DURING_HASH');
  }
  let type;
  let content;
  if (before.isFile() && !before.isSymbolicLink()) {
    type = 'REGULAR';
    content = fs.readFileSync(absolute);
  } else if (before.isSymbolicLink()) {
    type = 'SYMLINK';
    content = Buffer.from(fs.readlinkSync(absolute), 'utf8');
  } else {
    fail('WORKTREE_BASELINE_UNSUPPORTED_FILE_TYPE');
  }
  let after;
  try {
    after = fs.lstatSync(absolute);
  } catch {
    fail('WORKTREE_FILE_CHANGED_DURING_HASH');
  }
  if (before.dev !== after.dev || before.ino !== after.ino || before.mode !== after.mode
    || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) {
    fail('WORKTREE_FILE_CHANGED_DURING_HASH');
  }
  updateFramedHash(hash, 'untracked_path', rawPath);
  updateFramedHash(hash, 'untracked_type', type);
  updateFramedHash(hash, 'untracked_mode', String(before.mode));
  updateFramedHash(hash, 'untracked_size', String(content.length));
  updateFramedHash(hash, 'untracked_content', content);
};

const captureWorktreeState = (root, requireCleanEnforced) => {
  const status = git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all'], { buffer: true });
  const index = git(root, ['ls-files', '--stage', '-z'], { buffer: true });
  const indexVisibility = git(root, ['ls-files', '-v', '-z'], { buffer: true });
  const stagedDiff = git(root, [
    'diff', '--cached', '--binary', '--full-index', '--no-ext-diff', '--no-textconv', '--no-renames', '--'
  ], { buffer: true });
  const unstagedDiff = git(root, [
    'diff', '--binary', '--full-index', '--no-ext-diff', '--no-textconv', '--no-renames', '--'
  ], { buffer: true });
  const untracked = git(root, ['ls-files', '--others', '--exclude-standard', '-z'], { buffer: true });
  const untrackedPaths = splitNullBuffer(untracked).sort(Buffer.compare);
  const hash = crypto.createHash('sha256');
  updateFramedHash(hash, 'algorithm', WORKTREE_BASELINE_ALGORITHM);
  updateFramedHash(hash, 'status', status);
  updateFramedHash(hash, 'index', index);
  updateFramedHash(hash, 'index_visibility', indexVisibility);
  updateFramedHash(hash, 'staged_diff', stagedDiff);
  updateFramedHash(hash, 'unstaged_diff', unstagedDiff);
  for (const rawPath of untrackedPaths) hashUntrackedEntry(hash, root, rawPath);
  return {
    baseline_algorithm: WORKTREE_BASELINE_ALGORITHM,
    baseline_digest: `sha256:${hash.digest('hex')}`,
    require_clean_enforced: requireCleanEnforced,
    status: status.length === 0 ? 'CLEAN' : 'DIRTY'
  };
};

const assertCleanWorktreeState = (root, worktreeState) => {
  if (worktreeState.status !== 'CLEAN') fail('CLEAN_WORKTREE_REQUIRED');
  const visibility = git(root, ['ls-files', '-v', '-z'], { buffer: true });
  const hiddenIndexEntries = splitNullBuffer(visibility).filter((entry) => /^[a-zS]/.test(entry.toString('utf8')));
  if (hiddenIndexEntries.length > 0) fail('INDEX_VISIBILITY_FLAGS_FORBIDDEN_WHEN_CLEAN_REQUIRED');
};

const assertReceiptWorktreeState = (worktreeState) => {
  if (!worktreeState || typeof worktreeState !== 'object' || Array.isArray(worktreeState)
    || stableStringify(Object.keys(worktreeState).sort()) !== stableStringify([...WORKTREE_STATE_FIELDS].sort())
    || worktreeState.baseline_algorithm !== WORKTREE_BASELINE_ALGORITHM
    || !/^sha256:[0-9a-f]{64}$/.test(worktreeState.baseline_digest ?? '')
    || typeof worktreeState.require_clean_enforced !== 'boolean'
    || !['CLEAN', 'DIRTY'].includes(worktreeState.status)) {
    fail('RECEIPT_WORKTREE_STATE_INVALID');
  }
};

const trustedGitEvidence = () => ({
  path: TRUSTED_GIT,
  version: gitText(null, ['--version']),
  binary_sha256: sha256(fs.readFileSync(TRUSTED_GIT))
});
const repositoryRoot = () => {
  try {
    return gitText(null, ['rev-parse', '--show-toplevel']);
  } catch {
    fail('NOT_INSIDE_GIT_REPOSITORY');
  }
};

const assertGitObjectIsolation = (root) => {
  const replacements = gitText(root, ['for-each-ref', '--format=%(refname)', 'refs/replace']);
  if (replacements) fail('GIT_REPLACEMENT_REFS_FORBIDDEN');
  const commonDirRaw = gitText(root, ['rev-parse', '--git-common-dir']);
  const commonDir = fs.realpathSync(path.isAbsolute(commonDirRaw) ? commonDirRaw : path.resolve(root, commonDirRaw));
  const alternatesPath = path.join(commonDir, 'objects', 'info', 'alternates');
  if (fs.existsSync(alternatesPath) && fs.readFileSync(alternatesPath, 'utf8').trim()) {
    fail('GIT_OBJECT_ALTERNATES_FORBIDDEN');
  }
};

const assertSafeRepositoryGitConfig = (root) => {
  const output = git(root, ['config', '--show-scope', '--name-only', '--list', '--no-includes', '--null']);
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
  if (entries.length % 2 !== 0) fail('GIT_CONFIG_ENTRY_UNPARSEABLE');
  for (let index = 0; index < entries.length; index += 2) {
    const [scope, name] = entries.slice(index, index + 2);
    if (!['command', 'local', 'worktree'].includes(scope)) fail('UNEXPECTED_GIT_CONFIG_SCOPE', scope);
    if (scope !== 'command' && dangerous(name)) fail('UNSAFE_REPOSITORY_GIT_CONFIG_FORBIDDEN', name);
  }
  const rawOrigins = gitOptional(root, ['config', '--local', '--get-all', '--null', 'remote.origin.url']) ?? '';
  const originUrls = rawOrigins.split('\0').filter(Boolean);
  if (originUrls.length !== 1 || !ACCEPTED_ORIGINS.includes(originUrls[0])) {
    fail('CANONICAL_ORIGIN_MISSING_OR_MISMATCHED', originUrls.join(',') || '<missing>');
  }
  return originUrls[0];
};

const receiptRoot = (root) => {
  const gitDir = fs.realpathSync(gitText(root, ['rev-parse', '--absolute-git-dir']));
  const target = path.join(gitDir, 'kidults-agent-bootstrap', 'receipts');
  if (!fs.existsSync(target)) fail('RECEIPT_DIRECTORY_MISSING');
  const realTarget = fs.realpathSync(target);
  if (!realTarget.startsWith(`${gitDir}${path.sep}`)) fail('RECEIPT_DIRECTORY_ESCAPES_GIT_DIR');
  return { gitDir, receipts: realTarget };
};

const readControlledReceipt = (root, suppliedPath) => {
  const roots = receiptRoot(root);
  const absolute = path.resolve(suppliedPath);
  if (path.dirname(absolute) !== roots.receipts) fail('RECEIPT_PATH_OUTSIDE_CONTROLLED_DIRECTORY');
  const stat = fs.lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) fail('RECEIPT_NOT_REGULAR_FILE');
  let receipt;
  try {
    receipt = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  } catch {
    fail('BOOTSTRAP_RECEIPT_INVALID_JSON');
  }
  return { receiptPath: absolute, roots, receipt };
};

const boundReceiptFilename = (receipt) => `receipt-${sha256Hex(stableStringify({
  agent_id: receipt.agent_id,
  task_id: receipt.task_id,
  session_id: receipt.session_id,
  nonce_sha256: receipt.nonce_sha256
}))}.json`;

const committedBlobAt = (root, revision, relativePath) => {
  const listing = gitText(root, ['ls-tree', revision, '--', relativePath]);
  const match = listing.match(/^(100644|100755) blob ([0-9a-f]{40})\t(.+)$/);
  if (!match || match[3] !== relativePath) fail('COMMITTED_TRUST_BLOB_MISSING_OR_NON_REGULAR', relativePath);
  const body = git(root, ['show', `${revision}:${relativePath}`], { buffer: true });
  const worktreePath = path.resolve(root, relativePath);
  if (!worktreePath.startsWith(`${path.resolve(root)}${path.sep}`)) fail('TRUST_PATH_ESCAPES_REPOSITORY');
  const stat = fs.lstatSync(worktreePath);
  if (!stat.isFile() || stat.isSymbolicLink()) fail('TRUST_PATH_NOT_REGULAR_FILE', relativePath);
  if (!body.equals(fs.readFileSync(worktreePath))) fail('TRUST_PATH_DIFFERS_FROM_COMMITTED_HEAD', relativePath);
  return {
    mode: match[1],
    git_oid: match[2],
    bytes: body.byteLength,
    sha256: sha256(body),
    body
  };
};

const assertReceiptDigest = (receipt, nonce) => {
  const { receipt_digest: supplied, ...withoutDigest } = receipt;
  if (!/^hmac-sha256:[0-9a-f]{64}$/.test(supplied ?? '')) fail('RECEIPT_DIGEST_MISMATCH');
  const suppliedDigest = Buffer.from(supplied.slice('hmac-sha256:'.length), 'hex');
  const computedDigest = crypto
    .createHmac('sha256', Buffer.from(nonce, 'utf8'))
    .update(stableStringify(withoutDigest), 'utf8')
    .digest();
  if (suppliedDigest.length !== computedDigest.length || !crypto.timingSafeEqual(suppliedDigest, computedDigest)) {
    fail('RECEIPT_DIGEST_MISMATCH');
  }
};

const assertBinding = (actual, expected, code) => {
  if (actual !== expected) fail(code, `${actual ?? '<missing>'}!=${expected}`);
};

const verifyDocumentSet = (root, receipt) => {
  const recordedDocuments = receipt.committed_documents ?? [];
  const recordedArtifacts = receipt.bootstrap_artifacts ?? [];
  const documentIdentity = recordedDocuments.map(({ order, path: documentPath, purpose }) => ({ order, path: documentPath, purpose }));
  if (stableStringify(documentIdentity) !== stableStringify(REQUIRED_DOCUMENTS)) {
    fail('RECEIPT_REQUIRED_DOCUMENT_SET_OR_ORDER_MISMATCH');
  }
  if (stableStringify(recordedArtifacts.map((artifact) => artifact.path)) !== stableStringify(BOOTSTRAP_ARTIFACT_PATHS)) {
    fail('RECEIPT_BOOTSTRAP_ARTIFACT_SET_OR_ORDER_MISMATCH');
  }
  const all = [...recordedDocuments, ...recordedArtifacts];
  const seen = new Set();
  for (const recorded of all) {
    if (!recorded?.path || seen.has(recorded.path)) fail('RECEIPT_TRUST_PATH_DUPLICATE_OR_MISSING');
    seen.add(recorded.path);
    const actual = committedBlobAt(root, receipt.working_sha, recorded.path);
    for (const field of ['mode', 'git_oid', 'bytes', 'sha256']) {
      assertBinding(recorded[field], actual[field], `RECEIPT_TRUST_${field.toUpperCase()}_MISMATCH`);
    }
    if (recorded.worktree_matches_commit !== true) fail('RECEIPT_WORKTREE_MATCH_NOT_TRUE', recorded.path);
  }
};

const verifyCommittedContract = (contract) => {
  const checks = [
    [contract.id === 'kidults-ai-agent-github-bootstrap-contract-v1', 'CONTRACT_ID'],
    [contract.version === '1.3.0', 'CONTRACT_VERSION'],
    [contract.status === 'MANDATORY_FAIL_CLOSED', 'CONTRACT_STATUS'],
    [contract.effective_after === 'MERGE_TO_MAIN', 'CONTRACT_EFFECTIVE_AFTER'],
    [contract.scope === 'ALL_AI_AGENT_INSTANCES_AND_AGENT_DISPATCHING_AUTOMATIONS', 'CONTRACT_SCOPE'],
    [contract.canonical_repository?.slug === REPOSITORY_SLUG, 'CONTRACT_REPOSITORY'],
    [contract.canonical_repository?.remote_name === REMOTE_NAME, 'CONTRACT_REMOTE'],
    [contract.canonical_repository?.authority_ref === AUTHORITY_REF, 'CONTRACT_AUTHORITY_REF'],
    [stableStringify(contract.canonical_repository?.accepted_origin_urls) === stableStringify(ACCEPTED_ORIGINS), 'CONTRACT_ORIGINS'],
    [stableStringify(contract.required_documents) === stableStringify(REQUIRED_DOCUMENTS), 'CONTRACT_REQUIRED_DOCUMENTS'],
    [stableStringify(contract.mandatory_phases) === stableStringify(MANDATORY_PHASES), 'CONTRACT_MANDATORY_PHASES'],
    [stableStringify(contract.required_receipt_fields) === stableStringify(REQUIRED_RECEIPT_FIELDS), 'CONTRACT_REQUIRED_RECEIPT_FIELDS'],
    [stableStringify(contract.inheritance?.applies_to) === stableStringify(GOVERNED_CLASSES), 'CONTRACT_GOVERNED_CLASSES'],
    [contract.task_dispatch_gate?.independent_receipt_verification_required === true, 'CONTRACT_INDEPENDENT_VERIFICATION'],
    [contract.task_dispatch_gate?.receipt_consumption_required === true, 'CONTRACT_CONSUMPTION'],
    [contract.task_dispatch_gate?.receipt_alone_grants_task_authority === false, 'CONTRACT_RECEIPT_AUTHORITY'],
    [contract.task_dispatch_gate?.non_consuming_audit_state_grants_task_authority === false, 'CONTRACT_AUDIT_STATE_AUTHORITY'],
    [contract.task_dispatch_gate?.external_expected_sha_required === true, 'CONTRACT_EXPECTED_SHA_REQUIRED'],
    [contract.task_dispatch_gate?.expected_sha_must_equal_working_sha === true, 'CONTRACT_EXPECTED_SHA_EQUALITY'],
    [contract.task_dispatch_gate?.expected_sha_match_state_must_be_true === true, 'CONTRACT_EXPECTED_SHA_MATCH_STATE'],
    [stableStringify(contract.bootstrap_authority) === stableStringify(BOOTSTRAP_AUTHORITY), 'CONTRACT_BOOTSTRAP_AUTHORITY'],
    [stableStringify(contract.receipt_authority_boundary) === stableStringify(RECEIPT_AUTHORITY_BOUNDARY), 'CONTRACT_RECEIPT_AUTHORITY_BOUNDARY'],
    [stableStringify(contract.fail_closed_conditions) === stableStringify(FAIL_CLOSED_CONDITIONS), 'CONTRACT_FAIL_CLOSED_CONDITIONS'],
    [stableStringify(contract.worktree_baseline_policy) === stableStringify(WORKTREE_BASELINE_POLICY), 'CONTRACT_WORKTREE_BASELINE_POLICY'],
    [contract.trust_model?.github_event_context_binding_is_not_cryptographic_or_current_state_proof === true, 'CONTRACT_GITHUB_CONTEXT_LIMIT'],
    [contract.trust_model?.current_github_state_requires_authenticated_remote_working_ref_verification === true, 'CONTRACT_CURRENT_GITHUB_STATE_PROOF'],
    [contract.trust_model?.full_root_of_trust_requires_an_external_pinned_or_protected_base_launcher === true, 'CONTRACT_EXTERNAL_ROOT'],
    [contract.trust_model?.clean_github_actions_checkout_alone_is_a_full_root_of_trust === false, 'CONTRACT_CLEAN_CHECKOUT_ROOT_ESCALATION'],
    [contract.trust_model?.target_revision_must_be_treated_as_data_by_the_root_launcher === true, 'CONTRACT_TARGET_AS_DATA'],
    [contract.trust_model?.exact_committed_governance_trust_closure_is_bound === true, 'CONTRACT_TRUST_CLOSURE'],
    [contract.trust_model?.full_worktree_immutability_is_claimed === false, 'CONTRACT_FULL_WORKTREE_ESCALATION'],
    [contract.trust_model?.git_child_process_environment_is_minimal_and_excludes_orchestrator_nonce === true, 'CONTRACT_GIT_ENVIRONMENT_ISOLATION'],
    [contract.trust_model?.repository_git_config_with_execution_or_transport_overrides_is_rejected === true, 'CONTRACT_GIT_CONFIG_ISOLATION'],
    [contract.trust_model?.receipt_top_level_field_set_is_exact_and_versioned === true, 'CONTRACT_EXACT_RECEIPT_FIELD_SET'],
    [contract.trust_model?.raw_orchestrator_nonce_may_appear_in_receipt_marker_or_output === false, 'CONTRACT_RAW_NONCE_OUTPUT_BOUNDARY'],
    [contract.trust_model?.trusted_git_evidence_is_inventory_not_root_of_trust === true, 'CONTRACT_GIT_EVIDENCE_BOUNDARY'],
    [contract.trust_model?.local_git_transport_is_default_deny_and_partial_clone_lazy_fetch_is_forbidden === true, 'CONTRACT_GIT_LAZY_FETCH_BOUNDARY'],
    [contract.trust_model?.already_started_node_process_preexec_environment_is_sanitized_by_repository_code === false, 'CONTRACT_PREEXEC_BOUNDARY'],
    [contract.trust_model?.protected_launcher_must_sanitize_preexec_loader_and_node_environment === true, 'CONTRACT_PROTECTED_LAUNCHER_REQUIREMENT'],
    [contract.identity_and_replay_policy?.one_time_consumption_scope === 'REPOSITORY_GIT_DIR', 'CONTRACT_CONSUMPTION_SCOPE'],
    [contract.identity_and_replay_policy?.external_dispatcher_requires_durable_protected_nonce_store === true, 'CONTRACT_EXTERNAL_NONCE_STORE'],
    [contract.identity_and_replay_policy?.receipt_integrity_algorithm === 'HMAC_SHA256_WITH_ORCHESTRATOR_NONCE', 'CONTRACT_RECEIPT_INTEGRITY_ALGORITHM'],
    [contract.identity_and_replay_policy?.unkeyed_receipt_digest_allowed === false, 'CONTRACT_UNKEYED_RECEIPT_DIGEST'],
    [contract.identity_and_replay_policy?.additional_receipt_top_level_fields_allowed === false, 'CONTRACT_ADDITIONAL_RECEIPT_FIELDS'],
    [contract.identity_and_replay_policy?.generated_receipt_filename_is_fixed_length_digest === true, 'CONTRACT_FIXED_LENGTH_RECEIPT_NAME'],
    [contract.identity_and_replay_policy?.raw_orchestrator_nonce_allowed_in_receipt_consumption_marker_or_process_output === false, 'CONTRACT_RAW_NONCE_PERSISTENCE_BOUNDARY'],
    [contract.identity_and_replay_policy?.expiry_rechecked_immediately_before_consumption === true, 'CONTRACT_EXPIRY_RECHECK'],
    [contract.github_provenance_policy?.github_event_context_scope === 'GITHUB_CONTEXT_BOUND', 'CONTRACT_GITHUB_CONTEXT_SCOPE'],
    [contract.github_provenance_policy?.github_event_context_establishes_current_github_state === false, 'CONTRACT_GITHUB_CONTEXT_STATE_ESCALATION'],
    [contract.github_provenance_policy?.remote_verification_uses_canonical_https_url_without_credential_helpers === true, 'CONTRACT_CANONICAL_REMOTE_URL'],
    [contract.github_provenance_policy?.remote_attestation_scope === 'TLS_SERVER_IDENTITY_AND_EXACT_REF_STATE', 'CONTRACT_REMOTE_ATTESTATION_SCOPE'],
    [stableStringify(contract.github_provenance_policy?.source_attestation_required_fields) === stableStringify(SOURCE_ATTESTATION_FIELDS), 'CONTRACT_SOURCE_ATTESTATION_FIELDS'],
    [contract.github_provenance_policy?.remote_authority_relationship_evaluation === 'NOT_EVALUATED', 'CONTRACT_REMOTE_AUTHORITY_RELATIONSHIP'],
    [contract.github_provenance_policy?.remote_ref_presence_does_not_authorize_or_promote === true, 'CONTRACT_REMOTE_REF_AUTHORITY_BOUNDARY'],
    [contract.github_provenance_policy?.bootstrap_promotion_eligible === false, 'CONTRACT_BOOTSTRAP_PROMOTION_ELIGIBILITY'],
    [contract.github_provenance_policy?.promotion_requires_separate_protected_gate === true, 'CONTRACT_PROTECTED_PROMOTION_GATE'],
    [contract.dispatcher_integration?.repository_dispatchers_must_invoke_bootstrap_and_verifier_before_agent_logic === true, 'CONTRACT_REPOSITORY_DISPATCH_GATE'],
    [contract.dispatcher_integration?.repository_dispatch_jobs_trust_tier === 'REPOSITORY_BOUND_NOT_FULL_ROOT_OF_TRUST', 'CONTRACT_REPOSITORY_DISPATCH_TRUST_TIER'],
    [contract.dispatcher_integration?.full_root_launcher_reference === 'EXTERNAL_PINNED_OR_PROTECTED_BASE_LAUNCHER', 'CONTRACT_FULL_ROOT_LAUNCHER_REFERENCE'],
    [stableStringify(contract.dispatcher_integration?.actual_ai_model_dispatch_jobs) === '[]', 'CONTRACT_ACTUAL_AI_MODEL_DISPATCH_JOBS'],
    [contract.dispatcher_integration?.repository_defense_in_depth_bootstrap_jobs_are_ai_or_model_dispatchers === false, 'CONTRACT_DEFENSE_IN_DEPTH_DISPATCH_CLASSIFICATION'],
    [stableStringify(contract.dispatcher_integration?.repository_defense_in_depth_bootstrap_jobs) === stableStringify(REPOSITORY_DEFENSE_IN_DEPTH_BOOTSTRAP_JOBS), 'CONTRACT_REPOSITORY_DEFENSE_IN_DEPTH_BOOTSTRAP_JOBS'],
    [contract.dispatcher_integration?.defense_in_depth_registration_reclassifies_job_as_ai_agent === false, 'CONTRACT_DEFENSE_IN_DEPTH_RECLASSIFICATION'],
    [contract.dispatcher_integration?.application_runtime_exclusions?.length === 1, 'CONTRACT_APPLICATION_EXCLUSION_COUNT'],
    [contract.dispatcher_integration?.application_runtime_exclusions?.[0]?.symbol === 'app/agent.py:KAIOSAgent', 'CONTRACT_APPLICATION_EXCLUSION_SYMBOL'],
    [contract.dispatcher_integration?.application_runtime_exclusions?.[0]?.classification === 'DETERMINISTIC_APPLICATION_PIPELINE', 'CONTRACT_APPLICATION_EXCLUSION_CLASSIFICATION'],
    [contract.dispatcher_integration?.application_runtime_exclusions?.[0]?.may_dispatch_ai_or_model_agents === false, 'CONTRACT_APPLICATION_EXCLUSION_AI_DISPATCH'],
    [contract.dispatcher_integration?.external_dispatch_without_verified_capability_is_forbidden_after_activation === true, 'CONTRACT_EXTERNAL_DISPATCH_GATE'],
    [contract.inheritance?.every_agent_instance_must_emit_own_receipt === true, 'CONTRACT_PER_AGENT_RECEIPT'],
    [contract.inheritance?.parent_receipt_may_replace_child_receipt === false, 'CONTRACT_PARENT_SUBSTITUTION'],
    [contract.inheritance?.agent_self_exemption_allowed === false, 'CONTRACT_SELF_EXEMPTION']
  ];
  for (const [condition, code] of checks) if (!condition) fail(code);
};

const remoteSha = (root, ref) => {
  let output;
  try {
    output = gitText(root, [
      '-c', 'http.lowSpeedLimit=1',
      '-c', 'http.lowSpeedTime=15',
      'ls-remote', '--exit-code', '--refs', ACCEPTED_ORIGINS[0], ref
    ], { network: 'https' });
  } catch (error) {
    if (error?.message === 'REMOTE_VERIFICATION_TIMEOUT') throw error;
    fail('REMOTE_REF_UNAVAILABLE_DURING_VERIFICATION', error?.stderr?.toString().trim() || ref);
  }
  const lines = output.split(/\r?\n/).filter(Boolean);
  if (lines.length !== 1) fail('REMOTE_REF_RESPONSE_AMBIGUOUS', ref);
  const [shaRaw, returnedRef, ...extra] = lines[0].split(/\s+/);
  const resolved = shaRaw?.toLowerCase();
  if (extra.length > 0 || returnedRef !== ref || !/^[0-9a-f]{40}$/.test(resolved ?? '')) {
    fail('REMOTE_REF_SHA_UNRESOLVED', ref);
  }
  return resolved;
};

const currentGithubEventContextBinding = (workingSha) => {
  if (process.env.GITHUB_ACTIONS !== 'true') fail('GITHUB_ACTIONS_ATTESTATION_ENV_REQUIRED');
  if (process.env.GITHUB_REPOSITORY !== REPOSITORY_SLUG) {
    fail('CANONICAL_GITHUB_REPOSITORY_ENV_MISMATCH', process.env.GITHUB_REPOSITORY || '<missing>');
  }
  const eventName = process.env.GITHUB_EVENT_NAME || 'unknown';
  if (eventName === 'pull_request_target') fail('PULL_REQUEST_TARGET_BOOTSTRAP_FORBIDDEN');
  let payload = null;
  if (process.env.GITHUB_EVENT_PATH) {
    try {
      payload = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
    } catch {
      fail('GITHUB_EVENT_PAYLOAD_UNREADABLE');
    }
  }
  let trustedSha = null;
  let source = 'GITHUB_SHA';
  if (eventName === 'pull_request') {
    trustedSha = payload?.pull_request?.head?.sha ?? null;
    source = 'pull_request.head.sha';
  } else if (eventName === 'push') {
    trustedSha = payload?.after ?? null;
    source = 'push.after';
  } else {
    trustedSha = process.env.GITHUB_SHA ?? null;
  }
  trustedSha = trustedSha?.toLowerCase() ?? null;
  if (!/^[0-9a-f]{40}$/.test(trustedSha ?? '')) fail('GITHUB_EVENT_TRUSTED_SHA_UNRESOLVED');
  if (trustedSha !== workingSha) fail('GITHUB_EVENT_CHECKOUT_SHA_MISMATCH', `${trustedSha}!=${workingSha}`);
  return {
    scope: 'GITHUB_CONTEXT_BOUND',
    repository: process.env.GITHUB_REPOSITORY,
    event_name: eventName,
    event_sha_source: source,
    event_sha: trustedSha,
    run_id: process.env.GITHUB_RUN_ID ?? null,
    run_attempt: process.env.GITHUB_RUN_ATTEMPT ?? null
  };
};

const verifySourceAttestation = (root, receipt) => {
  if (stableStringify(Object.keys(receipt.source_attestation ?? {}).sort())
    !== stableStringify([...SOURCE_ATTESTATION_FIELDS].sort())) {
    fail('SOURCE_ATTESTATION_FIELD_SET_MISMATCH');
  }
  if (receipt.source_attestation.authority_relationship !== 'NOT_EVALUATED'
    || receipt.source_attestation.remote_ref_presence_does_not_authorize_or_promote !== true
    || receipt.source_attestation.promotion_eligible !== false) {
    fail('SOURCE_ATTESTATION_AUTHORITY_BOUNDARY_INVALID');
  }
  const scope = receipt.source_attestation?.scope;
  if (scope === 'LOCAL_COMMIT_BOUND') {
    if (receipt.source_attestation.current_github_state_claims_allowed !== false) fail('LOCAL_RECEIPT_GITHUB_CLAIM_ALLOWED');
    if (receipt.source_attestation.github_event !== null || receipt.source_attestation.remote !== null) {
      fail('LOCAL_RECEIPT_CONTAINS_EXTERNAL_ATTESTATION');
    }
    return;
  }
  if (scope === 'GITHUB_CONTEXT_BOUND') {
    if (receipt.source_attestation.current_github_state_claims_allowed !== false) fail('GITHUB_CONTEXT_CURRENT_STATE_CLAIM_ALLOWED');
    if (receipt.source_attestation.remote !== null) fail('GITHUB_EVENT_RECEIPT_CONTAINS_REMOTE_ATTESTATION');
    const expectedEvent = currentGithubEventContextBinding(receipt.working_sha);
    if (stableStringify(receipt.source_attestation.github_event) !== stableStringify(expectedEvent)) {
      fail('GITHUB_EVENT_ATTESTATION_MISMATCH');
    }
    return;
  }
  if (scope === 'REMOTE_WORKING_REF_ATTESTED') {
    if (receipt.source_attestation.current_github_state_claims_allowed !== true) fail('REMOTE_CLAIM_NOT_ALLOWED');
    if (receipt.source_attestation.github_event !== null) fail('REMOTE_RECEIPT_CONTAINS_GITHUB_EVENT_ATTESTATION');
    const remote = receipt.source_attestation.remote;
    const expectedWorkingRef = `refs/heads/${receipt.working_ref}`;
    if (receipt.working_ref === 'DETACHED' || remote?.working_ref !== expectedWorkingRef || remote.working_sha !== receipt.working_sha) {
      fail('REMOTE_ATTESTATION_INVALID');
    }
    if (remoteSha(root, expectedWorkingRef) !== receipt.working_sha) fail('REMOTE_WORKING_ATTESTATION_STALE');
    if (remoteSha(root, AUTHORITY_REF) !== remote.authority_sha) fail('REMOTE_AUTHORITY_ATTESTATION_STALE');
    return;
  }
  fail('SOURCE_ATTESTATION_SCOPE_INVALID', scope ?? '<missing>');
};

const consumeReceipt = (roots, receipt, expiresAt) => {
  const consumedTarget = path.join(roots.gitDir, 'kidults-agent-bootstrap', 'consumed');
  fs.mkdirSync(consumedTarget, { recursive: true, mode: 0o700 });
  const consumedRoot = fs.realpathSync(consumedTarget);
  if (!consumedRoot.startsWith(`${roots.gitDir}${path.sep}`)) fail('CONSUMPTION_DIRECTORY_ESCAPES_GIT_DIR');
  const nonceDigest = receipt.nonce_sha256?.replace(/^sha256:/, '');
  if (!/^[0-9a-f]{64}$/.test(nonceDigest ?? '')) fail('NONCE_DIGEST_INVALID');
  const marker = path.join(consumedRoot, `${nonceDigest}.json`);
  let descriptor;
  try {
    if (Date.now() >= expiresAt) fail('BOOTSTRAP_RECEIPT_EXPIRED');
    const markerBody = `${JSON.stringify({
      id: 'kidults-ai-agent-bootstrap-consumption-v1',
      receipt_digest: receipt.receipt_digest,
      nonce_sha256: receipt.nonce_sha256,
      agent_id: receipt.agent_id,
      task_id: receipt.task_id,
      session_id: receipt.session_id,
      consumed_at: new Date().toISOString()
    }, null, 2)}\n`;
    if (containsRawMaterial(JSON.parse(markerBody), nonce)) fail('RAW_NONCE_PRESENT_IN_CONSUMPTION_MARKER');
    descriptor = fs.openSync(marker, 'wx', 0o600);
    fs.writeFileSync(descriptor, markerBody, 'utf8');
    fs.fsyncSync(descriptor);
  } catch (error) {
    if (error?.code === 'EEXIST') fail('BOOTSTRAP_NONCE_REPLAY', receipt.nonce_sha256);
    throw error;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
  return marker;
};

const options = parseArgs(process.argv.slice(2));
const nonce = process.env.KIDULTS_BOOTSTRAP_NONCE;
if (!nonce || Buffer.byteLength(nonce, 'utf8') < 32) fail('ORCHESTRATOR_NONCE_REQUIRED_MIN_32_BYTES');
const root = repositoryRoot();
const currentOrigin = assertSafeRepositoryGitConfig(root);
assertGitObjectIsolation(root);
const { receiptPath, roots, receipt } = readControlledReceipt(root, options.receipt);

if (receipt.id !== 'kidults-ai-agent-github-bootstrap-receipt-v1' || receipt.version !== '1.3.0') {
  fail('RECEIPT_ID_OR_VERSION_INVALID');
}
if (receipt.state !== 'BOOTSTRAP_PREREQUISITES_SATISFIED') fail('RECEIPT_STATE_INVALID');
if (stableStringify(Object.keys(receipt).sort()) !== stableStringify([...REQUIRED_RECEIPT_FIELDS].sort())) {
  fail('RECEIPT_FIELD_SET_MISMATCH');
}
if (containsRawMaterial(receipt, nonce)) fail('RAW_NONCE_PRESENT_IN_RECEIPT');
assertReceiptDigest(receipt, nonce);
if (path.basename(receiptPath) !== boundReceiptFilename(receipt)) {
  fail('RECEIPT_FILENAME_BINDING_MISMATCH');
}
assertBinding(receipt.agent_id, options.agentId, 'AGENT_ID_BINDING_MISMATCH');
assertBinding(receipt.agent_class, options.agentClass, 'AGENT_CLASS_BINDING_MISMATCH');
assertBinding(receipt.task_id, options.taskId, 'TASK_ID_BINDING_MISMATCH');
assertBinding(receipt.session_id, options.sessionId, 'SESSION_ID_BINDING_MISMATCH');
assertBinding(receipt.parent_agent_id, options.parentAgentId, 'PARENT_AGENT_ID_BINDING_MISMATCH');
assertBinding(receipt.working_sha, options.expectedSha.toLowerCase(), 'EXPECTED_SHA_BINDING_MISMATCH');
assertBinding(receipt.nonce_sha256, sha256(Buffer.from(nonce, 'utf8')), 'NONCE_BINDING_MISMATCH');
assertBinding(receipt.canonical_repository, REPOSITORY_SLUG, 'REPOSITORY_BINDING_MISMATCH');
assertBinding(receipt.authority_ref, AUTHORITY_REF, 'AUTHORITY_REF_BINDING_MISMATCH');
if (stableStringify(receipt.trusted_git) !== stableStringify(trustedGitEvidence())) {
  fail('TRUSTED_GIT_EVIDENCE_MISMATCH');
}
if (!ACCEPTED_ORIGINS.includes(currentOrigin) || receipt.origin?.remote_name !== REMOTE_NAME || receipt.origin?.url !== currentOrigin || receipt.origin?.verified !== true) {
  fail('ORIGIN_BINDING_INVALID');
}
if (gitText(root, ['rev-parse', 'HEAD']).toLowerCase() !== receipt.working_sha) fail('CURRENT_HEAD_CHANGED');
const currentWorkingRef = gitOptional(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']) ?? 'DETACHED';
assertBinding(receipt.working_ref, currentWorkingRef, 'CURRENT_WORKING_REF_CHANGED');
assertReceiptWorktreeState(receipt.worktree_state);
const initialVerifierWorktreeState = captureWorktreeState(root, receipt.worktree_state.require_clean_enforced);
if (stableStringify(initialVerifierWorktreeState) !== stableStringify(receipt.worktree_state)) {
  fail('CURRENT_WORKTREE_BASELINE_CHANGED');
}
if (receipt.worktree_state.require_clean_enforced) {
  assertCleanWorktreeState(root, initialVerifierWorktreeState);
}
if (receipt.local_authority_sha !== null && !/^[0-9a-f]{40}$/.test(receipt.local_authority_sha)) {
  fail('LOCAL_AUTHORITY_SHA_INVALID');
}

const issued = Date.parse(receipt.issued_at);
const expires = Date.parse(receipt.expires_at);
const now = Date.now();
if (!Number.isFinite(issued) || !Number.isFinite(expires) || expires <= issued) fail('RECEIPT_TIME_WINDOW_INVALID');
if (issued > now + 30_000) fail('RECEIPT_ISSUED_IN_FUTURE');
if (now >= expires) fail('BOOTSTRAP_RECEIPT_EXPIRED');
if (!Number.isInteger(receipt.ttl_seconds) || receipt.ttl_seconds < 60 || receipt.ttl_seconds > MAX_TTL_SECONDS) {
  fail('RECEIPT_TTL_INVALID');
}
if (expires - issued !== receipt.ttl_seconds * 1000) fail('RECEIPT_TTL_WINDOW_MISMATCH');

verifyDocumentSet(root, receipt);
const contractBlob = committedBlobAt(root, receipt.working_sha, CONTRACT_PATH);
let committedContract;
try {
  committedContract = JSON.parse(contractBlob.body.toString('utf8'));
} catch {
  fail('COMMITTED_BOOTSTRAP_CONTRACT_INVALID_JSON');
}
verifyCommittedContract(committedContract);
assertBinding(receipt.contract?.id, committedContract.id, 'CONTRACT_ID_BINDING_MISMATCH');
assertBinding(receipt.contract?.version, committedContract.version, 'CONTRACT_VERSION_BINDING_MISMATCH');
assertBinding(receipt.contract?.effective_after, committedContract.effective_after, 'CONTRACT_EFFECTIVE_BINDING_MISMATCH');
assertBinding(receipt.contract?.path, CONTRACT_PATH, 'CONTRACT_PATH_BINDING_MISMATCH');
assertBinding(receipt.contract?.git_oid, contractBlob.git_oid, 'CONTRACT_OID_BINDING_MISMATCH');
assertBinding(receipt.contract?.sha256, contractBlob.sha256, 'CONTRACT_DIGEST_BINDING_MISMATCH');
verifySourceAttestation(root, receipt);
if (receipt.expected_checkout_binding?.establishes_github_provenance !== false
  || receipt.expected_checkout_binding?.expected_sha !== receipt.working_sha
  || receipt.expected_checkout_binding?.matched !== true) {
  fail('RECEIPT_EXPECTED_SHA_BINDING_INVALID');
}
if (receipt.dispatch_gate?.task_execution_allowed_from_this_receipt_alone !== false) fail('RECEIPT_ALONE_TASK_GATE_OPEN');
if (receipt.dispatch_gate?.independent_verification_required !== true) fail('INDEPENDENT_VERIFICATION_NOT_REQUIRED');
if (receipt.dispatch_gate?.receipt_consumption_required !== true) fail('RECEIPT_CONSUMPTION_NOT_REQUIRED');
if (receipt.dispatch_gate?.bootstrap_prerequisites_satisfied !== true || receipt.dispatch_gate?.verified_state_required !== 'BOOTSTRAP_VERIFIED') {
  fail('DISPATCH_GATE_SEMANTICS_INVALID');
}
if (stableStringify(receipt.authority_boundary) !== stableStringify(RECEIPT_AUTHORITY_BOUNDARY)) {
  fail('AUTHORITY_BOUNDARY_FIELD_SET_MISMATCH');
}

const finalVerifierWorktreeState = captureWorktreeState(root, receipt.worktree_state.require_clean_enforced);
if (stableStringify(finalVerifierWorktreeState) !== stableStringify(receipt.worktree_state)
  || stableStringify(finalVerifierWorktreeState) !== stableStringify(initialVerifierWorktreeState)) {
  fail('CURRENT_WORKTREE_BASELINE_CHANGED');
}
if (receipt.worktree_state.require_clean_enforced) {
  assertCleanWorktreeState(root, finalVerifierWorktreeState);
}
const consumptionMarker = options.consume ? consumeReceipt(roots, receipt, expires) : null;
console.log(JSON.stringify({
  id: 'kidults-ai-agent-bootstrap-verification-v1',
  version: '1.3.0',
  state: options.consume ? 'BOOTSTRAP_VERIFIED' : 'BOOTSTRAP_AUDIT_VERIFIED',
  receipt_path: receiptPath,
  receipt_digest: receipt.receipt_digest,
  agent_id: receipt.agent_id,
  agent_class: receipt.agent_class,
  task_id: receipt.task_id,
  session_id: receipt.session_id,
  working_sha: receipt.working_sha,
  source_scope: receipt.source_attestation.scope,
  consumed: options.consume,
  consumption_marker: consumptionMarker,
  task_dispatch_allowed_for_bound_task_session: options.consume,
  authority_boundary: receipt.authority_boundary
}, null, 2));
