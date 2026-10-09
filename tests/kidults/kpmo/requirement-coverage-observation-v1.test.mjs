import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyCoverageObservation } from '../../../scripts/kidults/kpmo/classify-requirement-coverage-observation-v1.mjs';

const sha = 'a'.repeat(40);
const run = { id: 77, run_attempt: 1, status: 'completed', conclusion: 'success', event: 'workflow_run', head_branch: 'main', head_sha: sha,
  path: '.github/workflows/kidults-asi-requirement-adapter-coverage-v1.yml', repository: { full_name: 'o/r' }, head_repository: { full_name: 'o/r' } };
const artifact = (name, id = 9) => ({ id, name, expired: false, digest: `sha256:${'b'.repeat(64)}`, workflow_run: { id: 77, head_sha: sha } });
const admission = { id: 'kidults-asi-requirement-coverage-admission-v1', version: '1.0.0', state: 'VERIFIED_SKIP',
  admission: 'EXPECTED_NONAUTHORITATIVE_SKIP', reason: 'ARL_PUSH_RECOVERY_NONAUTHORITATIVE', repository: 'o/r', execution_sha: sha,
  should_run: false, promotion_authority: false, production: 'HOLD', public_release: 'HOLD', g5: 'HOLD' };

test('full Coverage artifact authorizes the existing exact binding audit', () => {
  const result = classifyCoverageObservation({ run, artifacts: { artifacts: [artifact('kidults-asi-requirement-adapter-coverage-v1')] }, admission: null });
  assert.equal(result.execute_full_audit, true);
});

test('verified admission-only skip is observed without Coverage authority', () => {
  const result = classifyCoverageObservation({ run, artifacts: { artifacts: [artifact('kidults-asi-requirement-coverage-admission-v1-77-1')] }, admission });
  assert.equal(result.execute_full_audit, false);
  assert.equal(result.coverage_authority, false);
  assert.match(result.receipt_digest, /^sha256:[a-f0-9]{64}$/);
});

test('missing, duplicated, or authority-elevating admission fails closed', () => {
  assert.throws(() => classifyCoverageObservation({ run, artifacts: { artifacts: [] }, admission }), /CARDINALITY/);
  assert.throws(() => classifyCoverageObservation({ run, artifacts: { artifacts: [artifact('kidults-asi-requirement-coverage-admission-v1-77-1'), artifact('kidults-asi-requirement-coverage-admission-v1-77-1', 10)] }, admission }), /CARDINALITY/);
  assert.throws(() => classifyCoverageObservation({ run, artifacts: { artifacts: [artifact('kidults-asi-requirement-coverage-admission-v1-77-1')] }, admission: { ...admission, promotion_authority: true } }), /INVALID/);
});
