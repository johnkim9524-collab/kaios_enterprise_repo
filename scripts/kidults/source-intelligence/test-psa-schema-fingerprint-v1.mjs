import assert from 'node:assert/strict';
import {
  assertPsaSuccessEnvelope,
  collectSchemaFingerprint,
  fieldPresenceFromSchema
} from './psa-schema-fingerprint-v1-lib.mjs';

const fixture = {
  IsValidRequest: true,
  ServerMessage: 'Request Successful',
  PSACert: {
    CertNumber: '12345678',
    GradeDescription: 'GEM MT 10',
    Subject: 'PRIVATE SUBJECT VALUE',
    Population: { Total: 42 },
    Items: [{ Brand: 'PRIVATE BRAND VALUE' }]
  }
};

assert.equal(assertPsaSuccessEnvelope(fixture, 200), true);
const schema = collectSchemaFingerprint(fixture);
const serialized = JSON.stringify(schema);
for (const forbidden of ['12345678', 'GEM MT 10', 'PRIVATE SUBJECT VALUE', 'PRIVATE BRAND VALUE', 'Request Successful']) {
  assert.equal(serialized.includes(forbidden), false, `provider value leaked: ${forbidden}`);
}
assert.ok(schema.some(entry => entry.path === '$/PSACert/Population/Total'));
assert.ok(schema.some(entry => entry.path === '$/PSACert/Items/*/Brand'));
assert.deepEqual(fieldPresenceFromSchema(schema), {
  certification_identifier: true,
  grade: true,
  item_identity_or_reference: true,
  population_context: true,
  alternate_identifier: false
});
assert.throws(() => assertPsaSuccessEnvelope({ IsValidRequest: false, ServerMessage: 'Request Failed' }, 200), /PSA_INVALID_REQUEST_ENVELOPE/);
assert.throws(() => assertPsaSuccessEnvelope(fixture, 403), /PSA_HTTP_403/);
assert.throws(() => collectSchemaFingerprint({ a: { b: { c: true } } }, { maxDepth: 1 }), /PSA_SCHEMA_DEPTH_LIMIT_EXCEEDED/);
assert.throws(() => collectSchemaFingerprint({ a: 1, b: 2 }, { maxNodes: 2 }), /PSA_SCHEMA_NODE_LIMIT_EXCEEDED/);
console.log('VERIFIED_PASS: recursive PSA schema fingerprint is value-free and fail-closed.');
