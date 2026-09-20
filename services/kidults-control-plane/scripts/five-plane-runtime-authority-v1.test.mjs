import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const serviceRoot = path.resolve(import.meta.dirname, '..');
const contract = JSON.parse(fs.readFileSync(path.join(serviceRoot,
  'contracts/five-plane-runtime-authority-v1.json'), 'utf8'));
const packageJson = JSON.parse(fs.readFileSync(path.join(serviceRoot, 'package.json'), 'utf8'));
const expectedPlanes = ['EXECUTION', 'DECISION', 'TRUTH', 'EVIDENCE', 'OBSERVABILITY_AND_RECOVERY'];
const expectedInvariants = [
  'I01_IMPLEMENTER_REVIEWER_SEPARATION', 'I02_PROVIDER_FAILURE_ISOLATION',
  'I03_AGENT_EXIT_TASK_SURVIVAL', 'I04_RUNTIME_TRUTH_PRECEDENCE',
  'I05_RIGHTS_REVOCATION_SCOPED_PROPAGATION', 'I06_AUTH_SIGNATURE_FAILURE_HARD_STOP',
  'I07_COMPONENT_FAILURE_LOCALIZATION', 'I08_EXACT_INPUT_OUTPUT_EVIDENCE_BINDING',
  'I09_TASK_LEASE_AND_CHECKPOINT', 'I10_ROLLBACK_OR_COMPENSATION_REQUIRED',
  'I11_PROTECTED_BOUNDARY_EXPLICIT_AUTHORITY', 'I12_IDEMPOTENT_EVENT_REPLAY',
];

function runtimeModules(directory = path.join(serviceRoot, 'src')) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? runtimeModules(absolute)
      : entry.isFile() && entry.name.endsWith('.mjs')
        ? [path.relative(serviceRoot, absolute).replaceAll('\\', '/')]
        : [];
  }).sort();
}

function validate(candidate) {
  const errors = [];
  if (candidate.contract_id !== 'KIDULTS_FIVE_PLANE_RUNTIME_AUTHORITY_V1') errors.push('CONTRACT_ID');
  if (JSON.stringify(candidate.plane_order) !== JSON.stringify(expectedPlanes)) errors.push('PLANE_ORDER');
  if (JSON.stringify(Object.keys(candidate.planes || {})) !== JSON.stringify(expectedPlanes)) errors.push('PLANE_SET');
  if (candidate.structure_limits?.plane_count !== 5) errors.push('PLANE_COUNT');
  if (candidate.structure_limits?.unclassified_runtime_modules_allowed !== 0 ||
      candidate.structure_limits?.multi_owner_runtime_modules_allowed !== 0 ||
      candidate.structure_limits?.new_controller_gate_or_registry_allowed !== false) errors.push('STRUCTURE_LIMITS');
  if (!/^[a-f0-9]{40}$/.test(candidate.baseline?.source_sha || '') ||
      !/^[a-f0-9]{40}$/.test(candidate.baseline?.source_tree || '')) errors.push('BASELINE_IDENTITY');
  if (candidate.baseline?.package !== packageJson.name || candidate.baseline?.package_version !== packageJson.version ||
      candidate.baseline?.authority !== 'READ_ONLY_INVENTORY_NOT_ACTIVATION') errors.push('PACKAGE_AUTHORITY');
  const assigned = expectedPlanes.flatMap((plane) => candidate.planes?.[plane]?.modules || []);
  const unique = new Set(assigned);
  if (unique.size !== assigned.length) errors.push('MULTI_OWNER_MODULE');
  if (JSON.stringify([...unique].sort()) !== JSON.stringify(runtimeModules())) errors.push('RUNTIME_INVENTORY_DRIFT');
  for (const plane of expectedPlanes) {
    const item = candidate.planes?.[plane];
    if (!item?.responsibility || !Array.isArray(item.forbidden) || item.forbidden.length < 1) errors.push(`PLANE_BOUNDARY:${plane}`);
  }
  if (JSON.stringify(candidate.invariants) !== JSON.stringify(expectedInvariants)) errors.push('INVARIANT_SET');
  if (candidate.activation?.remote_runtime !== 'HOLD' || candidate.activation?.production !== 'HOLD' ||
      candidate.activation?.public !== 'HOLD' || candidate.activation?.g5 !== 'HOLD') errors.push('PROTECTED_BOUNDARY');
  return errors;
}

test('all runtime modules have exactly one owner in the fixed five-plane architecture', () => {
  assert.deepEqual(validate(contract), []);
});

for (const [label, mutate, expected] of [
  ['sixth plane', value => { value.plane_order.push('NEW_PLANE'); }, 'PLANE_ORDER'],
  ['unclassified module', value => { value.planes.EXECUTION.modules.pop(); }, 'RUNTIME_INVENTORY_DRIFT'],
  ['duplicate owner', value => { value.planes.TRUTH.modules.push(value.planes.EXECUTION.modules[0]); }, 'MULTI_OWNER_MODULE'],
  ['missing invariant', value => { value.invariants.pop(); }, 'INVARIANT_SET'],
  ['production activation', value => { value.activation.production = 'ACTIVE'; }, 'PROTECTED_BOUNDARY'],
]) test(`five-plane contract fails closed on ${label}`, () => {
  const candidate = structuredClone(contract);
  mutate(candidate);
  assert.ok(validate(candidate).includes(expected));
});
