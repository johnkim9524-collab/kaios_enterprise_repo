#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
APP="$ROOT/apps/kidults-enterprise-staging"
PUBLIC="$APP/public/a13-b10"

cd "$ROOT"

node "$APP/scripts/run-a13-b18-live-pilot-readiness.mjs"

python3 - <<'PY'
from pathlib import Path

root = Path.cwd()
app = root / "apps/kidults-enterprise-staging"
public = app / "public/a13-b10"
html_path = public / "index.html"
css_path = public / "portal.css"
js_path = public / "portal.js"
test_path = app / "a13-b18-provider-acquisition-live-pilot.test.mjs"

html = html_path.read_text(encoding="utf-8")
css = css_path.read_text(encoding="utf-8")
js = js_path.read_text(encoding="utf-8")
test = test_path.read_text(encoding="utf-8")

section = '''

    <!-- A13-B18 Live Pilot Readiness -->
    <section class="product-section" id="live-pilot-readiness">
      <div class="section-heading split-heading">
        <div><p class="eyebrow">Provider Acquisition / Live Pilot</p><h2>Provider selection becomes an auditable release decision.</h2></div>
        <p>Commercial review · rights review · technical review · explicit pilot approval</p>
      </div>
      <div class="trust-layout live-pilot-layout">
        <article class="trust-panel">
          <div class="status-heading-row"><div><p class="eyebrow">Pilot readiness state</p><h3 class="certification-title" data-pilot-state>Loading</h3></div><span class="source-health-status" data-pilot-badge data-health="failed">Production blocked</span></div>
          <div class="trust-metrics">
            <div><strong data-pilot-selected>—</strong><span>Selected providers</span></div>
            <div><strong data-pilot-families>—</strong><span>Independent families</span></div>
            <div><strong data-pilot-gates>—</strong><span>Passed gates</span></div>
          </div>
          <div class="certification-gates" data-pilot-gate-list></div>
          <p class="certification-note">Provider candidates remain non-production until rights, technical, commercial and explicit pilot gates pass.</p>
        </article>
        <article class="trust-panel">
          <p class="eyebrow">Role selection</p>
          <div class="provider-readiness-list" data-pilot-role-list><p class="source-health-empty">Loading provider candidates.</p></div>
          <p class="eyebrow command-blocker-title">Pilot blockers</p>
          <div class="command-blocker-list" data-pilot-blockers></div>
        </article>
      </div>
    </section>
'''

if 'id="live-pilot-readiness"' not in html:
    anchor = '    <section class="product-section" id="method-trust">'
    if anchor not in html:
        anchor = '  </main>'
    html = html.replace(anchor, section + '\n' + anchor, 1)

css_block = '''

/* A13-B18 Provider Acquisition & Live Pilot */
.live-pilot-layout { align-items: stretch; }
.status-heading-row { display:flex; align-items:flex-start; justify-content:space-between; gap:20px; }
.certification-title { margin:10px 0 0; font-family:var(--display); font-size:clamp(2.8rem,5vw,5rem); font-weight:400; line-height:.95; letter-spacing:-.04em; text-transform:capitalize; }
.certification-gates { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); margin-top:28px; border-top:1px solid var(--ink); border-bottom:1px solid var(--ink); }
.certification-gates div { display:flex; justify-content:space-between; gap:18px; padding:15px 0; border-bottom:1px solid var(--line); }
.certification-gates div:nth-child(odd) { padding-right:20px; border-right:1px solid var(--line); }
.certification-gates div:nth-child(even) { padding-left:20px; }
.certification-gates div:nth-last-child(-n+2) { border-bottom:0; }
.certification-gates span { color:var(--muted); font-size:12px; }
.certification-gates strong { font-size:10px; letter-spacing:.1em; text-transform:uppercase; }
.certification-gates strong[data-status="passed"] { color:var(--forest); }
.certification-gates strong[data-status="blocked"] { color:var(--risk); }
.certification-note { margin:22px 0 0; color:var(--muted); font-size:12px; line-height:1.6; }
.provider-readiness-list { border-top:1px solid var(--ink); }
.pilot-role-item { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:10px 18px; padding:18px 0; border-bottom:1px solid var(--line); }
.pilot-role-item strong { font-size:15px; }
.pilot-role-item small { display:block; margin-top:5px; color:var(--muted); font-size:11px; }
.pilot-role-meta { grid-column:1/-1; display:flex; flex-wrap:wrap; gap:8px 16px; color:var(--muted); font-size:11px; }
.command-blocker-title { margin-top:28px; }
.command-blocker-list { border-top:1px solid var(--ink); }
.command-blocker-list p { margin:0; padding:15px 0; border-bottom:1px solid var(--line); font-size:13px; line-height:1.5; }
.command-blocker-list p::before { content:'—'; margin-right:12px; color:var(--gold); }
@media (max-width:767px) {
  .status-heading-row { display:block; }
  .status-heading-row .source-health-status { margin-top:16px; }
  .certification-gates { grid-template-columns:1fr; }
  .certification-gates div:nth-child(odd), .certification-gates div:nth-child(even) { padding-left:0; padding-right:0; border-right:0; border-bottom:1px solid var(--line); }
  .certification-gates div:last-child { border-bottom:0; }
  .pilot-role-item { grid-template-columns:1fr; }
  .pilot-role-item .source-health-status { justify-self:start; }
}
'''
if '/* A13-B18 Provider Acquisition & Live Pilot */' not in css:
    css += css_block

js_block = '''

  const renderLivePilotReadiness = report => {
    const gates = report?.gates || {};
    const gateEntries = Object.entries(gates);
    const passed = gateEntries.filter(([, value]) => value === 'passed').length;
    const selected = Array.isArray(report?.selectedProviders) ? report.selectedProviders : [];
    const candidates = Array.isArray(report?.candidates) ? report.candidates : [];
    const requiredRoles = ['transactions', 'supply', 'culturalDemand'];

    setText('[data-pilot-state]', String(report?.status || 'blocked').replaceAll('-', ' '));
    setText('[data-pilot-selected]', `${selected.length}/3`);
    setText('[data-pilot-families]', report?.independentProviderFamilies ?? 0);
    setText('[data-pilot-gates]', passed);

    const badge = qs('[data-pilot-badge]');
    if (badge) {
      badge.textContent = report?.productionPromotionAuthorized ? 'Production authorized' : 'Production blocked';
      badge.dataset.health = report?.productionPromotionAuthorized ? 'healthy' : 'failed';
    }

    const gateList = qs('[data-pilot-gate-list]');
    if (gateList) {
      gateList.innerHTML = gateEntries.map(([key, value]) => `
        <div><span>${key.replace(/([A-Z])/g, ' $1')}</span><strong data-status="${value}">${value}</strong></div>
      `).join('');
    }

    const roleList = qs('[data-pilot-role-list]');
    if (roleList) {
      roleList.innerHTML = requiredRoles.map(role => {
        const selectedProvider = selected.find(item => item.role === role);
        const roleCandidates = candidates.filter(item => item.role === role);
        const bestCandidate = selectedProvider
          ? candidates.find(item => item.id === selectedProvider.id) || selectedProvider
          : [...roleCandidates].sort((a, b) => Number(b.score || 0) - Number(a.score || 0))[0];
        const status = selectedProvider ? 'ready' : 'blocked';
        const score = bestCandidate?.score ?? '—';
        const commercial = bestCandidate?.gates?.commercial || 'blocked';
        const rights = bestCandidate?.gates?.rights || 'blocked';
        const technical = bestCandidate?.gates?.technical || 'blocked';
        return `
          <div class="pilot-role-item">
            <div><strong>${role}</strong><small>${bestCandidate?.id || 'No approved candidate'}</small></div>
            <span class="source-health-status" data-health="${status === 'ready' ? 'healthy' : 'failed'}">${status}</span>
            <div class="pilot-role-meta"><span>Score: ${score}</span><span>Commercial: ${commercial}</span><span>Rights: ${rights}</span><span>Technical: ${technical}</span></div>
          </div>
        `;
      }).join('');
    }

    const blockers = qs('[data-pilot-blockers]');
    if (blockers) {
      const items = Array.isArray(report?.blockers) && report.blockers.length
        ? report.blockers
        : ['No pilot blocker is currently reported.'];
      blockers.innerHTML = items.map(item => `<p>${item}</p>`).join('');
    }

    document.body.dataset.livePilot = report?.status || 'blocked';
  };

  const loadLivePilotReadiness = async () => {
    try {
      const report = await fetchJson('/a13-b10/data/generated/live-pilot-readiness.json');
      renderLivePilotReadiness(report);
    } catch (error) {
      console.error(error);
      renderLivePilotReadiness({
        status: 'blocked',
        productionPromotionAuthorized: false,
        selectedProviders: [],
        independentProviderFamilies: 0,
        candidates: [],
        gates: { report: 'blocked', productionAuthorization: 'blocked' },
        blockers: ['Live pilot readiness report is unavailable.']
      });
    }
  };
'''

if 'const renderLivePilotReadiness = report =>' not in js:
    marker = "  qsa('[data-category]')"
    if marker not in js:
        marker = '})();'
    js = js.replace(marker, js_block + '\n' + marker, 1)

# Ensure the loader runs without disturbing existing B12-B17 startup ordering.
if 'loadLivePilotReadiness();' not in js:
    terminal = '})();'
    js = js.replace(terminal, "  loadLivePilotReadiness();\n\n" + terminal, 1)

extra_tests = '''

test('A13-B18 renders live pilot readiness and provider selection UI', () => {
  const html = fs.readFileSync(path.join(dataRoot, '..', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(dataRoot, '..', 'portal.css'), 'utf8');
  const js = fs.readFileSync(path.join(dataRoot, '..', 'portal.js'), 'utf8');
  assert.match(html, /id="live-pilot-readiness"/);
  assert.match(html, /data-pilot-role-list/);
  assert.match(css, /A13-B18 Provider Acquisition & Live Pilot/);
  assert.match(js, /renderLivePilotReadiness/);
  assert.match(js, /generated\/live-pilot-readiness\.json/);
});

test('A13-B18 UI exposes only evaluation state and keeps production blocked', () => {
  const js = fs.readFileSync(path.join(dataRoot, '..', 'portal.js'), 'utf8');
  assert.match(js, /productionPromotionAuthorized/);
  assert.match(js, /Production blocked/);
  assert.doesNotMatch(js, /process\.env/);
  assert.doesNotMatch(js, /API_KEY=/);
});
'''
if "renders live pilot readiness and provider selection UI" not in test:
    test += extra_tests

html_path.write_text(html, encoding="utf-8")
css_path.write_text(css, encoding="utf-8")
js_path.write_text(js, encoding="utf-8")
test_path.write_text(test, encoding="utf-8")
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
  "$APP/a13-b18-provider-acquisition-live-pilot.test.mjs"

echo "A13-B18 live pilot readiness UI integration completed successfully."
