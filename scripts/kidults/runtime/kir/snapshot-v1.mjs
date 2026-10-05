import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { PATHS, req } from './constants-v1.mjs';

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));

// Bind emitted digests to the exact immutable bytes that are evaluated.
// Caller-provided objects are accepted only when structurally equal to those bytes.
export function bindEvaluationSnapshot(provided) {
  const values = {};
  const digests = {};
  for (const [name, file] of Object.entries(PATHS)) {
    const bytes = fs.readFileSync(file);
    const parsed = JSON.parse(bytes.toString('utf8'));
    req(isDeepStrictEqual(provided[name], parsed), `KIR_EVALUATED_INPUT_FILE_MISMATCH:${name}`);
    values[name] = parsed;
    digests[`${name}_sha256`] = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  }
  return { values, digests };
}

export function loadKirRuntime() {
  return {
    contract: readJson(PATHS.contract),
    registry: readJson(PATHS.registry),
    readiness: readJson(PATHS.readiness),
  };
}
