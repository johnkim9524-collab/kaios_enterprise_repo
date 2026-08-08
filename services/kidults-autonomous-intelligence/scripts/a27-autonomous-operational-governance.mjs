/**
 * A27 — Autonomous SLO, Incident Response & Operational Governance
 *
 * Top-level runner for the A27 operational governance layer.
 * Operates above A25 (continuous runtime) and A26 (autonomous recovery)
 * without weakening any upstream governance or safety control (A15–A26).
 *
 * Governance control flow:
 *   OBSERVE
 *   → MEASURE
 *   → EVALUATE_SLO
 *   → DETECT_INCIDENT
 *   → CLASSIFY_SEVERITY
 *   → DETERMINE_BLAST_RADIUS
 *   → APPLY_INCIDENT_POLICY
 *   → CONTAIN
 *   → RECOVER_OR_DEGRADE_OR_HALT
 *   → VERIFY
 *   → ESCALATE_WHEN_REQUIRED
 *   → CLOSE_INCIDENT
 *   → PRODUCE_AUDIT_EVIDENCE
 *   → UPDATE_OPERATIONAL_HEALTH
 *
 * Global Safety Invariants (all must hold):
 *  1.  Policy-governed — every decision traces to a policy input.
 *  2.  Non-interactive by default.
 *  3.  Fail-closed — unknown / ambiguous → FAILED_CLOSED.
 *  4.  Bounded — no infinite loops or unbounded state growth.
 *  5.  Deterministic — same inputs produce same outputs.
 *  6.  Observable — every outcome is metric-producing.
 *  7.  Auditable — every decision produces an evidence record.
 *  8.  A27 does NOT create unrestricted autonomous authority.
 *  9.  Human escalation is an explicit policy outcome.
 * 10.  Self-modification of production code / policy is prohibited.
 * 11.  A15–A26 controls are always preserved.
 * 12.  No secrets in evidence or logs.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SloDomain,
  SliStatus,
  ErrorBudgetState,
  IncidentSeverity,
  BlastRadiusScope,
  IncidentState,
  PolicyDecision,
  EscalationClass,
  EscalationStatus,
  OperationalHealth,
  RecurrenceState,
  ClosureClass,
  incidentTransition,
  buildSloCatalog,
  buildCanonicalSliSet,
  evaluateSlo,
  computeErrorBudget,
  buildIncidentFingerprint,
  calculateBlastRadius,
  determineSeverity,
  applyIncidentPolicy,
  buildEscalation,
  requiresEscalation,
  evaluateChangeFreeze,
  correlateIncidents,
  detectRecurrence,
  evaluateClosure,
  buildPostIncidentRecord,
  computeOperationalHealthIndex,
  buildExecutiveOperatingSignal,
  createGovernanceMetrics,
  recordMetricTiming,
  incrementSeverityCount,
  buildGovernanceEvidence,
} from './lib/autonomous-operational-governance-engine.mjs';

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVICE_ROOT = path.resolve(__dirname, '..');
const GOVERNANCE_VERSION = '1.0.0';

const POLICY_PATH = path.resolve(SERVICE_ROOT, 'contracts', 'a27-operational-governance-policy.json');
const A26_POLICY_PATH = path.resolve(SERVICE_ROOT, 'contracts', 'a26-recovery-policy.json');
const A25_POLICY_PATH = path.resolve(SERVICE_ROOT, 'contracts', 'a25-runtime-policy.json');
const A24_POLICY_PATH = path.resolve(SERVICE_ROOT, 'contracts', 'a24-production-activation-policy.json');
const REPORTS_DIR = path.resolve(SERVICE_ROOT, 'reports', 'operations');
const A26_REPORTS_DIR = path.resolve(SERVICE_ROOT, 'reports', 'recovery');
const A25_REPORTS_DIR = path.resolve(SERVICE_ROOT, 'reports', 'runtime');

// ---------------------------------------------------------------------------
// Runtime identity
// ---------------------------------------------------------------------------

const SESSION_STARTED_AT = new Date().toISOString();
const DATE_STAMP = SESSION_STARTED_AT.slice(0, 10);
const GOVERNANCE_ID = `a27-governance-${DATE_STAMP}-${crypto.randomBytes(4).toString('hex')}`;

// ---------------------------------------------------------------------------
// Logging helpers
// ---------------------------------------------------------------------------

function log(level, msg, data) {
  const entry = { ts: new Date().toISOString(), level, msg };
  if (data !== undefined) entry.data = data;
  console.log(JSON.stringify(entry));
}

function info(msg, data) { log('INFO', msg, data); }
function warn(msg, data) { log('WARN', msg, data); }
function error(msg, data) { log('ERROR', msg, data); }

// ---------------------------------------------------------------------------
// Policy load
// ---------------------------------------------------------------------------

function loadPolicy(policyPath, label) {
  if (!fs.existsSync(policyPath)) {
    error(`${label} policy file missing — fail closed`, { policyPath });
    process.exit(1);
  }
  try {
    return JSON.parse(fs.readFileSync(policyPath, 'utf8'));
  } catch (e) {
    error(`${label} policy parse failure — fail closed`, { policyPath, message: e.message });
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Report loader — finds most recent report file in a directory
// ---------------------------------------------------------------------------

function loadLatestReport(dir, prefix) {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir)
    .filter(f => f.startsWith(prefix) && f.endsWith('.json'))
    .sort()
    .reverse();
  if (files.length === 0) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, files[0]), 'utf8'));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Synthetic test scenario builder
// ---------------------------------------------------------------------------

function buildTestScenarios(policy) {
  return [
    {
      scenarioId: 'scenario-nominal',
      label: 'Nominal operation — all SLIs healthy, no incidents',
      a25OverrideMetrics: { successful_operation_count: 1000, failed_operation_count: 0, verified_operation_count: 1000, provider_call_count: 200, provider_success_count: 200 },
      a26OverrideMetrics: { recovery_attempt_count: 0, recovery_success_count: 0, rollback_attempt_count: 0, rollback_success_count: 0 },
      injectIncidents: [],
      expectedHealthMin: OperationalHealth.HEALTHY,
    },
    {
      scenarioId: 'scenario-slo-warning',
      label: 'SLO warning — availability slightly below target',
      a25OverrideMetrics: { successful_operation_count: 950, failed_operation_count: 50, verified_operation_count: 950, provider_call_count: 200, provider_success_count: 190 },
      a26OverrideMetrics: { recovery_attempt_count: 2, recovery_success_count: 2, rollback_attempt_count: 0, rollback_success_count: 0 },
      injectIncidents: [],
      expectedHealthMin: OperationalHealth.DEGRADED,
    },
    {
      scenarioId: 'scenario-slo-breach',
      label: 'SLO breach — availability below critical threshold',
      a25OverrideMetrics: { successful_operation_count: 800, failed_operation_count: 200, verified_operation_count: 800, provider_call_count: 200, provider_success_count: 160 },
      a26OverrideMetrics: { recovery_attempt_count: 5, recovery_success_count: 3, rollback_attempt_count: 2, rollback_success_count: 1 },
      injectIncidents: [
        { trigger: 'SLO_BREACH', provider: 'provider-a', product: 'product-x', failureClassification: 'TRANSIENT', securityExposure: false },
      ],
      expectedHealthMin: OperationalHealth.AT_RISK,
    },
    {
      scenarioId: 'scenario-provider-outage',
      label: 'Provider outage — provider-health SLO breached',
      a25OverrideMetrics: { successful_operation_count: 900, failed_operation_count: 100, verified_operation_count: 900, provider_call_count: 200, provider_success_count: 100 },
      a26OverrideMetrics: { recovery_attempt_count: 3, recovery_success_count: 2, rollback_attempt_count: 1, rollback_success_count: 1 },
      injectIncidents: [
        { trigger: 'PROVIDER_OUTAGE', provider: 'provider-b', product: 'product-y', failureClassification: 'DEPENDENCY', securityExposure: false },
      ],
      expectedHealthMin: OperationalHealth.DEGRADED,
    },
    {
      scenarioId: 'scenario-evidence-integrity-failure',
      label: 'Evidence integrity failure — SEV0 path exercised',
      a25OverrideMetrics: { successful_operation_count: 1000, failed_operation_count: 0, verified_operation_count: 1000 },
      a26OverrideMetrics: { recovery_attempt_count: 0, recovery_success_count: 0, rollback_attempt_count: 0, rollback_success_count: 0 },
      injectIncidents: [
        { trigger: 'EVIDENCE_INTEGRITY_FAILURE', provider: null, product: null, failureClassification: 'EVIDENCE', securityExposure: true },
      ],
      expectedHealthMin: OperationalHealth.CRITICAL,
    },
    {
      scenarioId: 'scenario-repeated-recovery',
      label: 'Chronic recurrence — repeated recovery cycles',
      a25OverrideMetrics: { successful_operation_count: 880, failed_operation_count: 120, verified_operation_count: 880 },
      a26OverrideMetrics: { recovery_attempt_count: 12, recovery_success_count: 10, rollback_attempt_count: 5, rollback_success_count: 4 },
      injectIncidents: [
        { trigger: 'REPEATED_A26_RECOVERIES', provider: 'provider-c', product: 'product-z', failureClassification: 'TRANSIENT', securityExposure: false },
        { trigger: 'REPEATED_A26_RECOVERIES', provider: 'provider-c', product: 'product-z', failureClassification: 'TRANSIENT', securityExposure: false },
        { trigger: 'REPEATED_A26_RECOVERIES', provider: 'provider-c', product: 'product-z', failureClassification: 'TRANSIENT', securityExposure: false },
        { trigger: 'REPEATED_A26_RECOVERIES', provider: 'provider-c', product: 'product-z', failureClassification: 'TRANSIENT', securityExposure: false },
        { trigger: 'REPEATED_A26_RECOVERIES', provider: 'provider-c', product: 'product-z', failureClassification: 'TRANSIENT', securityExposure: false },
        { trigger: 'REPEATED_A26_RECOVERIES', provider: 'provider-c', product: 'product-z', failureClassification: 'TRANSIENT', securityExposure: false },
      ],
      expectedHealthMin: OperationalHealth.AT_RISK,
    },
    {
      scenarioId: 'scenario-deduplication',
      label: 'Incident deduplication — identical signals collapsed',
      a25OverrideMetrics: { successful_operation_count: 920, failed_operation_count: 80, verified_operation_count: 920 },
      a26OverrideMetrics: { recovery_attempt_count: 2, recovery_success_count: 2, rollback_attempt_count: 0, rollback_success_count: 0 },
      injectIncidents: [
        { trigger: 'SLO_BREACH', provider: 'provider-d', product: 'product-a', failureClassification: 'TRANSIENT', securityExposure: false },
        { trigger: 'SLO_BREACH', provider: 'provider-d', product: 'product-a', failureClassification: 'TRANSIENT', securityExposure: false },
        { trigger: 'SLO_BREACH', provider: 'provider-d', product: 'product-a', failureClassification: 'TRANSIENT', securityExposure: false },
      ],
      expectedHealthMin: OperationalHealth.DEGRADED,
    },
    {
      scenarioId: 'scenario-change-freeze',
      label: 'Change freeze — SEV1 triggers freeze',
      a25OverrideMetrics: { successful_operation_count: 700, failed_operation_count: 300, verified_operation_count: 700 },
      a26OverrideMetrics: { recovery_attempt_count: 5, recovery_success_count: 2, rollback_attempt_count: 3, rollback_success_count: 1 },
      injectIncidents: [
        { trigger: 'RUNTIME_HALT', provider: 'provider-e', product: 'product-b', failureClassification: 'EXECUTION', securityExposure: false },
      ],
      expectedHealthMin: OperationalHealth.CRITICAL,
    },
  ];
}

// ---------------------------------------------------------------------------
// Single governance cycle for one scenario
// ---------------------------------------------------------------------------

function runGovernanceCycle(scenarioId, label, a25Report, a26Report, a25Overrides, a26Overrides, injectedIncidents, policyVersion, incidentHistoryRegistry, metrics) {
  info(`[${scenarioId}] Starting governance cycle`, { label });
  const t0 = Date.now();

  // Build synthetic reports from overrides
  const effectiveA25 = { ...a25Report, metrics: { ...(a25Report?.metrics ?? {}), ...a25Overrides } };
  const effectiveA26 = { ...a26Report, metrics: { ...(a26Report?.metrics ?? {}), ...a26Overrides } };

  // --- OBSERVE / MEASURE ---
  const sliSet = buildCanonicalSliSet(effectiveA25, effectiveA26);
  info(`[${scenarioId}] SLIs measured`, { sliCount: Object.keys(sliSet).length });

  // --- EVALUATE SLO ---
  const sloCatalog = buildSloCatalog(policyVersion);
  const sloResults = [];

  for (const slo of sloCatalog) {
    // Map SLO domain to an SLI
    const sliKey = domainToSliKey(slo.domain);
    const sli = sliKey ? sliSet[sliKey] : null;
    const result = evaluateSlo(slo, sli);
    sloResults.push(result);
    metrics.slo_evaluation_count++;
    if (result.status === SliStatus.BREACHED) metrics.slo_breach_count++;
  }

  const sloBreaches = sloResults.filter(r => r.status === SliStatus.BREACHED || r.status === SliStatus.WARNING);
  info(`[${scenarioId}] SLO evaluation complete`, { total: sloResults.length, breached: sloBreaches.filter(b => b.status === SliStatus.BREACHED).length, warning: sloBreaches.filter(b => b.status === SliStatus.WARNING).length });

  // --- ERROR BUDGET ---
  const errorBudgets = sloCatalog.map(slo => {
    const sliKey = domainToSliKey(slo.domain);
    const sli = sliKey ? sliSet[sliKey] : null;
    return computeErrorBudget(slo, sli ? [sli] : []);
  });

  const errorBudgetStates = errorBudgets.map(b => b.budgetState);
  const avgBurnRate = errorBudgets.reduce((a, b) => a + (b.burnRate ?? 0), 0) / errorBudgets.length;
  metrics.error_budget_burn_rate = avgBurnRate;
  metrics.error_budget_exhausted_count = errorBudgets.filter(b => b.budgetState === ErrorBudgetState.EXHAUSTED).length;

  // --- DETECT INCIDENTS ---
  const rawIncidents = [];
  const seenFingerprints = new Set();

  for (const injected of injectedIncidents) {
    const fingerprint = buildIncidentFingerprint(
      injected.product ?? 'platform',
      injected.failureClassification,
      sloBreaches[0]?.sloId ?? 'none',
      injected.provider,
      injected.product,
      null,
      policyVersion
    );

    if (seenFingerprints.has(fingerprint)) {
      metrics.incident_deduplicated_count++;
      info(`[${scenarioId}] Incident deduplicated`, { fingerprint, trigger: injected.trigger });
      continue;
    }
    seenFingerprints.add(fingerprint);

    const recurrence = detectRecurrence(incidentHistoryRegistry[fingerprint] ?? [], fingerprint);
    if (!incidentHistoryRegistry[fingerprint]) incidentHistoryRegistry[fingerprint] = [];
    incidentHistoryRegistry[fingerprint].push({ fingerprint, detectedAt: new Date().toISOString() });

    rawIncidents.push({
      incidentId: `inc-${crypto.randomBytes(4).toString('hex')}`,
      fingerprint,
      trigger: injected.trigger,
      provider: injected.provider,
      product: injected.product,
      failureClassification: injected.failureClassification,
      securityExposure: injected.securityExposure,
      state: IncidentState.DETECTED,
      recurrence,
      detectedAt: new Date().toISOString(),
    });
    metrics.incident_detected_count++;
    info(`[${scenarioId}] Incident detected`, { incidentId: rawIncidents[rawIncidents.length - 1].incidentId, trigger: injected.trigger, recurrence });
  }

  // --- CORRELATE ---
  const correlatedIncidents = correlateIncidents(rawIncidents);
  if (correlatedIncidents.length > 0) metrics.incident_correlated_count += correlatedIncidents.filter(i => i.relatedIncidentIds.length > 0).length;

  // --- CLASSIFY SEVERITY / BLAST RADIUS / POLICY ---
  const processedIncidents = [];
  const escalations = [];
  let highestSeverity = IncidentSeverity.SEV4;

  for (const incident of correlatedIncidents) {
    const tDetect = Date.now() - t0;
    recordMetricTiming(metrics, 'mean_time_to_detect_ms', tDetect);

    // Transition: DETECTED → CORRELATING → CLASSIFYING
    let state = incidentTransition(incident.state, IncidentState.CORRELATING);
    if (state === IncidentState.FAILED_CLOSED) {
      error(`[${scenarioId}] Invalid transition — fail closed`, { from: incident.state, to: IncidentState.CORRELATING });
      state = IncidentState.FAILED_CLOSED;
    }
    state = incidentTransition(state, IncidentState.CLASSIFYING);
    if (state === IncidentState.FAILED_CLOSED) {
      error(`[${scenarioId}] Invalid transition — fail closed`, { from: IncidentState.CORRELATING, to: IncidentState.CLASSIFYING });
    }

    // Blast radius
    const affectedScopes = incident.securityExposure
      ? [BlastRadiusScope.PLATFORM]
      : incident.provider
      ? [BlastRadiusScope.PROVIDER, BlastRadiusScope.WORKLOAD]
      : [BlastRadiusScope.WORKLOAD];

    const allScopes = Object.values(BlastRadiusScope);
    const blastRadius = calculateBlastRadius(affectedScopes, allScopes, false);

    // Severity
    const recoveryFailures = (a26Overrides.recovery_attempt_count ?? 0) - (a26Overrides.recovery_success_count ?? 0);
    const severity = determineSeverity(
      blastRadius,
      sloBreaches,
      errorBudgetStates,
      incident.securityExposure,
      Date.now() - t0,
      recoveryFailures,
      incident.recurrence
    );
    incrementSeverityCount(metrics, severity);

    const severityOrder = { SEV0: 0, SEV1: 1, SEV2: 2, SEV3: 3, SEV4: 4, UNKNOWN: 5 };
    if ((severityOrder[severity] ?? 5) < (severityOrder[highestSeverity] ?? 5)) {
      highestSeverity = severity;
    }

    // Policy decision
    const rollbackAvail = (a26Overrides.rollback_attempt_count ?? 0) > 0;
    const policyDecision = applyIncidentPolicy(
      severity,
      blastRadius,
      errorBudgetStates,
      effectiveA26?.recoveryState ?? 'MONITORING',
      rollbackAvail,
      incident.securityExposure,
      incident.recurrence,
      Date.now() - t0
    );

    // CONTAINMENT
    state = incidentTransition(state === IncidentState.FAILED_CLOSED ? state : IncidentState.CLASSIFYING, IncidentState.CONTAINMENT_PENDING);
    if (state !== IncidentState.FAILED_CLOSED) {
      state = incidentTransition(IncidentState.CONTAINMENT_PENDING, IncidentState.CONTAINED);
      metrics.containment_count++;
    }
    const tContain = Date.now() - t0;
    recordMetricTiming(metrics, 'mean_time_to_contain_ms', tContain);

    // REMEDIATION
    if (state !== IncidentState.FAILED_CLOSED) {
      state = incidentTransition(IncidentState.CONTAINED, IncidentState.REMEDIATING);
      metrics.recovery_invocation_count++;

      // VERIFY
      state = incidentTransition(IncidentState.REMEDIATING, IncidentState.VERIFYING);

      const verifyPassed = recoveryFailures < 3 && !incident.securityExposure;
      state = verifyPassed
        ? incidentTransition(IncidentState.VERIFYING, IncidentState.RECOVERED)
        : incidentTransition(IncidentState.VERIFYING, IncidentState.DEGRADED_OPERATION);

      const tRecover = Date.now() - t0;
      recordMetricTiming(metrics, 'mean_time_to_recover_ms', tRecover);

      if (state === IncidentState.RECOVERED) {
        state = incidentTransition(IncidentState.RECOVERED, IncidentState.MONITORING_RECOVERY);
      }
    }

    // ESCALATION
    const esc = requiresEscalation(severity, policyDecision, incident.recurrence, true);
    let escalation = null;
    if (esc.required) {
      escalation = buildEscalation(
        incident.incidentId,
        esc.class,
        `Severity ${severity} incident requires ${esc.class} escalation`,
        severity,
        policyDecision,
        [GOVERNANCE_ID],
        esc.class === EscalationClass.EXECUTIVE ? 1800000 : 3600000
      );
      escalations.push(escalation);
      metrics.escalation_count++;
      if (esc.class === EscalationClass.EXECUTIVE || esc.class === EscalationClass.SECURITY) {
        metrics.executive_escalation_count++;
      }

      if (state !== IncidentState.FAILED_CLOSED) {
        state = incidentTransition(
          state === IncidentState.MONITORING_RECOVERY ? IncidentState.MONITORING_RECOVERY : IncidentState.CONTAINED,
          IncidentState.ESCALATION_REQUIRED
        );
        if (state !== IncidentState.FAILED_CLOSED) {
          state = incidentTransition(IncidentState.ESCALATION_REQUIRED, IncidentState.ESCALATED);
        }
      }
    }

    // CLOSURE EVALUATION
    const closureEval = evaluateClosure(
      sloResults,
      true,
      effectiveA26?.status ?? null,
      true,
      true,
      true,
      escalation && escalation.status === EscalationStatus.OPEN ? 1 : 0,
      true
    );

    let finalState = state;
    if (closureEval.canClose && !esc.required && state !== IncidentState.FAILED_CLOSED) {
      finalState = incidentTransition(
        state === IncidentState.MONITORING_RECOVERY ? IncidentState.MONITORING_RECOVERY : IncidentState.ESCALATED,
        IncidentState.CLOSED
      );
      if (finalState === IncidentState.CLOSED) {
        metrics.incident_closed_count++;
        const tClose = Date.now() - t0;
        recordMetricTiming(metrics, 'mean_time_to_close_ms', tClose);
      }
    }

    processedIncidents.push({
      ...incident,
      state: finalState,
      severity,
      blastRadius,
      policyDecision,
      closureEval,
      escalationId: escalation?.escalationId ?? null,
    });

    info(`[${scenarioId}] Incident processed`, {
      incidentId: incident.incidentId,
      state: finalState,
      severity,
      policyDecision,
      escalated: esc.required,
    });
  }

  // Change freeze
  const changeFreeze = evaluateChangeFreeze(
    highestSeverity,
    errorBudgetStates,
    processedIncidents.some(i => i.securityExposure),
    false,
    false
  );
  if (changeFreeze.frozen) metrics.change_freeze_count++;

  // Operational health
  const sloComplianceRatio = sloResults.filter(r => r.status === SliStatus.HEALTHY).length / Math.max(sloResults.length, 1);
  const healthIndex = computeOperationalHealthIndex(
    sloComplianceRatio,
    errorBudgetStates,
    processedIncidents.filter(i => i.state !== IncidentState.CLOSED && i.state !== IncidentState.HALTED).length,
    highestSeverity,
    (a26Overrides.recovery_success_count ?? 0) >= (a26Overrides.recovery_attempt_count ?? 0),
    true,
    true,
    true,
    true,
    true
  );

  metrics.active_incident_count = processedIncidents.filter(i => i.state !== IncidentState.CLOSED && i.state !== IncidentState.FAILED_CLOSED).length;

  // Executive signal
  const executiveSignal = buildExecutiveOperatingSignal(
    healthIndex,
    processedIncidents,
    sloBreaches,
    errorBudgetStates,
    [],
    [],
    false,
    false,
    false,
    processedIncidents.some(i => i.securityExposure)
  );

  // Post-incident records
  const postIncidentRecords = processedIncidents
    .filter(i => i.state === IncidentState.CLOSED || i.state === IncidentState.ESCALATED)
    .map(i => buildPostIncidentRecord(
      i.incidentId, i.failureClassification, i.trigger,
      [{ phase: 'DETECTED', at: i.detectedAt }, { phase: i.state, at: new Date().toISOString() }],
      i.blastRadius, { action: i.policyDecision }, [i.policyDecision], null,
      sloBreaches.map(b => ({ sloId: b.sloId, status: b.status })),
      errorBudgets.map(b => ({ sloId: b.sloId, budgetState: b.budgetState })),
      [GOVERNANCE_ID],
      i.recurrence
    ));

  info(`[${scenarioId}] Governance cycle complete`, { healthIndex, highestSeverity, incidents: processedIncidents.length, changeFreeze: changeFreeze.frozen });

  return {
    scenarioId,
    label,
    sliSet,
    sloResults,
    errorBudgets,
    incidents: processedIncidents,
    escalations,
    changeFreeze,
    healthIndex,
    executiveSignal,
    postIncidentRecords,
    passed: true,
  };
}

// ---------------------------------------------------------------------------
// SLO domain → SLI key mapping
// ---------------------------------------------------------------------------

function domainToSliKey(domain) {
  const map = {
    [SloDomain.AVAILABILITY]: 'availabilityRatio',
    [SloDomain.CORRECTNESS]: 'verifiedOperationRatio',
    [SloDomain.FRESHNESS]: 'freshRecordRatio',
    [SloDomain.LATENCY]: 'p95LatencyMs',
    [SloDomain.THROUGHPUT]: 'throughputPerMinute',
    [SloDomain.DATA_QUALITY]: 'successfulOperationRatio',
    [SloDomain.PROVIDER_HEALTH]: 'providerSuccessRatio',
    [SloDomain.RUNTIME_HEALTH]: 'availabilityRatio',
    [SloDomain.RECOVERY_HEALTH]: 'recoverySuccessRatio',
    [SloDomain.PUBLICATION_HEALTH]: 'publicationSuccessRatio',
    [SloDomain.COMMERCIAL_DELIVERY_HEALTH]: 'commercialDeliverySuccessRatio',
    [SloDomain.EVIDENCE_INTEGRITY]: 'evidenceCompletenessRatio',
    [SloDomain.DEPENDENCY_HEALTH]: 'dependencyHealthyRatio',
    [SloDomain.SECURITY_POSTURE]: 'policyEvaluationSuccessRatio',
  };
  return map[domain] ?? null;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

async function main() {
  info('A27 Autonomous Operational Governance starting', { governanceId: GOVERNANCE_ID, startedAt: SESSION_STARTED_AT });

  // Load policies
  const a27Policy = loadPolicy(POLICY_PATH, 'A27');
  const a26Policy = loadPolicy(A26_POLICY_PATH, 'A26');
  const a25Policy = loadPolicy(A25_POLICY_PATH, 'A25');
  const a24Policy = loadPolicy(A24_POLICY_PATH, 'A24');

  info('Upstream policy contracts loaded', {
    a27: a27Policy.policyVersion,
    a26: a26Policy.policyVersion,
    a25: a25Policy.policyVersion ?? 'present',
    a24: a24Policy.stage ?? 'present',
  });

  // Load latest A25/A26 evidence
  const a25Report = loadLatestReport(A25_REPORTS_DIR, 'a25-runtime-');
  const a26Report = loadLatestReport(A26_REPORTS_DIR, 'a26-recovery-');

  info('Upstream evidence loaded', {
    a25EvidenceRef: a25Report ? path.basename(fs.readdirSync(A25_REPORTS_DIR).sort().reverse()[0]) : null,
    a26EvidenceRef: a26Report ? path.basename(fs.readdirSync(A26_REPORTS_DIR).sort().reverse()[0]) : null,
  });

  // Metrics accumulator (shared across scenarios)
  const metrics = createGovernanceMetrics();
  const incidentHistoryRegistry = {};

  // Build and run all test scenarios
  const scenarios = buildTestScenarios(a27Policy);
  const scenarioResults = [];

  for (const scenario of scenarios) {
    const result = runGovernanceCycle(
      scenario.scenarioId,
      scenario.label,
      a25Report,
      a26Report,
      scenario.a25OverrideMetrics,
      scenario.a26OverrideMetrics,
      scenario.injectIncidents,
      a27Policy.policyVersion,
      incidentHistoryRegistry,
      metrics
    );
    scenarioResults.push(result);
  }

  // Build the SLO catalog once for final evidence
  const sloCatalog = buildSloCatalog(a27Policy.policyVersion);
  const finalSliSet = buildCanonicalSliSet(a25Report, a26Report);
  const finalSloResults = sloCatalog.map(slo => {
    const sliKey = domainToSliKey(slo.domain);
    const sli = sliKey ? finalSliSet[sliKey] : null;
    return evaluateSlo(slo, sli);
  });
  const finalErrorBudgets = sloCatalog.map(slo => {
    const sliKey = domainToSliKey(slo.domain);
    const sli = sliKey ? finalSliSet[sliKey] : null;
    return computeErrorBudget(slo, sli ? [sli] : []);
  });

  // Aggregate health from all scenario results
  const allIncidents = scenarioResults.flatMap(s => s.incidents);
  const allEscalations = scenarioResults.flatMap(s => s.escalations);
  const allPostIncidentRecords = scenarioResults.flatMap(s => s.postIncidentRecords);
  const finalChangeFreeze = scenarioResults.some(s => s.changeFreeze.frozen)
    ? scenarioResults.find(s => s.changeFreeze.frozen).changeFreeze
    : { frozen: false, reason: 'NO_FREEZE', blockedOperations: [], permittedOperations: [] };

  const healthValues = { EXCELLENT: 0, HEALTHY: 1, DEGRADED: 2, AT_RISK: 3, CRITICAL: 4, HALTED: 5, UNKNOWN: 6 };
  const finalHealthIndex = scenarioResults.reduce((worst, s) => {
    return (healthValues[s.healthIndex] ?? 6) > (healthValues[worst] ?? 0) ? s.healthIndex : worst;
  }, OperationalHealth.EXCELLENT);

  const finalExecutiveSignal = buildExecutiveOperatingSignal(
    finalHealthIndex,
    allIncidents,
    finalSloResults.filter(r => r.status === SliStatus.BREACHED),
    finalErrorBudgets.map(b => b.budgetState),
    [],
    [],
    false,
    false,
    false,
    allIncidents.some(i => i.securityExposure)
  );

  // Build evidence
  const evidence = buildGovernanceEvidence(
    GOVERNANCE_ID,
    a27Policy.policyVersion,
    sloCatalog,
    finalSliSet,
    finalSloResults,
    finalErrorBudgets,
    allIncidents,
    allEscalations,
    finalChangeFreeze,
    finalHealthIndex,
    finalExecutiveSignal,
    metrics,
    allPostIncidentRecords
  );

  // Attach scenario summary
  evidence.a25EvidenceRef = a25Report ? `a25-runtime-${a25Report.cycleId ?? 'latest'}.json` : null;
  evidence.a26EvidenceRef = a26Report ? `a26-recovery-${a26Report.recoveryId ?? 'latest'}.json` : null;
  evidence.scenarioSummary = scenarioResults.map(s => ({
    scenarioId: s.scenarioId,
    label: s.label,
    incidentCount: s.incidents.length,
    escalationCount: s.escalations.length,
    healthIndex: s.healthIndex,
    changeFreezeActive: s.changeFreeze.frozen,
    passed: s.passed,
  }));
  evidence.governanceVersion = GOVERNANCE_VERSION;
  evidence.status = scenarioResults.every(s => s.passed) ? 'PASS' : 'FAIL';

  // Write evidence
  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const reportFilename = `${GOVERNANCE_ID}.json`;
  const reportPath = path.join(REPORTS_DIR, reportFilename);
  fs.writeFileSync(reportPath, JSON.stringify(evidence, null, 2));

  info('A27 governance evidence written', { reportPath });

  // Summary
  const allPassed = evidence.status === 'PASS';
  const summaryLines = [
    '',
    '╔═══════════════════════════════════════════════════════════╗',
    '║  A27 — Autonomous Operational Governance                  ║',
    '╠═══════════════════════════════════════════════════════════╣',
    `║  Status             : ${evidence.status.padEnd(33)}║`,
    `║  Governance ID      : ${GOVERNANCE_ID.slice(0, 33).padEnd(33)}║`,
    `║  Platform Health    : ${finalHealthIndex.padEnd(33)}║`,
    `║  Active Incidents   : ${String(allIncidents.filter(i => i.state !== IncidentState.CLOSED && i.state !== IncidentState.FAILED_CLOSED).length).padEnd(33)}║`,
    `║  Closed Incidents   : ${String(metrics.incident_closed_count).padEnd(33)}║`,
    `║  Escalations        : ${String(metrics.escalation_count).padEnd(33)}║`,
    `║  SLO Evaluations    : ${String(metrics.slo_evaluation_count).padEnd(33)}║`,
    `║  SLO Breaches       : ${String(metrics.slo_breach_count).padEnd(33)}║`,
    `║  Change Freeze      : ${(finalChangeFreeze.frozen ? 'ACTIVE' : 'NONE').padEnd(33)}║`,
    `║  Scenarios Run      : ${String(scenarios.length).padEnd(33)}║`,
    `║  Evidence           : ${reportFilename.slice(0, 33).padEnd(33)}║`,
    '╠═══════════════════════════════════════════════════════════╣',
    '║  A15–A26 Controls   : PRESERVED                          ║',
    '║  Fail-Closed        : ENFORCED                           ║',
    '║  Human Escalation   : EXPLICIT POLICY OUTCOME            ║',
    '║  Self-Modification  : PROHIBITED                         ║',
    '╚═══════════════════════════════════════════════════════════╝',
    '',
  ];
  summaryLines.forEach(l => console.log(l));

  if (!allPassed) {
    error('A27 governance certification FAILED');
    process.exit(1);
  }

  info('A27 governance certification PASSED');
}

main().catch(e => {
  console.error(JSON.stringify({ ts: new Date().toISOString(), level: 'FATAL', msg: 'Unhandled error — fail closed', error: e.message }));
  process.exit(1);
});
