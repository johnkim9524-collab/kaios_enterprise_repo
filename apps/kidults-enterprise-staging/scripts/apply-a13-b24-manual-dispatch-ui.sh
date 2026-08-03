#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
APP="$ROOT/apps/kidults-enterprise-staging"
PUBLIC="$APP/public/a13-b10"

cd "$ROOT"
node "$APP/scripts/run-a13-b24-manual-dispatch-export.mjs"

python3 - <<'PY'
from pathlib import Path

root = Path.cwd()
app = root / 'apps/kidults-enterprise-staging'
public = app / 'public/a13-b10'
html_file = public / 'index.html'
css_file = public / 'portal.css'
js_file = public / 'portal.js'
test_file = app / 'a13-b24-manual-dispatch-export.test.mjs'

html = html_file.read_text(encoding='utf-8')
section = '''
    <section class="product-section" id="manual-dispatch-control">
      <div class="section-heading split-heading">
        <div><p class="eyebrow">Manual Dispatch Control Center</p><h2>Review first. Confirm only after real dispatch.</h2></div>
        <p>Provider-specific packet export · operator review · explicit dispatch confirmation</p>
      </div>
      <div class="manual-dispatch-layout">
        <article class="trust-panel">
          <div class="manual-dispatch-state">
            <div><p class="eyebrow">Dispatch state</p><h3 data-manual-dispatch-status>Loading</h3></div>
            <span class="status-chip" data-manual-dispatch-production>Production blocked</span>
          </div>
          <div class="trust-metrics">
            <div><strong data-manual-dispatch-pending>—</strong><span>Pending packets</span></div>
            <div><strong data-manual-dispatch-reviewed>—</strong><span>Reviewed</span></div>
            <div><strong data-manual-dispatch-confirmed>—</strong><span>Confirmed</span></div>
            <div><strong data-manual-dispatch-commands>—</strong><span>Commands ready</span></div>
          </div>
          <div class="gate-grid" data-manual-dispatch-gates></div>
          <p class="manual-dispatch-note">Contacted commands remain hidden until the operator checklist is complete and real-world dispatch is explicitly confirmed.</p>
        </article>
        <article class="trust-panel">
          <p class="eyebrow">Dispatch packets</p>
          <div class="manual-dispatch-list" data-manual-dispatch-list></div>
        </article>
      </div>
    </section>
'''
if 'id="manual-dispatch-control"' not in html:
    html = html.replace('</main>', section + '\n  </main>')
html_file.write_text(html, encoding='utf-8')

css = css_file.read_text(encoding='utf-8')
css_block = '''

/* A13-B24 manual dispatch control */
.manual-dispatch-layout{display:grid;grid-template-columns:minmax(0,.95fr) minmax(0,1.05fr);gap:22px}
.manual-dispatch-state{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;padding-bottom:26px;border-bottom:1px solid var(--line)}
.manual-dispatch-state h3{margin:8px 0 0;font-family:var(--serif);font-size:clamp(2.35rem,4.8vw,4.8rem);font-weight:400;line-height:.96;text-transform:capitalize}
.manual-dispatch-list{border-top:1px solid var(--ink)}
.manual-dispatch-card{padding:20px 0;border-bottom:1px solid var(--line)}
.manual-dispatch-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px}
.manual-dispatch-head h3{margin:0;font-size:1rem;text-transform:none}
.manual-dispatch-head span{font-size:.68rem;letter-spacing:.1em;text-transform:uppercase}
.manual-dispatch-meta{display:flex;flex-wrap:wrap;gap:8px 18px;margin:10px 0 0;color:var(--muted);font-size:.76rem}
.manual-dispatch-path{margin:10px 0 0;font-size:.78rem;overflow-wrap:anywhere}
.manual-dispatch-command{margin:12px 0 0;padding:10px 12px;border:1px solid var(--line);background:rgba(0,0,0,.025);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.72rem;line-height:1.45;overflow-wrap:anywhere}
.manual-dispatch-locked{margin:12px 0 0;color:var(--muted);font-size:.78rem}
.manual-dispatch-note{margin:24px 0 0;color:var(--muted);font-size:.82rem;line-height:1.55}
@media (max-width:900px){.manual-dispatch-layout{grid-template-columns:1fr}}
@media (max-width:430px){.manual-dispatch-state{flex-direction:column}.manual-dispatch-state h3{font-size:2.5rem}.manual-dispatch-head{flex-direction:column;gap:8px}}
'''
if 'A13-B24 manual dispatch control' not in css:
    css += css_block
css_file.write_text(css, encoding='utf-8')

js = js_file.read_text(encoding='utf-8')
js_block = '''

// A13-B24 manual dispatch control
const renderManualDispatchControl = async () => {
  const section = document.querySelector('#manual-dispatch-control');
  if (!section) return;
  try {
    const response = await fetch('/a13-b10/data/generated/provider-manual-dispatch-status.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Manual dispatch status request failed: ${response.status}`);
    const report = await response.json();
    const set = (selector, value) => { const node = section.querySelector(selector); if (node) node.textContent = value; };
    set('[data-manual-dispatch-status]', report.status.replaceAll('-', ' '));
    set('[data-manual-dispatch-pending]', String(report.totals.pending));
    set('[data-manual-dispatch-reviewed]', String(report.totals.reviewComplete));
    set('[data-manual-dispatch-confirmed]', String(report.totals.dispatchedConfirmed));
    set('[data-manual-dispatch-commands]', String(report.totals.contactedCommandsReady));
    const gates = section.querySelector('[data-manual-dispatch-gates]');
    if (gates) gates.innerHTML = Object.entries(report.gates).map(([name, value]) => `<p><span>${name.replace(/([A-Z])/g, ' $1')}</span><strong>${value}</strong></p>`).join('');
    const list = section.querySelector('[data-manual-dispatch-list]');
    if (list) list.innerHTML = report.exports.map(item => {
      const command = item.contactedCommand
        ? `<p class="manual-dispatch-command">${item.contactedCommand}</p>`
        : '<p class="manual-dispatch-locked">Contacted command locked until review and real dispatch confirmation are complete.</p>';
      return `<article class="manual-dispatch-card"><div class="manual-dispatch-head"><h3>${item.subject}</h3><span>${item.role}</span></div><div class="manual-dispatch-meta"><span>Review: ${item.reviewComplete ? 'complete' : 'pending'}</span><span>Dispatch: ${item.dispatched ? 'confirmed' : 'pending'}</span></div><p class="manual-dispatch-path">Packet: ${item.exportFile}</p>${command}</article>`;
    }).join('');
    document.body.dataset.manualDispatch = report.status;
  } catch (error) {
    const node = section.querySelector('[data-manual-dispatch-status]');
    if (node) node.textContent = 'Unavailable';
    console.error(error);
  }
};
renderManualDispatchControl();
'''
if 'A13-B24 manual dispatch control' not in js:
    js += js_block
js_file.write_text(js, encoding='utf-8')

test_text = test_file.read_text(encoding='utf-8')
addition = '''

test('A13-B24 renders the manual dispatch control center', () => {
  const html = fs.readFileSync(path.join(dataRoot, '..', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(dataRoot, '..', 'portal.css'), 'utf8');
  const js = fs.readFileSync(path.join(dataRoot, '..', 'portal.js'), 'utf8');
  assert.match(html, /id="manual-dispatch-control"/);
  assert.match(html, /data-manual-dispatch-list/);
  assert.match(js, /provider-manual-dispatch-status\.json/);
  assert.match(js, /contactedCommand/);
  assert.match(css, /A13-B24 manual dispatch control/);
});

test('A13-B24 UI hides contacted commands until review and dispatch confirmation', () => {
  const js = fs.readFileSync(path.join(dataRoot, '..', 'portal.js'), 'utf8');
  assert.match(js, /Contacted command locked/);
  assert.match(js, /item\.contactedCommand/);
  assert.doesNotMatch(js, /sendMail|smtp|recipientAddress|process\.env/);
});
'''
if 'renders the manual dispatch control center' not in test_text:
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
  "$APP/a13-b23-batch-outreach-evidence-intake.test.mjs" \
  "$APP/a13-b24-manual-dispatch-export.test.mjs"

echo "A13-B24 manual dispatch control center integration completed successfully."
