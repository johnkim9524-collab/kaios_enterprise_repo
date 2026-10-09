#!/usr/bin/env node
// Stable KIR public entrypoint. Domain logic lives in bounded modules under ./kir/.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { PATHS, REPOSITORY } from './kir/constants-v1.mjs';
import { evaluateKirRuntime, validateKirRuntime } from './kir/evaluator-v1.mjs';
import { loadKirRuntime } from './kir/snapshot-v1.mjs';

export { PATHS, evaluateKirRuntime, loadKirRuntime, validateKirRuntime };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const loaded = loadKirRuntime();
  if (process.argv.includes('--validate')) {
    process.stdout.write(`${JSON.stringify(validateKirRuntime(loaded), null, 2)}\n`);
  } else if (process.argv.includes('--evaluate')) {
    const identity = {
      repository: process.env.GITHUB_REPOSITORY || REPOSITORY,
      source_sha: process.env.KIR_SOURCE_SHA || process.env.GITHUB_SHA || '',
      run_id: Number(process.env.GITHUB_RUN_ID || 0),
      run_attempt: Number(process.env.GITHUB_RUN_ATTEMPT || 0),
      trigger_event: process.env.GITHUB_EVENT_NAME || 'unknown',
    };
    const receipt = evaluateKirRuntime({ ...loaded, identity });
    if (process.env.KIR_RECEIPT_PATH) {
      fs.writeFileSync(process.env.KIR_RECEIPT_PATH, `${JSON.stringify(receipt, null, 2)}\n`);
    }
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  } else {
    throw new Error('USAGE: --validate or --evaluate');
  }
}
