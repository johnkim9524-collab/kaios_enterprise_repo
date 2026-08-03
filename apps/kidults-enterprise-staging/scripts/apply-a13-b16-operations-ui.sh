#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
APP="$ROOT/apps/kidults-enterprise-staging"
PUBLIC="$APP/public/a13-b10"

cd "$ROOT"

node "$APP/scripts/run-a13-b16-autonomous-operations.mjs"

python3 - <<'PY'
from pathlib import Path

root = Path.cwd()
app = root / "apps/kidults-enterprise-staging"
public = app / "public/a13-b10"
html_file = public / "index.html"
css_file = public / "portal.css"
js_file = public / "portal.js"
test_file = app / "a13-b16-autonomous-operations-certification.test.mjs"

html = html_file.read_text(encoding="utf-8")
css = css_file.read_text(encoding="utf-8")
js = js_file.read_text(encoding="utf-8")
test = test_file.read_text(encoding="utf-8")

section = '''
    <section class="product-section" id="autonomous-operations">
      <div class="section-heading split-heading"><div><p class="eyebrow">Autonomous Operations</p><h2>Execution, failure recovery and fallback are continuously certified.</h2></div><p>Scheduled runner · failure simulation · pipeline regeneration · recovery controls</p></div>
      <div class="trust-layout operations-layout">
        <article class="trust-panel">
          <div class="operations-state-head"><div><p class="eyebrow">Operations state</p><h3 data-operations-state>Loading</h3></div><span class="source-health-status" data-operations-badge data-health="degraded">Loading</span></div>
          <div class="trust-metrics operations-metrics"><div><strong data-operations-simulations>—</strong><span>Simulations passed</span></div><div><strong data-operations-reports>—</strong><span>Archive reports</span></div><div><strong data-operations-fallback>—</strong><span>Fallback verified</span></div></div>
          <div class="trust-meta"><p><span>Schedule</span><strong data-operations-schedule>—</strong></p><p><span>Pipeline</span><strong data-operations-pipeline>—</strong></p><p><span>Recovery</span><strong data-operations-recovery>—</strong></p><p><span>Production</span><strong data-operations-production>Blocked</strong></p></div>
        </article>
        <article class="trust-panel">
          <p class="eyebrow">Failure certification</p>
          <div class="operations-simulation-list" data-operations-simulations-list><p class="source-health-empty">Loading simulations.</p></div>
          <p class="eyebrow operations-blocker-heading">Operations blockers</p>
          <div class="operations-blocker-list" data-operations-blockers><p class="source-health-empty">Loading blockers.</p></div>
        </article>
      </div>
    </section>
'''

if 'id="autonomous-operations"' not in html:
    marker = '    <section class="product-section" id="method-trust">'
    if marker not in html:
        raise SystemExit("B16 HTML insertion marker not found")
    html = html.replace(marker, section + "\n" + marker, 1)

css_block = '''

/* A13-B16 Autonomous Operations */
.operations-state-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
}
.operations-state-head h3 {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(2.8rem, 4.6vw, 4.8rem);
  font-weight: 500;
  letter-spacing: -.035em;
  line-height: .92;
  overflow-wrap: anywhere;
}
.operations-metrics strong { font-size: clamp(2rem, 3vw, 2.85rem); }
.operations-simulation-list,
.operations-blocker-list { border-top: 1px solid var(--ink); }
.operations-simulation-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px 18px;
  padding: 16px 0;
  border-bottom: 1px solid var(--line);
}
.operations-simulation-item strong { font-size: 14px; line-height: 1.4; }
.operations-simulation-item small {
  grid-column: 1 / -1;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.45;
}
.operations-blocker-heading { margin-top: 30px; }
.operations-blocker-list p {
  position: relative;
  margin: 0;
  padding: 14px 0 14px 26px;
  border-bottom: 1px solid var(--line);
  color: var(--body);
  font-size: 13px;
  line-height: 1.5;
}
.operations-blocker-list p::before {
  content: '—';
  position: absolute;
  left: 0;
  color: var(--gold);
}
@media (max-width: 767px) {
  .operations-state-head { display: block; }
  .operations-state-head .source-health-status { margin-top: 16px; }
  .operations-simulation-item { grid-template-columns: minmax(0, 1fr); }
  .operations-simulation-item .source-health-status { justify-self: start; }
  .operations-simulation-item small { grid-column: 1; }
}
'''
if '/* A13-B16 Autonomous Operations */' not in css:
    css += css_block

js_block = '''

  const loadAutonomousOperations = async () => {
    try {
      const [health, report] = await Promise.all([
        fetchJson('/a13-b10/data/generated/operations-health.json'),
        fetchJson('/a13-b10/data/generated/autonomous-operations.json')
      ]);
      const results = health.failureSimulation?.results || [];
      const passed = results.filter(item => item.passed).length;
      const stateLabel = report.status === 'staging-operations-certified'
        ? 'Staging operations certified'
        : 'Operations blocked';
      setText('[data-operations-state]', stateLabel);
      setText('[data-operations-simulations]', `${passed}/${results.length}`);
      setText('[data-operations-reports]', health.archive?.reportCount ?? 0);
      setText('[data-operations-fallback]', health.fallback?.verifiedBySimulation ? 'Verified' : 'Blocked');
      setText('[data-operations-schedule]', `${health.schedule?.status || 'blocked'} · ${health.schedule?.cadence || 'unavailable'} ${health.schedule?.timezone || ''}`);
      setText('[data-operations-pipeline]', report.gates?.pipeline || 'blocked');
      setText('[data-operations-recovery]', report.gates?.recovery || 'blocked');
      setText('[data-operations-production]', report.productionPromotionAuthorized ? 'Authorized' : 'Blocked');

      const badge = qs('[data-operations-badge]');
      if (badge) {
        const healthy = report.status === 'staging-operations-certified';
        badge.textContent = healthy ? 'Certified' : 'Blocked';
        badge.dataset.health = healthy ? 'healthy' : 'failed';
      }

      const simulationList = qs('[data-operations-simulations-list]');
      if (simulationList) {
        simulationList.innerHTML = results.map(item => `
          <div class="operations-simulation-item">
            <strong>${item.id}</strong>
            <span class="source-health-status" data-health="${item.passed ? 'healthy' : 'failed'}">${item.passed ? 'Passed' : 'Blocked'}</span>
            <small>Expected: ${item.expected} · Outcome: ${item.outcome} · Fallback: ${item.fallbackActivated ? 'active' : 'not used'}</small>
          </div>
        `).join('');
      }

      const blockers = qs('[data-operations-blockers]');
      if (blockers) {
        blockers.innerHTML = report.blockers?.length
          ? report.blockers.map(item => `<p>${item}</p>`).join('')
          : '<p>No staging operations blockers.</p>';
      }
      document.body.dataset.operationsHealth = health.aggregateHealth || 'unknown';
    } catch (error) {
      console.error(error);
      setText('[data-operations-state]', 'Operations report unavailable');
      const badge = qs('[data-operations-badge]');
      if (badge) {
        badge.textContent = 'Unavailable';
        badge.dataset.health = 'failed';
      }
    }
  };
'''

if 'const loadAutonomousOperations = async () =>' not in js:
    marker = "  qsa('[data-category]').forEach"
    if marker not in js:
        raise SystemExit("B16 JS insertion marker not found")
    js = js.replace(marker, js_block + "\n\n" + marker, 1)

if 'loadAutonomousOperations();' not in js:
    marker = '  requestNavigationSync();\n})();'
    if marker not in js:
        raise SystemExit("B16 JS invocation marker not found")
    js = js.replace(marker, '  loadAutonomousOperations();\n  requestNavigationSync();\n})();', 1)

test = test.replace("assert.match(runner, /includeBlockers/);", "assert.match(runner, /blockers:/);")

extra_tests = '''

test('A13-B16 renders autonomous operations and failure certification UI', () => {
  const html = fs.readFileSync(path.join(appRoot, 'public', 'a13-b10', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(appRoot, 'public', 'a13-b10', 'portal.css'), 'utf8');
  const js = fs.readFileSync(path.join(appRoot, 'public', 'a13-b10', 'portal.js'), 'utf8');
  assert.match(html, /id="autonomous-operations"/);
  assert.match(html, /data-operations-simulations-list/);
  assert.match(css, /A13-B16 Autonomous Operations/);
  assert.match(js, /loadAutonomousOperations/);
  assert.match(js, /operations-health\.json/);
  assert.match(js, /autonomous-operations\.json/);
});

test('A13-B16 UI keeps production blocked and exposes no credentials', () => {
  const html = fs.readFileSync(path.join(appRoot, 'public', 'a13-b10', 'index.html'), 'utf8');
  const js = fs.readFileSync(path.join(appRoot, 'public', 'a13-b10', 'portal.js'), 'utf8');
  assert.match(html, /data-operations-production>Blocked/);
  assert.doesNotMatch(html, /KIDULTS_[A-Z_]+_API_KEY/);
  assert.doesNotMatch(js, /process\.env/);
});
'''
if "renders autonomous operations and failure certification UI" not in test:
    test += extra_tests

html_file.write_text(html, encoding="utf-8")
css_file.write_text(css, encoding="utf-8")
js_file.write_text(js, encoding="utf-8")
test_file.write_text(test, encoding="utf-8")
PY

node --test \
  "$APP/a13-b10-baseline-lock.test.mjs" \
  "$APP/a13-b11-intelligence-product.test.mjs" \
  "$APP/a13-b12-live-data-integration.test.mjs" \
  "$APP/a13-b13-live-source-resilience.test.mjs" \
  "$APP/a13-b14-integrated-intelligence-activation.test.mjs" \
  "$APP/a13-b15-external-source-certification.test.mjs" \
  "$APP/a13-b16-autonomous-operations-certification.test.mjs"

echo "A13-B16 operations UI integration completed successfully."
