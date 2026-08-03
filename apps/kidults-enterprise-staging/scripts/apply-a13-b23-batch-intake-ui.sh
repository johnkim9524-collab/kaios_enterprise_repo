#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
APP="$ROOT/apps/kidults-enterprise-staging"
PUBLIC="$APP/public/a13-b10"

cd "$ROOT"
node "$APP/scripts/run-a13-b23-batch-intake.mjs"

python3 - <<'PY'
from pathlib import Path

root = Path.cwd()
app = root / 'apps/kidults-enterprise-staging'
public = app / 'public/a13-b10'
html_file = public / 'index.html'
css_file = public / 'portal.css'
js_file = public / 'portal.js'
test_file = app / 'a13-b23-batch-outreach-evidence-intake.test.mjs'

html = html_file.read_text(encoding='utf-8')
section = '''
    <section class="product-section" id="batch-intake">
      <div class="section-heading split-heading">
        <div><p class="eyebrow">Batch Outreach & Evidence Intake</p><h2>Dispatch only after explicit confirmation.</h2></div>
        <p>Remaining provider batch · response imports · evidence validation · pilot readiness</p>
      </div>
      <div class="batch-intake-layout">
        <article class="trust-panel">
          <div class="batch-state"><div><p class="eyebrow">Batch state</p><h3 data-batch-status>Loading</h3></div><span class="status-chip">Production blocked</span></div>
          <div class="trust-metrics"><div><strong data-batch-contacted>—</strong><span>Contacted</span></div><div><strong data-batch-remaining>—</strong><span>Remaining</span></div><div><strong data-batch-ready>—</strong><span>Pilot-ready</span></div></div>
          <div class="gate-grid" data-batch-gates></div>
          <p class="batch-note">No remaining provider is marked contacted until an operator explicitly confirms dispatch.</p>
        </article>
        <article class="trust-panel">
          <p class="eyebrow">Candidate progress</p>
          <div class="batch-candidate-list" data-batch-candidates></div>
        </article>
      </div>
    </section>
'''
if 'id="batch-intake"' not in html:
    html = html.replace('</main>', section + '\n  </main>')
html_file.write_text(html, encoding='utf-8')

css = css_file.read_text(encoding='utf-8')
css_block = '''

/* A13-B23 batch outreach and evidence intake */
.batch-intake-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:22px}
.batch-state{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;padding-bottom:26px;border-bottom:1px solid var(--line)}
.batch-state h3{margin:8px 0 0;font-family:var(--serif);font-size:clamp(2.4rem,5vw,4.6rem);font-weight:400;line-height:.96;text-transform:capitalize}
.batch-candidate-list{border-top:1px solid var(--ink)}
.batch-candidate{padding:18px 0;border-bottom:1px solid var(--line)}
.batch-candidate-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
.batch-candidate-head h3{margin:0;font-size:1rem}
.batch-candidate-meta{display:flex;flex-wrap:wrap;gap:8px 18px;margin-top:8px;color:var(--muted);font-size:.76rem}
.batch-note{margin:24px 0 0;color:var(--muted);font-size:.82rem}
@media (max-width:900px){.batch-intake-layout{grid-template-columns:1fr}}
@media (max-width:430px){.batch-state{flex-direction:column}.batch-state h3{font-size:2.5rem}.batch-candidate-head{align-items:center}}
'''
if 'A13-B23 batch outreach and evidence intake' not in css:
    css += css_block
css_file.write_text(css, encoding='utf-8')

js = js_file.read_text(encoding='utf-8')
js_block = '''

// A13-B23 batch outreach and evidence intake
const renderBatchIntake = async () => {
  const section = document.querySelector('#batch-intake');
  if (!section) return;
  try {
    const response = await fetch('/a13-b10/data/generated/provider-batch-progress.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Batch intake request failed: ${response.status}`);
    const report = await response.json();
    const set = (selector, value) => { const node = section.querySelector(selector); if (node) node.textContent = value; };
    set('[data-batch-status]', report.status.replaceAll('-', ' '));
    set('[data-batch-contacted]', `${report.totals.contacted}/${report.totals.candidates}`);
    set('[data-batch-remaining]', String(report.totals.remainingDispatches));
    set('[data-batch-ready]', String(report.totals.pilotReady));
    const gates = section.querySelector('[data-batch-gates]');
    if (gates) gates.innerHTML = Object.entries(report.gates).map(([name, value]) => `<p><span>${name.replace(/([A-Z])/g, ' $1')}</span><strong>${value}</strong></p>`).join('');
    const list = section.querySelector('[data-batch-candidates]');
    if (list) list.innerHTML = report.candidates.map(item => `<article class="batch-candidate"><div class="batch-candidate-head"><h3>${item.role} · priority ${item.priority}</h3><span class="status-chip">${item.status}</span></div><div class="batch-candidate-meta"><span>${item.candidateId}</span><span>Evidence ${item.evidenceVerified}/${item.evidenceRequired}</span><span>Complete: ${item.evidenceComplete ? 'Yes' : 'No'}</span><span>Pilot-ready: ${item.pilotReady ? 'Yes' : 'No'}</span></div></article>`).join('');
    document.body.dataset.batchIntake = report.status;
  } catch (error) {
    set('[data-batch-status]', 'Unavailable');
    console.error(error);
  }
};
renderBatchIntake();
'''
if 'A13-B23 batch outreach and evidence intake' not in js:
    js += js_block
js_file.write_text(js, encoding='utf-8')

test_text = test_file.read_text(encoding='utf-8')
addition = '''

test('A13-B23 renders batch progress without auto-dispatching providers', () => {
  const html = fs.readFileSync(path.join(dataRoot, '..', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(dataRoot, '..', 'portal.css'), 'utf8');
  const js = fs.readFileSync(path.join(dataRoot, '..', 'portal.js'), 'utf8');
  assert.match(html, /id="batch-intake"/);
  assert.match(html, /explicit confirmation/i);
  assert.match(js, /provider-batch-progress\.json/);
  assert.match(js, /remainingDispatches/);
  assert.match(css, /A13-B23 batch outreach and evidence intake/);
});

test('A13-B23 UI remains secret-safe and production-blocked', () => {
  const html = fs.readFileSync(path.join(dataRoot, '..', 'index.html'), 'utf8');
  const js = fs.readFileSync(path.join(dataRoot, '..', 'portal.js'), 'utf8');
  assert.match(html, /Production blocked/i);
  assert.doesNotMatch(html, /API_KEY|recipient@/i);
  assert.doesNotMatch(js, /process\.env/);
});
'''
if 'renders batch progress without auto-dispatching providers' not in test_text:
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
  "$APP/a13-b22-outreach-dispatch-ledger.test.mjs" \
  "$APP/a13-b23-batch-outreach-evidence-intake.test.mjs"

echo "A13-B23 batch outreach UI integration completed successfully."
