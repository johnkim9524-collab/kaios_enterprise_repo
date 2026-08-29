#!/usr/bin/env node

/**
 * Shared KIDULTS Portal browser-QA evidence helpers.
 *
 * Truth contract:
 * - diagnostics are frozen only after page, context, and browser closure;
 * - verdict and serialized evidence use the same immutable snapshot;
 * - deterministic harness noise is non-authorizing;
 * - synthetic lifecycle dispatch is never BFCache evidence;
 * - BFCache PASS requires trusted persisted events and preserved document identity;
 * - a real back/forward reload may pass only as non-promotable containment evidence,
 *   while BFCache and physical-iPhone acceptance remain pending.
 */

function frozenStrings(values, field) {
  if (!Array.isArray(values)) throw new TypeError(`${field} must be an array`);
  return Object.freeze(values.map((value) => String(value)));
}

async function settleListenerQueues() {
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  await Promise.resolve();
}

export function classifyConsoleError({text, forcedFailureResponseCount = 0}) {
  const value = String(text || '');
  if (/favicon/i.test(value)) return Object.freeze({classification: 'IGNORED_FAVICON', value});
  if (
    Number(forcedFailureResponseCount) > 0
    && /Failed to load resource: the server responded with a status of 500/i.test(value)
  ) {
    return Object.freeze({classification: 'EXPECTED_FORCED_500_HARNESS_DIAGNOSTIC', value});
  }
  return Object.freeze({classification: 'APPLICATION_RUNTIME_ERROR', value});
}

export async function closeAndFreezePageDiagnostics({
  page,
  context = null,
  browser = null,
  closeContext = false,
  closeBrowser = false,
  runtimeErrors = [],
  responseErrors = [],
  harnessDiagnostics = [],
}) {
  if (!page || typeof page.close !== 'function') throw new TypeError('page.close is required');
  const isClosed = typeof page.isClosed === 'function' ? page.isClosed() : false;
  if (!isClosed) await page.close({runBeforeUnload: false});
  await settleListenerQueues();

  if (closeContext) {
    if (!context || typeof context.close !== 'function') {
      throw new TypeError('context.close is required when closeContext=true');
    }
    await context.close();
    await settleListenerQueues();
  }

  if (closeBrowser) {
    if (!browser || typeof browser.close !== 'function') {
      throw new TypeError('browser.close is required when closeBrowser=true');
    }
    await browser.close();
    await settleListenerQueues();
  }

  return Object.freeze({
    runtimeErrors: frozenStrings(runtimeErrors, 'runtimeErrors'),
    responseErrors: frozenStrings(responseErrors, 'responseErrors'),
    harnessDiagnostics: frozenStrings(harnessDiagnostics, 'harnessDiagnostics'),
    frozenAfterPageClose: true,
    frozenAfterContextClose: closeContext,
    frozenAfterBrowserClose: closeBrowser,
  });
}

export function deriveCaseVerdict({functionalFailures = [], diagnostics}) {
  if (
    !diagnostics
    || diagnostics.frozenAfterPageClose !== true
    || diagnostics.frozenAfterContextClose !== true
    || diagnostics.frozenAfterBrowserClose !== true
  ) {
    throw new Error('DIAGNOSTICS_NOT_FROZEN_AFTER_FULL_BROWSER_CLOSE');
  }

  const failures = Object.freeze([
    ...frozenStrings(functionalFailures, 'functionalFailures'),
    ...diagnostics.runtimeErrors.map((value) => `RUNTIME_${value}`),
    ...diagnostics.responseErrors.map((value) => `RESPONSE_${value}`),
  ]);

  return Object.freeze({
    result: failures.length ? 'FAIL' : 'PASS',
    failures,
    diagnostics,
    serializedFromSameImmutableSnapshot: true,
    harnessDiagnosticsAreNonAuthorizing: true,
  });
}

const COMMON_HISTORY_FACTS = Object.freeze([
  ['navigationMethod', 'page.goBack'],
  ['secondDocumentSameOrigin', true],
  ['navigationType', 'back_forward'],
  ['syntheticDispatchUsed', false],
  ['forcedFailureResponseCount', 1],
  ['settledFailClosedPass', true],
]);

const REQUIRED_BFCACHE_FACTS = Object.freeze([
  ...COMMON_HISTORY_FACTS,
  ['pagehidePersisted', true],
  ['pagehideTrusted', true],
  ['pageshowPersisted', true],
  ['pageshowTrusted', true],
  ['documentIdentityPreserved', true],
  ['immediatePurgePass', true],
]);

function mismatches(evidence, facts) {
  const findings = [];
  for (const [field, expected] of facts) {
    if (evidence[field] !== expected) {
      findings.push(`${field}:expected=${JSON.stringify(expected)}:actual=${JSON.stringify(evidence[field])}`);
    }
  }
  return findings;
}

function identityFindings(evidence, {same}) {
  const findings = [];
  if (!evidence.firstDocumentId || !evidence.restoredDocumentId) {
    findings.push('document_identity_missing');
    return findings;
  }
  const equal = evidence.firstDocumentId === evidence.restoredDocumentId;
  if (same && !equal) findings.push('document_identity_changed');
  if (!same && equal) findings.push('document_identity_unexpectedly_preserved');
  return findings;
}

export function assessRealBfcacheEvidence(evidence) {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    throw new TypeError('evidence must be an object');
  }
  const findings = [
    ...mismatches(evidence, REQUIRED_BFCACHE_FACTS),
    ...identityFindings(evidence, {same: true}),
  ];
  return Object.freeze({
    state: findings.length ? 'VERIFIED_FAIL' : 'VERIFIED_PASS',
    outcome: findings.length ? 'BFCACHE_NOT_VERIFIED' : 'BFCACHE_RESTORED',
    evidenceType: 'REAL_SAME_ORIGIN_HISTORY_BFCACHE',
    syntheticControlIsNotEmpiricalBfcacheProof: true,
    findings: Object.freeze(findings),
    promotionEligible: false,
    publicRelease: 'HOLD',
    production: 'HOLD',
    g5: 'HOLD',
  });
}

export function assessRealHistoryTraversalEvidence(evidence) {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    throw new TypeError('evidence must be an object');
  }

  const findings = mismatches(evidence, COMMON_HISTORY_FACTS);
  const fullyRestored = Boolean(
    evidence.pagehidePersisted === true
    && evidence.pagehideTrusted === true
    && evidence.pageshowPersisted === true
    && evidence.pageshowTrusted === true
    && evidence.documentIdentityPreserved === true
    && evidence.firstDocumentId
    && evidence.firstDocumentId === evidence.restoredDocumentId
  );
  const partialBfcacheSignal = Boolean(
    evidence.pagehidePersisted === true
    || evidence.pageshowPersisted === true
    || evidence.documentIdentityPreserved === true
  );

  let outcome;
  let bfcacheAcceptance;
  if (fullyRestored) {
    outcome = 'BFCACHE_RESTORED';
    const strict = assessRealBfcacheEvidence(evidence);
    findings.push(...strict.findings);
    bfcacheAcceptance = strict.state;
  } else {
    outcome = 'HISTORY_RELOAD_NO_BFCACHE';
    bfcacheAcceptance = 'NOT_OBSERVED_PENDING_PHYSICAL_DEVICE';
    if (partialBfcacheSignal) findings.push('partial_or_contradictory_bfcache_signal');
    if (evidence.immediateReloadContainmentPass !== true) {
      findings.push(`immediateReloadContainmentPass:expected=true:actual=${JSON.stringify(evidence.immediateReloadContainmentPass)}`);
    }
    findings.push(...identityFindings(evidence, {same: false}));
  }

  return Object.freeze({
    state: findings.length ? 'VERIFIED_FAIL' : 'VERIFIED_PASS',
    outcome,
    evidenceType: 'REAL_SAME_ORIGIN_HISTORY_TRAVERSAL',
    bfcacheAcceptance,
    physicalIphoneAcceptance: 'PENDING',
    syntheticControlIsNotEmpiricalBfcacheProof: true,
    findings: Object.freeze(findings),
    promotionEligible: false,
    publicRelease: 'HOLD',
    production: 'HOLD',
    g5: 'HOLD',
  });
}

export function assertRealNavigationCanarySource(source) {
  const text = String(source || '');
  const findings = [];
  const require = (condition, id) => { if (!condition) findings.push(id); };
  require(text.includes('page.goBack('), 'PAGE_GOBACK_MISSING');
  require(text.includes('__kidultsQaDocumentId'), 'DOCUMENT_IDENTITY_MISSING');
  require(text.includes("type === 'back_forward'") || text.includes("type==='back_forward'"), 'BACK_FORWARD_NAVIGATION_TYPE_MISSING');
  require(text.includes('event.persisted'), 'PERSISTED_EVENT_OBSERVATION_MISSING');
  require(text.includes('event.isTrusted'), 'TRUSTED_EVENT_OBSERVATION_MISSING');
  require(text.includes('__qa_bfcache_target'), 'SECOND_SAME_ORIGIN_DOCUMENT_MISSING');
  require(text.includes('assessRealHistoryTraversalEvidence'), 'HISTORY_TRAVERSAL_ASSESSMENT_MISSING');
  require(!text.includes("new PageTransitionEvent('pagehide'"), 'SYNTHETIC_PAGEHIDE_DISPATCH_PRESENT');
  require(!text.includes("new PageTransitionEvent('pageshow'"), 'SYNTHETIC_PAGESHOW_DISPATCH_PRESENT');
  if (findings.length) throw new Error(`REAL_NAVIGATION_CANARY_SOURCE_INVALID:${findings.join(',')}`);
  return Object.freeze({state: 'VERIFIED_PASS', findings: Object.freeze([])});
}

const THIRTY_CYCLE_MOBILE_FACTS = Object.freeze([
  ['evidenceClass', 'NON_PHYSICAL_WEBKIT_SURROGATE'],
  ['engine', 'PLAYWRIGHT_WEBKIT'],
  ['physicalDevice', false],
  ['voiceOverEnabled', false],
  ['syntheticLifecycleDispatch', false],
  ['requiredCycles', 30],
  ['completedCycles', 30],
  ['navigationPassCount', 30],
  ['backgroundForegroundExerciseCount', 30],
  ['nativeBackgroundForegroundObservation', 'NOT_AVAILABLE_IN_HEADLESS_WEBKIT'],
  ['historyRestorationPassCount', 30],
  ['menuRestorationPassCount', 30],
  ['focusRestorationPassCount', 30],
  ['scrollRestorationPassCount', 30],
  ['accessibilitySurrogatePassCount', 30],
  ['staleProjectionLeakCount', 0],
  ['runtimeErrorCount', 0],
  ['crashCount', 0],
  ['failedCycleCount', 0],
]);

/**
 * Assess the deterministic WebKit/mobile surrogate without turning it into a
 * physical-device or screen-reader receipt. A full surrogate PASS remains
 * non-promotable and keeps every external release gate on HOLD.
 */
export function assessThirtyCycleMobileSurrogate(evidence) {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    throw new TypeError('evidence must be an object');
  }
  const findings = mismatches(evidence, THIRTY_CYCLE_MOBILE_FACTS);
  const traversalTotal = Number(evidence.bfcacheRestoredCount) + Number(evidence.historyReloadContainedCount);
  if (!Number.isInteger(traversalTotal) || traversalTotal !== 30) {
    findings.push(`historyOutcomeCount:expected=30:actual=${JSON.stringify(traversalTotal)}`);
  }
  if (evidence.claimsPhysicalIphoneAcceptance === true) findings.push('physical_iphone_false_claim');
  if (evidence.claimsVoiceOverAcceptance === true) findings.push('voiceover_false_claim');

  return Object.freeze({
    state: findings.length ? 'VERIFIED_FAIL' : 'VERIFIED_PASS',
    evidenceClass: 'NON_PHYSICAL_WEBKIT_SURROGATE',
    findings: Object.freeze(findings),
    automatedWebkitAcceptance: findings.length ? 'FAIL' : 'PASS',
    physicalIphoneAcceptance: 'HOLD_PENDING_PHYSICAL_DEVICE',
    voiceOverAcceptance: 'HOLD_PENDING_HUMAN_REVIEW',
    promotionEligible: false,
    publicRelease: 'HOLD',
    production: 'HOLD',
    g5: 'HOLD',
  });
}
