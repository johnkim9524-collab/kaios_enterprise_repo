#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const STALE_MARKER = /fixture-(?:approved|projection|assessment|replay|pair|correlation|what_changed|liquidity|market_scale)/;

const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
function requireArray(value, name) {
  if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`);
  return value;
}

export async function closeAndSettle({pages = [], contexts = [], browsers = []} = {}) {
  for (const page of requireArray(pages, 'pages')) {
    if (page && typeof page.close === 'function' && !(typeof page.isClosed === 'function' && page.isClosed())) {
      await page.close({runBeforeUnload: false});
    }
  }
  for (const context of requireArray(contexts, 'contexts')) if (context?.close) await context.close();
  for (const browser of requireArray(browsers, 'browsers')) if (browser?.close) await browser.close();
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

export function freezeDiagnostics({runtimeErrors = [], responseErrors = [], harnessDiagnostics = []} = {}) {
  return deepFreeze({
    frozen_after_all_browser_close: true,
    runtime_errors: requireArray(runtimeErrors, 'runtimeErrors').map(String),
    response_errors: requireArray(responseErrors, 'responseErrors').map(String),
    harness_diagnostics: requireArray(harnessDiagnostics, 'harnessDiagnostics').map(clone),
  });
}

export function assessRealBfcache(evidence = {}) {
  const required = {
    navigation_method: 'page.goBack',
    same_origin_history_navigation: true,
    browser_emitted_pagehide_persisted: true,
    browser_emitted_pageshow_persisted: true,
    restored_document_identity_reused: true,
    distinct_second_document_identity: true,
    synthetic_dispatch_count: 0,
    forced_failure_response_count: 1,
    immediate_purge_pass: true,
    settled_fail_closed_pass: true,
    evidence_source: 'BROWSER_HISTORY_NAVIGATION',
  };
  const findings = [];
  for (const [field, expected] of Object.entries(required)) {
    if (evidence[field] !== expected) findings.push(`${field}:expected=${JSON.stringify(expected)}:actual=${JSON.stringify(evidence[field])}`);
  }
  for (const field of ['first_document_id', 'second_document_id', 'restored_document_id']) {
    if (!String(evidence[field] || '')) findings.push(`${field}:missing`);
  }
  return deepFreeze({
    state: findings.length ? 'VERIFIED_FAIL' : 'VERIFIED_PASS',
    evidence_type: 'REAL_SAME_ORIGIN_HISTORY_BFCACHE',
    findings,
    synthetic_control_is_not_bfcache_proof: true,
    performance_navigation_type: evidence.performance_navigation_type || null,
    promotion_eligible: false,
    empirical_gate_effect: 'NONE',
    public_release: 'HOLD',
    production: 'HOLD',
    g5: 'HOLD',
  });
}

export function deriveVerdict({functionalFailures = [], diagnostics, realBfcache}) {
  if (!diagnostics?.frozen_after_all_browser_close || !Object.isFrozen(diagnostics)) {
    throw new Error('DIAGNOSTICS_NOT_FROZEN_AFTER_ALL_BROWSER_CLOSE');
  }
  const failures = [
    ...requireArray(functionalFailures, 'functionalFailures').map(String),
    ...diagnostics.runtime_errors.map((item) => `RUNTIME_${item}`),
    ...diagnostics.response_errors.map((item) => `RESPONSE_${item}`),
    ...(realBfcache?.state === 'VERIFIED_PASS'
      ? []
      : (realBfcache?.findings || ['REAL_BFCACHE_NOT_PASS']).map((item) => `BFCACHE_${item}`)),
  ];
  return deepFreeze({result: failures.length ? 'FAIL' : 'PASS', failures});
}

export function assertSerializedBinding(report, verdict, realBfcache, diagnostics) {
  if (report?.result !== verdict.result) throw new Error('REPORT_RESULT_DIVERGES_FROM_FROZEN_VERDICT');
  if (JSON.stringify(report?.failures) !== JSON.stringify(verdict.failures)) throw new Error('REPORT_FAILURES_DIVERGE_FROM_FROZEN_VERDICT');
  if (JSON.stringify(report?.real_bfcache) !== JSON.stringify(realBfcache)) throw new Error('REPORT_BFCACHE_DIVERGES_FROM_FROZEN_EVIDENCE');
  if (JSON.stringify(report?.diagnostics) !== JSON.stringify(diagnostics)) throw new Error('REPORT_DIAGNOSTICS_DIVERGE_FROM_FROZEN_EVIDENCE');
  return true;
}

function canonicalEvidence() {
  return {
    navigation_method: 'page.goBack',
    same_origin_history_navigation: true,
    browser_emitted_pagehide_persisted: true,
    browser_emitted_pageshow_persisted: true,
    restored_document_identity_reused: true,
    distinct_second_document_identity: true,
    synthetic_dispatch_count: 0,
    forced_failure_response_count: 1,
    immediate_purge_pass: true,
    settled_fail_closed_pass: true,
    evidence_source: 'BROWSER_HISTORY_NAVIGATION',
    performance_navigation_type: 'back_forward',
    first_document_id: 'doc-a',
    second_document_id: 'doc-b',
    restored_document_id: 'doc-a',
  };
}

async function selfTest() {
  const rejected = [];
  const lateErrors = [];
  const fakeContext = {close: async () => { queueMicrotask(() => lateErrors.push('LATE_CONTEXT_ERROR')); }};
  await closeAndSettle({contexts: [fakeContext]});
  const diagnostics = freezeDiagnostics({runtimeErrors: lateErrors});
  const real = assessRealBfcache(canonicalEvidence());
  if (real.state !== 'VERIFIED_PASS') throw new Error(`SELF_TEST_REAL_BFCACHE:${real.findings.join('|')}`);
  const lateVerdict = deriveVerdict({diagnostics, realBfcache: real});
  if (lateVerdict.result !== 'FAIL' || !lateVerdict.failures.includes('RUNTIME_LATE_CONTEXT_ERROR')) {
    throw new Error('SELF_TEST_LATE_ERROR_NOT_BOUND');
  }
  rejected.push('LATE_CONTEXT_ERROR_NOT_IN_VERDICT');

  for (const [id, mutation] of [
    ['SYNTHETIC_EVENT', {synthetic_dispatch_count: 2}],
    ['NEW_DOCUMENT_ON_BACK', {restored_document_identity_reused: false, restored_document_id: 'doc-c'}],
    ['NO_PERSISTED_PAGESHOW', {browser_emitted_pageshow_persisted: false}],
    ['NO_IMMEDIATE_PURGE', {immediate_purge_pass: false}],
    ['NO_SETTLED_FAIL_CLOSED', {settled_fail_closed_pass: false}],
  ]) {
    if (assessRealBfcache({...canonicalEvidence(), ...mutation}).state !== 'VERIFIED_FAIL') {
      throw new Error(`SELF_TEST_FALSE_GREEN:${id}`);
    }
    rejected.push(id);
  }

  const cleanDiagnostics = freezeDiagnostics({});
  const cleanVerdict = deriveVerdict({diagnostics: cleanDiagnostics, realBfcache: real});
  const cleanReport = {result: cleanVerdict.result, failures: cleanVerdict.failures, real_bfcache: real, diagnostics: cleanDiagnostics};
  assertSerializedBinding(cleanReport, cleanVerdict, real, cleanDiagnostics);
  let divergenceRejected = false;
  try {
    assertSerializedBinding({...cleanReport, result: 'FAIL'}, cleanVerdict, real, cleanDiagnostics);
  } catch {
    divergenceRejected = true;
  }
  if (!divergenceRejected) throw new Error('SELF_TEST_SERIALIZED_DIVERGENCE_FALSE_GREEN');
  rejected.push('SERIALIZED_VERDICT_DIVERGENCE');

  console.log(JSON.stringify({
    id: 'kidults-shared-portal-lifecycle-integrity-self-test-v1',
    state: 'VERIFIED_PASS',
    negative_canaries_rejected: rejected.length,
    rejected,
    real_bfcache_contract: 'PASS',
    post_close_verdict_binding: 'PASS',
    synthetic_control_non_promotable: true,
    public_release: 'HOLD',
    production: 'HOLD',
    g5: 'HOLD',
  }, null, 2));
}

function immediatePurgePass(value = {}) {
  return value.state === 'INVALID'
    && value.signal_count === 0
    && !value.signal_text
    && value.audit_row_count === 9
    && !STALE_MARKER.test(value.audit_text || '')
    && value.vertical_count === 0
    && value.audit_seal === 'CONTROL BOUNDARY'
    && value.workspace_blocked
    && !value.kidult_ready
    && value.object_title === 'No governed object'
    && value.object_count === 'WAITING';
}

function settledPurgePass(value = {}) {
  return value.state === 'INVALID'
    && value.signal_count === 0
    && !value.signal_text
    && !STALE_MARKER.test(value.audit_text || '')
    && value.vertical_count === 8
    && value.audit_seal === 'CONTROL BOUNDARY'
    && value.workspace_blocked
    && !value.kidult_ready
    && value.object_title === 'No governed object'
    && value.object_count === 'WAITING';
}

async function runBrowser() {
  const {webkit} = await import('playwright');
  const output = path.resolve(process.env.KIDULTS_SHARED_PORTAL_LIFECYCLE_REPORT || '/tmp/kidults-shared-portal-lifecycle-integrity-v1.json');
  const baseUrl = process.env.KIDULTS_SHARED_PORTAL_BASE_URL || 'http://127.0.0.1:4174';
  const runtimeErrors = [];
  const responseErrors = [];
  const harnessDiagnostics = [];
  const functionalFailures = [];
  let forcedFailureResponseCount = 0;
  let failAfterRestore = false;
  let browser;
  let context;
  let page;
  let firstDocument;
  let secondDocument;
  let restoredDocument;
  let immediatePurge;
  let settledPurge;
  let evidence;

  try {
    browser = await webkit.launch({headless: true});
    context = await browser.newContext({viewport: {width: 390, height: 844}, reducedMotion: 'reduce'});
    await context.addInitScript(() => {
      globalThis.__kidultsQaDocumentId ||= crypto.randomUUID();
      globalThis.__kidultsQaLifecycle ||= [];
      addEventListener('pagehide', (event) => {
        globalThis.__kidultsQaLifecycle.push({type: 'pagehide', persisted: event.persisted, at: performance.now()});
      });
      addEventListener('pageshow', (event) => {
        globalThis.__kidultsQaLifecycle.push({type: 'pageshow', persisted: event.persisted, at: performance.now()});
      });
    });

    await context.route('**/__kidults-bfcache-probe-v1.html', (route) => route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>KIDULTS BFCache Probe</title></head><body><main id="kidults-bfcache-probe-v1">Same-origin history probe</main></body></html>',
    }));
    await context.route('**/api/v1/projection', async (route) => {
      if (!failAfterRestore) return route.continue();
      forcedFailureResponseCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 3000));
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ok: false, error: 'qa_forced_restored_revalidation_failure'}),
      });
    });

    page = await context.newPage();
    page.on('pageerror', (error) => runtimeErrors.push(`PAGEERROR:${error.message}`));
    page.on('response', (response) => {
      if (response.status() < 400) return;
      const pathname = new URL(response.url()).pathname;
      const expected = failAfterRestore && pathname === '/api/v1/projection' && response.status() === 500;
      if (!expected) responseErrors.push(`HTTP_${response.status()}:${pathname}`);
    });
    page.on('console', (message) => {
      if (message.type() !== 'error' || /favicon/i.test(message.text())) return;
      const expected = failAfterRestore
        && /Failed to load resource: the server responded with a status of 500/i.test(message.text());
      if (!expected) runtimeErrors.push(`CONSOLE:${message.text()}`);
    });

    const firstResponse = await page.goto(`${baseUrl}/portal-r001/index.html`, {waitUntil: 'domcontentloaded', timeout: 45_000});
    if (!firstResponse?.ok()) functionalFailures.push(`FIRST_DOCUMENT_HTTP_${firstResponse?.status()}`);
    await page.waitForFunction(() => document.documentElement.dataset.state === 'LIVE_APPROVED', null, {timeout: 10_000});

    // Register after the Portal runtime's own pageshow listener. On a genuine
    // BFCache restore, the Portal synchronously purges stale values first; this
    // listener then stores the same-event DOM state before the delayed 500 can settle.
    await page.evaluate(() => {
      globalThis.__kidultsQaCapturePortalState = () => {
        const workspace = [...document.querySelectorAll('.workspace-grid article')];
        return {
          captured_at: performance.now(),
          state: document.documentElement.dataset.state || null,
          signal_count: document.querySelectorAll('[data-signal-grid] .signal-item').length,
          signal_text: document.querySelector('[data-signal-grid]')?.textContent || '',
          audit_row_count: document.querySelectorAll('[data-audit-safe] > span').length,
          audit_text: document.querySelector('[data-audit-safe]')?.textContent || '',
          vertical_count: document.querySelectorAll('[data-vertical-grid] .vertical-tile').length,
          audit_seal: document.querySelector('[data-audit-seal]')?.textContent || null,
          workspace_blocked: workspace.length === 4 && workspace.every((node) => node.getAttribute('aria-disabled') === 'true'),
          kidult_ready: document.querySelector('[data-k100-state]')?.dataset.contentState === 'LIVE_APPROVED',
          object_title: document.querySelector('[data-object-title]')?.textContent || null,
          object_count: document.querySelector('[data-object-count]')?.textContent || null,
        };
      };
      globalThis.__kidultsQaImmediateRestoredPurge = null;
      addEventListener('pageshow', (event) => {
        if (event.persisted) {
          globalThis.__kidultsQaImmediateRestoredPurge = globalThis.__kidultsQaCapturePortalState();
        }
      });
    });

    firstDocument = await page.evaluate(() => ({
      id: globalThis.__kidultsQaDocumentId,
      url: location.href,
      lifecycle: (globalThis.__kidultsQaLifecycle || []).map((event) => ({...event})),
      performance_navigation_type: performance.getEntriesByType('navigation')[0]?.type || null,
      signal_text: document.querySelector('[data-signal-grid]')?.textContent || '',
      audit_text: document.querySelector('[data-audit-safe]')?.textContent || '',
    }));
    if (!STALE_MARKER.test(`${firstDocument.signal_text} ${firstDocument.audit_text}`)) {
      functionalFailures.push('LIVE_PRECONDITION_MISSING');
    }

    const probeUrl = `${baseUrl}/__kidults-bfcache-probe-v1.html`;
    const secondResponse = await page.goto(probeUrl, {waitUntil: 'load', timeout: 45_000});
    if (!secondResponse?.ok()) functionalFailures.push(`SECOND_DOCUMENT_HTTP_${secondResponse?.status()}`);
    await page.waitForSelector('#kidults-bfcache-probe-v1', {state: 'attached', timeout: 10_000});
    secondDocument = await page.evaluate(() => ({
      id: globalThis.__kidultsQaDocumentId,
      url: location.href,
      lifecycle: (globalThis.__kidultsQaLifecycle || []).map((event) => ({...event})),
      performance_navigation_type: performance.getEntriesByType('navigation')[0]?.type || null,
    }));

    failAfterRestore = true;
    const backResponse = await page.goBack({waitUntil: 'commit', timeout: 45_000});
    await page.waitForURL((url) => url.pathname === '/portal-r001/index.html', {timeout: 10_000});
    await page.waitForFunction(() => globalThis.__kidultsQaImmediateRestoredPurge !== null, null, {timeout: 10_000});
    immediatePurge = await page.evaluate(() => structuredClone(globalThis.__kidultsQaImmediateRestoredPurge));

    await page.waitForFunction(() => (
      document.documentElement.dataset.state === 'INVALID'
      && document.querySelectorAll('[data-vertical-grid] .vertical-tile').length === 8
    ), null, {timeout: 15_000});
    settledPurge = await page.evaluate(() => globalThis.__kidultsQaCapturePortalState());
    restoredDocument = await page.evaluate(() => ({
      id: globalThis.__kidultsQaDocumentId,
      url: location.href,
      lifecycle: (globalThis.__kidultsQaLifecycle || []).map((event) => ({...event})),
      performance_navigation_type: performance.getEntriesByType('navigation')[0]?.type || null,
    }));

    evidence = {
      navigation_method: 'page.goBack',
      same_origin_history_navigation: new URL(firstDocument.url).origin === new URL(secondDocument.url).origin
        && new URL(firstDocument.url).origin === new URL(restoredDocument.url).origin,
      browser_emitted_pagehide_persisted: restoredDocument.lifecycle.some((event) => event.type === 'pagehide' && event.persisted === true),
      browser_emitted_pageshow_persisted: restoredDocument.lifecycle.some((event) => event.type === 'pageshow' && event.persisted === true),
      restored_document_identity_reused: firstDocument.id === restoredDocument.id,
      distinct_second_document_identity: firstDocument.id !== secondDocument.id,
      synthetic_dispatch_count: 0,
      forced_failure_response_count: forcedFailureResponseCount,
      immediate_purge_pass: immediatePurgePass(immediatePurge),
      settled_fail_closed_pass: settledPurgePass(settledPurge),
      evidence_source: 'BROWSER_HISTORY_NAVIGATION',
      performance_navigation_type: restoredDocument.performance_navigation_type,
      back_response_was_null: backResponse === null,
      first_document_id: firstDocument.id,
      second_document_id: secondDocument.id,
      restored_document_id: restoredDocument.id,
    };
  } catch (error) {
    functionalFailures.push(`EXCEPTION:${error.message}`);
  } finally {
    await closeAndSettle({
      pages: page ? [page] : [],
      contexts: context ? [context] : [],
      browsers: browser ? [browser] : [],
    });
  }

  const diagnostics = freezeDiagnostics({runtimeErrors, responseErrors, harnessDiagnostics});
  const realBfcache = assessRealBfcache(evidence || {});
  const verdict = deriveVerdict({functionalFailures, diagnostics, realBfcache});
  const report = {
    id: 'kidults-shared-portal-lifecycle-integrity-v1',
    source_sha: process.env.SOURCE_SHA || null,
    result: verdict.result,
    failures: verdict.failures,
    real_bfcache: realBfcache,
    observations: {
      first_document: firstDocument,
      second_document: secondDocument,
      restored_document: restoredDocument,
      immediate_purge: immediatePurge,
      settled_purge: settledPurge,
      evidence,
    },
    diagnostics,
    synthetic_lifecycle_control: {
      classification: 'CONTROL_ONLY',
      promotion_eligible: false,
      synthetic_dispatch_count: 0,
    },
    evidence_frozen_after_all_browser_close: true,
    serialized_verdict_bound_to_frozen_evidence: true,
    truth_boundary: {
      automated_webkit: true,
      physical_iphone: false,
      human_usability: false,
      empirical_gate_effect: 'NONE',
      approved_projection: 'FIXTURE_ONLY',
      public_release: 'HOLD',
      production: 'HOLD',
      g5: 'HOLD',
    },
  };
  assertSerializedBinding(report, verdict, realBfcache, diagnostics);
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (report.result !== 'PASS') process.exitCode = 1;
}

const mode = process.argv[2] || '--browser';
if (mode === '--self-test') await selfTest();
else if (mode === '--browser') await runBrowser();
else throw new Error(`UNKNOWN_MODE:${mode}`);
