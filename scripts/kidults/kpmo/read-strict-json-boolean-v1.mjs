#!/usr/bin/env node
import fs from 'node:fs';

const fail = (code) => {
  const error = new Error(code);
  error.code = code;
  throw error;
};

const AUTHORITATIVE_READERS = [
  '.github/workflows/kidults-platform-continuous-assurance-v1.yml',
  '.github/workflows/kidults-asi-requirement-adapter-coverage-v1.yml',
];
const STRICT_READER = 'node scripts/kidults/kpmo/read-strict-json-boolean-v1.mjs expired';
const STRICT_SELF_TEST = 'node scripts/kidults/kpmo/read-strict-json-boolean-v1.mjs --self-test';
const occurrences = (source, needle) => source.split(needle).length - 1;

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

export function validateAuthoritativeExpiryReaders(readFile = (path) => fs.readFileSync(path, 'utf8')) {
  let strictReaderInvocations = 0;
  let strictSelfTestInvocations = 0;
  for (const path of AUTHORITATIVE_READERS) {
    const source = readFile(path);
    if (/\.expired\s*\/\//.test(source)) {
      fail('AUTHORITATIVE_EXPIRY_BOOLEAN_COALESCING_FORBIDDEN');
    }
    const readerCount = occurrences(source, STRICT_READER);
    const selfTestCount = occurrences(source, STRICT_SELF_TEST);
    if (readerCount !== 1) fail('AUTHORITATIVE_EXPIRY_STRICT_READER_CARDINALITY_INVALID');
    if (selfTestCount !== 1) fail('AUTHORITATIVE_EXPIRY_SELF_TEST_CARDINALITY_INVALID');
    strictReaderInvocations += readerCount;
    strictSelfTestInvocations += selfTestCount;
  }
  return {
    authoritative_reader_count: AUTHORITATIVE_READERS.length,
    unsafe_boolean_coalescing_matches: 0,
    strict_reader_invocations: strictReaderInvocations,
    strict_self_test_invocations: strictSelfTestInvocations,
  };
}

const args = process.argv.slice(2);
if (args[0] === '--self-test') {
  const valid = [
    ['{"expired":false}', false],
    ['{"expired":true}', true],
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
    '{"expired":',
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

  const pristine = Object.fromEntries(AUTHORITATIVE_READERS.map((path) => [path, fs.readFileSync(path, 'utf8')]));
  const authority = validateAuthoritativeExpiryReaders((path) => pristine[path]);
  const first = AUTHORITATIVE_READERS[0];
  const mutations = [
    {...pristine, [first]: pristine[first] + "\n# .expired // true\n"},
    {...pristine, [first]: pristine[first].replace(STRICT_READER, "jq -r '.expired'")},
    {...pristine, [first]: pristine[first] + "\n" + STRICT_READER + "\n"},
    {...pristine, [first]: pristine[first].replace(STRICT_SELF_TEST, 'node --version')},
    {...pristine, [first]: pristine[first] + "\n" + STRICT_SELF_TEST + "\n"},
  ];
  for (const mutation of mutations) {
    let rejected = false;
    try {
      validateAuthoritativeExpiryReaders((path) => mutation[path]);
    } catch {
      rejected = true;
    }
    if (!rejected) fail('AUTHORITATIVE_EXPIRY_READER_MUTATION_NOT_REJECTED');
  }

  process.stdout.write(JSON.stringify({
    id: 'kidults-strict-json-boolean-self-test-v1',
    state: 'VERIFIED_PASS',
    positive_false_preserved: true,
    positive_true_preserved: true,
    invalid_cases_rejected: invalid.length,
    ...authority,
    negative_reader_mutations_rejected: mutations.length,
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
