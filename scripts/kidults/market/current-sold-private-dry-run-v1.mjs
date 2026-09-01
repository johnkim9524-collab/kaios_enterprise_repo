import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import {
  buildAtomicCurrentSoldBatchBundle
} from './current-sold-atomic-batch-v1.mjs';
import { canonicalJsonDigest } from './current-sold-batch-v1.mjs';

const EXECUTION_CLASSES = new Set(['CONTROL_SYNTHETIC', 'LAWFUL_EMPIRICAL_PRIVATE']);
const AUTHORITY_CLASSES = new Set(['CONTROL_SYNTHETIC_GENERATOR', 'GOVERNED_LEDGER_DIGEST']);
const SHA256_RE = /^sha256:[a-f0-9]{64}$/;
const MAX_INPUT_BYTES = 16 * 1024 * 1024;
const MAX_REGISTRY_BYTES = 16 * 1024 * 1024;

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
  if (runClass === 'LAWFUL_EMPIRICAL_PRIVATE' && normalized !== 'GOVERNED_LEDGER_DIGEST') {
    fail('CURRENT_SOLD_DRY_RUN_EMPIRICAL_AUTHORITY_MISMATCH');
  }
  return normalized;
}

function canonicalNow(value) {
  const now = value ?? new Date();
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) fail('CURRENT_SOLD_DRY_RUN_INVALID_NOW');
  return now;
}

function withinRoot(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export async function validateCurrentSoldDryRunInputPath(
  filePath,
  { executionClass: runClass, privateMountRoot, maxBytes = MAX_INPUT_BYTES } = {}
) {
  const classValue = executionClass(runClass);
  const rawPath = exactString(filePath, 'CURRENT_SOLD_DRY_RUN_INPUT_PATH_REQUIRED');
  const absolute = path.resolve(rawPath);
  const stats = await fs.lstat(absolute).catch(() => null);
  if (!stats || !stats.isFile() || stats.isSymbolicLink()) {
    fail('CURRENT_SOLD_DRY_RUN_INPUT_MUST_BE_REGULAR_FILE');
  }
  if (stats.size <= 0 || stats.size > maxBytes) fail('CURRENT_SOLD_DRY_RUN_INPUT_SIZE_INVALID');

  if (classValue === 'LAWFUL_EMPIRICAL_PRIVATE') {
    const rootValue = exactString(privateMountRoot, 'CURRENT_SOLD_DRY_RUN_PRIVATE_MOUNT_REQUIRED');
    if (!path.isAbsolute(rootValue)) fail('CURRENT_SOLD_DRY_RUN_PRIVATE_MOUNT_MUST_BE_ABSOLUTE');
    const root = path.resolve(rootValue);
    if (!withinRoot(absolute, root)) fail('CURRENT_SOLD_DRY_RUN_INPUT_OUTSIDE_PRIVATE_MOUNT');
    if ((stats.mode & 0o077) !== 0) fail('CURRENT_SOLD_DRY_RUN_INPUT_PERMISSIONS_TOO_OPEN');
  }
  return absolute;
}

async function readJson(filePath, code) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    fail(`${code}:${error.code ?? error.name}`);
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
  const effectiveNow = canonicalNow(now);
  const bundle = buildAtomicCurrentSoldBatchBundle(envelope, receiptRegistry, {
    now: effectiveNow,
    expectedReceiptRegistryDigest
  });
  const empiricalAdmitted =
    classValue === 'LAWFUL_EMPIRICAL_PRIVATE' && bundle.receipt.status === 'PASS'
      ? bundle.receipt.counts.admitted
      : 0;
  const controlSyntheticAdmitted =
    classValue === 'CONTROL_SYNTHETIC' && bundle.receipt.status === 'PASS'
      ? bundle.receipt.counts.admitted
      : 0;

  const identity = {
    execution_class: classValue,
    registry_authority_class: authorityValue,
    batch_receipt_id: bundle.receipt.receipt_id,
    source_sha: bundle.receipt.source_sha,
    canonical_run_id: bundle.receipt.canonical_run_id,
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
    batch_id: bundle.receipt.batch_id,
    batch_receipt_id: bundle.receipt.receipt_id,
    evaluated_at: bundle.receipt.evaluated_at,
    source_sha: bundle.receipt.source_sha,
    canonical_run_id: bundle.receipt.canonical_run_id,
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
      empirical_admitted: empiricalAdmitted,
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
        : 'PIPELINE_FUNCTIONAL_ONLY',
      synthetic_is_empirical: false,
      empirical_global_current_sold_claim: 'UNSET',
      public: 'HOLD',
      production: 'HOLD',
      g5: 'HOLD'
    }
  };
}

export async function writeCurrentSoldDryRunReceipt(outputPath, receipt) {
  const rawPath = exactString(outputPath, 'CURRENT_SOLD_DRY_RUN_OUTPUT_PATH_REQUIRED');
  const absolute = path.resolve(rawPath);
  await fs.mkdir(path.dirname(absolute), { recursive: true, mode: 0o700 });
  await fs.writeFile(absolute, `${JSON.stringify(receipt, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600
  });
  await fs.chmod(absolute, 0o600);
  return absolute;
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
  const inputPath = await validateCurrentSoldDryRunInputPath(args.get('--input'), {
    executionClass: classValue,
    privateMountRoot,
    maxBytes: MAX_INPUT_BYTES
  });
  const registryPath = await validateCurrentSoldDryRunInputPath(args.get('--receipt-registry'), {
    executionClass: classValue,
    privateMountRoot,
    maxBytes: MAX_REGISTRY_BYTES
  });
  const envelope = await readJson(inputPath, 'CURRENT_SOLD_DRY_RUN_INPUT_READ_FAILED');
  const receiptRegistry = await readJson(registryPath, 'CURRENT_SOLD_DRY_RUN_REGISTRY_READ_FAILED');
  const now = args.has('--now') ? new Date(args.get('--now')) : undefined;
  const receipt = buildCurrentSoldDryRunReceipt(envelope, receiptRegistry, {
    now,
    executionClass: classValue,
    registryAuthorityClass: args.get('--registry-authority-class'),
    expectedReceiptRegistryDigest: args.get('--expected-registry-digest')
  });
  const output = await writeCurrentSoldDryRunReceipt(args.get('--receipt-output'), receipt);
  process.stdout.write(`${JSON.stringify({
    receipt_id: receipt.receipt_id,
    status: receipt.status,
    execution_class: receipt.execution_class,
    empirical_admitted: receipt.counts.empirical_admitted,
    control_synthetic_admitted: receipt.counts.control_synthetic_admitted,
    ledger_write_performed: false,
    output,
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
