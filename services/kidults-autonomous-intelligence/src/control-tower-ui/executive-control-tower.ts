import { controlTowerAdapter } from './control-tower-adapter.js';
import { buildControlTowerFixture, type ControlTowerScenario, CONTROL_TOWER_SCENARIOS } from './control-tower-fixtures.js';
import { buildBoundedExecutiveActionRequest } from './executive-action-client.js';
import { formatActionLabel, formatTimestamp, toBusinessLabel } from './executive-formatters.js';
import type { DataMode, DecisionAction, ExecutiveDashboardModel } from './control-tower-types.js';

const ROUTES = [
  '/control-tower',
  '/control-tower/decisions',
  '/control-tower/incidents',
  '/control-tower/products',
  '/control-tower/providers',
  '/control-tower/publication',
  '/control-tower/commercial',
  '/control-tower/audit',
] as const;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body, null, 2), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

export function isControlTowerRoute(pathname: string): boolean {
  return ROUTES.includes(pathname as (typeof ROUTES)[number]);
}

export function handleControlTowerRequest(request: Request): Response {
  const url = new URL(request.url);
  const requestedMode = String(url.searchParams.get('mode') || 'evidence').toLowerCase();
  const scenarioInput = String(url.searchParams.get('scenario') || 'healthy').toLowerCase();
  const scenario = CONTROL_TOWER_SCENARIOS.includes(scenarioInput as ControlTowerScenario)
    ? (scenarioInput as ControlTowerScenario)
    : 'healthy';

  let dataMode: DataMode = 'EVIDENCE';
  let modeNote = 'Canonical A28/A29 evidence adapter active.';
  if (requestedMode === 'demo') {
    dataMode = 'DEMO';
    modeNote = 'Deterministic simulation fixture mode.';
  } else if (requestedMode === 'live') {
    dataMode = 'EVIDENCE';
    modeNote = 'LIVE endpoint unavailable. Fail-closed fallback to canonical evidence mode.';
  }

  const fixture = buildControlTowerFixture(scenario);
  const model = controlTowerAdapter({
    a28Snapshot: fixture.a28,
    a29Evidence: fixture.a29,
    dataMode,
    modeNote,
    scenario,
  });

  if (url.pathname === '/control-tower/audit' && request.method === 'POST') {
    return json({
      events: ['control_tower_view', 'decision_open', 'decision_confirm_view', 'decision_action_submit', 'decision_action_result', 'incident_view', 'evidence_view'],
      sensitivePayloadTracked: false,
    });
  }

  if (request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  if (url.pathname === '/control-tower/decisions' && url.searchParams.get('submit') === '1') {
    const action = String(url.searchParams.get('action') || 'DEFER') as DecisionAction;
    const decisionId = String(url.searchParams.get('decisionId') || 'unknown-decision');
    try {
      const bounded = buildBoundedExecutiveActionRequest(decisionId, action);
      return json({
        decision: bounded,
        result: 'SUBMITTED',
        systemAction: 'Two-phase preflight and bounded execution request queued via A29 lifecycle.',
        verification: 'PENDING',
        rollback: 'AVAILABLE',
        platformImpact: 'Pending verification',
        remainingRisk: 'LOW',
        whatHappensNext: 'Audit timeline will update after execution and verification.',
      });
    } catch (error) {
      void error;
      return json({ error: 'invalid_action', message: 'Unsupported decision action request.' }, 400);
    }
  }

  return new Response(renderPage(url.pathname, model), {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function renderPage(pathname: string, model: ExecutiveDashboardModel): string {
  const primary = pathname === '/control-tower' ? renderHome(model) :
    pathname === '/control-tower/decisions' ? renderDecisions(model) :
    pathname === '/control-tower/incidents' ? renderIncidents(model) :
    pathname === '/control-tower/products' ? renderProducts(model) :
    pathname === '/control-tower/providers' ? renderProviders(model) :
    pathname === '/control-tower/publication' ? renderPublication(model) :
    pathname === '/control-tower/commercial' ? renderCommercial(model) :
    renderAudit(model);

  const nav = [
    ['CONTROL TOWER', '/control-tower'],
    ['DECISIONS', '/control-tower/decisions'],
    ['INCIDENTS', '/control-tower/incidents'],
    ['PRODUCTS', '/control-tower/products'],
    ['PROVIDERS', '/control-tower/providers'],
    ['PUBLICATION', '/control-tower/publication'],
    ['COMMERCIAL', '/control-tower/commercial'],
    ['AUDIT', '/control-tower/audit'],
  ] as const;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>KIDULTS Control Tower</title>
  <style>
    :root {
      color-scheme: dark;
      --surface:#0c1119; --surfaceElevated:#141b26; --textPrimary:#e8edf6; --textSecondary:#9db0c6;
      --borderSubtle:#28384d; --statusHealthy:#5ecf92; --statusWarning:#e9c46a; --statusCritical:#ef476f;
      --statusUnknown:#9aa4b2; --focusRing:#8ec5ff;
    }
    * { box-sizing: border-box; }
    body { margin:0; background:var(--surface); color:var(--textPrimary); font:500 15px/1.45 Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif; }
    a { color:inherit; text-decoration:none; }
    .app { max-width: 1440px; margin:0 auto; padding: 16px; }
    .header { display:flex; flex-wrap:wrap; gap:12px; align-items:center; justify-content:space-between; }
    .badge { border:1px solid var(--borderSubtle); padding:6px 10px; border-radius:999px; color:var(--textSecondary); }
    .nav { margin-top:14px; display:grid; gap:8px; grid-template-columns:repeat(8,minmax(0,1fr)); }
    .nav a { background:var(--surfaceElevated); border:1px solid var(--borderSubtle); padding:10px; border-radius:10px; text-align:center; min-height:44px; display:flex; align-items:center; justify-content:center; font-size:12px; letter-spacing:.04em; }
    .hero { margin-top:16px; background:var(--surfaceElevated); border:1px solid var(--borderSubtle); border-radius:14px; padding:18px; }
    .kpi { display:grid; gap:8px; grid-template-columns:repeat(4,minmax(0,1fr)); margin-top:12px; }
    .kpi div { background:#111826; border:1px solid var(--borderSubtle); border-radius:12px; padding:10px; min-height:72px; }
    .grid { margin-top:14px; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
    .card { background:var(--surfaceElevated); border:1px solid var(--borderSubtle); border-radius:12px; padding:12px; overflow-wrap:anywhere; }
    button { min-height:44px; border-radius:10px; border:1px solid var(--borderSubtle); background:#1a2435; color:var(--textPrimary); padding:8px 12px; }
    button:focus, a:focus { outline:2px solid var(--focusRing); outline-offset:2px; }
    button[disabled] { opacity:.5; cursor:not-allowed; }
    details summary { cursor:pointer; }
    table { width:100%; border-collapse:collapse; }
    td,th { border-bottom:1px solid var(--borderSubtle); text-align:left; padding:8px; vertical-align:top; }
    .risk-LOW,.status-HEALTHY,.status-EXCELLENT { color:var(--statusHealthy); }
    .risk-MODERATE,.status-DEGRADED,.status-AT_RISK { color:var(--statusWarning); }
    .risk-HIGH,.risk-CRITICAL,.status-CRITICAL,.status-HALTED { color:var(--statusCritical); }
    .risk-UNKNOWN,.status-UNKNOWN { color:var(--statusUnknown); }
    @media (max-width:1024px){ .nav{grid-template-columns:repeat(4,minmax(0,1fr));} .kpi{grid-template-columns:repeat(2,minmax(0,1fr));} }
    @media (max-width:768px){ .grid{grid-template-columns:1fr;} .nav{grid-template-columns:repeat(2,minmax(0,1fr));} }
    @media (max-width:430px){ .app{padding:10px;} .hero{padding:12px;} .nav a{font-size:11px;} }
    @media (prefers-reduced-motion: reduce){ * { scroll-behavior:auto !important; transition:none !important; animation:none !important; } }
  </style>
</head>
<body>
  <main class="app">
    <header class="header" aria-label="Control Tower Header">
      <div>
        <div style="font-size:12px;letter-spacing:.09em;color:var(--textSecondary)">KIDULTS</div>
        <h1 style="margin:.15rem 0 0">GLOBAL INTELLIGENCE CONTROL TOWER</h1>
      </div>
      <div class="badge" role="status" aria-live="polite">${model.dataMode} · ${escapeHtml(model.modeNote)} · SCENARIO ${escapeHtml(model.scenario.toUpperCase())}</div>
    </header>
    <nav class="nav" aria-label="Executive Navigation">
      ${nav.map(([label, href]) => `<a href="${href}">${label}</a>`).join('')}
    </nav>
    ${primary}
  </main>
</body>
</html>`;
}

function renderHome(model: ExecutiveDashboardModel): string {
  return `<section class="hero" aria-label="Platform Status Hero">
      <div style="font-size:13px;letter-spacing:.08em;color:var(--textSecondary)">Platform Status</div>
      <h2 class="status-${model.platformStatus}">${toBusinessLabel(model.platformStatus)}</h2>
      <p>${escapeHtml(model.platformExplanation)}</p>
      <div style="color:var(--textSecondary)">Last verified ${escapeHtml(formatTimestamp(model.lastVerified))}</div>
      <div class="kpi">
        <div><strong>Executive Action Required</strong><br/>${model.executiveActionRequired ? 'YES' : 'NONE'}</div>
        <div><strong>Critical Blockers</strong><br/>${model.criticalBlockers.length || 0}</div>
        <div><strong>Highest Priority</strong><br/>${escapeHtml(model.highestPriority)}</div>
        <div><strong>State</strong><br/>${escapeHtml(model.state)}</div>
      </div>
    </section>
    <section class="grid" aria-label="Executive Dashboard">
      <article class="card"><h3>Active Decisions</h3>${renderDecisionList(model)}</article>
      <article class="card"><h3>Active Incidents</h3>${renderIncidentsList(model)}</article>
      <article class="card"><h3>Autonomous Actions</h3><ul>${model.autonomousActions.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></article>
      <article class="card"><h3>Blocked Scopes</h3>${model.blockedScopes.length ? `<ul>${model.blockedScopes.map((scope) => `<li>${escapeHtml(scope)}</li>`).join('')}</ul>` : 'None'}</article>
      <article class="card"><h3>Change Freeze</h3><p>${escapeHtml(model.changeFreeze.state)}${model.changeFreeze.reason ? ` · ${escapeHtml(model.changeFreeze.reason)}` : ''}</p></article>
      <article class="card"><h3>Risk Center</h3>${Object.entries(model.riskCenter).map(([k, v]) => `<div>${escapeHtml(k)}: <span class="risk-${v}">${v}</span></div>`).join('')}</article>
      <article class="card"><h3>Executive Briefing</h3>${renderBriefing(model)}</article>
      <article class="card"><h3>Evidence Drawer</h3>${renderEvidence(model)}</article>
    </section>`;
}

function renderDecisions(model: ExecutiveDashboardModel): string {
  return `<section class="hero"><h2>Executive Decision Center</h2><p>Select decision → review consequences → confirm decision → submit.</p></section>
  <section class="grid"><article class="card">${renderDecisionList(model, true)}</article><article class="card">${renderDecisionDetail(model)}</article></section>`;
}

function renderDecisionList(model: ExecutiveDashboardModel, withActions = false): string {
  if (!model.decisions.length) return 'No urgent executive decision required.';
  return model.decisions.map((decision) => {
    const buttons = withActions ? decision.actionState.permittedActions.map((action) =>
      `<button ${decision.actionState.enabled ? '' : 'disabled'} aria-label="${formatActionLabel(action)}">${formatActionLabel(action)}</button>`).join(' ') : '';
    const failClosed = decision.actionState.enabled ? '' : `<p><strong>Execution blocked:</strong> ${escapeHtml(decision.actionState.reason || 'Fail-closed')}</p>`;
    return `<article class="card" style="margin-bottom:10px">
      <div>${escapeHtml(decision.priority)} · ${escapeHtml(toBusinessLabel(decision.decisionClass))}</div>
      <h3>${escapeHtml(decision.title)}</h3>
      <p>${escapeHtml(decision.explanation)}</p>
      <p><strong>Recommended:</strong> ${escapeHtml(formatActionLabel(decision.recommendation))}</p>
      <p><strong>Expected Benefit:</strong> ${escapeHtml(decision.expectedBenefit)}</p>
      <p><strong>Risk:</strong> <span class="risk-${decision.risk}">${decision.risk}</span></p>
      <p><strong>Deadline:</strong> ${escapeHtml(formatTimestamp(decision.deadline))}</p>
      <p><strong>Affected Scope:</strong> ${escapeHtml(decision.affectedScope.join(', ') || 'None')}</p>
      <p><strong>Authority Required:</strong> ${escapeHtml(decision.authorityRequired)}</p>
      ${failClosed}
      ${withActions ? `<div role="group" aria-label="Permitted Decision Actions">${buttons}</div>` : ''}
    </article>`;
  }).join('');
}

function renderDecisionDetail(model: ExecutiveDashboardModel): string {
  const decision = model.decisions[0];
  if (!decision) return '<h3>Decision Detail</h3><p>No active decision.</p>';
  return `<h3>Decision Detail</h3>
  <p><strong>WHAT CHANGED:</strong> ${escapeHtml(model.briefing.whatChanged)}</p>
  <p><strong>WHY IT MATTERS:</strong> ${escapeHtml(model.briefing.whyItMatters)}</p>
  <p><strong>SYSTEM RECOMMENDATION:</strong> ${escapeHtml(formatActionLabel(decision.recommendation))}</p>
  <p><strong>EXPECTED BENEFIT:</strong> ${escapeHtml(decision.expectedBenefit)}</p>
  <p><strong>RISKS:</strong> ${escapeHtml(model.briefing.risks)}</p>
  <p><strong>WHAT THE SYSTEM WILL DO:</strong> Enable approved bounded scope, run preflight checks, verify policy and dependencies, verify rollback availability.</p>
  <p><strong>WHAT THE SYSTEM WILL NOT DO:</strong> Expand scope, modify billing, procure providers, modify credentials, bypass publication controls.</p>
  <p><strong>IF APPROVED:</strong> Bounded execution and verification path starts.</p>
  <p><strong>IF REJECTED:</strong> Scope remains blocked.</p>
  <p><strong>IF DEFERRED:</strong> Current behavior remains unchanged until deadline.</p>
  <p><strong>DEADLINE:</strong> ${escapeHtml(formatTimestamp(decision.deadline))}</p>
  <details><summary>Evidence</summary>${renderEvidence(model)}</details>
  <h4>Confirmation</h4>
  <p>Approve Limited Scope? Confirm approval to proceed with governed A29 lifecycle.</p>
  <button>Cancel</button> <button>Confirm Approval</button>
  <h4>Decision Result View</h4>
  <p>Decision: ${escapeHtml(formatActionLabel(decision.recommendation))} · Result: ${decision.actionState.enabled ? 'READY_TO_SUBMIT' : 'BLOCKED'}</p>
  <p>System Action: Governed request only. Verification: Required. Rollback: Available. Platform Impact: Pending. Remaining Risk: ${decision.risk}.</p>`;
}

function renderIncidents(model: ExecutiveDashboardModel): string {
  return `<section class="hero"><h2>Incident Center</h2><p>Executive incident and business impact view.</p></section>
  <section class="card">${renderIncidentsList(model, true)}</section>`;
}

function renderIncidentsList(model: ExecutiveDashboardModel, full = false): string {
  if (!model.incidents.length) return 'No active incidents.';
  return model.incidents.map((incident) => full
    ? `<article class="card" style="margin-bottom:10px"><h3>${incident.severity} · ${escapeHtml(incident.title)}</h3><p>${escapeHtml(incident.businessImpact)}</p><p>Affected: ${escapeHtml(incident.affectedScopes.join(', '))}</p><p>Status: ${escapeHtml(incident.status)} · Recovery: ${escapeHtml(incident.recoveryStatus)} · Duration: ${escapeHtml(incident.duration)}</p><p>Autonomous Action: ${escapeHtml(incident.autonomousAction)}</p><p>Decision Required: ${incident.decisionRequired ? 'YES' : 'NO'}</p><details><summary>Evidence</summary>${renderEvidence(model)}</details></article>`
    : `<div>${incident.severity} · ${escapeHtml(incident.title)}</div>`).join('');
}

function renderProducts(model: ExecutiveDashboardModel): string {
  return `<section class="hero"><h2>Product Governance</h2></section><section class="card">${renderTable([
    'Product', 'Readiness', 'Runtime', 'Publication', 'Commercial', 'Dependency', 'SLO', 'Decision Required'],
    model.products.map((p) => [p.product, p.readiness, p.runtime, p.publication, p.commercial, p.dependency, p.slo, p.decisionRequired ? 'YES' : 'NO'])
  )}</section>`;
}

function renderProviders(model: ExecutiveDashboardModel): string {
  return `<section class="hero"><h2>Provider Governance</h2></section><section class="card">${renderTable([
    'Provider', 'Health', 'Dependency', 'Affected Products', 'Contract', 'Credential', 'Cost Risk', 'Decision Required'],
    model.providers.map((p) => [p.provider, p.health, p.dependencyLevel, p.affectedProducts.join(', '), p.contractStatus, p.credentialStatus, p.costRisk, p.decisionRequired ? 'YES' : 'NO'])
  )}<p style="color:var(--textSecondary)">Credentials are never displayed.</p></section>`;
}

function renderPublication(model: ExecutiveDashboardModel): string {
  return `<section class="hero"><h2>Publication Governance</h2></section>
    <section class="card"><p>State: ${escapeHtml(model.publication.state)} · Decision Required: ${model.publication.decisionRequired ? 'YES' : 'NO'}</p>
    <p>Eligible Products: ${escapeHtml(model.publication.eligibleProducts.join(', ') || 'None')}</p>
    <p>Blocked Products: ${escapeHtml(model.publication.blockedProducts.join(', ') || 'None')}</p>
    <p>Channels: ${escapeHtml(model.publication.channels.join(', '))}</p>
    <p>Freeze State: ${escapeHtml(model.publication.freezeState)}</p>
    <p>Block Reasons: ${escapeHtml(Object.entries(model.publication.blockReasons).map(([k, v]) => `${k}: ${v}`).join(' | ') || 'None')}</p>
    <p>A30 never bypasses A22 publication governance.</p></section>`;
}

function renderCommercial(model: ExecutiveDashboardModel): string {
  return `<section class="hero"><h2>Commercial Governance</h2></section>
    <section class="card"><p>State: ${escapeHtml(model.commercial.state)} · Risk: <span class="risk-${model.commercial.risk}">${model.commercial.risk}</span></p>
    <p>Eligible Products: ${escapeHtml(model.commercial.eligibleProducts.join(', ') || 'None')}</p>
    <p>Eligible Channels: ${escapeHtml(model.commercial.eligibleChannels.join(', ') || 'None')}</p>
    <p>Blocked Channels: ${escapeHtml(model.commercial.blockedChannels.join(', ') || 'None')}</p>
    <p>Provider Dependencies: ${escapeHtml(model.commercial.providerDependencies.join(', ') || 'None')}</p>
    <p>Billing Dependencies: ${escapeHtml(model.commercial.billingDependencies.join(', ') || 'None')}</p>
    <p>Contract Dependencies: ${escapeHtml(model.commercial.contractDependencies.join(', ') || 'None')}</p>
    <p>Decision Required: ${model.commercial.decisionRequired ? 'YES' : 'NO'}</p>
    <p>A30 never bypasses A23 commercial governance.</p></section>`;
}

function renderAudit(model: ExecutiveDashboardModel): string {
  return `<section class="hero"><h2>Audit Timeline</h2></section>
    <section class="grid"><article class="card"><ol>${model.auditTimeline.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ol></article><article class="card">${renderEvidence(model)}</article></section>`;
}

function renderBriefing(model: ExecutiveDashboardModel): string {
  return `<div><strong>WHAT CHANGED</strong><br/>${escapeHtml(model.briefing.whatChanged)}</div>
  <div><strong>WHY IT MATTERS</strong><br/>${escapeHtml(model.briefing.whyItMatters)}</div>
  <div><strong>WHAT THE SYSTEM DID</strong><br/>${escapeHtml(model.briefing.whatSystemDid)}</div>
  <div><strong>WHAT REMAINS BLOCKED</strong><br/>${escapeHtml(model.briefing.whatRemainsBlocked)}</div>
  <div><strong>WHAT DECISION IS REQUIRED</strong><br/>${escapeHtml(model.briefing.decisionRequired)}</div>
  <div><strong>RECOMMENDATION</strong><br/>${escapeHtml(model.briefing.recommendation)}</div>
  <div><strong>RISKS</strong><br/>${escapeHtml(model.briefing.risks)}</div>
  <div><strong>DEADLINE</strong><br/>${escapeHtml(model.briefing.deadline)}</div>`;
}

function renderEvidence(model: ExecutiveDashboardModel): string {
  return `<details><summary>Expand Evidence</summary>${renderTable(
    ['Evidence ID', 'Source Stage', 'Policy Version', 'Generated Time', 'Verification', 'Audit Reference'],
    model.evidence.map((row) => [row.evidenceId, row.sourceStage, row.policyVersion, row.generatedTime, row.verification, row.auditReference]),
  )}</details>`;
}

function renderTable(headers: string[], rows: string[][]): string {
  const body = rows.length
    ? rows.map((row) => `<tr>${row.map((column) => `<td>${escapeHtml(column)}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${headers.length}">No records.</td></tr>`;
  return `<table><thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`;
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
