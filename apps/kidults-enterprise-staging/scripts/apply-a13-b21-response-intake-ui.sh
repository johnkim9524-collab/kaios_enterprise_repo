#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
APP="$ROOT/apps/kidults-enterprise-staging"
PUBLIC="$APP/public/a13-b10"

cd "$ROOT"
node "$APP/scripts/run-a13-b21-response-intake.mjs"

python3 - <<'PY'
from pathlib import Path

root = Path.cwd()
app = root / 'apps/kidults-enterprise-staging'
public = app / 'public/a13-b10'
html_file = public / 'index.html'
css_file = public / 'portal.css'
js_file = public / 'portal.js'
test_file = app / 'a13-b21-provider-outreach-pack.test.mjs'

html = html_file.read_text(encoding='utf-8')
section = '''
    <section class="product-section" id="response-intake">
      <div class="section-heading split-heading">
        <div><p class="eyebrow">Provider Response Intake</p><h2>Outreach evidence becomes pilot readiness.</h2></div>
        <p>Provider packs · response states · evidence completeness · pilot handoff</p>
      </div>
      <div class="intake-layout">
        <article class="trust-panel">
          <div class="intake-state"><div><p class="eyebrow">Response intake state</p><h3 data-intake-status>Loading</h3></div><span class="status-chip" data-intake-production>Production blocked</span></div>
          <div class="trust-metrics"><div><strong data-intake-packs>—</strong><span>Outreach packs</span></div><div><strong data-intake-contacted>—</strong><span>Contacted</span></div><div><strong data-intake-responded>—</strong><span>Responded</span></div><div><strong data-intake-ready>—</strong><span>Pilot-ready</span></div></div>
          <div class="gate-grid" data-intake-gates></div>
        </article>
        <article class="trust-panel">
          <p class="eyebrow">Response queue</p>
          <div class="intake-queue" data-intake-queue></div>
        </article>
      </div>
    </section>
'''
if 'id="response-intake"' not in html:
    html = html.replace('</main>', section + '\n  </main>')
html_file.write_text(html, encoding='utf-8')

css = css_file.read_text(encoding='utf-8')
css_block = '''

/* A13-B21 response intake */
.intake-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:22px}
.intake-state{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;padding-bottom:26px;border-bottom:1px solid var(--line)}
.intake-state h3{margin:8px 0 0;font-family:var(--serif);font-size:clamp(2.5rem,5vw,5rem);font-weight:400;line-height:.94;text-transform:capitalize}
.intake-queue{border-top:1px solid var(--ink)}
.intake-card{padding:18px 0;border-bottom:1px solid var(--line)}
.intake-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
.intake-card h3{margin:0;font-size:1rem}
.intake-card-meta{display:flex;flex-wrap:wrap;gap:8px 16px;margin-top:9px;color:var(--muted);font-size:.75rem}
.intake-card-subject{margin:10px 0 0;font-weight:700;font-size:.82rem}
.intake-card-request{margin:7px 0 0;font-size:.8rem;line-height:1.55}
@media (max-width:900px){.intake-layout{grid-template-columns:1fr}}
@media (max-width:430px){.intake-state{flex-direction:column}.intake-state h3{font-size:2.6rem}.intake-card-head{align-items:center}}
'''
if 'A13-B21 response intake' not in css:
    css += css_block
css_file.write_text(css, encoding='utf-8')

js = js_file.read_text(encoding='utf-8')
js_block = '''

// A13-B21 response intake
const renderProviderResponseIntake = async () => {
  const section = document.querySelector('#response-intake');
  if (!section) return;
  const set = (selector, value) => { const node = section.querySelector(selector); if (node) node.textContent = value; };
  try {
    const response = await fetch('/a13-b10/data/generated/provider-response-intake-status.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Response intake request failed: ${response.status}`);
    const report = await response.json();
    set('[data-intake-status]', report.status.replaceAll('-', ' '));
    set('[data-intake-packs]', String(report.totals.packs));
    set('[data-intake-contacted]', String(report.totals.contacted));
    set('[data-intake-responded]', String(report.totals.responded));
    set('[data-intake-ready]', String(report.totals.pilotReady));
    const gates = section.querySelector('[data-intake-gates]');
    if (gates) gates.innerHTML = Object.entries(report.gates).map(([name, value]) => `<p><span>${name.replace(/([A-Z])/g, ' $1')}</span><strong>${value}</strong></p>`).join('');
    const queue = section.querySelector('[data-intake-queue]');
    if (queue) queue.innerHTML = report.queue.map(item => `<article class="intake-card"><div class="intake-card-head"><h3>${item.role} · priority ${item.priority}</h3><span class="status-chip">${item.status}</span></div><p class="intake-card-subject">${item.subject || item.candidateId}</p><div class="intake-card-meta"><span>Candidate: ${item.candidateId}</span><span>Evidence: ${item.verifiedEvidenceCount}/${report.totals.requiredEvidencePerCandidate}</span><span>Complete: ${item.evidenceComplete ? 'Yes' : 'No'}</span></div><p class="intake-card-request">${item.request || 'Provider response pending.'}</p></article>`).join('');
    document.body.dataset.responseIntake = report.status;
  } catch (error) {
    set('[data-intake-status]', 'Unavailable');
    console.error(error);
  }
};
renderProviderResponseIntake();
'''
if 'A13-B21 response intake' not in js:
    js += js_block
js_file.write_text(js, encoding='utf-8')

test_text = test_file.read_text(encoding='utf-8')
addition = '''

test('A13-B21 runner publishes response intake status without secrets', () => {
  const runner = fs.readFileSync(path.join(appRoot, 'scripts', 'run-a13-b21-response-intake.mjs'), 'utf8');
  assert.match(runner, /provider-response-intake-status\.json/);
  assert.match(runner, /evidenceComplete/);
  assert.match(runner, /pilot-handoff-ready/);
  assert.doesNotMatch(runner, /process\.env/);
});

test('A13-B21 renders response intake and preserves mobile-safe architecture', () => {
  const html = fs.readFileSync(path.join(dataRoot, '..', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(dataRoot, '..', 'portal.css'), 'utf8');
  const js = fs.readFileSync(path.join(dataRoot, '..', 'portal.js'), 'utf8');
  assert.match(html, /id="response-intake"/);
  assert.match(html, /data-intake-queue/);
  assert.match(js, /provider-response-intake-status\.json/);
  assert.match(css, /A13-B21 response intake/);
  assert.match(css, /max-width:430px/);
  assert.doesNotMatch(html, /API_KEY/);
});
'''
if 'runner publishes response intake status' not in test_text:
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
  "$APP/a13-b21-provider-outreach-pack.test.mjs"

echo "A13-B21 provider response intake UI integration completed successfully."
