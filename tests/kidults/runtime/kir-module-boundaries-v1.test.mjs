#!/usr/bin/env node
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadKirModuleArchitecture,
  validateKirModuleArchitecture,
} from '../../../scripts/kidults/runtime/validate-kir-module-boundaries-v1.mjs';

const clone = value => structuredClone(value);
const baseline = loadKirModuleArchitecture();
const fresh = () => ({ policy: clone(baseline.policy), sources: { ...baseline.sources } });
const validate = loaded => validateKirModuleArchitecture(loaded || fresh());

test('KIR is composed through a bounded public entrypoint and acyclic private modules', () => {
  const result = validate();
  assert.deepEqual(result, {
    id: 'kidults-kir-module-boundary-validation-v1',
    state: 'VERIFIED_PASS',
    module_count: 5,
    dependency_cycle: false,
    private_import_bypass: false,
    provider_authority: false,
    database_authority: false,
    production: 'HOLD',
    public: 'HOLD',
    g5: 'HOLD',
  });
});

test('undeclared module coupling fails closed', () => {
  const loaded = fresh();
  const graph = loaded.policy.modules.find(module => module.id === 'graph');
  loaded.sources[graph.file] += "\nimport './snapshot-v1.mjs';\n";
  assert.throws(() => validate(loaded), /KIR_ARCH_DEPENDENCY_DRIFT:graph/);
});

test('cyclic module policy fails closed', () => {
  const loaded = fresh();
  const constants = loaded.policy.modules.find(module => module.id === 'constants');
  constants.dependencies = ['evaluator'];
  loaded.sources[constants.file] += "\nimport './evaluator-v1.mjs';\n";
  assert.throws(() => validate(loaded), /KIR_ARCH_DEPENDENCY_CYCLE/);
});

test('private module bypass outside the public entrypoint fails closed', () => {
  const loaded = fresh();
  loaded.sources['scripts/kidults/runtime/kir-current-sold-control-bridge-v1.mjs'] += "\nimport './kir/evaluator-v1.mjs';\n";
  assert.throws(() => validate(loaded), /KIR_ARCH_PRIVATE_IMPORT_BYPASS/);
});

test('module process side effects and size growth fail closed', () => {
  const sideEffect = fresh();
  const snapshot = sideEffect.policy.modules.find(module => module.id === 'snapshot');
  sideEffect.sources[snapshot.file] += '\nprocess.exitCode = 0;\n';
  assert.throws(() => validate(sideEffect), /KIR_ARCH_MODULE_SIDE_EFFECT:snapshot/);

  const oversized = fresh();
  const constants = oversized.policy.modules.find(module => module.id === 'constants');
  constants.max_nonempty_lines = 1;
  assert.throws(() => validate(oversized), /KIR_ARCH_MODULE_TOO_LARGE:constants/);
});

test('HOLD or authority relaxation in architecture policy fails closed', () => {
  for (const mutate of [
    policy => { policy.constraints.production = 'READY'; },
    policy => { policy.constraints.provider_calls_allowed = true; },
    policy => { policy.constraints.database_writes_allowed = true; },
    policy => { policy.constraints.deployment_allowed = true; },
  ]) {
    const loaded = fresh();
    mutate(loaded.policy);
    assert.throws(() => validate(loaded), /KIR_ARCH_(RELEASE_HOLD|AUTHORITY_POLICY)/);
  }
});
