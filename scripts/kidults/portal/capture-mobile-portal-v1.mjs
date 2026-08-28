import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';
import { chromium, webkit } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const outputRoot = path.resolve('apps/kidults-mobile-portal/public');
const outputDir = path.resolve(process.env.KIDULTS_MOBILE_OUTPUT ?? 'artifacts/kidults-mobile-portal-v1');
const port = Number(process.env.KIDULTS_MOBILE_PORT ?? 4175);
const baseUrl = `http://127.0.0.1:${port}`;
const redirectRules = fs.readFileSync(path.join(outputRoot, '_redirects'), 'utf8')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .map(line => line.split(/\s+/))
    .filter(([, , status]) => status === '200')
    .map(([from, to]) => ({ from, to }));
const headerRules = (() => {
  const rules = [];
  let current = null;
  for (const line of fs.readFileSync(path.join(outputRoot, '_headers'), 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      current = { pattern: line.trim(), headers: {} };
      rules.push(current);
      continue;
    }
    const separator = line.indexOf(':');
    if (current && separator > 0) current.headers[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return rules;
})();
const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'], ['.webp', 'image/webp'], ['.png', 'image/png'],
]);

fs.mkdirSync(outputDir, { recursive: true });

function firstRewrite(pathname) {
  return redirectRules.find(rule => rule.from === pathname)?.to ?? pathname;
}

function responseHeaders(pathname) {
  const result = {};
  for (const rule of headerRules) {
    const matches = rule.pattern.endsWith('*') ? pathname.startsWith(rule.pattern.slice(0, -1)) : pathname === rule.pattern;
    if (matches) Object.assign(result, rule.headers);
  }
  return result;
}

function startPagesFixture() {
  const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url ?? '/', baseUrl);
    let pathname = firstRewrite(requestUrl.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const absolute = path.resolve(outputRoot, `.${pathname}`);
    if (absolute !== outputRoot && !absolute.startsWith(`${outputRoot}${path.sep}`)) {
      response.writeHead(400).end('Bad path');
      return;
    }
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found');
      return;
    }
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': contentTypes.get(path.extname(absolute).toLowerCase()) ?? 'application/octet-stream',
      'x-kidults-pages-fixture': 'mobile-route-v1',
      ...responseHeaders(requestUrl.pathname),
    });
    fs.createReadStream(absolute).pipe(response);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

const viewports = [
  { width: 320, height: 844 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];
const report = {
  id: 'kidults-independent-mobile-portal-browser-qa-v1',
  generated_at: new Date().toISOString(),
  source_sha: process.env.SOURCE_SHA || 'LOCAL_UNBOUND',
  public_root: 'apps/kidults-mobile-portal/public',
  root: '/',
  cases: [],
  failures: [],
  visual_evidence: {
    screenshot_context: 'AXE_ISOLATED_BYPASS_CSP',
    runtime_security_evidence: false,
    strict_runtime_evidence: 'METRICS_PAGEERROR_CONSOLE_HTTP',
  },
  truth_boundary: { empirical_gate_effect: 'NONE', public: 'HOLD', production: 'HOLD', g5: 'HOLD' },
};
const server = await startPagesFixture();

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).filter(key => value[key] !== undefined).sort()
    .map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function mobilePayloadDigest(view) {
  const audit = view.audit;
  const payload = {
    schema_version: view.schema_version,
    source: view.source,
    projection: view.projection,
    release: view.release,
    signals: view.signals,
    evidence_methodology: view.evidence_methodology,
    kidult_100: view.kidult_100,
    audit: {
      projection_id: audit.projection_id,
      assessment_id: audit.assessment_id,
      exact_pair_digest: audit.exact_pair_digest,
      correlation_id: audit.correlation_id,
      reason_category: audit.reason_category,
    },
  };
  return `sha256:${crypto.createHash('sha256').update(`KIDULTS_MOBILE_PROJECTION_VIEW_V1\n${canonicalJson(payload)}`).digest('hex')}`;
}

function signedMobileEnvelope() {
  const digest = 'a'.repeat(64);
  const evidenceDigest = `sha256:${'b'.repeat(64)}`;
  const capabilityExpiresAt = Math.floor(Date.now() / 1_000) + 120;
  const signals = [
    ['market-scale', 'Market scale'], ['venue-depth', 'Venue depth'], ['transaction-activity', 'Transaction activity'],
    ['liquidity', 'Liquidity'], ['demand-scarcity', 'Demand / scarcity'], ['momentum', 'Momentum'],
  ].map(([signal_id, label], index) => ({ signal_id, label, state: 'LIVE_APPROVED', value: index + 1, confidence: 'HIGH', as_of: '2026-08-28T00:00:00Z', rights_state: 'CLEARED', freshness: 'CURRENT', evidence_refs: [evidenceDigest] }));
  const envelope = {
    record_type: 'kidults_mobile_projection_envelope',
    schema_version: '1.0.0',
    ok: true,
    capability_expires_at: capabilityExpiresAt,
    revalidate_after_ms: 5000,
    mobile_view: {
      schema_version: 'kidults-mobile-portal-view-1.0.0',
      source: 'MOBILE_VERIFIED_SERVER_CAPABILITY',
      projection: { state: 'LIVE_APPROVED', publication_state: 'APPROVED_PROJECTION', projection_id: 'qa-projection', assessment_id: 'qa-assessment', rights_state: 'CLEARED', freshness: 'CURRENT', as_of: '2026-08-28T00:00:00Z' },
      release: { state: 'RELEASED' },
      verticals: [], signals, objects: [],
      evidence_methodology: { coverage: '1 source', independence: '1 family', freshness: 'CURRENT', rights: 'CLEARED', methodology_version: 'qa-v1', lineage_version: '1.0.0' },
      kidult_100: { state: 'NOT_AVAILABLE', index_value: null, as_of: null, methodology_version: null, publication_authority: null, evidence_package_digest: null },
      audit: { projection_id: 'qa-projection', assessment_id: 'qa-assessment', exact_pair_digest: digest, correlation_id: 'qa-capability', reason_category: 'MOBILE_VERIFIED_CAPABILITY_ADMISSION' },
    },
    consumption_receipt: {
      record_type: 'kidults_mobile_projection_consumption_receipt', version: '1.0.0', decision: 'ACCEPTED', reason: 'MOBILE_VERIFIED_CAPABILITY_ADMISSION', errors: [],
      render_scope: 'MOBILE_PORTAL', purpose: 'MOBILE_PUBLIC_DISPLAY', publication_authority_state: 'VERIFIED_AUTHORIZED', public_live_intelligence: 'AUTHORIZED_FOR_EXACT_PROJECTION', clock_authority: 'KIDULTS_CONTROL_PLANE',
      capability_digest: digest, capability_id: 'qa-capability', payload_exposed: true, state_only: false,
      projection_id: 'qa-projection', assessment_id: 'qa-assessment', rankability_assessment_id: 'qa-assessment', rights_state: 'CLEARED', freshness_state: 'CURRENT', valid_until: new Date(capabilityExpiresAt * 1000).toISOString(),
      production_state: 'HOLD', g5_state: 'HOLD',
    },
  };
  const payloadDigest = mobilePayloadDigest(envelope.mobile_view);
  envelope.mobile_view.audit.mobile_payload_digest = payloadDigest;
  envelope.consumption_receipt.mobile_payload_digest = payloadDigest;
  return envelope;
}

async function inspect(page) {
  return page.evaluate(() => {
    const visible = node => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
    };
    const targets = [...document.querySelectorAll('a[href],button,input,select,textarea,summary')]
      .filter(visible)
      .map(node => {
        const rect = node.getBoundingClientRect();
        return { tag: node.tagName, label: (node.textContent || node.getAttribute('aria-label') || '').trim().slice(0, 60), width: Math.round(rect.width), height: Math.round(rect.height) };
      });
    const undersized = targets.filter(target => target.width < 44 || target.height < 44);
    const bar = document.querySelector('.m-projection-bar');
    const main = document.querySelector('main');
    const minimumText = [...document.querySelectorAll('.m-projection-bar span,.m-projection-bar strong,.m-eyebrow,.m-bottom-nav b,.m-signal small,.m-signal span')]
      .filter(visible)
      .map(node => ({ text: node.textContent.trim().slice(0, 40), px: Number.parseFloat(getComputedStyle(node).fontSize) }))
      .filter(item => item.px < 11);
    return {
      product: document.documentElement.dataset.product,
      entrySurface: document.documentElement.dataset.entrySurface,
      release: document.documentElement.dataset.release,
      state: document.documentElement.dataset.state,
      mobileReady: document.documentElement.dataset.mobileReady,
      mainCount: document.querySelectorAll('main,[role="main"]').length,
      projectionBeforeMain: Boolean(bar && main && (bar.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING)),
      projectionInFirstFold: Boolean(bar && bar.getBoundingClientRect().bottom < innerHeight * .28),
      verticalCount: document.querySelectorAll('.m-vertical-item').length,
      verticalListHeight: Math.round(document.querySelector('[data-mobile-verticals]')?.getBoundingClientRect().height ?? 0),
      signalCount: document.querySelectorAll('.m-signal').length,
      bottomNavCount: document.querySelectorAll('.m-bottom-nav a').length,
      activeNavCount: document.querySelectorAll('.m-bottom-nav a[aria-current="location"]').length,
      nonMobileLinks: [...document.querySelectorAll('a[href]')]
        .map(node => node.getAttribute('href') ?? '')
        .filter(href => !href.startsWith('#')),
      desktopUiMarkers: document.querySelectorAll('.module-card,.status-strip,.hero-image,.workspace-grid').length,
      nonMobileResourceLoads: performance.getEntriesByType('resource').map(entry => new URL(entry.name, location.href)).filter(url => {
        const allowed = new Set([
          '/api/mobile/v1/projection',
          '/mobile/mobile.css',
          '/mobile/mobile.js',
          '/mobile/projection-client.js',
          '/mobile/data/no-projection.json',
        ]);
        return url.origin !== location.origin || !allowed.has(url.pathname);
      }).map(url => url.href),
      signalAggregate: document.querySelector('[data-signal-state]')?.textContent?.trim(),
      kidult100State: document.querySelector('[data-k100-state]')?.textContent?.trim(),
      privateSentinelVisible: (document.body.textContent ?? '').includes('PRIVATE_SENTINEL'),
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      undersized,
      minimumText,
    };
  });
}

function mobileContextOptions(viewport) {
  return {
    viewport,
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
    reducedMotion: 'reduce',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  };
}

async function installProjectionFixture(context, projectionMode, { exerciseRevalidation = false } = {}) {
  let projectionRequestCount = 0;
  if (projectionMode === 'live') {
    await context.route('**/api/mobile/v1/projection', async route => {
      projectionRequestCount += 1;
      if (exerciseRevalidation && projectionRequestCount === 2) await new Promise(resolve => setTimeout(resolve, 4_000));
      if (exerciseRevalidation && projectionRequestCount > 2) await new Promise(resolve => setTimeout(resolve, 9_000));
      try {
        await route.fulfill({ status: 200, contentType: 'application/json', headers: { date: new Date().toUTCString() }, body: JSON.stringify(signedMobileEnvelope()) });
      } catch (error) {
        if (projectionRequestCount < 3) throw error;
      }
    });
  } else if (projectionMode === 'forged') {
    const forged = signedMobileEnvelope();
    forged.mobile_view.projection.rights_state = 'BLOCKED';
    forged.mobile_view.signals = [{ label: 'private', value: 'PRIVATE_SENTINEL', state: 'LIVE_APPROVED' }];
    await context.route('**/api/mobile/v1/projection', route => route.fulfill({ status: 200, contentType: 'application/json', headers: { date: new Date().toUTCString() }, body: JSON.stringify(forged) }));
  } else if (projectionMode === 'invalid') {
    await context.route('**/api/mobile/v1/projection', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false }) }));
  }
}

async function runCase(browserType, browserName, viewport, { entryPath = '/', withJourney = false, projectionMode = 'control' } = {}) {
  const browser = await browserType.launch({ headless: true });
  const contextOptions = mobileContextOptions(viewport);
  const context = await browser.newContext(contextOptions);
  await installProjectionFixture(context, projectionMode, { exerciseRevalidation: true });
  const page = await context.newPage();
  const runtimeErrors = [];
  const responseErrors = [];
  const harnessDiagnostics = [];
  page.on('pageerror', error => runtimeErrors.push(`PAGEERROR:${error.message}`));
  page.on('response', response => {
    if (response.status() < 400) return;
    const url = new URL(response.url());
    const expectedApi = url.pathname === '/api/mobile/v1/projection'
      && ((projectionMode === 'control' && [404, 503].includes(response.status())) || (projectionMode === 'invalid' && response.status() === 500));
    if (!expectedApi) responseErrors.push(`HTTP_${response.status()}:${url.pathname}`);
  });
  // Engines emit URL-less console errors for the expected negative Projection fixtures.
  // All unexpected HTTP failures are independently captured by the response listener above.
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const expectedControl404 = projectionMode === 'control' && /404 \(Not Found\)/.test(message.text());
    const expectedInvalid500 = projectionMode === 'invalid' && /500 \(Internal Server Error\)/.test(message.text());
    if (!expectedControl404 && !expectedInvalid500) runtimeErrors.push(`CONSOLE:${message.text()}`);
  });
  const localFailures = [];
  let metrics = null;
  let axeDetails = [];
  let journey = null;
  let revalidation = null;
  const entryName = entryPath === '/' ? 'root' : entryPath.replaceAll('/', '-') || 'root';
  try {
    const response = await page.goto(`${baseUrl}${entryPath}`, { waitUntil: 'networkidle', timeout: 45_000 });
    if (!response?.ok()) localFailures.push(`ENTRY_HTTP_${response?.status()}`);
    const headers = await response?.allHeaders();
    if (!headers?.['content-security-policy']?.includes("frame-ancestors 'none'")) localFailures.push('CSP_FRAME_ANCESTORS_MISSING');
    if (headers?.['x-content-type-options'] !== 'nosniff') localFailures.push('NOSNIFF_MISSING');
    if (headers?.['x-frame-options'] !== 'DENY') localFailures.push('FRAME_DENY_MISSING');
    if (!headers?.['permissions-policy']?.includes('camera=()')) localFailures.push('PERMISSIONS_POLICY_MISSING');
    if (headers?.['referrer-policy'] !== 'no-referrer') localFailures.push('REFERRER_POLICY_MISSING');
    if (headers?.['x-robots-tag'] !== 'noindex, nofollow') localFailures.push('ROBOTS_NOINDEX_MISSING');
    await page.waitForFunction(() => document.documentElement.dataset.mobileReady === 'true', null, { timeout: 15_000 });
    metrics = await inspect(page);
    // Keep the runtime page under the exact strict CSP with zero-tolerance error
    // capture. Axe performs its own style probe, so accessibility analysis runs on
    // a second, isolated context. This prevents the QA tool from modifying or
    // suppressing security evidence from the application page.
    const axeContext = await browser.newContext({ ...contextOptions, bypassCSP: true });
    await installProjectionFixture(axeContext, projectionMode);
    const axePage = await axeContext.newPage();
    let axe;
    try {
      const axeResponse = await axePage.goto(`${baseUrl}${entryPath}`, { waitUntil: 'networkidle', timeout: 45_000 });
      if (!axeResponse?.ok()) throw new Error(`AXE_ENTRY_HTTP_${axeResponse?.status()}`);
      await axePage.waitForFunction(() => document.documentElement.dataset.mobileReady === 'true', null, { timeout: 15_000 });
      axe = await new AxeBuilder({ page: axePage }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      // Playwright WebKit may inject diagnostic CSS while taking a full-page
      // screenshot. Keep that tooling mutation inside the already-isolated
      // bypass-CSP visual/a11y context; the runtime evidence page remains under
      // the exact production CSP and retains zero-tolerance console capture.
      await axePage.screenshot({ path: path.join(outputDir, `${browserName}-${entryName}-${projectionMode}-${viewport.width}x${viewport.height}.png`), fullPage: true, animations: 'allow', caret: 'initial' });
    } finally {
      await axeContext.close();
    }
    axeDetails = axe.violations
      .filter(violation => ['serious', 'critical'].includes(violation.impact))
      .flatMap(violation => violation.nodes.map(node => ({ id: violation.id, target: node.target, html: node.html })));

    if (metrics.product !== 'kidults-mobile-intelligence-portal') localFailures.push(`PRODUCT_${metrics.product}`);
    if (metrics.entrySurface !== 'mobile-independent') localFailures.push(`ENTRY_${metrics.entrySurface}`);
    if (metrics.release !== 'mobile-release-001') localFailures.push(`RELEASE_${metrics.release}`);
    const expectedState = projectionMode === 'live' ? 'LIVE_APPROVED' : ['invalid', 'forged'].includes(projectionMode) ? 'INVALID' : 'NO_PROJECTION';
    if (metrics.state !== expectedState) localFailures.push(`STATE_${metrics.state}_EXPECTED_${expectedState}`);
    if (metrics.mainCount !== 1) localFailures.push(`MAIN_COUNT_${metrics.mainCount}`);
    if (!metrics.projectionBeforeMain || !metrics.projectionInFirstFold) localFailures.push('PROJECTION_STATUS_NOT_FIRST_FOLD');
    if (metrics.verticalCount !== 8) localFailures.push(`VERTICAL_COUNT_${metrics.verticalCount}`);
    if (metrics.signalCount !== 6) localFailures.push(`SIGNAL_COUNT_${metrics.signalCount}`);
    if (metrics.bottomNavCount !== 4) localFailures.push(`BOTTOM_NAV_${metrics.bottomNavCount}`);
    if (metrics.activeNavCount !== 1) localFailures.push(`ACTIVE_NAV_COUNT_${metrics.activeNavCount}`);
    if (metrics.nonMobileLinks.length) localFailures.push(`NON_MOBILE_LINKS_${JSON.stringify(metrics.nonMobileLinks)}`);
    if (metrics.desktopUiMarkers !== 0) localFailures.push(`DESKTOP_MARKERS_${metrics.desktopUiMarkers}`);
    if (metrics.nonMobileResourceLoads.length) localFailures.push(`NON_MOBILE_RESOURCE_LOADS_${JSON.stringify(metrics.nonMobileResourceLoads)}`);
    if (projectionMode === 'live' && metrics.signalAggregate !== 'LIVE APPROVED') localFailures.push(`EVIDENCE_BOUND_SIGNALS_NOT_LIVE_${metrics.signalAggregate}`);
    if (projectionMode === 'live' && metrics.kidult100State === 'LIVE APPROVED') localFailures.push('K100_FALSE_LIVE');
    if (metrics.privateSentinelVisible) localFailures.push('PRIVATE_SENTINEL_EXPOSED');
    if (metrics.horizontalOverflow) localFailures.push('HORIZONTAL_OVERFLOW');
    if (metrics.undersized.length) localFailures.push(`UNDERSIZED_TARGETS_${JSON.stringify(metrics.undersized)}`);
    if (metrics.minimumText.length) localFailures.push(`TEXT_BELOW_11PX_${JSON.stringify(metrics.minimumText)}`);
    if (axeDetails.length) localFailures.push(`AXE_${JSON.stringify(axeDetails)}`);
    await page.locator('[data-open-status]').first().click();
    if (!(await page.locator('#mobile-status-dialog').evaluate(node => node.open))) localFailures.push('STATUS_DIALOG_NOT_OPEN');
    const dialogViewport = await page.locator('#mobile-status-dialog').evaluate(node => ({ bottom: node.getBoundingClientRect().bottom, height: node.getBoundingClientRect().height, viewport: innerHeight, overflowY: getComputedStyle(node).overflowY }));
    if (dialogViewport.bottom > dialogViewport.viewport + 1 || !['auto', 'scroll'].includes(dialogViewport.overflowY)) localFailures.push(`DIALOG_VIEWPORT_${JSON.stringify(dialogViewport)}`);
    await page.locator('.m-dialog-close').click();

    if (projectionMode === 'live') {
      await page.waitForFunction(() => document.documentElement.dataset.revalidating === 'true', null, { timeout: 8_000 });
      const atomicObservation = await page.evaluate(() => ({
        state: document.documentElement.dataset.state,
        mobileReady: document.documentElement.dataset.mobileReady,
        verticalCount: document.querySelectorAll('.m-vertical-item').length,
        verticalListHeight: Math.round(document.querySelector('[data-mobile-verticals]')?.getBoundingClientRect().height ?? 0),
        brief: document.querySelector('[data-brief-copy]')?.textContent?.trim(),
      }));
      if (atomicObservation.state !== 'LIVE_APPROVED' || atomicObservation.mobileReady !== 'true') localFailures.push(`REVALIDATION_NON_ATOMIC_${JSON.stringify(atomicObservation)}`);
      if (atomicObservation.verticalCount !== 8) localFailures.push(`REVALIDATION_VERTICAL_COUNT_${atomicObservation.verticalCount}`);
      if (Math.abs(atomicObservation.verticalListHeight - metrics.verticalListHeight) > 2) localFailures.push(`REVALIDATION_LAYOUT_SHIFT_${metrics.verticalListHeight}_TO_${atomicObservation.verticalListHeight}`);
      if (!atomicObservation.brief?.startsWith('A governed Projection is available.')) localFailures.push(`REVALIDATION_COPY_${atomicObservation.brief}`);
      await page.waitForFunction(() => document.documentElement.dataset.revalidating !== 'true' && document.documentElement.dataset.state === 'LIVE_APPROVED', null, { timeout: 6_000 });
      await page.waitForFunction(() => document.documentElement.dataset.revalidating === 'true', null, { timeout: 8_000 });
      await page.waitForFunction(() => document.documentElement.dataset.state === 'INVALID' && document.documentElement.dataset.mobileReady === 'true', null, { timeout: 10_000 });
      const timeoutObservation = await page.evaluate(() => ({
        state: document.documentElement.dataset.state,
        reason: document.querySelector('[data-dialog-reason]')?.textContent?.trim(),
        verticalCount: document.querySelectorAll('.m-vertical-item').length,
        signalCount: document.querySelectorAll('.m-signal').length,
        privateSentinelVisible: (document.body.textContent ?? '').includes('PRIVATE_SENTINEL'),
      }));
      if (timeoutObservation.reason !== 'MOBILE PROJECTION TIMEOUT') localFailures.push(`REVALIDATION_TIMEOUT_REASON_${timeoutObservation.reason}`);
      if (timeoutObservation.verticalCount !== 8 || timeoutObservation.signalCount !== 6) localFailures.push(`REVALIDATION_TIMEOUT_FOOTPRINT_${JSON.stringify(timeoutObservation)}`);
      if (timeoutObservation.privateSentinelVisible) localFailures.push('REVALIDATION_TIMEOUT_PRIVATE_SENTINEL_EXPOSED');
      revalidation = { atomicObservation, timeoutObservation };
    }

    if (withJourney) {
      const before = await page.evaluate(() => document.documentElement.dataset.entrySurface);
      await page.locator('.m-bottom-nav a[href="#evidence"]').click();
      await page.waitForURL(/#evidence$/, { timeout: 15_000 });
      await page.waitForTimeout(100);
      const evidenceActive = await page.locator('.m-bottom-nav a[href="#evidence"]').getAttribute('aria-current') === 'location';
      const evidenceReached = await page.locator('#evidence').evaluate(node => {
        const heading = node.querySelector('h2');
        const headingRect = heading?.getBoundingClientRect();
        const stickyBottom = Math.max(0, ...[...document.querySelectorAll('.m-header,.m-projection-bar')]
          .filter(item => ['fixed', 'sticky'].includes(getComputedStyle(item).position))
          .map(item => item.getBoundingClientRect().bottom));
        const bottomNavTop = document.querySelector('.m-bottom-nav')?.getBoundingClientRect().top ?? innerHeight;
        return location.hash === '#evidence'
          && Boolean(headingRect)
          && headingRect.bottom > stickyBottom
          && headingRect.top < bottomNavTop - 44;
      });
      await page.goto('about:blank');
      await page.goBack({ waitUntil: 'networkidle', timeout: 45_000 });
      await page.waitForFunction(() => document.documentElement.dataset.mobileReady === 'true', null, { timeout: 15_000 });
      await page.waitForTimeout(100);
      const restored = await inspect(page);
      const restoredEvidenceActive = await page.locator('.m-bottom-nav a[href="#evidence"]').getAttribute('aria-current') === 'location';
      await page.setViewportSize({ width: viewport.height, height: viewport.width });
      const landscape = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, fixedObstruction: [...document.querySelectorAll('.m-header,.m-projection-bar,.m-bottom-nav')].filter(node => getComputedStyle(node).position === 'fixed' || getComputedStyle(node).position === 'sticky').reduce((sum, node) => sum + node.getBoundingClientRect().height, 0), scrollPaddingTop: Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop), viewport: innerHeight }));
      journey = { before, evidenceReached, evidenceActive, restored: { product: restored.product, entrySurface: restored.entrySurface, horizontalOverflow: restored.horizontalOverflow, evidenceActive: restoredEvidenceActive }, landscape };
      if (!evidenceReached) localFailures.push('MOBILE_EVIDENCE_NAVIGATION_FAILED');
      if (!evidenceActive) localFailures.push('MOBILE_EVIDENCE_NAV_NOT_ACTIVE');
      if (restored.entrySurface !== 'mobile-independent' || restored.horizontalOverflow) localFailures.push(`BACK_RESTORE_${JSON.stringify(restored)}`);
      if (!restoredEvidenceActive) localFailures.push('BACK_RESTORE_EVIDENCE_NAV_NOT_ACTIVE');
      if (landscape.overflow) localFailures.push('LANDSCAPE_OVERFLOW');
      if (landscape.fixedObstruction > landscape.viewport * .35) localFailures.push(`LANDSCAPE_OBSTRUCTION_${JSON.stringify(landscape)}`);
      if (landscape.scrollPaddingTop > 24) localFailures.push(`LANDSCAPE_SCROLL_PADDING_${JSON.stringify(landscape)}`);
      await page.setViewportSize(viewport);
    }

    await page.waitForTimeout(50);
    if (runtimeErrors.length) localFailures.push(...runtimeErrors);
    if (responseErrors.length) localFailures.push(...responseErrors);
  } catch (error) {
    localFailures.push(`EXCEPTION:${error.message}`);
  } finally {
    report.cases.push({ browser: browserName, entryPath, projectionMode, viewport, metrics, axeDetails, runtimeErrors, responseErrors, harnessDiagnostics, journey, revalidation, failures: localFailures });
    report.failures.push(...localFailures.map(failure => `${browserName}:${entryPath}:${projectionMode}:${viewport.width}x${viewport.height}:${failure}`));
    await context.close();
    await browser.close();
  }
}

try {
  for (const viewport of viewports) await runCase(chromium, 'chromium', viewport, { withJourney: true });
  for (const viewport of viewports) await runCase(webkit, 'webkit', viewport, { withJourney: true });
  await runCase(chromium, 'chromium', { width: 390, height: 844 }, { entryPath: '/mobile' });
  await runCase(webkit, 'webkit', { width: 390, height: 844 }, { entryPath: '/mobile/' });
  await runCase(chromium, 'chromium', { width: 390, height: 844 }, { projectionMode: 'live' });
  await runCase(webkit, 'webkit', { width: 390, height: 844 }, { projectionMode: 'invalid' });
  await runCase(chromium, 'chromium', { width: 390, height: 844 }, { projectionMode: 'forged' });
} finally {
  await new Promise(resolve => server.close(resolve));
}

report.result = report.failures.length ? 'FAIL' : 'PASS';
fs.writeFileSync(path.join(outputDir, 'mobile-portal-report-v1.json'), `${JSON.stringify(report, null, 2)}\n`);
if (report.failures.length) {
  console.error(`KIDULTS independent mobile Portal QA: FAIL (${report.failures.length})`);
  for (const failure of report.failures) console.error(`ERROR: ${failure}`);
  process.exit(1);
}
console.log(`KIDULTS independent mobile Portal QA: PASS (${report.cases.length} cases, Chromium+WebKit 320/375/390/430, root+/mobile+/mobile/, control+live+invalid+forged, zero desktop links/resources, headers, touch, a11y, cross-document restore, orientation)`);
