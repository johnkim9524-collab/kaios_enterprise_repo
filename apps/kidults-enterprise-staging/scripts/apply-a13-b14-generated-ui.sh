#!/usr/bin/env bash
set -euo pipefail

ROOT="apps/kidults-enterprise-staging"
PUBLIC="$ROOT/public/a13-b10"
HTML="$PUBLIC/index.html"
CSS="$PUBLIC/portal.css"
JS="$PUBLIC/portal.js"
TEST="$ROOT/a13-b14-integrated-intelligence-activation.test.mjs"

python3 - <<'PY'
from pathlib import Path

root = Path('apps/kidults-enterprise-staging')
public = root / 'public' / 'a13-b10'
html_path = public / 'index.html'
css_path = public / 'portal.css'
js_path = public / 'portal.js'
test_path = root / 'a13-b14-integrated-intelligence-activation.test.mjs'

html = html_path.read_text(encoding='utf-8')
css = css_path.read_text(encoding='utf-8')
js = js_path.read_text(encoding='utf-8')
test = test_path.read_text(encoding='utf-8')

section = '''
    <section class="product-section" id="integrated-activation">
      <div class="section-heading split-heading"><div><p class="eyebrow">Integrated Intelligence Activation</p><h2>Evidence becomes an operating system.</h2></div><p>Multi-source scoring · monthly intelligence · release readiness</p></div>
      <div class="trust-layout activation-layout">
        <article class="trust-panel">
          <p class="eyebrow">Kidult 100 generated output</p>
          <div class="trust-metrics activation-metrics">
            <div><strong data-activation-score>—</strong><span>Top score</span></div>
            <div><strong data-activation-category>Loading</strong><span>Leading category</span></div>
            <div><strong data-activation-families>—</strong><span>Source families</span></div>
          </div>
          <div class="trust-meta">
            <p><span>Method version</span><strong data-activation-method>—</strong></p>
            <p><span>Regime</span><strong data-activation-regime>—</strong></p>
            <p><span>Average confidence</span><strong data-activation-confidence>—</strong></p>
          </div>
        </article>
        <article class="trust-panel">
          <p class="eyebrow">Monthly Intelligence</p>
          <h3 class="activation-report-title" data-activation-report-title>Loading generated report</h3>
          <p class="activation-summary" data-activation-summary>Generated intelligence will appear after pipeline completion.</p>
          <div class="trust-meta activation-report-meta">
            <p><span>Issue</span><strong data-activation-issue>—</strong></p>
            <p><span>Risk watch</span><strong data-activation-risk>—</strong></p>
          </div>
        </article>
      </div>
      <article class="trust-panel activation-readiness">
        <div class="activation-readiness-head"><div><p class="eyebrow">Release readiness</p><h3 data-activation-readiness>Loading readiness</h3></div><span class="source-health-status" data-activation-readiness-chip data-health="degraded">Pending</span></div>
        <div class="activation-gates" data-activation-gates></div>
        <p class="activation-blocker" data-activation-blocker>Production promotion remains blocked until certification is complete.</p>
      </article>
    </section>
'''

if 'id="integrated-activation"' not in html:
    marker = '    <section class="product-section" id="method-trust">'
    if marker not in html:
        raise SystemExit('HTML insertion marker not found')
    html = html.replace(marker, section + '\n' + marker)
    html = html.replace('/a13-b10/portal.css?v=20260803-b12', '/a13-b10/portal.css?v=20260803-b14')
    html = html.replace('/a13-b10/portal.js?v=20260803-b12', '/a13-b10/portal.js?v=20260803-b14')

css_block = '''

/* A13-B14 Integrated Intelligence Activation */
.activation-layout { align-items: stretch; }
.activation-metrics strong { max-width: 100%; overflow-wrap: anywhere; }
.activation-metrics [data-activation-category] { font-size: clamp(1.7rem, 2.4vw, 2.5rem); }
.activation-report-title,
.activation-readiness h3 {
  margin: 18px 0 14px;
  font-family: var(--font-display);
  font-size: clamp(2.1rem, 3vw, 3.2rem);
  font-weight: 500;
  line-height: 1;
  letter-spacing: -.025em;
}
.activation-summary {
  max-width: 58ch;
  margin: 0;
  color: var(--body);
  font-size: 15px;
  line-height: 1.65;
}
.activation-report-meta { margin-top: 28px; }
.activation-readiness { margin-top: 20px; }
.activation-readiness-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
}
.activation-readiness h3 { margin-top: 0; }
.activation-gates {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  margin-top: 24px;
  border-top: 1px solid var(--ink);
  border-bottom: 1px solid var(--line);
}
.activation-gate {
  min-width: 0;
  padding: 18px;
  border-right: 1px solid var(--line);
}
.activation-gate:last-child { border-right: 0; }
.activation-gate small {
  display: block;
  color: var(--muted);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: .12em;
  line-height: 1.3;
  text-transform: uppercase;
}
.activation-gate strong {
  display: block;
  margin-top: 7px;
  font-size: 13px;
  line-height: 1.35;
  text-transform: capitalize;
  overflow-wrap: anywhere;
}
.activation-gate[data-status="passed"] strong { color: var(--forest); }
.activation-gate[data-status="blocked"] strong { color: var(--risk); }
.activation-blocker {
  margin: 18px 0 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.55;
}
@media (max-width: 900px) {
  .activation-gates { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .activation-gate:nth-child(2n) { border-right: 0; }
  .activation-gate { border-bottom: 1px solid var(--line); }
  .activation-gate:last-child { grid-column: 1 / -1; border-bottom: 0; }
}
@media (max-width: 520px) {
  .activation-readiness-head { display: block; }
  .activation-readiness-head .source-health-status { margin-top: 12px; }
  .activation-gates { grid-template-columns: 1fr; }
  .activation-gate,
  .activation-gate:nth-child(2n) { border-right: 0; }
  .activation-gate:last-child { grid-column: 1; }
}
'''
if '/* A13-B14 Integrated Intelligence Activation */' not in css:
    css += css_block

js_block = r'''

  const renderIntegratedActivation = ({ index, monthly, readiness }) => {
    const leader = Array.isArray(index?.categories) ? index.categories[0] : null;
    setText('[data-activation-score]', leader ? leader.score.toFixed(1) : '—');
    setText('[data-activation-category]', leader?.category || 'Unavailable');
    setText('[data-activation-families]', index?.sourceFamilies ?? '—');
    setText('[data-activation-method]', index?.methodVersion || 'Unavailable');
    setText('[data-activation-regime]', leader?.regime || 'Unavailable');
    setText('[data-activation-confidence]', monthly?.averageConfidence != null ? `${monthly.averageConfidence}%` : '—');
    setText('[data-activation-report-title]', monthly?.title || 'Monthly Intelligence unavailable');
    setText('[data-activation-summary]', monthly?.executiveSummary || 'No generated summary is available.');
    setText('[data-activation-issue]', monthly?.issue || '—');
    setText('[data-activation-risk]', Array.isArray(monthly?.riskWatch) ? `${monthly.riskWatch.length} categories` : '—');
    setText('[data-activation-readiness]', readiness?.status || 'Blocked');

    const chip = qs('[data-activation-readiness-chip]');
    if (chip) {
      const passed = readiness?.status === 'staging-certified';
      chip.textContent = passed ? 'Staging certified' : 'Blocked';
      chip.dataset.health = passed ? 'healthy' : 'failed';
    }

    const gates = qs('[data-activation-gates]');
    if (gates) {
      gates.innerHTML = Object.entries(readiness?.gates || {}).map(([id, status]) => `
        <div class="activation-gate" data-status="${status}">
          <small>${id.replace(/([A-Z])/g, ' $1')}</small>
          <strong>${status}</strong>
        </div>
      `).join('');
    }

    const blocker = Array.isArray(readiness?.blockers) && readiness.blockers.length
      ? readiness.blockers[0]
      : 'Production promotion remains blocked pending explicit authorization.';
    setText('[data-activation-blocker]', blocker);
    document.body.dataset.activationReadiness = readiness?.status || 'blocked';
  };

  const loadIntegratedActivation = async () => {
    try {
      const [index, monthly, readiness] = await Promise.all([
        fetchJson('/a13-b10/data/generated/kidult-100.json'),
        fetchJson('/a13-b10/data/generated/monthly-intelligence.json'),
        fetchJson('/a13-b10/data/generated/readiness.json')
      ]);
      renderIntegratedActivation({ index, monthly, readiness });
    } catch (error) {
      console.error(error);
      renderIntegratedActivation({
        index: null,
        monthly: null,
        readiness: {
          status: 'blocked',
          gates: {},
          blockers: ['Generated activation outputs are unavailable. B12 fallback remains active.']
        }
      });
    }
  };
'''

if 'const loadIntegratedActivation = async () =>' not in js:
    marker = "  qsa('[data-category]').forEach"
    if marker not in js:
        raise SystemExit('JavaScript insertion marker not found')
    js = js.replace(marker, js_block + '\n\n' + marker)

    startup_candidates = [
        '  loadSourceRegistry().finally(loadProductThroughAdapter);',
        '  loadProductThroughAdapter();'
    ]
    replaced = False
    for startup in startup_candidates:
        if startup in js:
            js = js.replace(startup, startup + '\n  loadIntegratedActivation();', 1)
            replaced = True
            break
    if not replaced:
        raise SystemExit('JavaScript startup marker not found')

extra_tests = r'''

test('A13-B14 renders generated index monthly intelligence and readiness in the portal', () => {
  const html = fs.readFileSync(path.join(publicRoot, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(publicRoot, 'portal.css'), 'utf8');
  const js = fs.readFileSync(path.join(publicRoot, 'portal.js'), 'utf8');
  assert.match(html, /id="integrated-activation"/);
  assert.match(html, /data-activation-score/);
  assert.match(html, /data-activation-gates/);
  assert.match(css, /\.activation-gates/);
  assert.match(css, /A13-B14 Integrated Intelligence Activation/);
  assert.match(js, /loadIntegratedActivation/);
  assert.match(js, /generated\/kidult-100\.json/);
  assert.match(js, /generated\/monthly-intelligence\.json/);
  assert.match(js, /generated\/readiness\.json/);
});

test('A13-B14 preserves fallback when generated activation outputs are unavailable', () => {
  const js = fs.readFileSync(path.join(publicRoot, 'portal.js'), 'utf8');
  assert.match(js, /B12 fallback remains active/);
  assert.match(js, /activationReadiness/);
  assert.match(js, /production promotion remains blocked/i);
});
'''
if "renders generated index monthly intelligence and readiness" not in test:
    test += extra_tests

html_path.write_text(html, encoding='utf-8')
css_path.write_text(css, encoding='utf-8')
js_path.write_text(js, encoding='utf-8')
test_path.write_text(test, encoding='utf-8')
PY

node --test \
  "$ROOT/a13-b10-baseline-lock.test.mjs" \
  "$ROOT/a13-b11-intelligence-product.test.mjs" \
  "$ROOT/a13-b12-live-data-integration.test.mjs" \
  "$ROOT/a13-b13-live-source-resilience.test.mjs" \
  "$ROOT/a13-b14-integrated-intelligence-activation.test.mjs"

echo "A13-B14 generated output UI integration completed successfully."
