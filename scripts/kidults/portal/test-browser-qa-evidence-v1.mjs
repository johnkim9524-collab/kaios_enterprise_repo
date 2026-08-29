#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  assessRealBfcacheEvidence,
  assessRealHistoryTraversalEvidence,
  assessThirtyCycleMobileSurrogate,
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

const validMobileSurrogate = {
  evidenceClass: 'NON_PHYSICAL_WEBKIT_SURROGATE',
  engine: 'PLAYWRIGHT_WEBKIT',
  physicalDevice: false,
  voiceOverEnabled: false,
  syntheticLifecycleDispatch: false,
  requiredCycles: 30,
  completedCycles: 30,
  navigationPassCount: 30,
  backgroundForegroundExerciseCount: 30,
  nativeBackgroundForegroundObservation: 'NOT_AVAILABLE_IN_HEADLESS_WEBKIT',
  historyRestorationPassCount: 30,
  menuRestorationPassCount: 30,
  focusRestorationPassCount: 30,
  scrollRestorationPassCount: 30,
  accessibilitySurrogatePassCount: 30,
  staleProjectionLeakCount: 0,
  runtimeErrorCount: 0,
  crashCount: 0,
  failedCycleCount: 0,
  bfcacheRestoredCount: 18,
  historyReloadContainedCount: 12,
  claimsPhysicalIphoneAcceptance: false,
  claimsVoiceOverAcceptance: false,
};
const mobileAssessment = assessThirtyCycleMobileSurrogate(validMobileSurrogate);
assert.equal(mobileAssessment.state, 'VERIFIED_PASS');
assert.equal(mobileAssessment.physicalIphoneAcceptance, 'HOLD_PENDING_PHYSICAL_DEVICE');
assert.equal(mobileAssessment.voiceOverAcceptance, 'HOLD_PENDING_HUMAN_REVIEW');
assert.equal(mobileAssessment.promotionEligible, false);

const mobileMutations = [
  ['EMULATION_LABELED_PHYSICAL', {physicalDevice: true}],
  ['VOICEOVER_FALSE_CLAIM', {claimsVoiceOverAcceptance: true}],
  ['PHYSICAL_FALSE_CLAIM', {claimsPhysicalIphoneAcceptance: true}],
  ['CYCLE_SHORTFALL', {completedCycles: 29}],
  ['BACKGROUND_EXERCISE_SHORTFALL', {backgroundForegroundExerciseCount: 29}],
  ['HEADLESS_FALSE_NATIVE_OBSERVATION', {nativeBackgroundForegroundObservation: 'PASS'}],
  ['HISTORY_SHORTFALL', {historyRestorationPassCount: 29}],
  ['MENU_SHORTFALL', {menuRestorationPassCount: 29}],
  ['FOCUS_SHORTFALL', {focusRestorationPassCount: 29}],
  ['SCROLL_SHORTFALL', {scrollRestorationPassCount: 29}],
  ['ACCESSIBILITY_SHORTFALL', {accessibilitySurrogatePassCount: 29}],
  ['STALE_VALUE_LEAK', {staleProjectionLeakCount: 1}],
  ['RUNTIME_ERROR', {runtimeErrorCount: 1}],
  ['PAGE_CRASH', {crashCount: 1}],
  ['SYNTHETIC_LIFECYCLE', {syntheticLifecycleDispatch: true}],
  ['OUTCOME_ACCOUNTING_GAP', {bfcacheRestoredCount: 17}],
];
for (const [id, mutation] of mobileMutations) {
  const result = assessThirtyCycleMobileSurrogate({...validMobileSurrogate, ...mutation});
  assert.equal(result.state, 'VERIFIED_FAIL', id);
  assert.ok(result.findings.length > 0, id);
}

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
  immediateReloadContainmentPass: false,
  settledFailClosedPass: true,
  firstDocumentId: 'doc-1',
  restoredDocumentId: 'doc-1',
};
assert.equal(assessRealBfcacheEvidence(validBfcache).state, 'VERIFIED_PASS');
const restoredHistory = assessRealHistoryTraversalEvidence(validBfcache);
assert.equal(restoredHistory.state, 'VERIFIED_PASS');
assert.equal(restoredHistory.outcome, 'BFCACHE_RESTORED');
assert.equal(restoredHistory.bfcacheAcceptance, 'VERIFIED_PASS');

const validReload = {
  ...validBfcache,
  pagehidePersisted: false,
  pagehideTrusted: false,
  pageshowPersisted: false,
  pageshowTrusted: false,
  documentIdentityPreserved: false,
  immediatePurgePass: false,
  immediateReloadContainmentPass: true,
  restoredDocumentId: 'doc-2',
};
assert.equal(assessRealBfcacheEvidence(validReload).state, 'VERIFIED_FAIL');
const reloadHistory = assessRealHistoryTraversalEvidence(validReload);
assert.equal(reloadHistory.state, 'VERIFIED_PASS');
assert.equal(reloadHistory.outcome, 'HISTORY_RELOAD_NO_BFCACHE');
assert.equal(reloadHistory.bfcacheAcceptance, 'NOT_OBSERVED_PENDING_PHYSICAL_DEVICE');
assert.equal(reloadHistory.promotionEligible, false);

const strictMutations = [
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
for (const [id, mutation] of strictMutations) {
  const result = assessRealBfcacheEvidence({...validBfcache, ...mutation});
  assert.equal(result.state, 'VERIFIED_FAIL', id);
  assert.ok(result.findings.length > 0, id);
}

const reloadMutations = [
  ['RELOAD_SYNTHETIC_DISPATCH', {syntheticDispatchUsed: true}],
  ['RELOAD_NOT_BACK_FORWARD', {navigationType: 'navigate'}],
  ['RELOAD_NOT_SAME_ORIGIN', {secondDocumentSameOrigin: false}],
  ['RELOAD_FAILURE_RESPONSE_REPLAYED', {forcedFailureResponseCount: 2}],
  ['RELOAD_NOT_SETTLED_FAIL_CLOSED', {settledFailClosedPass: false}],
  ['RELOAD_IMMEDIATE_CONTAINMENT_MISSING', {immediateReloadContainmentPass: false}],
  ['RELOAD_PARTIAL_PERSISTED_SIGNAL', {pagehidePersisted: true}],
  ['RELOAD_IDENTITY_MISSING', {restoredDocumentId: null}],
  ['RELOAD_IDENTITY_FALSE_GREEN', {restoredDocumentId: 'doc-1'}],
];
for (const [id, mutation] of reloadMutations) {
  const result = assessRealHistoryTraversalEvidence({...validReload, ...mutation});
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
  assessRealHistoryTraversalEvidence({});
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
  real_history_reload_containment_contract: 'PASS',
  false_bfcache_green_rejected: 'PASS',
  thirty_cycle_mobile_surrogate_contract: 'PASS_NON_PHYSICAL',
  physical_iphone_voiceover_acceptance: 'HOLD',
  negative_mutations_rejected: strictMutations.length + reloadMutations.length + mobileMutations.length + 1,
  public_release: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
}, null, 2));
