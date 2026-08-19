import test from 'node:test';
import assert from 'node:assert/strict';
import { assertSanitizedContent, validatePublicOutputGuard } from '../../../scripts/kidults/source-intelligence/validate-collectaio-public-output-guard-v1.mjs';

test('public output guard accepts current repository state', () => {
  assert.doesNotThrow(() => validatePublicOutputGuard(process.cwd()));
});

test('public output guard rejects a provider network call', () => {
  assert.throws(
    () => assertSanitizedContent('fixture.mjs', 'const value = fetch("provider");'),
    /LIVE_PROVIDER_FETCH/
  );
});

test('public output guard rejects artifact upload configuration', () => {
  assert.throws(
    () => assertSanitizedContent('workflow.yml', 'uses: actions/upload-artifact@v4'),
    /ARTIFACT_UPLOAD/
  );
});

test('public output guard rejects raw provider field labels', () => {
  assert.throws(
    () => assertSanitizedContent('fixture.json', '{"source_url":"x"}'),
    /RAW_SOURCE_URL_FIELD/
  );
});
