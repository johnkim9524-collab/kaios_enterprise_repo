#!/usr/bin/env node

/**
 * Shared KIDULTS Portal browser-QA evidence helpers.
 *
 * Security / truth contract:
 * - browser diagnostics are frozen only after page, context, and browser closure;
 * - the serialized case and its verdict are derived from the same immutable snapshot;
 * - deterministic harness noise is non-authorizing and cannot erase application errors;
 * - synthetic PageTransitionEvent dispatch is never accepted as BFCache proof;
 * - real BFCache evidence requires a same-origin second document, page.goBack(),
 *   trusted persisted lifecycle events, preserved document identity, and fail-closed purge.
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

  // This message is deterministic browser noise caused by the intentionally
  // forced Projection 500 response. Classification depends on the response
  // counter, never on an event-timing flag such as axeActive.
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

const REQUIRED_BFCACHE_FACTS = Object.freeze([
  ['navigationMethod', 'page.goBack'],
  ['secondDocumentSameOrigin', true],
  ['pagehidePersisted', true],
  ['pagehideTrusted', true],
  ['pageshowPersisted', true],
  ['pageshowTrusted', true],
  ['navigationType', 'back_forward'],
  ['documentIdentityPreserved', true],
  ['syntheticDispatchUsed', false],
  ['forcedFailureResponseCount', 1],
  ['immediatePurgePass', true],
  ['settledFailClosedPass', true],
]);

export function assessRealBfcacheEvidence(evidence) {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    throw new TypeError('evidence must be an object');
  }

  const findings = [];
  for (const [field, expected] of REQUIRED_BFCACHE_FACTS) {
    if (evidence[field] !== expected) {
      findings.push(`${field}:expected=${JSON.stringify(expected)}:actual=${JSON.stringify(evidence[field])}`);
    }
  }

  if (!evidence.firstDocumentId || !evidence.restoredDocumentId) {
    findings.push('document_identity_missing');
  } else if (evidence.firstDocumentId !== evidence.restoredDocumentId) {
    findings.push('document_identity_changed');
  }

  return Object.freeze({
    state: findings.length ? 'VERIFIED_FAIL' : 'VERIFIED_PASS',
    evidenceType: 'REAL_SAME_ORIGIN_HISTORY_BFCACHE',
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
  require(!text.includes("new PageTransitionEvent('pagehide'"), 'SYNTHETIC_PAGEHIDE_DISPATCH_PRESENT');
  require(!text.includes("new PageTransitionEvent('pageshow'"), 'SYNTHETIC_PAGESHOW_DISPATCH_PRESENT');

  if (findings.length) throw new Error(`REAL_NAVIGATION_CANARY_SOURCE_INVALID:${findings.join(',')}`);
  return Object.freeze({state: 'VERIFIED_PASS', findings: Object.freeze([])});
}
