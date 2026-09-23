import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { idFrom, sha256 } from '../../../scripts/kidults/staging-operations/lib/canonical-v1.mjs';

const schema = JSON.parse(fs.readFileSync('coordination/kidults/staging-operations/autonomous-provider-event-v1.schema.json'));
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
const validate = ajv.compile(schema);

const approval = (role, taskId, actor) => ({
  approval_id: idFrom('approval', { role, taskId, actor }),
  approver_id: actor,
  role,
  task_id: taskId,
  expires_at: '2026-09-21T17:00:00.000Z',
});

const event = {
  task_id: 'contract-positive',
  provider_id: 'fixture-open-metadata',
  policy_version: 'provider-control-staging-v1',
  rights_snapshot_id: 'rights:contract-positive',
  approval_a: approval('TRACK_A', 'contract-positive', 'track-a-1'),
  approval_z: approval('TRACK_Z', 'contract-positive', 'track-z-1'),
  decision: 'ALLOW_SHADOW',
  lease_id: idFrom('lease', 'contract-positive'),
  attempt: 1,
  evidence_uri: 'evidence://staging/contract-positive/receipt.json',
  receipt_digest: sha256('receipt'),
  state: 'COMPLETE_VERIFIED',
};

test('exact 12-field event contract accepts a fully bound terminal event', () => {
  assert.equal(validate(event), true, JSON.stringify(validate.errors));
  assert.equal(Object.keys(event).length, 12);
});

test('event contract rejects missing evidence, extra fields and invalid holds-by-omission claims', () => {
  const missing = structuredClone(event);
  delete missing.receipt_digest;
  assert.equal(validate(missing), false);
  const extra = { ...event, production: 'OPEN' };
  assert.equal(validate(extra), false);
});
