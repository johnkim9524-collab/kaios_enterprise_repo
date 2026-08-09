#!/usr/bin/env node
/**
 * A32 — Production Reality Gate & End-to-End Live Acceptance
 * Top-level entrypoint: scripts/a32-production-reality-gate.mjs
 *
 * Delegates to the canonical service-level harness.
 * Mode is controlled via A32_MODE environment variable (default: SIMULATION).
 */

import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const harness = path.resolve(__dirname, '../services/kidults-autonomous-intelligence/scripts/a32-production-reality-gate.mjs');

console.log('[A32] Launching production reality gate...');
execSync(`node ${JSON.stringify(harness)}`, {
  stdio: 'inherit',
  env: { ...process.env },
});
