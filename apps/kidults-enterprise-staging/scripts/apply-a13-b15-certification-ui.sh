#!/usr/bin/env bash
set -euo pipefail

ROOT="apps/kidults-enterprise-staging"
PUBLIC="$ROOT/public/a13-b10"
HTML="$PUBLIC/index.html"
CSS="$PUBLIC/portal.css"
JS="$PUBLIC/portal.js"
TEST="$ROOT/a13-b15-external-source-certification.test.mjs"

python3 - <<'PY'
from pathlib import Path

root = Path("apps/kidults-enterprise-staging")
public = root / "public" / "a13-b10"
html_file = public / "index.html"
css_file = public / "portal.css"
js_file = public / "portal.js"
test_file = root / "a13-b15-external-source-certification.test.mjs"

html = html_file.read_text(encoding="utf-8")
css = css_file.read_text(encoding="utf-8")
js = js_file.read_text(encoding="utf-8")
test = test_file.read_text(encoding="utf-8")

section = '''
    <section class="product-section" id="external-certification">
      <div class="section-heading split-heading"><div><p class="eyebrow">External Source Certification</p><h2>Production access stays blocked until every external gate is proven.</h2></div><p>Credentials · rights · provider health · scheduling · failure simulation</p></div>
      <div class="trust-layout certification-layout">
        <article class="trust-panel">
          <div class="certification-heading"><div><p class="eyebrow">Certification state</p><h3 data-certification-status>Loading</h3></div><span class="source-health-status" data-certification-badge data-health="degraded">Blocked</span></div>
          <div class="trust-metrics certification-metrics">
            <div><strong data-certified-families>—</strong><span>Certified families</span></div>
            <div><strong data-certification-passed>—</strong><span>Passed gates</span></div>
            <div><strong data-certification-blocked>—</strong><span>Blocked gates</span></div>
          </div>
          <div class="certification-gates" data-certification-gates></div>
          <p class="certification-safety">Secret values are never exposed. Only credential presence and certification state are shown.</p>
        </article>
        <article class="trust-panel">
          <p class="eyebrow">Provider readiness</p>
          <div class="source-health-list" data-provider-certification-list><p class="source-health-empty">Loading provider certification.</p></div>
          <div class="certification-blockers"><p class="eyebrow">Promotion blockers</p><ul data-certification-blockers><li>Loading certification report.</li></ul></div>
        </article>
      </div>
    </section>
'''

if 'id="external-certification"' not in html:
    marker = '    <section class="product-section" id="method-trust">'
    if marker not in html:
        raise SystemExit("Unable to locate method-trust section")
    html = html.replace(marker, section + "\n" + marker, 1)

html = html.replace('portal.css?v=20260803-b12', 'portal.css?v=20260803-b15')
html = html.replace('portal.js?v=20260803-b12', 'portal.js?v=20260803-b15')

css_block = '''

/* A13-B15 External Source Certification */
.certification-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 24px;
}
.certification-heading h3 {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(2.5rem, 4vw, 4rem);
  font-weight: 500;
  line-height: .94;
  letter-spacing: -.03em;
  text-transform: capitalize;
}
.certification-metrics { margin-bottom: 28px; }
.certification-gates {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border-top: 1px solid var(--ink);
}
.certification-gate {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-width: 0;
  padding: 14px 0;
  border-bottom: 1px solid var(--line);
}
.certification-gate:nth-child(odd) { padding-right: 18px; }
.certification-gate:nth-child(even) { padding-left: 18px; border-left: 1px solid var(--line); }
.certification-gate span:first-child {
  min-width: 0;
  color: var(--muted);
  font-size: 12px;
  overflow-wrap: anywhere;
}
.certification-gate strong {
  flex: 0 0 auto;
  color: var(--risk);
  font-size: 10px;
  letter-spacing: .1em;
  text-transform: uppercase;
}
.certification-gate strong[data-state="passed"],
.certification-gate strong[data-state="ready"] { color: var(--forest); }
.certification-safety {
  margin: 22px 0 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}
.certification-blockers { margin-top: 28px; }
.certification-blockers ul {
  margin: 0;
  padding: 0;
  list-style: none;
  border-top: 1px solid var(--ink);
}
.certification-blockers li {
  position: relative;
  padding: 14px 0 14px 24px;
  border-bottom: 1px solid var(--line);
  color: var(--body);
  font-size: 13px;
  line-height: 1.45;
}
.certification-blockers li::before {
  content: '—';
  position: absolute;
  left: 0;
  color: var(--gold);
}
@media (max-width: 767px) {
  .certification-heading { display: block; }
  .certification-heading .source-health-status { margin-top: 14px; }
  .certification-gates { grid-template-columns: 1fr; }
  .certification-gate:nth-child(odd),
  .certification-gate:nth-child(even) { padding-inline: 0; border-left: 0; }
}
'''

if 'A13-B15 External Source Certification' not in css:
    css += css_block

js_block = '''

  const formatCertificationLabel = value => String(value || '').replace(/([A-Z])/g, ' $1').replace(/^./, char => char.toUpperCase());

  const renderExternalCertification = report => {
    const gates = Object.entries(report.gates || {});
    const passed = gates.filter(([, value]) => value === 'passed' || value === 'ready').length;
    const blocked = gates.length - passed;
    const authorized = report.productionPromotionAuthorized === true;

    setText('[data-certification-status]', report.status || 'blocked');
    setText('[data-certified-families]', report.independentCertifiedFamilies || 0);
    setText('[data-certification-passed]', passed);
    setText('[data-certification-blocked]', blocked);

    const badge = qs('[data-certification-badge]');
    if (badge) {
      badge.textContent = authorized ? 'Production authorized' : 'Production blocked';
      badge.dataset.health = authorized ? 'healthy' : 'failed';
    }

    const gateTarget = qs('[data-certification-gates]');
    if (gateTarget) {
      gateTarget.innerHTML = gates.map(([name, value]) => `
        <div class="certification-gate"><span>${formatCertificationLabel(name)}</span><strong data-state="${value}">${value}</strong></div>
      `).join('');
    }

    const providerTarget = qs('[data-provider-certification-list]');
    if (providerTarget) {
      providerTarget.innerHTML = (report.providers || []).map(provider => {
        const providerGates = Object.values(provider.certification || {});
        const providerReady = providerGates.every(value => value === 'passed' || value === 'ready');
        return `
          <article class="source-health-item">
            <div class="source-health-head"><strong>${provider.role}</strong><small>${provider.family} · ${provider.id}</small></div>
            <span class="source-health-status" data-health="${providerReady ? 'healthy' : 'failed'}">${providerReady ? 'Certified' : 'Blocked'}</span>
            <div class="source-health-meta">
              <span>Credentials: ${provider.certification?.credentials || 'blocked'}</span>
              <span>Rights: ${provider.certification?.rights || 'blocked'}</span>
              <span>Endpoint: ${provider.certification?.endpoint || 'blocked'}</span>
              <span>Health: ${provider.certification?.healthProbe || 'blocked'}</span>
            </div>
          </article>
        `;
      }).join('') || '<p class="source-health-empty">No provider certification records.</p>';
    }

    const blockers = qs('[data-certification-blockers]');
    if (blockers) {
      blockers.innerHTML = (report.blockers || []).map(item => `<li>${item}</li>`).join('') || '<li>No blockers.</li>';
    }

    document.body.dataset.externalCertification = report.status || 'blocked';
    document.body.dataset.productionAuthorized = String(authorized);
  };

  const loadExternalCertification = async () => {
    try {
      const report = await fetchJson('/a13-b10/data/generated/external-source-certification.json');
      renderExternalCertification(report);
    } catch (error) {
      console.error(error);
      renderExternalCertification({
        status: 'blocked',
        productionPromotionAuthorized: false,
        independentCertifiedFamilies: 0,
        providers: [],
        gates: { certificationReport: 'blocked' },
        blockers: ['Certification report is unavailable. Production promotion remains blocked.']
      });
    }
  };
'''

if 'const loadExternalCertification = async () =>' not in js:
    marker = '  const navLinks = qsa(\'.main-nav a\');'
    if marker not in js:
        raise SystemExit("Unable to locate navigation block")
    js = js.replace(marker, js_block + "\n" + marker, 1)

if 'loadExternalCertification();' not in js:
    marker = '  loadSourceRegistry().finally(loadProductThroughAdapter);'
    if marker in js:
        js = js.replace(marker, marker + '\n  loadExternalCertification();', 1)
    else:
        marker = '  loadProductThroughAdapter();'
        if marker not in js:
            raise SystemExit("Unable to locate product loader")
        js = js.replace(marker, marker + '\n  loadExternalCertification();', 1)

extra_tests = '''

test('A13-B15 renders external certification and promotion blockers', () => {
  const html = fs.readFileSync(path.join(dataRoot, '..', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(dataRoot, '..', 'portal.css'), 'utf8');
  const js = fs.readFileSync(path.join(dataRoot, '..', 'portal.js'), 'utf8');
  assert.match(html, /id="external-certification"/);
  assert.match(html, /data-certification-status/);
  assert.match(html, /data-provider-certification-list/);
  assert.match(css, /A13-B15 External Source Certification/);
  assert.match(js, /loadExternalCertification/);
  assert.match(js, /generated\/external-source-certification\.json/);
  assert.match(js, /productionAuthorized/);
});

test('A13-B15 UI never exposes credential values', () => {
  const js = fs.readFileSync(path.join(dataRoot, '..', 'portal.js'), 'utf8');
  assert.doesNotMatch(js, /process\.env/);
  assert.match(js, /Credentials:/);
  assert.match(js, /Production promotion remains blocked/);
});
'''

if "renders external certification and promotion blockers" not in test:
    test += extra_tests

html_file.write_text(html, encoding="utf-8")
css_file.write_text(css, encoding="utf-8")
js_file.write_text(js, encoding="utf-8")
test_file.write_text(test, encoding="utf-8")
PY

node "$ROOT/scripts/run-a13-b15-certification.mjs"

node --test \
  "$ROOT/a13-b10-baseline-lock.test.mjs" \
  "$ROOT/a13-b11-intelligence-product.test.mjs" \
  "$ROOT/a13-b12-live-data-integration.test.mjs" \
  "$ROOT/a13-b13-live-source-resilience.test.mjs" \
  "$ROOT/a13-b14-integrated-intelligence-activation.test.mjs" \
  "$ROOT/a13-b15-external-source-certification.test.mjs"

echo "A13-B15 certification UI integration completed successfully."
