#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
APP="$ROOT/apps/kidults-enterprise-staging"
PUBLIC="$APP/public/a13-b10"

cd "$ROOT"
node "$APP/scripts/run-a13-b19-provider-shortlist.mjs"

python3 - <<'PY'
from pathlib import Path

root = Path.cwd()
app = root / 'apps/kidults-enterprise-staging'
public = app / 'public/a13-b10'
html_file = public / 'index.html'
css_file = public / 'portal.css'
js_file = public / 'portal.js'
test_file = app / 'a13-b19-provider-candidate-population.test.mjs'

html = html_file.read_text(encoding='utf-8')
section = '''
    <section class="product-section" id="provider-shortlist">
      <div class="section-heading split-heading">
        <div><p class="eyebrow">Provider Candidate Shortlist</p><h2>Real candidates. Unknowns remain explicit.</h2></div>
        <p>Official-source research · access status · rights diligence · outreach actions</p>
      </div>
      <div class="shortlist-layout">
        <article class="trust-panel shortlist-summary">
          <div class="shortlist-state"><div><p class="eyebrow">Shortlist state</p><h3 data-shortlist-status>Loading</h3></div><span class="status-chip" data-shortlist-production>Production blocked</span></div>
          <div class="trust-metrics"><div><strong data-shortlist-candidates>—</strong><span>Candidates</span></div><div><strong data-shortlist-roles>—</strong><span>Roles covered</span></div><div><strong data-shortlist-outreach>—</strong><span>Outreach required</span></div></div>
          <div class="gate-grid" data-shortlist-gates></div>
          <p class="shortlist-note">No candidate is pilot-approved until commercial terms, service levels and data rights are confirmed directly.</p>
        </article>
        <article class="trust-panel">
          <p class="eyebrow">Role shortlist</p>
          <div class="provider-role-list" data-shortlist-roles-list></div>
        </article>
      </div>
    </section>
'''
if 'id="provider-shortlist"' not in html:
    html = html.replace('</main>', section + '\n  </main>')
html_file.write_text(html, encoding='utf-8')

css = css_file.read_text(encoding='utf-8')
css_block = '''

/* A13-B19 provider shortlist */
.shortlist-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:22px}
.shortlist-state{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;padding-bottom:26px;border-bottom:1px solid var(--line)}
.shortlist-state h3{margin:8px 0 0;font-family:var(--serif);font-size:clamp(2.5rem,5vw,5rem);font-weight:400;line-height:.94;text-transform:capitalize}
.status-chip{display:inline-flex;align-items:center;min-height:28px;padding:6px 10px;border:1px solid currentColor;font-size:.68rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;white-space:nowrap}
.gate-grid{display:grid;grid-template-columns:1fr 1fr;border-top:1px solid var(--ink);margin-top:26px}
.gate-grid p{display:flex;justify-content:space-between;gap:16px;margin:0;padding:15px 0;border-bottom:1px solid var(--line);font-size:.82rem}
.gate-grid p:nth-child(odd){padding-right:20px;border-right:1px solid var(--line)}
.gate-grid p:nth-child(even){padding-left:20px}
.gate-grid strong{font-size:.7rem;letter-spacing:.1em;text-transform:uppercase}
.provider-role-list{border-top:1px solid var(--ink)}
.provider-role-card{padding:20px 0;border-bottom:1px solid var(--line)}
.provider-role-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px}
.provider-role-head h3{margin:0;font-size:1rem;text-transform:none}
.provider-role-head span{font-size:.68rem;letter-spacing:.1em;text-transform:uppercase}
.provider-primary{margin:8px 0 4px;font-weight:700}
.provider-meta{display:flex;flex-wrap:wrap;gap:8px 18px;margin:8px 0 0;color:var(--muted);font-size:.76rem}
.provider-action{margin:12px 0 0;font-size:.82rem;line-height:1.55}
.shortlist-note{margin:24px 0 0;color:var(--muted);font-size:.82rem}
@media (max-width:900px){.shortlist-layout{grid-template-columns:1fr}.gate-grid{grid-template-columns:1fr}.gate-grid p:nth-child(odd){padding-right:0;border-right:0}.gate-grid p:nth-child(even){padding-left:0}}
@media (max-width:430px){.shortlist-state{flex-direction:column}.shortlist-state h3{font-size:2.6rem}.provider-role-head{align-items:center}}
'''
if 'A13-B19 provider shortlist' not in css:
    css += css_block
css_file.write_text(css, encoding='utf-8')

js = js_file.read_text(encoding='utf-8')
js_block = '''

// A13-B19 provider shortlist
const renderProviderShortlist = async () => {
  const section = document.querySelector('#provider-shortlist');
  if (!section) return;
  try {
    const response = await fetch('/a13-b10/data/generated/provider-shortlist.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Shortlist request failed: ${response.status}`);
    const report = await response.json();
    const set = (selector, value) => { const node = section.querySelector(selector); if (node) node.textContent = value; };
    set('[data-shortlist-status]', report.status.replaceAll('-', ' '));
    set('[data-shortlist-candidates]', String(report.candidateCount));
    set('[data-shortlist-roles]', `${report.roleCoverage.filter(item => item.candidateCount >= 2).length}/${report.roleCoverage.length}`);
    set('[data-shortlist-outreach]', String(report.outreachRequired));
    const gates = section.querySelector('[data-shortlist-gates]');
    if (gates) gates.innerHTML = Object.entries(report.gates).map(([name, value]) => `<p><span>${name.replace(/([A-Z])/g, ' $1')}</span><strong>${value}</strong></p>`).join('');
    const roles = section.querySelector('[data-shortlist-roles-list]');
    if (roles) roles.innerHTML = report.roleCoverage.map(role => {
      const primary = role.primaryCandidate;
      return `<article class="provider-role-card"><div class="provider-role-head"><h3>${role.role}</h3><span>${role.candidateCount} candidates</span></div><p class="provider-primary">${primary ? primary.provider : 'No primary candidate'}</p><div class="provider-meta"><span>Access: ${primary ? primary.accessStatus : 'unknown'}</span><span>Priority: ${primary ? '1' : '—'}</span></div><p class="provider-action">${primary ? primary.outreachAction : 'Direct provider research required.'}</p></article>`;
    }).join('');
    document.body.dataset.providerShortlist = report.status;
  } catch (error) {
    setTimeout(() => { const node = section.querySelector('[data-shortlist-status]'); if (node) node.textContent = 'Unavailable'; }, 0);
    console.error(error);
  }
};
renderProviderShortlist();
'''
if 'A13-B19 provider shortlist' not in js:
    js += js_block
js_file.write_text(js, encoding='utf-8')

test_text = test_file.read_text(encoding='utf-8')
addition = '''

test('A13-B19 renders the verified shortlist without invented commercial metrics', () => {
  const html = fs.readFileSync(path.join(dataRoot, '..', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(dataRoot, '..', 'portal.css'), 'utf8');
  const js = fs.readFileSync(path.join(dataRoot, '..', 'portal.js'), 'utf8');
  assert.match(html, /id="provider-shortlist"/);
  assert.match(html, /data-shortlist-roles-list/);
  assert.match(js, /provider-shortlist\.json/);
  assert.match(js, /outreachAction/);
  assert.match(css, /A13-B19 provider shortlist/);
  assert.doesNotMatch(js, /monthlyPilotCostUsd/);
});

test('A13-B19 UI keeps production blocked and exposes no credentials', () => {
  const html = fs.readFileSync(path.join(dataRoot, '..', 'index.html'), 'utf8');
  const js = fs.readFileSync(path.join(dataRoot, '..', 'portal.js'), 'utf8');
  assert.match(html, /Production blocked/i);
  assert.doesNotMatch(html, /API_KEY/);
  assert.doesNotMatch(js, /process\.env/);
});
'''
if 'renders the verified shortlist' not in test_text:
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
  "$APP/a13-b19-provider-candidate-population.test.mjs"

echo "A13-B19 provider shortlist UI integration completed successfully."
