#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_MANIFEST_PATH = 'coordination/kidults/kpmo/trusted-governed-control-freeze-v1.json';

export class TrustedControlFreezeError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'TrustedControlFreezeError';
    this.code = code;
    this.detail = detail;
  }
}

const fail = (code, detail = '') => {
  throw new TrustedControlFreezeError(code, detail);
};

const repositoryRootForThisModule = () => path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);

const assertRepositoryRelativePath = (value) => {
  if (typeof value !== 'string' || !value || value.includes('\\')) {
    fail('TRUSTED_CONTROL_FREEZE_PATH_INVALID', String(value));
  }
  const normalized = path.posix.normalize(value);
  if (normalized !== value || normalized.startsWith('../') || path.posix.isAbsolute(value)) {
    fail('TRUSTED_CONTROL_FREEZE_PATH_INVALID', value);
  }
  return value;
};

const readRegularFile = (root, relative, role) => {
  const absolute = path.resolve(root, relative);
  const expectedPrefix = `${path.resolve(root)}${path.sep}`;
  if (!absolute.startsWith(expectedPrefix)) fail('TRUSTED_CONTROL_FREEZE_PATH_ESCAPE', relative);
  let stat;
  try {
    stat = fs.lstatSync(absolute);
  } catch (error) {
    if (error?.code === 'ENOENT') fail('TRUSTED_CONTROL_FREEZE_FILE_MISSING', `${role}:${relative}`);
    throw error;
  }
  if (stat.isSymbolicLink()) fail('TRUSTED_CONTROL_FREEZE_SYMLINK_FORBIDDEN', `${role}:${relative}`);
  if (!stat.isFile()) fail('TRUSTED_CONTROL_FREEZE_REGULAR_FILE_REQUIRED', `${role}:${relative}`);
  return fs.readFileSync(absolute);
};

const parseManifest = (trustedRoot, manifestPath) => {
  const manifestBytes = readRegularFile(trustedRoot, manifestPath, 'trusted');
  let manifest;
  try {
    manifest = JSON.parse(manifestBytes.toString('utf8'));
  } catch (error) {
    fail('TRUSTED_CONTROL_FREEZE_MANIFEST_INVALID_JSON', error.message);
  }
  if (manifest.id !== 'kidults-trusted-governed-control-freeze-v1') {
    fail('TRUSTED_CONTROL_FREEZE_MANIFEST_ID_INVALID', String(manifest.id));
  }
  if (manifest.version !== '1.0.0') {
    fail('TRUSTED_CONTROL_FREEZE_MANIFEST_VERSION_INVALID', String(manifest.version));
  }
  if (manifest.comparison !== 'EXACT_BYTES_FROM_TRUSTED_BASE') {
    fail('TRUSTED_CONTROL_FREEZE_COMPARISON_MODE_INVALID', String(manifest.comparison));
  }
  if (!Array.isArray(manifest.immutable_paths) || manifest.immutable_paths.length === 0) {
    fail('TRUSTED_CONTROL_FREEZE_IMMUTABLE_SET_EMPTY');
  }
  const immutablePaths = manifest.immutable_paths.map(assertRepositoryRelativePath);
  if (new Set(immutablePaths).size !== immutablePaths.length) {
    fail('TRUSTED_CONTROL_FREEZE_DUPLICATE_PATH');
  }
  if (!immutablePaths.includes(manifestPath)) {
    fail('TRUSTED_CONTROL_FREEZE_MANIFEST_NOT_SELF_FROZEN', manifestPath);
  }
  if (!immutablePaths.includes('scripts/kidults/kpmo/validate-trusted-governed-control-freeze-v1.mjs')) {
    fail('TRUSTED_CONTROL_FREEZE_VALIDATOR_NOT_SELF_FROZEN');
  }
  return { manifest, immutablePaths };
};

export function validateTrustedControlFreeze({
  trustedRoot = repositoryRootForThisModule(),
  candidateRoot = process.cwd(),
  manifestPath = DEFAULT_MANIFEST_PATH,
} = {}) {
  const normalizedManifestPath = assertRepositoryRelativePath(manifestPath);
  const resolvedTrustedRoot = path.resolve(trustedRoot);
  const resolvedCandidateRoot = path.resolve(candidateRoot);
  const { manifest, immutablePaths } = parseManifest(resolvedTrustedRoot, normalizedManifestPath);
  const aggregate = crypto.createHash('sha256');

  for (const relative of immutablePaths) {
    const trustedBytes = readRegularFile(resolvedTrustedRoot, relative, 'trusted');
    const candidateBytes = readRegularFile(resolvedCandidateRoot, relative, 'candidate');
    if (!crypto.timingSafeEqual(
      crypto.createHash('sha256').update(trustedBytes).digest(),
      crypto.createHash('sha256').update(candidateBytes).digest(),
    ) || trustedBytes.length !== candidateBytes.length || !trustedBytes.equals(candidateBytes)) {
      fail('TRUSTED_CONTROL_FREEZE_EXACT_BYTES_MISMATCH', relative);
    }
    aggregate.update(relative, 'utf8');
    aggregate.update('\0');
    aggregate.update(trustedBytes);
    aggregate.update('\0');
  }

  return {
    id: 'kidults-trusted-governed-control-freeze-receipt-v1',
    result: 'PASS',
    comparison: manifest.comparison,
    trusted_base_only_validator: true,
    candidate_executable_used_as_authority: false,
    immutable_path_count: immutablePaths.length,
    immutable_path_set_sha256: `sha256:${aggregate.digest('hex')}`,
    update_path: manifest.update_path,
    bootstrap_exception_required: true,
    production: 'HOLD',
    public_release: 'HOLD',
    g5: 'HOLD',
  };
}

function parseArguments(argv) {
  const values = {
    trustedRoot: repositoryRootForThisModule(),
    candidateRoot: process.cwd(),
    manifestPath: DEFAULT_MANIFEST_PATH,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (!['--trusted-root', '--candidate-root', '--manifest'].includes(name)) {
      fail('TRUSTED_CONTROL_FREEZE_ARGUMENT_INVALID', name);
    }
    const value = argv[index + 1];
    if (!value) fail('TRUSTED_CONTROL_FREEZE_ARGUMENT_VALUE_MISSING', name);
    index += 1;
    if (name === '--trusted-root') values.trustedRoot = value;
    if (name === '--candidate-root') values.candidateRoot = value;
    if (name === '--manifest') values.manifestPath = value;
  }
  return values;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    console.log(JSON.stringify(validateTrustedControlFreeze(parseArguments(process.argv.slice(2))), null, 2));
  } catch (error) {
    const code = error?.code || 'TRUSTED_CONTROL_FREEZE_UNEXPECTED_FAILURE';
    console.error(`FAIL ${code}${error?.detail ? `: ${error.detail}` : ''}`);
    process.exit(1);
  }
}
