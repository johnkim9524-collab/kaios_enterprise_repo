#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  assessRealBfcacheEvidence,
  assertRealNavigationCanarySource,
  classifyConsoleError,
  closeAndFreezePageDiagnostics,
  deriveCaseVerdict,
} from './browser-qa-evidence-v1.mjs';

const runtimeErrors = [];
const context = {
  closed: false,
  async close() {
    runtimeErrors.push('LATE_ERROR_EMITTED_DURING_CONTEXT_CLOSE');
    this.closed = true;
    queueMicrotask(() => runtimeErrors.push('LATE_CONTEXT_MICROTASK_ERROR'));
  },
};
const browser = {
  closed: false,
  async close() {
    runtimeErrors.push('LATE_ERROR_EMITTED_DURING_BROWSER_CLOSE');
    this.closed = true;
    queueMicrotask(() => runtimeErrors.push('LATE_BROWSER_MICROTASK_ERROR'));
  },
};
const page = {
  closed: false,
  isClosed() { return this.closed; },
  async close() {
    runtimeErrors.push('LATE_ERROR_EMITTED_DURING_PAGE_CLOSE');
    this.closed = true;
    queueMicrotask(() => runtimeErrors.push('LATE_PAGE_MICROTASK_ERROR'));
  },
};

const diagnostics = await closeAndFreezePageDiagnostics({
  page,
  context,
  browser,
  closeContext: true,
  closeBrowser: true,
  runtimeErrors,
});
assert.equal(diagnostics.frozenAfterPageClose, true);
assert.equal(diagnostics.frozenAfterContextClose, true);
assert.equal(diagnostics.frozenAfterBrowserClose, true);
assert.deepEqual(diagnostics.runtimeErrors, [
  'LATE_ERROR_EMITTED_DURING_PAGE_CLOSE',
  'LATE_PAGE_MICROTASK_ERROR',
  'LATE_ERROR_EMITTED_DURING_CONTEXT_CLOSE',
  'LATE_CONTEXT_MICROTASK_ERROR',
  'LATE_ERROR_EMITTED_DURING_BROWSER_CLOSE',
  'LATE_BROWSER_MICROTASK_ERROR',
]);
assert.throws(() => diagnostics.runtimeErrors.push('MUTATE'), TypeError);

const verdict = deriveCaseVerdict({functionalFailures: [], diagnostics});
assert.equal(verdict.result, 'FAIL');
assert.equal(verdict.failures.length, 6);
assert.equal(verdict.serializedFromSameImmutableSnapshot, true);
assert.strictEqual(verdict.diagnostics, diagnostics);

assert.throws(
  () => deriveCaseVerdict({
    functionalFailures: [],
    diagnostics: {
      frozenAfterPageClose: true,
      frozenAfterContextClose: true,
      frozenAfterBrowserClose: false,
      runtimeErrors: [],
      responseErrors: [],
      harnessDiagnostics: [],
    },
  }),
  /DIAGNOSTICS_NOT_FROZEN_AFTER_FULL_BROWSER_CLOSE/,
);

assert.equal(
  classifyConsoleError({
    text: 'Failed to load resource: the server responded with a status of 500',
    forcedFailureResponseCount: 1,
  }).classification,
  'EXPECTED_FORCED_500_HARNESS_DIAGNOSTIC',
);
assert.equal(
  classifyConsoleError({
    text: 'Failed to load resource: the server responded with a status of 500',
    forcedFailureResponseCount: 0,
  }).classification,
  'APPLICATION_RUNTIME_ERROR',
);

const validBfcache = {
  navigationMethod: 'page.goBack',
  secondDocumentSameOrigin: true,
  pagehidePersisted: true,
  pagehideTrusted: true,
  pageshowPersisted: true,
  pageshowTrusted: true,
  navigationType: 'back_forward',
  documentIdentityPreserved: true,
  syntheticDispatchUsed: false,
  forcedFailureResponseCount: 1,
  immediatePurgePass: true,
  settledFailClosedPass: true,
  firstDocumentId: 'doc-1',
  restoredDocumentId: 'doc-1',
};
assert.equal(assessRealBfcacheEvidence(validBfcache).state, 'VERIFIED_PASS');

const mutations = [
  ['SYNTHETIC_DISPATCH', {syntheticDispatchUsed: true}],
  ['NO_BACK_FORWARD', {navigationType: 'navigate'}],
  ['PAGESHOW_NOT_PERSISTED', {pageshowPersisted: false}],
  ['PAGESHOW_NOT_TRUSTED', {pageshowTrusted: false}],
  ['PAGEHIDE_NOT_PERSISTED', {pagehidePersisted: false}],
  ['PAGEHIDE_NOT_TRUSTED', {pagehideTrusted: false}],
  ['NO_SECOND_DOCUMENT', {secondDocumentSameOrigin: false}],
  ['DOCUMENT_RELOADED', {restoredDocumentId: 'doc-2'}],
  ['NO_IMMEDIATE_PURGE', {immediatePurgePass: false}],
  ['NO_SETTLED_FAIL_CLOSED', {settledFailClosedPass: false}],
  ['FAILURE_RESPONSE_REPLAYED', {forcedFailureResponseCount: 2}],
];
for (const [id, mutation] of mutations) {
  const result = assessRealBfcacheEvidence({...validBfcache, ...mutation});
  assert.equal(result.state, 'VERIFIED_FAIL', id);
  assert.ok(result.findings.length > 0, id);
}

const validSource = `
  const target = '__qa_bfcache_target';
  globalThis.__kidultsQaDocumentId = 'x';
  addEventListener('pageshow', event => [event.persisted, event.isTrusted]);
  addEventListener('pagehide', event => [event.persisted, event.isTrusted]);
  const type = performance.getEntriesByType('navigation')[0].type;
  if (type === 'back_forward') await page.goBack();
`;
assert.equal(assertRealNavigationCanarySource(validSource).state, 'VERIFIED_PASS');
assert.throws(
  () => assertRealNavigationCanarySource(`${validSource}\nnew PageTransitionEvent('pageshow',{persisted:true});`),
  /SYNTHETIC_PAGESHOW_DISPATCH_PRESENT/,
);

console.log(JSON.stringify({
  suite: 'KIDULTS_SHARED_PORTAL_BROWSER_QA_EVIDENCE_V1',
  result: 'PASS',
  late_error_capture: 'PASS',
  immutable_verdict_binding: 'PASS',
  deterministic_harness_classification: 'PASS',
  real_bfcache_contract: 'PASS',
  negative_mutations_rejected: mutations.length + 1,
  public_release: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
}, null, 2));
