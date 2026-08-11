import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'scripts', 'kidult100-stage2-wikidata-type-verify.mjs');
const POLICY = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'kidult100-wikidata-type-verification-policy.json'), 'utf8'));

function run(policy) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wikidata-type-policy-'));
  const output = path.join(dir, 'poc.json');
  const audit = path.join(dir, 'audit.json');
  const input = { mode: 'KIDULT100_VALUE_BEFORE_DATA_POC', candidates: [] };
  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      KIDULTS_WIKIDATA_TYPE_POLICY_JSON: JSON.stringify(policy),
      KIDULTS_WIKIDATA_TYPE_INPUT_JSON: JSON.stringify(input),
      KIDULTS_WIKIDATA_TYPE_OUTPUT: output,
      KIDULTS_WIKIDATA_TYPE_AUDIT_OUTPUT: audit,
    },
  });
  fs.rmSync(dir, { recursive: true, force: true });
  return result;
}

test('type verifier rejects invalid policy identity and incomplete identity', () => {
  const invalidPolicy = run({ ...POLICY, policy: 'WRONG_POLICY' });
  assert.notEqual(invalidPolicy.status, 0);
  assert.match(invalidPolicy.stderr, /Invalid Wikidata type verification policy/);

  const incompleteIdentity = run({ ...POLICY, targetSourceClass: '' });
  assert.notEqual(incompleteIdentity.status, 0);
  assert.match(incompleteIdentity.stderr, /Incomplete Wikidata type verification policy identity/);
});

test('type verifier rejects missing type controls, relaxed required rules, and unsafe safety flags', () => {
  const missingControls = run({ ...POLICY, allowedTypeTermsByVertical: null });
  assert.notEqual(missingControls.status, 0);
  assert.match(missingControls.stderr, /requires type controls/);

  const relaxedRule = run({ ...POLICY, rules: { ...POLICY.rules, directP31Only: false } });
  assert.notEqual(relaxedRule.status, 0);
  assert.match(relaxedRule.stderr, /Unsafe Wikidata type verification rule: directP31Only/);

  const unsafeSafety = run({ ...POLICY, safety: { ...POLICY.safety, syntheticEvidenceCreated: true } });
  assert.notEqual(unsafeSafety.status, 0);
  assert.match(unsafeSafety.stderr, /Unsafe Wikidata type verification safety flag: syntheticEvidenceCreated/);
});
