import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = resolve(root, 'src', 'd1-projector-write-boundary.ts');
const runtimePath = resolve(root, 'src', 'asi', 'runtime.ts');
const temp = mkdtempSync(resolve(tmpdir(), 'kaios-d1-readonly-e2e-'));

try {
  const source = readFileSync(sourcePath, 'utf8');
  const output = ts.transpileModule(source, {
    fileName: 'd1-projector-write-boundary.ts',
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const compiled = resolve(temp, 'boundary.mjs');
  writeFileSync(compiled, output, 'utf8');
  const boundary = await import(pathToFileURL(compiled).href);

  let prepareCalls = 0;
  const database = {
    prepare(sql) {
      prepareCalls += 1;
      return { sql, bind() { return this; }, run: async () => ({ success: true }) };
    },
  };

  assert.throws(
    () => boundary.prepareD1ProjectionWrite(database, 'INSERT INTO audit_log(id) VALUES (?)'),
    /D1_LEGACY_RUNTIME_WRITE_DISABLED_USE_CONTROL_PLANE_PROJECTOR/,
  );
  assert.equal(prepareCalls, 0, 'write boundary must not prepare a D1 mutation');

  assert.throws(
    () => boundary.prepareD1ProjectionWrite(database, 'DROP TABLE audit_log'),
    /D1_PROJECTOR_WRITE_BOUNDARY_NON_MUTATION|D1_PROJECTOR_WRITE_BOUNDARY_SCHEMA_MUTATION_DENIED/,
  );
  assert.equal(prepareCalls, 0, 'schema mutation must not touch D1');

  const readStatement = boundary.prepareD1ProjectionRead(database, 'SELECT id FROM audit_log LIMIT 1');
  assert.equal(readStatement.sql, 'SELECT id FROM audit_log LIMIT 1');
  assert.equal(prepareCalls, 1, 'only the classified read path may prepare D1 SQL');

  const runtimeSource = readFileSync(runtimePath, 'utf8');
  assert.match(runtimeSource, /prepareD1ProjectionWrite/);
  assert.doesNotMatch(runtimeSource, /\b(?:env\.)?DB\.prepare\s*\(/);
  assert.doesNotMatch(runtimeSource, /\b(?:env\.)?DB\.exec\s*\(/);

  console.log(JSON.stringify({
    status: 'PASS',
    gate: 'ASI_D1_READ_ONLY_RUNTIME_BOUNDARY',
    write_prepare_calls: 0,
    classified_read_prepare_calls: prepareCalls,
    legacy_runtime_mutation: 'FAIL_CLOSED',
    production: 'HOLD',
  }));
} finally {
  rmSync(temp, { recursive: true, force: true });
}
