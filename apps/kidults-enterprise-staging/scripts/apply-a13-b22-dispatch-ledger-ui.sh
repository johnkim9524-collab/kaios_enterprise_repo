#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
APP="$ROOT/apps/kidults-enterprise-staging"
PUBLIC="$APP/public/a13-b10"

cd "$ROOT"
node "$APP/scripts/run-a13-b22-dispatch-ledger.mjs"

python3 - <<'PY'
from pathlib import Path

root = Path.cwd()
app = root / 'apps/kidults-enterprise-staging'
public = app / 'public/a13-b10'
html_file = public / 'index.html'
css_file = public / 'portal.css'
js_file = public / 'portal.js'
test_file = app / 'a13-b22-outreach-dispatch-ledger.test.mjs'

html = html_file.read_text(encoding='utf-8')
section = '''
    <section class="product-section" id="dispatch-ledger">
      <div class="section-heading split-heading">
        <div><p class="eyebrow">Outreach Dispatch Ledger</p><h2>Every provider event is auditable.</h2></div>
        <p>Append-only events · duplicate protection · evidence audit · pilot readiness</p>
      </div>
      <div class="dispatch-layout">
        <article class="trust-panel">
          <div class="dispatch-state"><div><p class="eyebrow">Ledger state</p><h3 data-dispatch-status>Loading</h3></div><span class="status-chip">Production blocked</span></div>
          <div class="trust-metrics"><div><strong data-dispatch-contacted>—</strong><span>Contacted</span></div><div><strong data-dispatch-responded>—</strong><span>Responded</span></div><div><strong data-dispatch-ready>—</strong><span>Pilot-ready</span></div><div><strong data-dispatch-events>—</strong><span>Events</span></div></div>
          <div class="gate-grid" data-dispatch-gates></div>
        </article>
        <article class="trust-panel">
          <p class="eyebrow">Candidate audit</p>
          <div class="dispatch-candidate-list" data-dispatch-candidates></div>
        </article>
      </div>
    </section>
'''
if 'id="dispatch-ledger"' not in html:
    html = html.replace('</main>', section + '\n  </main>')
html_file.write_text(html, encoding='utf-8')

css = css_file.read_text(encoding='utf-8')
block = '''

/* A13-B22 dispatch ledger */
.dispatch-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:22px}
.dispatch-state{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;padding-bottom:26px;border-bottom:1px solid var(--line)}
.dispatch-state h3{margin:8px 0 0;font-family:var(--serif);font-size:clamp(2.6rem,5vw,4.8rem);font-weight:400;line-height:.96;text-transform:capitalize}
.dispatch-candidate-list{border-top:1px solid var(--ink)}
.dispatch-candidate{padding:18px 0;border-bottom:1px solid var(--line)}
.dispatch-candidate-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}
.dispatch-candidate h3{margin:0;font-size:1rem}
.dispatch-candidate p{margin:8px 0 0;color:var(--muted);font-size:.78rem;line-height:1.5}
@media (max-width:900px){.dispatch-layout{grid-template-columns:1fr}}
@media (max-width:430px){.dispatch-state{flex-direction:column}.dispatch-state h3{font-size:2.6rem}}
'''
if 'A13-B22 dispatch ledger' not in css:
    css += block
css_file.write_text(css, encoding='utf-8')

js = js_file.read_text(encoding='utf-8')
js_block = '''

// A13-B22 dispatch ledger
const renderDispatchLedger = async () => {
  const section = document.querySelector('#dispatch-ledger');
  if (!section) return;
  try {
    const response = await fetch('/a13-b10/data/generated/provider-dispatch-audit.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Dispatch audit request failed: ${response.status}`);
    const report = await response.json();
    const set = (selector, value) => { const node = section.querySelector(selector); if (node) node.textContent = value; };
    set('[data-dispatch-status]', report.status.replaceAll('-', ' '));
    set('[data-dispatch-contacted]', `${report.totals.contacted}/${report.totals.candidates}`);
    set('[data-dispatch-responded]', String(report.totals.responded));
    set('[data-dispatch-ready]', String(report.totals.pilotReady));
    set('[data-dispatch-events]', String(report.totals.events));
    const gates = section.querySelector('[data-dispatch-gates]');
    if (gates) gates.innerHTML = Object.entries(report.gates).map(([name, value]) => `<p><span>${name.replace(/([A-Z])/g, ' $1')}</span><strong>${value}</strong></p>`).join('');
    const candidates = section.querySelector('[data-dispatch-candidates]');
    if (candidates) candidates.innerHTML = report.candidates.map(item => `<article class="dispatch-candidate"><div class="dispatch-candidate-head"><h3>${item.role} · priority ${item.priority}</h3><span class="status-chip">${item.status}</span></div><p>${item.candidateId}</p><p>Evidence ${item.evidenceVerified}/${item.evidenceRequired} · Complete: ${item.evidenceComplete ? 'Yes' : 'No'} · Pilot-ready: ${item.pilotReady ? 'Yes' : 'No'}</p></article>`).join('');
    document.body.dataset.dispatchLedger = report.status;
  } catch (error) {
    const node = section.querySelector('[data-dispatch-status]');
    if (node) node.textContent = 'Unavailable';
    console.error(error);
  }
};
renderDispatchLedger();
'''
if 'A13-B22 dispatch ledger' not in js:
    js += js_block
js_file.write_text(js, encoding='utf-8')

test_text = test_file.read_text(encoding='utf-8')
addition = '''

test('A13-B22 renders dispatch audit status and candidate history', () => {
  const html = fs.readFileSync(path.join(dataRoot, '..', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(dataRoot, '..', 'portal.css'), 'utf8');
  const js = fs.readFileSync(path.join(dataRoot, '..', 'portal.js'), 'utf8');
  assert.match(html, /id="dispatch-ledger"/);
  assert.match(html, /data-dispatch-candidates/);
  assert.match(js, /provider-dispatch-audit\.json/);
  assert.match(js, /evidenceVerified/);
  assert.match(css, /A13-B22 dispatch ledger/);
});

test('A13-B22 UI remains secret-safe and production-blocked', () => {
  const html = fs.readFileSync(path.join(dataRoot, '..', 'index.html'), 'utf8');
  const js = fs.readFileSync(path.join(dataRoot, '..', 'portal.js'), 'utf8');
  assert.match(html, /Production blocked/i);
  assert.doesNotMatch(html, /@/);
  assert.doesNotMatch(js, /process\.env/);
});
'''
if 'renders dispatch audit status' not in test_text:
    test_text += addition
test_file.write_text(test_text, encoding='utf-8')
PY

node --test \
  "$APP/a13-b10-baseline-lock.test.mjs" \
  "$APP/a13-b11-intelligence-product.test.mjs" \
  "$APP/a13-b12-live-data-integration.test.mjs" \
  "$APP/a13-b13-live-source-resilience.test.mjs" \
  "$APP/a13-b14-integrated-intelligence-activation.test.mjs" \
  "$APP/a13-b15-external-source-certification.test.mjs" \
  "$APP/a13-b16-autonomous-operations-certification.test.mjs" \
  "$APP/a13-b17-secure-provider-injection.test.mjs" \
  "$APP/a13-b18-provider-acquisition-live-pilot.test.mjs" \
  "$APP/a13-b19-provider-candidate-population.test.mjs" \
  "$APP/a13-b20-provider-outreach-execution.test.mjs" \
  "$APP/a13-b21-provider-outreach-pack.test.mjs" \
  "$APP/a13-b22-outreach-dispatch-ledger.test.mjs"

echo "A13-B22 dispatch ledger UI integration completed successfully."
