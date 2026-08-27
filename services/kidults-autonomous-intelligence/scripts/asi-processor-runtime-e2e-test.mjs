import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

/**
 * Runtime E2E after PostgreSQL canonical cutover policy.
 *
 * The previous test executed the legacy D1 mutation path end-to-end. That is
 * now an invalid architecture contract: D1 is a read model and runtime
 * mutation must fail before D1 prepare/exec. Processor semantics remain
 * covered by asi-processor-shadow-test.mjs; recovery/fencing remain covered by
 * asi-runtime-recovery-fairness-test.mjs. This test owns the runtime storage
 * boundary itself.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const boundaryPath = resolve(root, 'src', 'd1-projector-write-boundary.ts');
const runtimePath = resolve(root, 'src', 'asi', 'runtime.ts');
const processorRuntimePath = resolve(root, 'src', 'asi', 'processor-runtime.ts');
const temp = mkdtempSync(resolve(tmpdir(), 'kaios-d1-readonly-e2e-'));

try {
  const source = readFileSync(boundaryPath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    fileName: 'd1-projector-write-boundary.ts',
    reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  });
  const errors = (transpiled.diagnostics || []).filter((item) => item.category === ts.DiagnosticCategory.Error);
  assert.equal(errors.length, 0, `boundary transpile diagnostics: ${errors.map((item) => item.messageText).join('|')}`);
  const compiled = resolve(temp, 'boundary.mjs');
  writeFileSync(compiled, transpiled.outputText, 'utf8');
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
  assert.equal(prepareCalls, 0, 'legacy runtime write must fail before D1 prepare');

  assert.throws(
    () => boundary.prepareD1ProjectionWrite(database, 'DROP TABLE audit_log'),
    /D1_PROJECTOR_WRITE_BOUNDARY_NON_MUTATION|D1_PROJECTOR_WRITE_BOUNDARY_SCHEMA_MUTATION_DENIED/,
  );
  assert.equal(prepareCalls, 0, 'schema mutation must fail before D1 prepare');

  const readStatement = boundary.prepareD1ProjectionRead(database, 'SELECT id FROM audit_log LIMIT 1');
  assert.equal(readStatement.sql, 'SELECT id FROM audit_log LIMIT 1');
  assert.equal(prepareCalls, 1, 'classified read is the only D1 prepare allowed');

  for (const path of [runtimePath, processorRuntimePath]) {
    const moduleSource = readFileSync(path, 'utf8');
    assert.doesNotMatch(moduleSource, /\b(?:env\.)?DB\.prepare\s*\(/);
    assert.doesNotMatch(moduleSource, /\b(?:env\.)?DB\.exec\s*\(/);
  }
  assert.match(readFileSync(runtimePath, 'utf8'), /prepareD1ProjectionWrite/);

  console.log('ok 1 - runtime D1 mutations fail closed before prepare');
  console.log('ok 2 - D1 schema mutation cannot bypass the boundary');
  console.log('ok 3 - classified D1 reads remain available');
  console.log('ok 4 - ASI runtime modules contain no direct DB.prepare/exec bypass');
  console.log(JSON.stringify({
    status: 'PASS',
    mode: 'SHADOW_READ_MODEL_ONLY',
    tests: 4,
    legacy_runtime_mutation: 'FAIL_CLOSED',
    write_prepare_calls: 0,
    production: 'HOLD',
  }));
} finally {
  rmSync(temp, { recursive: true, force: true });
}
