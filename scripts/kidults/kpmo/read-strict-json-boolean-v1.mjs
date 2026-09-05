#!/usr/bin/env node
import fs from 'node:fs';

const fail = (code) => {
  const error = new Error(code);
  error.code = code;
  throw error;
};

export function readStrictJsonBoolean(raw, field) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    fail('STRICT_JSON_BOOLEAN_MALFORMED_JSON');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('STRICT_JSON_BOOLEAN_ROOT_NOT_OBJECT');
  }
  if (!Object.prototype.hasOwnProperty.call(value, field)) {
    fail('STRICT_JSON_BOOLEAN_FIELD_MISSING');
  }
  if (typeof value[field] !== 'boolean') {
    fail('STRICT_JSON_BOOLEAN_FIELD_NOT_BOOLEAN');
  }
  return value[field];
}

const args = process.argv.slice(2);
if (args[0] === '--self-test') {
  const valid = [
    ['{"expired":false}', false],
    ['{"expired":true}', true]
  ];
  for (const [raw, expected] of valid) {
    if (readStrictJsonBoolean(raw, 'expired') !== expected) fail('STRICT_JSON_BOOLEAN_SELF_TEST_VALID');
  }
  const invalid = [
    '{}',
    '{"expired":null}',
    '{"expired":"false"}',
    '{"expired":0}',
    '[]',
    '{"expired":'
  ];
  for (const raw of invalid) {
    let rejected = false;
    try {
      readStrictJsonBoolean(raw, 'expired');
    } catch {
      rejected = true;
    }
    if (!rejected) fail('STRICT_JSON_BOOLEAN_SELF_TEST_INVALID');
  }
  process.stdout.write(JSON.stringify({
    id: 'kidults-strict-json-boolean-self-test-v1',
    state: 'VERIFIED_PASS',
    positive_false_preserved: true,
    positive_true_preserved: true,
    invalid_cases_rejected: invalid.length
  }) + '\n');
  process.exit(0);
}

const field = args[0];
if (!field || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(field)) {
  console.error('STRICT_JSON_BOOLEAN_FIELD_NAME_INVALID');
  process.exit(2);
}
try {
  const raw = fs.readFileSync(0, 'utf8');
  process.stdout.write(String(readStrictJsonBoolean(raw, field)) + '\n');
} catch (error) {
  console.error(error.code || error.message || 'STRICT_JSON_BOOLEAN_FAILED');
  process.exit(2);
}
