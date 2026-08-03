#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
APP="$ROOT/apps/kidults-enterprise-staging"
PUBLIC="$APP/public/a13-b10"

cd "$ROOT"

node "$APP/scripts/run-a13-b17-provider-injection.mjs"

python3 - <<'PY'
from pathlib import Path

root = Path('apps/kidults-enterprise-staging')
public = root / 'public' / 'a13-b10'
html_path = public / 'index.html'
css_path = public / 'portal.css'
js_path = public / 'portal.js'
test_path = root / 'a13-b17-secure-provider-injection.test.mjs'

html = html_path.read_text(encoding='utf-8')
css = css_path.read_text(encoding='utf-8')
js = js_path.read_text(encoding='utf-8')
test = test_path.read_text(encoding='utf-8')

section = '''\n    <section class="product-section" id="provider-command-center">\n      <div class="section-heading split-heading"><div><p class="eyebrow">Release Command Center</p><h2>Approved providers enter through explicit gates.</h2></div><p>Endpoint · health · credentials · rights · production handoff</p></div>\n      <div class="trust-layout provider-command-layout">\n        <article class="trust-panel">\n          <p class="eyebrow">Provider injection state</p>\n          <div class="provider-command-head"><strong data-provider-state>Loading</strong><span class="source-health-status" data-provider-badge data-health="degraded">Blocked</span></div>\n          <div class="trust-metrics"><div><strong data-provider-ready>—</strong><span>Ready providers</span></div><div><strong data-provider-passed>—</strong><span>Passed gates</span></div><div><strong data-provider-blocked>—</strong><span>Blocked gates</span></div></div>\n          <div class="provider-gates" data-provider-gates></div>\n          <p class="provider-secret-note">Secret values are never rendered. Only configuration presence and approval state are shown.</p>\n        </article>\n        <article class="trust-panel">\n          <p class="eyebrow">Provider readiness</p>\n          <div class="source-health-list" data-provider-list><p class="source-health-empty">Loading provider readiness.</p></div>\n          <p class="eyebrow provider-blocker-title">Release blockers</p>\n          <div class="provider-blockers" data-provider-blockers></div>\n        </article>\n      </div>\n    </section>\n'''

if 'id="provider-command-center"' not in html:
    marker = '    <section class="product-section" id="method-trust">'
    if marker not in html:
        raise SystemExit('Unable to locate Method & Trust insertion point')
    html = html.replace(marker, section + '\n' + marker, 1)

css_block = '''\n\n/* A13-B17 Secure Provider Injection */\n.provider-command-layout { align-items: stretch; }\n.provider-command-layout .trust-panel { min-width: 0; }\n.provider-command-head { display:flex; align-items:flex-start; justify-content:space-between; gap:20px; margin-bottom:24px; }\n.provider-command-head > strong { max-width:75%; font-family:var(--serif); font-size:clamp(2.3rem,4vw,4rem); font-weight:400; line-height:.95; overflow-wrap:anywhere; text-transform:capitalize; }\n.provider-gates { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); border-top:1px solid var(--ink); }\n.provider-gate { display:flex; justify-content:space-between; gap:18px; padding:14px 0; border-bottom:1px solid var(--line); }\n.provider-gate:nth-child(odd) { padding-right:20px; border-right:1px solid var(--line); }\n.provider-gate:nth-child(even) { padding-left:20px; }\n.provider-gate span { color:var(--muted); font-size:12px; }\n.provider-gate strong { font-size:10px; letter-spacing:.1em; text-transform:uppercase; }\n.provider-gate strong[data-state="passed"] { color:var(--forest); }\n.provider-gate strong[data-state="blocked"] { color:var(--risk); }\n.provider-secret-note { margin:18px 0 0; color:var(--muted); font-size:12px; line-height:1.5; }\n.provider-blocker-title { margin-top:28px; }\n.provider-blockers { border-top:1px solid var(--ink); }\n.provider-blockers p { margin:0; padding:14px 0; border-bottom:1px solid var(--line); color:var(--body); font-size:13px; line-height:1.45; }\n.provider-blockers p::before { content:'—'; margin-right:12px; color:var(--gold); }\n@media (max-width:767px) {\n  .provider-command-head { display:grid; }\n  .provider-command-head > strong { max-width:100%; }\n  .provider-gates { grid-template-columns:1fr; }\n  .provider-gate:nth-child(odd), .provider-gate:nth-child(even) { padding-left:0; padding-right:0; border-right:0; }\n}\n'''

if '/* A13-B17 Secure Provider Injection */' not in css:
    css += css_block

js_block = '''\n\n  const renderProviderCommandCenter = report => {\n    const gates = Object.entries(report.gates || {});\n    const providers = Array.isArray(report.providers) ? report.providers : [];\n    const passed = gates.filter(([, value]) => value === 'passed').length;\n    const blocked = gates.length - passed;\n    const ready = providers.filter(provider => provider.status === 'ready').length;\n\n    setText('[data-provider-state]', String(report.status || 'blocked').replaceAll('-', ' '));\n    setText('[data-provider-ready]', `${ready}/${providers.length}`);\n    setText('[data-provider-passed]', passed);\n    setText('[data-provider-blocked]', blocked);\n\n    const badge = qs('[data-provider-badge]');\n    if (badge) {\n      const authorized = report.productionPromotionAuthorized === true;\n      badge.textContent = authorized ? 'Authorized' : 'Production blocked';\n      badge.dataset.health = authorized ? 'healthy' : 'failed';\n    }\n\n    const gateTarget = qs('[data-provider-gates]');\n    if (gateTarget) gateTarget.innerHTML = gates.map(([key, value]) => `\n      <div class="provider-gate"><span>${key.replace(/([A-Z])/g, ' $1')}</span><strong data-state="${value}">${value}</strong></div>\n    `).join('');\n\n    const providerTarget = qs('[data-provider-list]');\n    if (providerTarget) providerTarget.innerHTML = providers.map(provider => `\n      <article class="source-health-item">\n        <div class="source-health-head"><strong>${provider.role}</strong><small>Secure provider injection</small></div>\n        <span class="source-health-status" data-health="${provider.status === 'ready' ? 'healthy' : 'failed'}">${provider.status}</span>\n        <div class="source-health-meta">\n          <span>Endpoint: ${provider.endpointConfigured ? 'configured' : 'blocked'}</span>\n          <span>Health: ${provider.healthEndpointConfigured ? 'configured' : 'blocked'}</span>\n          <span>Credential: ${provider.credentialPresent ? 'present' : 'blocked'}</span>\n          <span>Rights: ${provider.rightsApproved ? 'approved' : 'blocked'}</span>\n        </div>\n      </article>\n    `).join('');\n\n    const blockerTarget = qs('[data-provider-blockers]');\n    if (blockerTarget) blockerTarget.innerHTML = (report.blockers || []).map(item => `<p>${item}</p>`).join('');\n\n    document.body.dataset.providerInjection = report.status || 'blocked';\n  };\n\n  const loadProviderCommandCenter = async () => {\n    try {\n      const report = await fetchJson('/a13-b10/data/generated/provider-injection.json');\n      renderProviderCommandCenter(report);\n    } catch (error) {\n      console.error(error);\n      renderProviderCommandCenter({\n        status: 'blocked',\n        productionPromotionAuthorized: false,\n        providers: [],\n        gates: { report: 'blocked', productionAuthorization: 'blocked' },\n        blockers: ['Provider injection report is unavailable.']\n      });\n    }\n  };\n'''

if 'const renderProviderCommandCenter' not in js:
    marker = "  const loadProductThroughAdapter = async () => {"
    if marker not in js:
        raise SystemExit('Unable to locate portal.js insertion point')
    js = js.replace(marker, js_block + '\n' + marker, 1)

if 'loadProviderCommandCenter();' not in js:
    marker = '  loadSourceRegistry().finally(loadProductThroughAdapter);'
    if marker not in js:
        raise SystemExit('Unable to locate startup marker')
    js = js.replace(marker, marker + '\n  loadProviderCommandCenter();', 1)

extra_tests = '''\n\ntest('A13-B17 renders secure provider command center without secrets', () => {\n  const html = fs.readFileSync(path.join(dataRoot, '..', 'index.html'), 'utf8');\n  const css = fs.readFileSync(path.join(dataRoot, '..', 'portal.css'), 'utf8');\n  const js = fs.readFileSync(path.join(dataRoot, '..', 'portal.js'), 'utf8');\n  assert.match(html, /id="provider-command-center"/);\n  assert.match(html, /data-provider-list/);\n  assert.match(css, /A13-B17 Secure Provider Injection/);\n  assert.match(js, /renderProviderCommandCenter/);\n  assert.match(js, /generated\\/provider-injection\\.json/);\n  assert.doesNotMatch(html, /KIDULTS_[A-Z_]+_API_KEY=/);\n  assert.doesNotMatch(js, /process\\.env/);\n});\n\ntest('A13-B17 UI keeps promotion blocked and exposes only configuration state', () => {\n  const js = fs.readFileSync(path.join(dataRoot, '..', 'portal.js'), 'utf8');\n  assert.match(js, /Production blocked/);\n  assert.match(js, /credentialPresent/);\n  assert.match(js, /rightsApproved/);\n  assert.match(js, /document\\.body\\.dataset\\.providerInjection/);\n});\n'''

if "renders secure provider command center" not in test:
    test += extra_tests

html_path.write_text(html, encoding='utf-8')
css_path.write_text(css, encoding='utf-8')
js_path.write_text(js, encoding='utf-8')
test_path.write_text(test, encoding='utf-8')
PY

node --test \
  "$APP/a13-b10-baseline-lock.test.mjs" \
  "$APP/a13-b11-intelligence-product.test.mjs" \
  "$APP/a13-b12-live-data-integration.test.mjs" \
  "$APP/a13-b13-live-source-resilience.test.mjs" \
  "$APP/a13-b14-integrated-intelligence-activation.test.mjs" \
  "$APP/a13-b15-external-source-certification.test.mjs" \
  "$APP/a13-b16-autonomous-operations-certification.test.mjs" \
  "$APP/a13-b17-secure-provider-injection.test.mjs"

echo "A13-B17 provider command center integration completed successfully."
