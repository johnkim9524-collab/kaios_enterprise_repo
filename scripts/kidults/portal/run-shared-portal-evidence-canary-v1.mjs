#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {webkit} from 'playwright';

const workspace = process.env.GITHUB_WORKSPACE;
if (!workspace) throw new Error('GITHUB_WORKSPACE is required');

const helperUrl = pathToFileURL(path.join(workspace, 'scripts/kidults/portal/browser-qa-evidence-v1.mjs')).href;
const {
  assessRealBfcacheEvidence,
  assertRealNavigationCanarySource,
  classifyConsoleError,
  closeAndFreezePageDiagnostics,
  deriveCaseVerdict,
} = await import(helperUrl);

const selfSource = await fs.readFile(new URL(import.meta.url), 'utf8');
assertRealNavigationCanarySource(selfSource);

const approvedUrl = 'http://127.0.0.1:4174/portal-r001/index.html';
const secondDocumentUrl = 'http://127.0.0.1:4174/__qa_bfcache_target';
const outputPath = '/tmp/kidults-shared-portal-evidence-integrity-v1.json';
const runtimeErrors = [];
const responseErrors = [];
const harnessDiagnostics = [];
const functionalFailures = [];
let forcedFailureResponseCount = 0;
let browser;
let context;
let page;
let observations = {};

const snapshotPortal = () => {
  const workspaceCards = [...document.querySelectorAll('.workspace-grid article')];
  return {
    state: document.documentElement.dataset.state || null,
    signalCount: document.querySelectorAll('[data-signal-grid] .signal-item').length,
    signalText: document.querySelector('[data-signal-grid]')?.textContent || '',
    auditRowCount: document.querySelectorAll('[data-audit-safe] > span').length,
    auditText: document.querySelector('[data-audit-safe]')?.textContent || '',
    verticalCount: document.querySelectorAll('[data-vertical-grid] .vertical-tile').length,
    auditSeal: document.querySelector('[data-audit-seal]')?.textContent || null,
    workspaceBlocked: workspaceCards.length === 4 && workspaceCards.every((node) => node.getAttribute('aria-disabled') === 'true'),
    kidultReady: document.querySelector('[data-k100-state]')?.dataset.contentState === 'LIVE_APPROVED',
    objectTitle: document.querySelector('[data-object-title]')?.textContent || null,
    objectCount: document.querySelector('[data-object-count]')?.textContent || null,
    documentId: globalThis.__kidultsQaDocumentId || null,
    lifecycle: structuredClone(globalThis.__kidultsQaLifecycle || []),
    navigationType: performance.getEntriesByType('navigation').at(-1)?.type || null,
  };
};

const staleMarker = /fixture-(?:approved|projection|assessment|replay|pair|correlation|what_changed|liquidity|market_scale)/;
const immediatePurgePass = (value) => Boolean(
  value
  && value.state === 'INVALID'
  && value.signalCount === 0
  && value.signalText === ''
  && value.auditRowCount === 9
  && !staleMarker.test(value.auditText)
  && value.verticalCount === 0
  && value.auditSeal === 'CONTROL BOUNDARY'
  && value.workspaceBlocked
  && !value.kidultReady
  && value.objectTitle === 'No governed object'
  && value.objectCount === 'WAITING'
);
const settledFailClosedPass = (value) => Boolean(
  value
  && value.state === 'INVALID'
  && value.signalCount === 0
  && value.signalText === ''
  && !staleMarker.test(value.auditText)
  && value.verticalCount === 8
  && value.auditSeal === 'CONTROL BOUNDARY'
  && value.workspaceBlocked
  && !value.kidultReady
  && value.objectTitle === 'No governed object'
  && value.objectCount === 'WAITING'
);

try {
  browser = await webkit.launch({headless: true});
  context = await browser.newContext({viewport: {width: 390, height: 844}, reducedMotion: 'reduce'});

  await context.route('**/__qa_bfcache_target', (route) => route.fulfill({
    status: 200,
    contentType: 'text/html; charset=utf-8',
    body: '<!doctype html><html lang="en"><meta charset="utf-8"><title>BFCache target</title><body>same-origin navigation target</body></html>',
  }));

  await context.addInitScript(() => {
    const documentId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    Object.defineProperty(globalThis, '__kidultsQaDocumentId', {
      value: documentId,
      writable: false,
      configurable: false,
      enumerable: false,
    });
    globalThis.__kidultsQaLifecycle = [];
    const record = (type, event) => {
      globalThis.__kidultsQaLifecycle.push({
        type,
        persisted: Boolean(event.persisted),
        trusted: Boolean(event.isTrusted),
        documentId: globalThis.__kidultsQaDocumentId,
        href: location.href,
        at: performance.now(),
      });
    };
    addEventListener('pagehide', (event) => record('pagehide', event));
    addEventListener('pageshow', (event) => record('pageshow', event));
  });

  page = await context.newPage();
  page.on('crash', () => runtimeErrors.push('PAGE_CRASH'));
  page.on('pageerror', (error) => runtimeErrors.push(`PAGEERROR_${error.message}`));
  page.on('response', (response) => {
    if (response.status() >= 400 && !response.url().includes('/api/v1/projection')) {
      responseErrors.push(`HTTP_${response.status()}_${response.url()}`);
    }
  });
  page.on('requestfailed', (request) => responseErrors.push(`REQUESTFAILED_${request.url()}_${request.failure()?.errorText || 'UNKNOWN'}`));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const classified = classifyConsoleError({
      text: message.text(),
      forcedFailureResponseCount,
    });
    if (classified.classification === 'EXPECTED_FORCED_500_HARNESS_DIAGNOSTIC') {
      harnessDiagnostics.push(`${classified.classification}_${classified.value}`);
    } else if (classified.classification === 'APPLICATION_RUNTIME_ERROR') {
      runtimeErrors.push(`CONSOLE_${classified.value}`);
    }
  });

  await page.goto(approvedUrl, {waitUntil: 'domcontentloaded'});
  await page.waitForFunction(() => document.documentElement.dataset.state === 'LIVE_APPROVED', {timeout: 5000});
  const livePrecondition = await page.evaluate(snapshotPortal);
  if (!livePrecondition.signalText.includes('fixture-what_changed') || !livePrecondition.auditText.includes('fixture-approved-market-v1')) {
    functionalFailures.push(`PRECONDITION_NOT_LIVE_${JSON.stringify(livePrecondition)}`);
  }
  const firstDocumentId = livePrecondition.documentId;

  await page.goto(secondDocumentUrl, {waitUntil: 'domcontentloaded'});
  const secondDocument = await page.evaluate(() => ({
    origin: location.origin,
    documentId: globalThis.__kidultsQaDocumentId || null,
  }));
  const secondDocumentSameOrigin = new URL(secondDocumentUrl).origin === new URL(approvedUrl).origin;
  if (!secondDocumentSameOrigin) functionalFailures.push('SECOND_DOCUMENT_NOT_SAME_ORIGIN');
  if (!secondDocument.documentId || secondDocument.documentId === firstDocumentId) {
    functionalFailures.push('SECOND_DOCUMENT_IDENTITY_NOT_DISTINCT');
  }

  await context.route('**/api/v1/projection', async (route) => {
    forcedFailureResponseCount += 1;
    await new Promise((resolve) => setTimeout(resolve, 400));
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ok: false, error: 'qa_forced_revalidation_failure'}),
    });
  });

  await page.goBack({waitUntil: 'commit'});
  await page.waitForURL(/\/portal-r001\/index\.html$/);
  const immediatePurge = await page.evaluate(snapshotPortal);
  await page.waitForFunction(
    () => document.documentElement.dataset.state === 'INVALID' && document.querySelectorAll('[data-vertical-grid] .vertical-tile').length === 8,
    {timeout: 5000},
  );
  const settledPurge = await page.evaluate(snapshotPortal);
  const type = settledPurge.navigationType;
  const browserHistoryTraversal = type === 'back_forward';
  if (!browserHistoryTraversal) {
    functionalFailures.push(`NAVIGATION_TYPE_${type}_EXPECTED_back_forward`);
  }

  const pagehide = [...settledPurge.lifecycle].reverse().find((entry) => entry.type === 'pagehide');
  const pageshow = [...settledPurge.lifecycle].reverse().find((entry) => entry.type === 'pageshow' && entry.documentId === firstDocumentId);
  const evidence = {
    navigationMethod: 'page.goBack',
    secondDocumentSameOrigin,
    pagehidePersisted: pagehide?.persisted === true,
    pagehideTrusted: pagehide?.trusted === true,
    pageshowPersisted: pageshow?.persisted === true,
    pageshowTrusted: pageshow?.trusted === true,
    navigationType: type,
    documentIdentityPreserved: settledPurge.documentId === firstDocumentId,
    syntheticDispatchUsed: false,
    forcedFailureResponseCount,
    immediatePurgePass: immediatePurgePass(immediatePurge),
    settledFailClosedPass: settledFailClosedPass(settledPurge),
    firstDocumentId,
    restoredDocumentId: settledPurge.documentId,
  };
  const bfcacheAssessment = assessRealBfcacheEvidence(evidence);
  if (bfcacheAssessment.state !== 'VERIFIED_PASS') {
    functionalFailures.push(...bfcacheAssessment.findings.map((finding) => `BFCACHE_${finding}`));
  }

  observations = {
    livePrecondition,
    secondDocument,
    immediatePurge,
    settledPurge,
    evidence,
    bfcacheAssessment,
  };
} catch (error) {
  functionalFailures.push(`CANARY_EXCEPTION_${error?.stack || error}`);
} finally {
  // Always emit a structured fail-closed receipt, including browser-launch failures.
  const pageForClose = page || {isClosed: () => true, close: async () => {}};
  const contextForClose = context || {close: async () => {}};
  const browserForClose = browser || {close: async () => {}};
  const diagnostics = await closeAndFreezePageDiagnostics({
    page: pageForClose,
    context: contextForClose,
    browser: browserForClose,
    closeContext: true,
    closeBrowser: true,
    runtimeErrors,
    responseErrors,
    harnessDiagnostics,
  });
  const verdict = deriveCaseVerdict({functionalFailures, diagnostics});
  const report = Object.freeze({
    id: 'kidults-shared-portal-evidence-integrity-v1',
    result: verdict.result,
    exactSourceSha: process.env.SOURCE_SHA || null,
    case: 'REAL_SAME_ORIGIN_HISTORY_BFCACHE_FAILED_REVALIDATION_PURGE',
    evidenceClass: 'REAL_BROWSER_CONTROL_EVIDENCE',
    legacySyntheticPageTransitionCasesAreControlOnly: true,
    verdict,
    observations,
    truthBoundary: Object.freeze({
      empiricalGateEffect: 'NONE',
      approvedProjection: 'FIXTURE_ONLY_NON_PROMOTABLE',
      publicRelease: 'HOLD',
      production: 'HOLD',
      g5: 'HOLD',
    }),
    limitations: Object.freeze([
      'AUTOMATED_WEBKIT_IS_NOT_PHYSICAL_IPHONE_ACCEPTANCE',
      'DETACHED_OR_EXACT_HEAD_EXECUTION_IS_NOT_PROTECTED_MAIN_ACCEPTANCE',
      'HARNESS_DIAGNOSTICS_CANNOT_AUTHORIZE_PROMOTION',
    ]),
  });
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (verdict.result !== 'PASS') process.exitCode = 1;
}
