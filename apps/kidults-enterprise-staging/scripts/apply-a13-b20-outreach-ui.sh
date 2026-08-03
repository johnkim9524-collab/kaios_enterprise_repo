#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
APP="$ROOT/apps/kidults-enterprise-staging"
PUBLIC="$APP/public/a13-b10"

cd "$ROOT"
node "$APP/scripts/run-a13-b20-outreach-status.mjs"

python3 - <<'PY'
from pathlib import Path

root = Path.cwd()
app = root / 'apps/kidults-enterprise-staging'
public = app / 'public/a13-b10'
html_file = public / 'index.html'
css_file = public / 'portal.css'
js_file = public / 'portal.js'
test_file = app / 'a13-b20-provider-outreach-execution.test.mjs'

html = html_file.read_text(encoding='utf-8')
section = '''
    <section class="product-section" id="provider-outreach">
      <div class="section-heading split-heading">
        <div><p class="eyebrow">Provider Outreach & Due Diligence</p><h2>Contact, evidence and approval remain explicit.</h2></div>
        <p>Primary queue · response tracking · evidence completeness · pilot handoff</p>
      </div>
      <div class="outreach-layout">
        <article class="trust-panel outreach-summary">
          <div class="outreach-state"><div><p class="eyebrow">Outreach state</p><h3 data-outreach-status>Loading</h3></div><span class="status-chip" data-outreach-production>Production blocked</span></div>
          <div class="trust-metrics"><div><strong data-outreach-contacted>—</strong><span>Contacted</span></div><div><strong data-outreach-responded>—</strong><span>Responded</span></div><div><strong data-outreach-ready>—</strong><span>Pilot-ready</span></div></div>
          <div class="gate-grid" data-outreach-gates></div>
          <p class="outreach-note">A candidate remains blocked until commercial, technical and rights evidence is verified.</p>
        </article>
        <article class="trust-panel">
          <p class="eyebrow">Execution queue</p>
          <div class="outreach-queue" data-outreach-queue></div>
          <div class="outreach-blockers"><p class="eyebrow">Outreach blockers</p><div data-outreach-blockers></div></div>
        </article>
      </div>
    </section>
'''
if 'id="provider-outreach"' not in html:
    html = html.replace('</main>', section + '\n  </main>')
html_file.write_text(html, encoding='utf-8')

css = css_file.read_text(encoding='utf-8')
css_block = '''

/* A13-B20 provider outreach */
.outreach-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:22px}
.outreach-state{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;padding-bottom:26px;border-bottom:1px solid var(--line)}
.outreach-state h3{margin:8px 0 0;font-family:var(--serif);font-size:clamp(2.4rem,4.5vw,4.8rem);font-weight:400;line-height:.96;text-transform:capitalize}
.outreach-queue{border-top:1px solid var(--ink)}
.outreach-item{padding:18px 0;border-bottom:1px solid var(--line)}
.outreach-item-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px}
.outreach-item-head h3{margin:0;font-size:1rem}
.outreach-item-head span{font-size:.68rem;letter-spacing:.1em;text-transform:uppercase}
.outreach-item-meta{display:flex;flex-wrap:wrap;gap:8px 18px;margin:9px 0 0;color:var(--muted);font-size:.76rem}
.outreach-evidence{margin:11px 0 0;font-size:.8rem;line-height:1.5}
.outreach-blockers{margin-top:28px}
.outreach-blockers [data-outreach-blockers]{border-top:1px solid var(--ink)}
.outreach-blockers p{margin:0}
.outreach-blocker{padding:14px 0;border-bottom:1px solid var(--line);font-size:.82rem;line-height:1.5}
.outreach-note{margin:24px 0 0;color:var(--muted);font-size:.82rem}
@media (max-width:900px){.outreach-layout{grid-template-columns:1fr}}
@media (max-width:430px){.outreach-state{flex-direction:column}.outreach-state h3{font-size:2.5rem}.outreach-item-head{align-items:center}}
'''
if 'A13-B20 provider outreach' not in css:
    css += css_block
css_file.write_text(css, encoding='utf-8')

js = js_file.read_text(encoding='utf-8')
js_block = '''

// A13-B20 provider outreach
const renderProviderOutreach = async () => {
  const section = document.querySelector('#provider-outreach');
  if (!section) return;
  const set = (selector, value) => { const node = section.querySelector(selector); if (node) node.textContent = value; };
  try {
    const response = await fetch('/a13-b10/data/generated/provider-outreach-status.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Outreach request failed: ${response.status}`);
    const report = await response.json();
    set('[data-outreach-status]', report.status.replaceAll('-', ' '));
    set('[data-outreach-contacted]', `${report.totals.contacted}/${report.totals.queued}`);
    set('[data-outreach-responded]', String(report.totals.responded));
    set('[data-outreach-ready]', String(report.totals.pilotReady));
    const gates = section.querySelector('[data-outreach-gates]');
    if (gates) gates.innerHTML = Object.entries(report.gates).map(([name, value]) => `<p><span>${name.replace(/([A-Z])/g, ' $1')}</span><strong>${value}</strong></p>`).join('');
    const queue = section.querySelector('[data-outreach-queue]');
    if (queue) queue.innerHTML = report.queue.map(item => `<article class="outreach-item"><div class="outreach-item-head"><h3>${item.role}</h3><span>${item.status}</span></div><div class="outreach-item-meta"><span>${item.candidateId}</span><span>Priority ${item.priority}</span><span>Evidence ${item.evidenceCount}/8</span></div><p class="outreach-evidence">Evidence complete: ${item.evidenceComplete ? 'yes' : 'no'} · Pilot-ready: ${item.pilotReady ? 'yes' : 'no'}</p></article>`).join('');
    const blockers = section.querySelector('[data-outreach-blockers]');
    if (blockers) blockers.innerHTML = report.blockers.map(item => `<p class="outreach-blocker">${item}</p>`).join('');
    document.body.dataset.providerOutreach = report.status;
  } catch (error) {
    set('[data-outreach-status]', 'Unavailable');
    console.error(error);
  }
};
renderProviderOutreach();
'''
if 'A13-B20 provider outreach' not in js:
    js += js_block
js_file.write_text(js, encoding='utf-8')

test_text = test_file.read_text(encoding='utf-8')
addition = '''

test('A13-B20 renders outreach progress evidence and blockers', () => {
  const html = fs.readFileSync(path.join(dataRoot, '..', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(dataRoot, '..', 'portal.css'), 'utf8');
  const js = fs.readFileSync(path.join(dataRoot, '..', 'portal.js'), 'utf8');
  assert.match(html, /id="provider-outreach"/);
  assert.match(html, /data-outreach-queue/);
  assert.match(js, /provider-outreach-status\.json/);
  assert.match(js, /evidenceComplete/);
  assert.match(js, /pilotReady/);
  assert.match(css, /A13-B20 provider outreach/);
});

test('A13-B20 UI remains secret-safe and production-blocked', () => {
  const html = fs.readFileSync(path.join(dataRoot, '..', 'index.html'), 'utf8');
  const js = fs.readFileSync(path.join(dataRoot, '..', 'portal.js'), 'utf8');
  assert.match(html, /Production blocked/i);
  assert.doesNotMatch(html, /API_KEY|@/);
  assert.doesNotMatch(js, /process\.env/);
});
'''
if 'renders outreach progress evidence and blockers' not in test_text:
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
  "$APP/a13-b20-provider-outreach-execution.test.mjs"

echo "A13-B20 provider outreach UI integration completed successfully."
