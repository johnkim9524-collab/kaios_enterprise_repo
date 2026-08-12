import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const SERVICE_ROOT = process.cwd();
const REPO_ROOT = path.resolve(SERVICE_ROOT, '..', '..');
const SCRIPT = path.join(SERVICE_ROOT, 'scripts', 'kidults-integrated-program-registry-gate.mjs');
const LIVE_COORDINATION_ROOT = path.join(REPO_ROOT, 'coordination', 'kidults');

function run(coordinationRoot) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-program-gate-'));
  const output = path.join(dir, 'report.json');
  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd: SERVICE_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      KIDULTS_COORDINATION_ROOT: coordinationRoot,
      KIDULTS_INTEGRATED_PROGRAM_GATE_OUTPUT: output,
    },
  });
  const report = fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, 'utf8')) : null;
  fs.rmSync(dir, { recursive: true, force: true });
  return { result, report };
}

test('current integrated program registry bootstraps safely without inventing snapshot or production readiness', () => {
  const { result, report } = run(LIVE_COORDINATION_ROOT);
  assert.equal(result.status, 0);
  assert.equal(report.status, 'PASS_BOOTSTRAPPING');
  assert.equal(report.required_registry_count, 14);
  assert.equal(report.loaded_registry_count, 14);
  assert.equal(report.current_snapshot_id, null);
  assert.equal(report.claims.production_ready, false);
  assert.equal(report.claims.snapshot_id_inferred_or_synthesized, false);
  assert.equal(report.claims.provider_procured, false);
});

test('missing registry root fails closed and still emits a diagnostic report', () => {
  const missingRoot = path.join(os.tmpdir(), `kidults-missing-${process.pid}-${Date.now()}`);
  const { result, report } = run(missingRoot);
  assert.equal(result.status, 1);
  assert.equal(report.status, 'FAIL_CLOSED');
  assert.equal(report.loaded_registry_count, 0);
  assert.match(report.failures[0], /^MISSING_FILE:/);
});

test('unsafe production state is rejected without changing any registry data', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-program-copy-'));
  fs.cpSync(LIVE_COORDINATION_ROOT, tempRoot, { recursive: true });
  const programPath = path.join(tempRoot, 'registry', 'program-registry.json');
  const program = JSON.parse(fs.readFileSync(programPath, 'utf8'));
  program.production_state = 'PRODUCTION_READY';
  fs.writeFileSync(programPath, JSON.stringify(program, null, 2));
  const { result, report } = run(tempRoot);
  fs.rmSync(tempRoot, { recursive: true, force: true });
  assert.equal(result.status, 1);
  assert.equal(report.status, 'FAIL_CLOSED');
  assert.ok(report.failures.includes('PRODUCTION_FAIL_CLOSED_STATE_INVALID'));
  assert.equal(report.claims.production_ready, false);
});
