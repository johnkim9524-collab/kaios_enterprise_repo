import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const schema = JSON.parse(fs.readFileSync(
  'coordination/kidults/schemas/asi-autonomous-resolution-artifact-binding-v1.schema.json',
  'utf8',
));
const builder = fs.readFileSync(
  'scripts/kidults/source-intelligence/build-asi-requirement-adapter-coverage-v1.mjs',
  'utf8',
).replace(/\r\n/g, '\n');
const workflow = fs.readFileSync(
  '.github/workflows/kidults-asi-requirement-adapter-coverage-v1.yml',
  'utf8',
).replace(/\r\n/g, '\n');
const registryValidator = fs.readFileSync(
  'scripts/kidults/source-intelligence/validate-asi-requirement-adapter-coverage-registry-v1.mjs',
  'utf8',
).replace(/\r\n/g, '\n');
const orchestrationValidator = fs.readFileSync(
  'scripts/kidults/redteam/validate-artifact-consumer-orchestration-v1.mjs',
  'utf8',
).replace(/\r\n/g, '\n');
const mutationBoundaryValidator = fs.readFileSync(
  'scripts/kidults/kpmo/validate-workflow-repository-mutation-boundary-v1.mjs',
  'utf8',
).replace(/\r\n/g, '\n');
const gitAttributes = fs.readFileSync('.gitattributes', 'utf8').replace(/\r\n/g, '\n');

test('Requirement consumes the same v1.4 binding emitted by its workflow', () => {
  assert.equal(schema.properties.version.const, '1.4.0');
  assert.match(workflow, /version:'1\.4\.0'/);
  assert.match(builder, /artifactBinding\.version === '1\.4\.0'/);
});

test('both governed ARL producer events require exact run binding', () => {
  assert.deepEqual(schema.properties.workflow_event.enum, ['workflow_run', 'workflow_dispatch']);
  assert.equal(schema.properties.exact_triggering_run_bound.const, true);
  assert.match(builder, /new Set\(\['workflow_run', 'workflow_dispatch'\]\)/);
  assert.match(builder, /artifactBinding\.exact_triggering_run_bound === true/);
});

test('legacy and unbound bindings remain fail closed', () => {
  assert.notEqual(schema.properties.version.const, '1.3.0');
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.authoritative_producer_event.const, true);
});

test('registry validation normalizes Windows CRLF before workflow shell parsing', () => {
  assert.match(registryValidator, /readFileSync\(file, 'utf8'\)\.replace\(\/\\r\\n\/g, '\\n'\)/);
  assert.match(registryValidator, /Git\\\\bin\\\\bash\.exe/);
  assert.match(registryValidator, /WORKFLOW_ARL_EVENT_SHELL_UNAVAILABLE/);
  assert.match(orchestrationValidator, /readFileSync\(path, 'utf8'\)\.replace\(\/\\r\\n\/g, '\\n'\)/);
  assert.match(mutationBoundaryValidator, /readFileSync\(file, 'utf8'\)\.replace\(\/\\r\\n\/g, '\\n'\)/);
  assert.match(gitAttributes, /^\* text=auto eol=lf$/m);
});
