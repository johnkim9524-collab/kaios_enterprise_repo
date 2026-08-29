#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {webkit} from 'playwright';

const workspace = process.env.GITHUB_WORKSPACE;
if (!workspace) throw new Error('GITHUB_WORKSPACE is required');

const helperUrl = pathToFileURL(path.join(workspace, 'scripts/kidults/portal/browser-qa-evidence-v1.mjs')).href;
const {
  assessThirtyCycleMobileSurrogate,
  classifyConsoleError,
  closeAndFreezePageDiagnostics,
  deriveCaseVerdict,
} = await import(helperUrl);

const portalUrl = 'http://127.0.0.1:4174/portal/index.html';
const historyTargetUrl = 'http://127.0.0.1:4174/__qa_mobile_history_target';
const outputPath = '/tmp/kidults-shared-responsive-portal-mobile-canary-v1.json';
const requiredCycles = 30;
const runtimeErrors = [];
const responseErrors = [];
const harnessDiagnostics = [];
const functionalFailures = [];
const cycles = [];
let crashCount = 0;
let browser;
let context;
let page;
let companion;

const portalSnapshot = () => {
  const metrics = [...document.querySelectorAll('.vertical-metric strong')].map((node) => node.textContent.trim());
  const state = history.state?.kidultsPortalResponsiveUiV1 || null;
  const focused = document.activeElement;
  return {
    url: location.href,
    dataState: document.documentElement.dataset.dataState || null,
    verticalCount: document.querySelectorAll('[data-vertical-card]').length,
    metricTexts: metrics,
    staleProjectionLeak: metrics.some((value) => /(?:^|\s)[+-]?\d+(?:\.\d+)?\s*%/.test(value)),
    allMetricsWithheld: metrics.length === 16 && metrics.every((value) => value === 'NOT REGISTERED'),
    menuOpen: document.querySelector('[data-menu-toggle]')?.getAttribute('aria-expanded') === 'true'
      && document.querySelector('#primary-nav')?.classList.contains('is-open') === true,
    menuControls: document.querySelector('[data-menu-toggle]')?.getAttribute('aria-controls') || null,
    navigationLabel: document.querySelector('#primary-nav')?.getAttribute('aria-label') || null,
    focusedHref: focused?.closest?.('#primary-nav a[href]')?.getAttribute('href') || null,
    scrollX: globalThis.scrollX,
    scrollY: globalThis.scrollY,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    historyStateToken: state?.token || null,
    restoredToken: document.documentElement.dataset.historyUiRestored || null,
    documentId: globalThis.__kidultsQaDocumentId || null,
    navigationType: performance.getEntriesByType('navigation').at(-1)?.type || null,
    lifecycle: structuredClone(globalThis.__kidultsQaLifecycle || []),
  };
};

try {
  browser = await webkit.launch({headless: true});
  context = await browser.newContext({
    viewport: {width: 390, height: 844},
    reducedMotion: 'reduce',
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
    userAgent: 'KIDULTS-QA-NON-PHYSICAL-WEBKIT-SURROGATE',
  });

  await context.route('**/__qa_mobile_history_target', (route) => route.fulfill({
    status: 200,
    contentType: 'text/html; charset=utf-8',
    body: '<!doctype html><html lang="en"><meta charset="utf-8"><title>History target</title><body>same-origin history target</body></html>',
  }));
  await context.route('**/__qa_mobile_companion', (route) => route.fulfill({
    status: 200,
    contentType: 'text/html; charset=utf-8',
    body: '<!doctype html><html lang="en"><meta charset="utf-8"><title>Foreground companion</title><body>foreground companion</body></html>',
  }));

  await context.addInitScript(() => {
    Object.defineProperty(globalThis, '__kidultsQaDocumentId', {
      value: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
      writable: false,
      configurable: false,
    });
    globalThis.__kidultsQaLifecycle = [];
    const record = (type, event) => globalThis.__kidultsQaLifecycle.push({
      type,
      persisted: Boolean(event.persisted),
      trusted: Boolean(event.isTrusted),
      documentId: globalThis.__kidultsQaDocumentId,
    });
    addEventListener('pagehide', (event) => record('pagehide', event));
    addEventListener('pageshow', (event) => record('pageshow', event));
  });

  page = await context.newPage();
  companion = await context.newPage();
  const observe = (observedPage) => {
    observedPage.on('crash', () => { crashCount += 1; });
    observedPage.on('pageerror', (error) => runtimeErrors.push(`PAGEERROR_${error.message}`));
    observedPage.on('requestfailed', (request) => responseErrors.push(`REQUESTFAILED_${request.url()}_${request.failure()?.errorText || 'UNKNOWN'}`));
    observedPage.on('response', (response) => {
      if (response.status() >= 500) responseErrors.push(`HTTP_${response.status()}_${response.url()}`);
    });
    observedPage.on('console', (message) => {
      if (message.type() !== 'error') return;
      const classified = classifyConsoleError({text: message.text(), forcedFailureResponseCount: 0});
      if (classified.classification === 'IGNORED_FAVICON') harnessDiagnostics.push(classified.value);
      else runtimeErrors.push(`CONSOLE_${classified.value}`);
    });
  };
  observe(page);
  observe(companion);

  await companion.goto('http://127.0.0.1:4174/__qa_mobile_companion', {waitUntil: 'domcontentloaded'});
  await page.goto(portalUrl, {waitUntil: 'domcontentloaded'});
  await page.waitForFunction(() => (
    document.documentElement.dataset.dataState !== 'loading'
    && document.querySelectorAll('[data-vertical-card]').length === 8
  ), null, {timeout: 15_000});

  for (let index = 1; index <= requiredCycles; index += 1) {
    const prepared = await page.evaluate((cycle) => {
      const toggle = document.querySelector('[data-menu-toggle]');
      const nav = document.querySelector('#primary-nav');
      const link = nav?.querySelector('a[href="#verticals"]') || nav?.querySelector('a[href]');
      if (!toggle || !nav || !link) return {prepared: false};
      if (toggle.getAttribute('aria-expanded') !== 'true') toggle.click();
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - innerHeight);
      globalThis.scrollTo(0, Math.min(maxScroll, 620 + cycle * 3));
      link.focus({preventScroll: true});
      return {
        prepared: true,
        expectedScrollY: globalThis.scrollY,
        expectedFocusHref: link.getAttribute('href'),
        menuOpen: toggle.getAttribute('aria-expanded') === 'true' && nav.classList.contains('is-open'),
        documentId: globalThis.__kidultsQaDocumentId,
      };
    }, index);
    if (!prepared.prepared) throw new Error(`CYCLE_${index}_PORTAL_CONTROLS_MISSING`);

    await companion.bringToFront();
    await page.waitForTimeout(25);
    const backgroundObserved = await page.evaluate(() => document.visibilityState === 'hidden' || !document.hasFocus());
    await page.bringToFront();
    await page.waitForTimeout(25);
    const foregroundObserved = await page.evaluate(() => document.visibilityState === 'visible' && document.hasFocus());

    await page.goto(historyTargetUrl, {waitUntil: 'domcontentloaded'});
    const returned = await page.goBack({waitUntil: 'commit'});
    await page.waitForURL(/\/portal\/index\.html$/);
    await page.waitForFunction(() => (
      document.querySelectorAll('[data-vertical-card]').length === 8
      && document.documentElement.dataset.historyUiRestored
      && document.documentElement.dataset.historyUiRestored === history.state?.kidultsPortalResponsiveUiV1?.token
    ), null, {timeout: 15_000});
    const restored = await page.evaluate(portalSnapshot);
    const menuPass = prepared.menuOpen === true && restored.menuOpen === true;
    const focusPass = restored.focusedHref === prepared.expectedFocusHref;
    const scrollPass = Math.abs(restored.scrollY - prepared.expectedScrollY) <= 2;
    const restorationPass = Boolean(restored.historyStateToken && restored.historyStateToken === restored.restoredToken);
    const navigationPass = Boolean(returned) && restored.url.endsWith('/portal/index.html');
    const accessibilityPass = restored.menuControls === 'primary-nav'
      && restored.navigationLabel === 'Primary navigation'
      && restored.scrollWidth <= restored.clientWidth;
    const lifecycle = restored.lifecycle;
    const trustedPersistedShow = lifecycle.some((entry) => entry.type === 'pageshow' && entry.persisted && entry.trusted);
    const identityPreserved = restored.documentId === prepared.documentId;
    const historyOutcome = identityPreserved && trustedPersistedShow ? 'BFCACHE_RESTORED' : 'HISTORY_RELOAD_CONTAINED';
    const stalePass = restored.allMetricsWithheld && restored.staleProjectionLeak === false;
    const backgroundForegroundExercise = true;
    const cyclePass = backgroundForegroundExercise && navigationPass && restorationPass
      && menuPass && focusPass && scrollPass && accessibilityPass && stalePass;
    cycles.push({
      cycle: index,
      backgroundObserved,
      foregroundObserved,
      backgroundForegroundExercise,
      navigationPass,
      restorationPass,
      menuPass,
      focusPass,
      scrollPass,
      accessibilityPass,
      stalePass,
      historyOutcome,
      navigationType: restored.navigationType,
      cyclePass,
    });
    if (!cyclePass) functionalFailures.push(`CYCLE_${index}_FAILED_${JSON.stringify(cycles.at(-1))}`);
  }
} catch (error) {
  functionalFailures.push(`CANARY_EXCEPTION_${error?.stack || error}`);
} finally {
  const pageForClose = page || {isClosed: () => true, close: async () => {}};
  const contextForClose = context || {close: async () => {}};
  const browserForClose = browser || {close: async () => {}};
  if (companion && !companion.isClosed()) await companion.close({runBeforeUnload: false});
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
  const evidence = {
    evidenceClass: 'NON_PHYSICAL_WEBKIT_SURROGATE',
    engine: 'PLAYWRIGHT_WEBKIT',
    physicalDevice: false,
    voiceOverEnabled: false,
    syntheticLifecycleDispatch: false,
    requiredCycles,
    completedCycles: cycles.length,
    navigationPassCount: cycles.filter((cycle) => cycle.navigationPass).length,
    backgroundForegroundExerciseCount: cycles.filter((cycle) => cycle.backgroundForegroundExercise).length,
    nativeBackgroundForegroundObservation: 'NOT_AVAILABLE_IN_HEADLESS_WEBKIT',
    historyRestorationPassCount: cycles.filter((cycle) => cycle.restorationPass).length,
    menuRestorationPassCount: cycles.filter((cycle) => cycle.menuPass).length,
    focusRestorationPassCount: cycles.filter((cycle) => cycle.focusPass).length,
    scrollRestorationPassCount: cycles.filter((cycle) => cycle.scrollPass).length,
    accessibilitySurrogatePassCount: cycles.filter((cycle) => cycle.accessibilityPass).length,
    staleProjectionLeakCount: cycles.filter((cycle) => !cycle.stalePass).length,
    runtimeErrorCount: diagnostics.runtimeErrors.length + diagnostics.responseErrors.length,
    crashCount,
    failedCycleCount: cycles.filter((cycle) => !cycle.cyclePass).length,
    bfcacheRestoredCount: cycles.filter((cycle) => cycle.historyOutcome === 'BFCACHE_RESTORED').length,
    historyReloadContainedCount: cycles.filter((cycle) => cycle.historyOutcome === 'HISTORY_RELOAD_CONTAINED').length,
    claimsPhysicalIphoneAcceptance: false,
    claimsVoiceOverAcceptance: false,
  };
  const assessment = assessThirtyCycleMobileSurrogate(evidence);
  if (assessment.state !== 'VERIFIED_PASS') functionalFailures.push(...assessment.findings.map((finding) => `MOBILE_${finding}`));
  const verdict = deriveCaseVerdict({functionalFailures, diagnostics});
  const report = Object.freeze({
    id: 'kidults-shared-responsive-portal-mobile-canary-v1',
    result: verdict.result,
    exactSourceSha: process.env.SOURCE_SHA || null,
    evidenceClass: 'NON_PHYSICAL_WEBKIT_SURROGATE',
    automatedWebkitSurrogate: assessment,
    physicalIphoneMobileSafariAcceptance: 'HOLD_PENDING_PHYSICAL_DEVICE',
    voiceOverScreenReaderAcceptance: 'HOLD_PENDING_HUMAN_REVIEW',
    evidence,
    cycles,
    verdict,
    authority: Object.freeze({promotionEligible: false, publicRelease: 'HOLD', production: 'HOLD', g5: 'HOLD'}),
    limitations: Object.freeze([
      'PLAYWRIGHT_WEBKIT_AND_MOBILE_EMULATION_ARE_NOT_A_PHYSICAL_IPHONE_OR_MOBILE_SAFARI_RECEIPT',
      'HEADLESS_WEBKIT_EXERCISES_TAB_SWITCHES_BUT_DOES_NOT_EXPOSE_NATIVE_IOS_BACKGROUND_FOREGROUND_LIFECYCLE',
      'DOM_ACCESSIBILITY_ASSERTIONS_ARE_NOT_VOICEOVER_OR_HUMAN_SCREEN_READER_ACCEPTANCE',
      'ONLY_A_SIGNED_PHYSICAL_DEVICE_RECEIPT_CAN_CLOSE_THE_HUMAN_GATE',
    ]),
  });
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (verdict.result !== 'PASS') process.exitCode = 1;
}
