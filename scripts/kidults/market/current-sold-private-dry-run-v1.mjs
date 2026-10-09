import { constants as FS_CONSTANTS } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import {
  buildAtomicCurrentSoldBatchBundle
} from './current-sold-atomic-batch-v1.mjs';
import { canonicalJsonDigest } from './current-sold-batch-v1.mjs';

const EXECUTION_CLASSES = new Set(['CONTROL_SYNTHETIC', 'EMPIRICAL_CANDIDATE_PRIVATE']);
const AUTHORITY_CLASSES = new Set(['CONTROL_SYNTHETIC_GENERATOR', 'EXTERNAL_EXACT_DIGEST_UNVERIFIED']);
const SHA256_RE = /^sha256:[a-f0-9]{64}$/;
const MAX_INPUT_BYTES = 16 * 1024 * 1024;
const MAX_REGISTRY_BYTES = 16 * 1024 * 1024;
const PRIVATE_FILE_MODE = 0o600;
const PRIVATE_DIRECTORY_MODE = 0o700;

function fail(code) {
  throw new Error(code);
}

function exactString(value, code) {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) fail(code);
  return value;
}

function executionClass(value) {
  const normalized = exactString(value, 'CURRENT_SOLD_DRY_RUN_EXECUTION_CLASS_REQUIRED');
  if (!EXECUTION_CLASSES.has(normalized)) fail('CURRENT_SOLD_DRY_RUN_EXECUTION_CLASS_INVALID');
  return normalized;
}

function authorityClass(value, runClass) {
  const normalized = exactString(value, 'CURRENT_SOLD_DRY_RUN_AUTHORITY_CLASS_REQUIRED');
  if (!AUTHORITY_CLASSES.has(normalized)) fail('CURRENT_SOLD_DRY_RUN_AUTHORITY_CLASS_INVALID');
  if (runClass === 'CONTROL_SYNTHETIC' && normalized !== 'CONTROL_SYNTHETIC_GENERATOR') {
    fail('CURRENT_SOLD_DRY_RUN_CONTROL_AUTHORITY_MISMATCH');
  }
  if (runClass === 'EMPIRICAL_CANDIDATE_PRIVATE' && normalized !== 'EXTERNAL_EXACT_DIGEST_UNVERIFIED') {
    fail('CURRENT_SOLD_DRY_RUN_CANDIDATE_AUTHORITY_MISMATCH');
  }
  return normalized;
}

function canonicalNow(value, runClass) {
  if (runClass === 'EMPIRICAL_CANDIDATE_PRIVATE' && value !== undefined) {
    fail('CURRENT_SOLD_DRY_RUN_EMPIRICAL_TIME_OVERRIDE_FORBIDDEN');
  }
  const now = value ?? new Date();
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) fail('CURRENT_SOLD_DRY_RUN_INVALID_NOW');
  return now;
}

function withinRoot(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function exactMode(stats, expected, code) {
  if ((stats.mode & 0o777) !== expected) fail(code);
}

async function privateRoot(privateMountRoot) {
  const rootValue = exactString(privateMountRoot, 'CURRENT_SOLD_DRY_RUN_PRIVATE_MOUNT_REQUIRED');
  if (!path.isAbsolute(rootValue)) fail('CURRENT_SOLD_DRY_RUN_PRIVATE_MOUNT_MUST_BE_ABSOLUTE');
  const lexicalRoot = path.resolve(rootValue);
  const stats = await fs.lstat(lexicalRoot).catch(() => null);
  if (!stats || !stats.isDirectory() || stats.isSymbolicLink()) {
    fail('CURRENT_SOLD_DRY_RUN_PRIVATE_MOUNT_INVALID');
  }
  exactMode(stats, PRIVATE_DIRECTORY_MODE, 'CURRENT_SOLD_DRY_RUN_PRIVATE_MOUNT_MODE_INVALID');
  const realRoot = await fs.realpath(lexicalRoot);
  return { lexicalRoot, realRoot };
}

async function assertNoSymlinkComponents(root, target, includeFinal = true) {
  const relative = path.relative(root, target);
  if (!withinRoot(target, root)) fail('CURRENT_SOLD_DRY_RUN_PATH_OUTSIDE_PRIVATE_MOUNT');
  const parts = relative.split(path.sep).filter(Boolean);
  const limit = includeFinal ? parts.length : Math.max(parts.length - 1, 0);
  let current = root;
  for (let index = 0; index < limit; index += 1) {
    current = path.join(current, parts[index]);
    const stats = await fs.lstat(current).catch(() => null);
    if (!stats) fail('CURRENT_SOLD_DRY_RUN_PATH_COMPONENT_MISSING');
    if (stats.isSymbolicLink()) fail('CURRENT_SOLD_DRY_RUN_SYMLINK_COMPONENT_FORBIDDEN');
  }
}

async function inspectInputPath(filePath, { executionClass: runClass, privateMountRoot, maxBytes }) {
  const classValue = executionClass(runClass);
  const rawPath = exactString(filePath, 'CURRENT_SOLD_DRY_RUN_INPUT_PATH_REQUIRED');
  const absolute = path.resolve(rawPath);
  let root = null;

  if (classValue === 'EMPIRICAL_CANDIDATE_PRIVATE') {
    root = await privateRoot(privateMountRoot);
    if (!withinRoot(absolute, root.lexicalRoot)) fail('CURRENT_SOLD_DRY_RUN_INPUT_OUTSIDE_PRIVATE_MOUNT');
    await assertNoSymlinkComponents(root.lexicalRoot, absolute, true);
  }

  const stats = await fs.lstat(absolute).catch(() => null);
  if (!stats || !stats.isFile() || stats.isSymbolicLink()) {
    fail('CURRENT_SOLD_DRY_RUN_INPUT_MUST_BE_REGULAR_FILE');
  }
  if (stats.nlink !== 1) fail('CURRENT_SOLD_DRY_RUN_INPUT_HARDLINK_FORBIDDEN');
  if (stats.size <= 0 || stats.size > maxBytes) fail('CURRENT_SOLD_DRY_RUN_INPUT_SIZE_INVALID');

  const realPath = await fs.realpath(absolute);
  if (classValue === 'EMPIRICAL_CANDIDATE_PRIVATE') {
    if (!withinRoot(realPath, root.realRoot)) fail('CURRENT_SOLD_DRY_RUN_INPUT_REALPATH_OUTSIDE_PRIVATE_MOUNT');
    exactMode(stats, PRIVATE_FILE_MODE, 'CURRENT_SOLD_DRY_RUN_INPUT_MODE_INVALID');
  }

  return {
    canonicalPath: realPath,
    device: stats.dev,
    inode: stats.ino,
    size: stats.size,
    mode: stats.mode & 0o777
  };
}

export async function validateCurrentSoldDryRunInputPath(
  filePath,
  { executionClass: runClass, privateMountRoot, maxBytes = MAX_INPUT_BYTES } = {}
) {
  const descriptor = await inspectInputPath(filePath, {
    executionClass: runClass,
    privateMountRoot,
    maxBytes
  });
  return descriptor.canonicalPath;
}

async function readValidatedJson(filePath, options, code) {
  const descriptor = await inspectInputPath(filePath, options);
  let handle;
  try {
    handle = await fs.open(descriptor.canonicalPath, FS_CONSTANTS.O_RDONLY | FS_CONSTANTS.O_NOFOLLOW);
    const opened = await handle.stat();
    if (!opened.isFile() || opened.dev !== descriptor.device || opened.ino !== descriptor.inode || opened.size !== descriptor.size) {
      fail('CURRENT_SOLD_DRY_RUN_INPUT_INODE_CHANGED');
    }
    if (options.executionClass === 'EMPIRICAL_CANDIDATE_PRIVATE') {
      exactMode(opened, PRIVATE_FILE_MODE, 'CURRENT_SOLD_DRY_RUN_INPUT_MODE_CHANGED');
    }
    return JSON.parse(await handle.readFile('utf8'));
  } catch (error) {
    if (String(error?.message || '').startsWith('CURRENT_SOLD_')) throw error;
    fail(`${code}:${error.code ?? error.name}`);
  } finally {
    await handle?.close().catch(() => {});
  }
}

export function buildCurrentSoldDryRunReceipt(
  envelope,
  receiptRegistry,
  {
    now,
    executionClass: runClass,
    registryAuthorityClass,
    expectedReceiptRegistryDigest
  } = {}
) {
  const classValue = executionClass(runClass);
  const authorityValue = authorityClass(registryAuthorityClass, classValue);
  if (typeof expectedReceiptRegistryDigest !== 'string' || !SHA256_RE.test(expectedReceiptRegistryDigest)) {
    fail('CURRENT_SOLD_DRY_RUN_EXPECTED_REGISTRY_DIGEST_REQUIRED');
  }
  const effectiveNow = canonicalNow(now, classValue);
  const bundle = buildAtomicCurrentSoldBatchBundle(envelope, receiptRegistry, {
    now: effectiveNow,
    expectedReceiptRegistryDigest
  });
  const privateCandidateAdmitted =
    classValue === 'EMPIRICAL_CANDIDATE_PRIVATE' && bundle.receipt.status === 'PASS'
      ? bundle.receipt.counts.admitted
      : 0;
  const controlSyntheticAdmitted =
    classValue === 'CONTROL_SYNTHETIC' && bundle.receipt.status === 'PASS'
      ? bundle.receipt.counts.admitted
      : 0;

  const batchIdDigest = canonicalJsonDigest({ batch_id: bundle.receipt.batch_id });
  const canonicalRunIdDigest = canonicalJsonDigest({ canonical_run_id: bundle.receipt.canonical_run_id });
  const identity = {
    execution_class: classValue,
    registry_authority_class: authorityValue,
    batch_receipt_id: bundle.receipt.receipt_id,
    source_sha: bundle.receipt.source_sha,
    canonical_run_id_digest: canonicalRunIdDigest,
    evaluated_at: bundle.receipt.evaluated_at,
    envelope_digest: bundle.receipt.envelope_digest,
    receipt_registry_digest: bundle.receipt.receipt_registry_digest,
    admission_digest: bundle.receipt.admission_digest,
    event_versions_digest: bundle.receipt.event_versions_digest,
    evidence_digest: bundle.receipt.evidence_digest
  };

  return {
    schema_version: 'current-sold-private-dry-run-receipt-v1',
    receipt_id: `csdr_${canonicalJsonDigest(identity).slice(7, 31)}`,
    receipt_type: 'CURRENT_SOLD_PRIVATE_DRY_RUN',
    status: bundle.receipt.status,
    execution_class: classValue,
    registry_authority_class: authorityValue,
    batch_id_digest: batchIdDigest,
    batch_receipt_id: bundle.receipt.receipt_id,
    evaluated_at: bundle.receipt.evaluated_at,
    clock: {
      authority: classValue === 'CONTROL_SYNTHETIC' ? 'CONTROL_FIXED_OR_SYSTEM_UTC' : 'SYSTEM_UTC',
      override_used: classValue === 'CONTROL_SYNTHETIC' && now !== undefined
    },
    authority: {
      registry_digest_exact_match: true,
      governed_registry_authority_verified: false,
      lawful_admission_authorized: false
    },
    source_sha: bundle.receipt.source_sha,
    canonical_run_id_digest: canonicalRunIdDigest,
    envelope_digest: bundle.receipt.envelope_digest,
    receipt_registry_digest: bundle.receipt.receipt_registry_digest,
    admission_digest: bundle.receipt.admission_digest,
    event_versions_digest: bundle.receipt.event_versions_digest,
    evidence_digest: bundle.receipt.evidence_digest,
    counts: {
      input: bundle.receipt.counts.input,
      validated_candidates: bundle.admission.validated_candidate_count,
      admitted: bundle.receipt.counts.admitted,
      rejected: bundle.receipt.counts.rejected,
      quarantined: bundle.receipt.counts.quarantined,
      superseded: bundle.receipt.counts.superseded,
      evidence: bundle.receipt.counts.evidence,
      lawful_empirical_admitted: 0,
      private_candidate_admitted: privateCandidateAdmitted,
      control_synthetic_admitted: controlSyntheticAdmitted
    },
    atomicity: {
      whole_batch_atomic: true,
      non_pass_admission_withheld: bundle.receipt.status === 'PASS'
        ? true
        : bundle.receipt.counts.admitted === 0 && bundle.receipt.counts.evidence === 0
    },
    privacy: {
      raw_input_emitted: false,
      raw_registry_emitted: false,
      raw_event_versions_emitted: false,
      raw_evidence_emitted: false,
      raw_bundle_persisted: false,
      stdout_redacted: true,
      receipt_file_mode: '0600'
    },
    ledger: {
      write_requested: false,
      write_performed: false,
      migration_applied: false,
      rows_written: 0,
      pass_bundle_eligible: bundle.receipt.ledger.write_eligible
    },
    claim_boundary: {
      claim_ceiling: classValue === 'CONTROL_SYNTHETIC'
        ? 'CONTROL_ONLY'
        : 'PRIVATE_PIPELINE_CANDIDATE_ONLY',
      synthetic_is_empirical: false,
      candidate_is_lawful_empirical: false,
      empirical_global_current_sold_claim: 'UNSET',
      public: 'HOLD',
      production: 'HOLD',
      g5: 'HOLD'
    }
  };
}

async function prepareOutputTarget(outputPath, { executionClass: runClass, privateMountRoot } = {}) {
  const classValue = executionClass(runClass);
  const rawPath = exactString(outputPath, 'CURRENT_SOLD_DRY_RUN_OUTPUT_PATH_REQUIRED');
  const absolute = path.resolve(rawPath);
  const parent = path.dirname(absolute);

  if (classValue === 'CONTROL_SYNTHETIC') {
    await fs.mkdir(parent, { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
    return { privateOutput: false, absolute };
  }

  if (process.platform !== 'linux' || !FS_CONSTANTS.O_DIRECTORY) {
    fail('CURRENT_SOLD_DRY_RUN_PRIVATE_OUTPUT_PLATFORM_UNSUPPORTED');
  }
  const root = await privateRoot(privateMountRoot);
  if (!withinRoot(absolute, root.lexicalRoot)) fail('CURRENT_SOLD_DRY_RUN_OUTPUT_OUTSIDE_PRIVATE_MOUNT');
  await assertNoSymlinkComponents(root.lexicalRoot, parent, true);
  const parentStats = await fs.lstat(parent).catch(() => null);
  if (!parentStats || !parentStats.isDirectory() || parentStats.isSymbolicLink()) {
    fail('CURRENT_SOLD_DRY_RUN_OUTPUT_PARENT_INVALID');
  }
  exactMode(parentStats, PRIVATE_DIRECTORY_MODE, 'CURRENT_SOLD_DRY_RUN_OUTPUT_PARENT_MODE_INVALID');
  const realParent = await fs.realpath(parent);
  if (!withinRoot(realParent, root.realRoot)) fail('CURRENT_SOLD_DRY_RUN_OUTPUT_REALPATH_OUTSIDE_PRIVATE_MOUNT');
  const existing = await fs.lstat(absolute).catch(error => {
    if (error?.code === 'ENOENT') return null;
    throw error;
  });
  if (existing) fail('CURRENT_SOLD_DRY_RUN_OUTPUT_ALREADY_EXISTS');
  return {
    privateOutput: true,
    absolute: path.join(realParent, path.basename(absolute)),
    parentPath: realParent,
    parentDevice: parentStats.dev,
    parentInode: parentStats.ino,
    basename: path.basename(absolute)
  };
}

export async function writeCurrentSoldDryRunReceipt(outputPath, receipt, options = {}) {
  const target = await prepareOutputTarget(outputPath, options);
  let parentHandle;
  let handle;
  try {
    let openPath = target.absolute;
    if (target.privateOutput) {
      parentHandle = await fs.open(
        target.parentPath,
        FS_CONSTANTS.O_RDONLY | FS_CONSTANTS.O_DIRECTORY | FS_CONSTANTS.O_NOFOLLOW
      );
      const parentStats = await parentHandle.stat();
      if (!parentStats.isDirectory() ||
          parentStats.dev !== target.parentDevice ||
          parentStats.ino !== target.parentInode) {
        fail('CURRENT_SOLD_DRY_RUN_OUTPUT_PARENT_INODE_CHANGED');
      }
      exactMode(parentStats, PRIVATE_DIRECTORY_MODE, 'CURRENT_SOLD_DRY_RUN_OUTPUT_PARENT_MODE_CHANGED');
      openPath = `/proc/self/fd/${parentHandle.fd}/${target.basename}`;
    }
    handle = await fs.open(
      openPath,
      FS_CONSTANTS.O_WRONLY | FS_CONSTANTS.O_CREAT | FS_CONSTANTS.O_EXCL | FS_CONSTANTS.O_NOFOLLOW,
      PRIVATE_FILE_MODE
    );
    await handle.writeFile(`${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
    await handle.sync();
    await handle.chmod(PRIVATE_FILE_MODE);
    const stats = await handle.stat();
    if (!stats.isFile() || stats.nlink !== 1) fail('CURRENT_SOLD_DRY_RUN_OUTPUT_FILE_INVALID');
    exactMode(stats, PRIVATE_FILE_MODE, 'CURRENT_SOLD_DRY_RUN_OUTPUT_MODE_INVALID');
  } finally {
    await handle?.close().catch(() => {});
    await parentHandle?.close().catch(() => {});
  }
  return target.absolute;
}

function parseArgs(argv) {
  if (argv.length % 2 !== 0) fail('CURRENT_SOLD_DRY_RUN_INVALID_CLI_ARGUMENTS');
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined || value.startsWith('--')) {
      fail('CURRENT_SOLD_DRY_RUN_INVALID_CLI_ARGUMENTS');
    }
    if (values.has(key)) fail('CURRENT_SOLD_DRY_RUN_DUPLICATE_CLI_ARGUMENT');
    values.set(key, value);
  }
  const allowed = new Set([
    '--input',
    '--receipt-registry',
    '--expected-registry-digest',
    '--registry-authority-class',
    '--execution-class',
    '--receipt-output',
    '--private-mount-root',
    '--now'
  ]);
  for (const key of values.keys()) {
    if (!allowed.has(key)) fail('CURRENT_SOLD_DRY_RUN_UNKNOWN_CLI_ARGUMENT');
  }
  for (const required of [
    '--input',
    '--receipt-registry',
    '--expected-registry-digest',
    '--registry-authority-class',
    '--execution-class',
    '--receipt-output'
  ]) {
    if (!values.has(required)) {
      fail(`CURRENT_SOLD_DRY_RUN_CLI_MISSING_${required.slice(2).replaceAll('-', '_').toUpperCase()}`);
    }
  }
  return values;
}

export async function runCurrentSoldPrivateDryRunCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const classValue = executionClass(args.get('--execution-class'));
  const privateMountRoot = args.get('--private-mount-root');
  if (classValue === 'EMPIRICAL_CANDIDATE_PRIVATE' && args.has('--now')) {
    fail('CURRENT_SOLD_DRY_RUN_EMPIRICAL_TIME_OVERRIDE_FORBIDDEN');
  }
  const inputOptions = {
    executionClass: classValue,
    privateMountRoot,
    maxBytes: MAX_INPUT_BYTES
  };
  const registryOptions = {
    executionClass: classValue,
    privateMountRoot,
    maxBytes: MAX_REGISTRY_BYTES
  };
  const envelope = await readValidatedJson(
    args.get('--input'),
    inputOptions,
    'CURRENT_SOLD_DRY_RUN_INPUT_READ_FAILED'
  );
  const receiptRegistry = await readValidatedJson(
    args.get('--receipt-registry'),
    registryOptions,
    'CURRENT_SOLD_DRY_RUN_REGISTRY_READ_FAILED'
  );
  const now = args.has('--now') ? new Date(args.get('--now')) : undefined;
  const receipt = buildCurrentSoldDryRunReceipt(envelope, receiptRegistry, {
    now,
    executionClass: classValue,
    registryAuthorityClass: args.get('--registry-authority-class'),
    expectedReceiptRegistryDigest: args.get('--expected-registry-digest')
  });
  const output = await writeCurrentSoldDryRunReceipt(args.get('--receipt-output'), receipt, {
    executionClass: classValue,
    privateMountRoot
  });
  process.stdout.write(`${JSON.stringify({
    receipt_id: receipt.receipt_id,
    status: receipt.status,
    execution_class: receipt.execution_class,
    lawful_empirical_admitted: receipt.counts.lawful_empirical_admitted,
    private_candidate_admitted: receipt.counts.private_candidate_admitted,
    control_synthetic_admitted: receipt.counts.control_synthetic_admitted,
    governed_registry_authority_verified: false,
    ledger_write_performed: false,
    receipt_written: true,
    public: 'HOLD',
    production: 'HOLD',
    g5: 'HOLD'
  })}\n`);
  return receipt.status === 'PASS' ? 0 : 2;
}

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (entry === import.meta.url) {
  runCurrentSoldPrivateDryRunCli()
    .then(code => {
      process.exitCode = code;
    })
    .catch(error => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    });
}
