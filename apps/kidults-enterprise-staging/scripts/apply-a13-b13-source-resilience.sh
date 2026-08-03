#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

APP="apps/kidults-enterprise-staging"
PUBLIC="$APP/public/a13-b10"

python3 - <<'PY'
from pathlib import Path
import re

app = Path('apps/kidults-enterprise-staging')
public = app / 'public' / 'a13-b10'
html_path = public / 'index.html'
css_path = public / 'portal.css'
js_path = public / 'portal.js'
test_path = app / 'a13-b13-live-source-resilience.test.mjs'

html = html_path.read_text(encoding='utf-8')
css = css_path.read_text(encoding='utf-8')
js = js_path.read_text(encoding='utf-8')

a13_section = '''
    <section class="product-section" id="operational-health">
      <div class="section-heading split-heading"><div><p class="eyebrow">Operational Health</p><h2>Sources fail independently. Intelligence continues.</h2></div><p>Registry health · retry policy · circuit state · partial-failure tolerance</p></div>
      <div class="trust-layout operational-health-layout">
        <article class="trust-panel">
          <p class="eyebrow">Registry state</p>
          <div class="trust-metrics operational-health-metrics">
            <div><strong data-registry-state>Loading</strong><span>Aggregate health</span></div>
            <div><strong data-registry-healthy>—</strong><span>Healthy sources</span></div>
            <div><strong data-registry-enabled>—</strong><span>Enabled sources</span></div>
          </div>
          <div class="trust-meta">
            <p><span>Retry policy</span><strong data-registry-retry>Loading registry</strong></p>
            <p><span>Circuit breaker</span><strong data-registry-circuit>Loading registry</strong></p>
            <p><span>Failure policy</span><strong data-registry-policy>Loading registry</strong></p>
          </div>
        </article>
        <article class="trust-panel">
          <p class="eyebrow">Source registry</p>
          <div class="source-health-list" data-source-health-list><p class="source-health-empty">Loading source health.</p></div>
        </article>
      </div>
    </section>
'''

if 'id="operational-health"' not in html:
    marker = '    <section class="product-section" id="method-trust">'
    if marker not in html:
        raise SystemExit('method-trust insertion marker not found')
    html = html.replace(marker, a13_section + '\n' + marker, 1)

html = html.replace('/a13-b10/portal.css?v=20260803-b11', '/a13-b10/portal.css?v=20260803-b13')
html = html.replace('/a13-b10/portal.js?v=20260803-b11', '/a13-b10/portal.js?v=20260803-b13')
html_path.write_text(html, encoding='utf-8')

css_block = r'''

/* A13-B13 Live Source Resilience */
.operational-health-layout {
  align-items: stretch;
}

.operational-health-layout .trust-panel {
  min-width: 0;
}

.operational-health-metrics strong {
  max-width: 100%;
  font-size: clamp(2rem, 3vw, 2.85rem);
  overflow-wrap: anywhere;
}

.source-health-list {
  border-top: 1px solid var(--ink);
}

.source-health-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px 20px;
  padding: 18px 0;
  border-bottom: 1px solid var(--line);
}

.source-health-head {
  min-width: 0;
}

.source-health-head strong,
.source-health-status {
  display: block;
}

.source-health-head strong {
  font-size: 15px;
  line-height: 1.35;
}

.source-health-head small {
  display: block;
  margin-top: 5px;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.source-health-status {
  align-self: start;
  min-width: 72px;
  padding: 5px 8px;
  border: 1px solid var(--line-strong);
  color: var(--body);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: .1em;
  line-height: 1.2;
  text-align: center;
  text-transform: uppercase;
}

.source-health-status[data-health="healthy"] {
  border-color: var(--forest);
  color: var(--forest);
}

.source-health-status[data-health="degraded"],
.source-health-status[data-health="stale"] {
  border-color: var(--gold);
  color: var(--gold);
}

.source-health-status[data-health="open"],
.source-health-status[data-health="failed"] {
  border-color: var(--risk);
  color: var(--risk);
}

.source-health-meta {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  gap: 7px 16px;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.4;
}

.source-health-empty {
  margin: 0;
  padding: 20px 0;
  color: var(--muted);
  font-size: 14px;
}

@media (max-width: 767px) {
  .source-health-item {
    grid-template-columns: minmax(0, 1fr);
  }

  .source-health-status {
    justify-self: start;
  }

  .source-health-meta {
    grid-column: 1;
    display: grid;
    gap: 4px;
  }
}
'''

if '/* A13-B13 Live Source Resilience */' not in css:
    css += css_block
css_path.write_text(css, encoding='utf-8')

js_block = r'''

  const validateSourceRegistry = registry => {
    if (!registry || registry.release !== 'A13-B13') throw new Error('Source registry release is invalid');
    if (!Array.isArray(registry.sources)) throw new Error('Source registry sources are missing');
    if (!registry.defaults?.retry || !registry.defaults?.circuitBreaker) throw new Error('Source resilience defaults are incomplete');
    return registry;
  };

  const sourceRuntime = new Map();

  const wait = ms => new Promise(resolve => window.setTimeout(resolve, ms));

  const fetchWithTimeout = async (url, timeoutMs) => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) {
        const error = new Error(`Source request failed: ${response.status}`);
        error.status = response.status;
        throw error;
      }
      return response;
    } finally {
      window.clearTimeout(timeout);
    }
  };

  const getCircuitState = (source, policy) => {
    const runtime = sourceRuntime.get(source.id) || { failures: 0, openedAt: 0 };
    if (runtime.failures < policy.failureThreshold) return 'closed';
    if (Date.now() - runtime.openedAt >= policy.openMs) return 'half-open';
    return 'open';
  };

  const recordSourceSuccess = source => {
    sourceRuntime.set(source.id, { failures: 0, openedAt: 0 });
  };

  const recordSourceFailure = (source, policy) => {
    const runtime = sourceRuntime.get(source.id) || { failures: 0, openedAt: 0 };
    const failures = runtime.failures + 1;
    sourceRuntime.set(source.id, {
      failures,
      openedAt: failures >= policy.failureThreshold ? Date.now() : runtime.openedAt
    });
  };

  const probeSource = async (source, registry) => {
    const retry = registry.defaults.retry;
    const circuit = registry.defaults.circuitBreaker;
    const state = getCircuitState(source, circuit);
    if (!source.enabled) return { source, health: 'disabled', circuit: 'closed', attempts: 0 };
    if (state === 'open') return { source, health: 'open', circuit: 'open', attempts: 0 };

    const healthUrl = source.healthEndpoint || source.endpoint;
    let lastError = null;
    for (let attempt = 1; attempt <= retry.maxAttempts; attempt += 1) {
      try {
        await fetchWithTimeout(healthUrl, registry.defaults.timeoutMs);
        recordSourceSuccess(source);
        return { source, health: source.trust === 'illustrative' ? 'healthy' : 'healthy', circuit: 'closed', attempts: attempt };
      } catch (error) {
        lastError = error;
        const retryable = !error.status || retry.retryOn.includes(error.status);
        if (!retryable || attempt >= retry.maxAttempts) break;
        await wait(retry.backoffMs * attempt);
      }
    }

    recordSourceFailure(source, circuit);
    return {
      source,
      health: getCircuitState(source, circuit) === 'open' ? 'open' : 'failed',
      circuit: getCircuitState(source, circuit),
      attempts: retry.maxAttempts,
      error: lastError?.message || 'Unknown source failure'
    };
  };

  const renderSourceRegistry = (registry, results) => {
    const enabled = registry.sources.filter(source => source.enabled);
    const healthy = results.filter(result => result.health === 'healthy');
    const failed = results.filter(result => ['failed', 'open'].includes(result.health));
    const minimum = registry.aggregatePolicy.minimumHealthySources;
    const aggregate = healthy.length >= minimum
      ? (failed.length ? 'Degraded' : 'Healthy')
      : 'Fallback';

    setText('[data-registry-state]', aggregate);
    setText('[data-registry-healthy]', `${healthy.length}/${enabled.length}`);
    setText('[data-registry-enabled]', enabled.length);
    setText('[data-registry-retry]', `${registry.defaults.retry.maxAttempts} attempts · ${registry.defaults.retry.backoffMs}ms backoff`);
    setText('[data-registry-circuit]', `${registry.defaults.circuitBreaker.failureThreshold} failures · ${Math.round(registry.defaults.circuitBreaker.openMs / 1000)}s open`);
    setText('[data-registry-policy]', registry.aggregatePolicy.allowPartialFailure
      ? 'Partial failure allowed · total failure falls back'
      : 'All sources required');

    const target = qs('[data-source-health-list]');
    if (target) {
      target.innerHTML = results.map(result => {
        const source = result.source;
        const trust = source.trust || 'unclassified';
        const freshness = source.freshness?.status || (trust === 'illustrative' ? 'Illustrative' : 'Unknown');
        return `
          <article class="source-health-item">
            <div class="source-health-head"><strong>${source.label}</strong><small>${source.id}</small></div>
            <span class="source-health-status" data-health="${result.health}">${result.health}</span>
            <div class="source-health-meta"><span>Trust: ${trust}</span><span>Freshness: ${freshness}</span><span>Circuit: ${result.circuit}</span><span>Attempts: ${result.attempts}</span></div>
          </article>
        `;
      }).join('') || '<p class="source-health-empty">No enabled sources.</p>';
    }

    document.body.dataset.registryHealth = aggregate.toLowerCase();
  };

  const loadSourceRegistry = async () => {
    try {
      const registry = validateSourceRegistry(await fetchJson('/a13-b10/data/source-registry.json'));
      const ordered = [...registry.sources].sort((a, b) => b.priority - a.priority);
      const results = await Promise.all(ordered.map(source => probeSource(source, registry)));
      renderSourceRegistry(registry, results);
      return { registry, results };
    } catch (error) {
      console.error(error);
      setText('[data-registry-state]', 'Fallback');
      setText('[data-registry-healthy]', '0/0');
      setText('[data-registry-enabled]', '0');
      const target = qs('[data-source-health-list]');
      if (target) target.innerHTML = '<p class="source-health-empty">Source registry unavailable. B12 fallback remains active.</p>';
      document.body.dataset.registryHealth = 'fallback';
      return null;
    }
  };
'''

if 'const validateSourceRegistry = registry =>' not in js:
    marker = "  qsa('[data-category]').forEach"
    if marker not in js:
        raise SystemExit('portal.js insertion marker not found')
    js = js.replace(marker, js_block + '\n' + marker, 1)

js = js.replace('  loadProductThroughAdapter();', '  loadSourceRegistry().finally(loadProductThroughAdapter);')
js_path.write_text(js, encoding='utf-8')

test = test_path.read_text(encoding='utf-8')
if "const html =" not in test:
    anchor = "const registry = JSON.parse(\n  fs.readFileSync(path.join(publicRoot, 'data', 'source-registry.json'), 'utf8')\n);"
    replacement = anchor + "\nconst html = fs.readFileSync(path.join(publicRoot, 'index.html'), 'utf8');\nconst css = fs.readFileSync(path.join(publicRoot, 'portal.css'), 'utf8');\nconst js = fs.readFileSync(path.join(publicRoot, 'portal.js'), 'utf8');"
    test = test.replace(anchor, replacement)

extra_tests = r'''

test('A13-B13 renders operational health and source registry UI', () => {
  assert.match(html, /id="operational-health"/);
  assert.match(html, /data-registry-state/);
  assert.match(html, /data-source-health-list/);
  assert.match(css, /\.source-health-list/);
  assert.match(css, /\.source-health-status/);
});

test('A13-B13 loads and validates the source registry before product delivery', () => {
  assert.match(js, /fetchJson\('\/a13-b10\/data\/source-registry\.json'\)/);
  assert.match(js, /validateSourceRegistry/);
  assert.match(js, /loadSourceRegistry\(\)\.finally\(loadProductThroughAdapter\)/);
});

test('A13-B13 implements timeout retry and circuit breaker runtime controls', () => {
  assert.match(js, /AbortController/);
  assert.match(js, /fetchWithTimeout/);
  assert.match(js, /retry\.maxAttempts/);
  assert.match(js, /failureThreshold/);
  assert.match(js, /openMs/);
  assert.match(js, /half-open/);
});

test('A13-B13 publishes partial failure and fallback health states', () => {
  assert.match(js, /Partial failure allowed/);
  assert.match(js, /aggregate = healthy\.length >= minimum/);
  assert.match(js, /document\.body\.dataset\.registryHealth/);
  assert.match(js, /B12 fallback remains active/);
});
'''

if "renders operational health and source registry UI" not in test:
    test += extra_tests

test_path.write_text(test, encoding='utf-8')
PY

node --test \
  "$APP/a13-b10-baseline-lock.test.mjs" \
  "$APP/a13-b11-intelligence-product.test.mjs" \
  "$APP/a13-b12-live-data-integration.test.mjs" \
  "$APP/a13-b13-live-source-resilience.test.mjs"

echo "A13-B13 source resilience implementation completed successfully."
