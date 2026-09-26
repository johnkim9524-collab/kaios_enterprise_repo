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
const coverageContract = JSON.parse(fs.readFileSync(
  'coordination/kidults/source-intelligence/asi-requirement-adapter-coverage-contract-v1.json',
  'utf8',
));
const producerWorkflow = fs.readFileSync(
  '.github/workflows/kidults-asi-autonomous-resolution-layer-v1.yml',
  'utf8',
).replace(/\r\n/g, '\n');

test('Requirement consumes the same v1.4 binding emitted by its workflow', () => {
  assert.equal(schema.properties.version.const, '1.4.0');
  assert.match(workflow, /version:'1\.4\.0'/);
  assert.match(builder, /artifactBinding\.version === '1\.4\.0'/);
});

test('both governed ARL producer events require exact run binding', () => {
  assert.deepEqual(schema.properties.workflow_event.enum, ['workflow_run', 'workflow_dispatch']);
  assert.equal(schema.properties.exact_triggering_run_bound.const, true);
  assert.match(builder, /validateAuthorityChainTriggerCompatibility/);
  assert.match(builder, /resolutionReceipt\.trigger_event === artifactBinding\.workflow_event/);
});

test('legacy and unbound bindings remain fail closed', () => {
  assert.notEqual(schema.properties.version.const, '1.3.0');
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.authoritative_producer_event.const, true);
});

test('ARL receipt producer and Requirement consumer share the canonical version contract', () => {
  assert.equal(coverageContract.version, '1.3.0');
  assert.equal(coverageContract.authoritative_inputs.resolution_receipt_version, '1.2.0');
  assert.match(producerWorkflow, /kpmo-receipt-v1',version:'1\.2\.0'/);
  assert.match(builder, /resolutionReceipt\.version === input\.resolution_receipt_version/);
  assert.doesNotMatch(builder, /resolutionReceipt\.version === '1\.1\.0'/);
});

test('repository policy enforces LF for cross-platform contract bytes', () => {
  assert.match(gitAttributes, /^\* text=auto eol=lf$/m);
});

test('registry validation normalizes Windows CRLF before workflow shell parsing', () => {
  assert.match(registryValidator, /readFileSync\(file, 'utf8'\)\.replace\(\/\\r\\n\/g, '\\n'\)/);
  assert.match(registryValidator, /Git\\\\bin\\\\bash\.exe/);
  assert.match(registryValidator, /WORKFLOW_ARL_EVENT_SHELL_UNAVAILABLE/);
  assert.match(orchestrationValidator, /readFileSync\(path, 'utf8'\)\.replace\(\/\\r\\n\/g, '\\n'\)/);
  assert.match(mutationBoundaryValidator, /readFileSync\(file, 'utf8'\)\.replace\(\/\\r\\n\/g, '\\n'\)/);
});
