import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const SCRIPT = path.join(ROOT, 'scripts/ci/validate-d1-direct-writer-cutover-v2.mjs');
const SERVICE = path.join(ROOT, 'services/kidults-autonomous-intelligence/src');

function run(script, cwd = ROOT) {
  const result = spawnSync(process.execPath, [script, '--enforce-zero'], {
    cwd,
    encoding: 'utf8'
  });
  return { ...result, report: JSON.parse(result.stdout) };
}

test('D1 cutover validator resolves and scans the repository on this platform', () => {
  const result = run(SCRIPT);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.report.status, 'PASS');
  assert.equal(result.report.approved_projector_boundary_count, 1);
  assert.ok(result.report.scanned_files > 0);
});

test('D1 cutover validator rejects a writer outside the canonical boundary', async (t) => {
  const fixture = await mkdtemp(path.join(tmpdir(), 'kidults-d1-cutover-'));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  const fixtureScript = path.join(fixture, 'scripts/ci/validate-d1-direct-writer-cutover-v2.mjs');
  const fixtureService = path.join(fixture, 'services/kidults-autonomous-intelligence/src');
  await mkdir(path.dirname(fixtureScript), { recursive: true });
  await cp(SCRIPT, fixtureScript);
  await cp(SERVICE, fixtureService, { recursive: true });
  await writeFile(path.join(fixtureService, 'unauthorized-writer.ts'), "database.prepare('DELETE FROM evidence').run();\n");

  const result = run(fixtureScript, fixture);
  assert.equal(result.status, 1);
  assert.equal(result.report.status, 'HOLD');
  assert.ok(result.report.details.some((finding) =>
    finding.kind === 'STATIC_D1_MUTATION' && finding.file.endsWith('unauthorized-writer.ts')));
});
