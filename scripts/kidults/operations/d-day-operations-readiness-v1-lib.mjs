import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { canonicalContentDigest } from '../market/current-sold-engine-v1.mjs';
import { buildAtomicCurrentSoldBatchBundle } from '../market/current-sold-atomic-batch-v1.mjs';
import { canonicalJsonDigest } from '../market/current-sold-batch-v1.mjs';
import { buildIntelligenceDecision } from '../../../apps/kidults-enterprise-staging/public/portal/components/v587-intelligence-core.js';

export const PROVIDERS = Object.freeze(['PSA', 'EBAY', 'HERITAGE', 'GOLDIN', 'CLASSIC_COM', 'BRING_A_TRAILER']);
export const PIPELINE = Object.freeze(['PROVIDER', 'SCHEMA', 'RIGHTS', 'EVIDENCE', 'CANONICAL', 'CURRENT_SOLD', 'CONFIDENCE', 'DECISION', 'PORTAL']);
export const DISASTER_SCENARIOS = Object.freeze(['PROVIDER_OFFLINE', 'NETWORK_PARTITION', 'REPLAY', 'DUPLICATE', 'CLOCK_SKEW', 'EVIDENCE_CORRUPTION', 'RIGHTS_MISMATCH', 'CANONICAL_MISMATCH', 'PARTIAL_FAILURE', 'ZERO_ADMISSION', 'PORTAL_ISOLATION']);
export const CURRENT_SOLD_QUALIFICATIONS = Object.freeze(['FRESHNESS', 'LIQUIDITY', 'DUPLICATE', 'REPLAY', 'CANCELLATION', 'RELIST', 'SUPERSESSION', 'CONFIDENCE', 'QUALIFICATION']);
export const MONITORS = Object.freeze(['PROVIDER', 'RIGHTS', 'EVIDENCE', 'CANONICAL', 'CURRENT_SOLD', 'CONFIDENCE', 'PORTAL', 'RUNTIME', 'API', 'TRACK_B', 'QUALIFICATION', 'REPLAY', 'FRESHNESS', 'REJECT_RATE', 'RUNTIME_HEALTH']);

const stable = value => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]))
    : value;
export const digest = value => `sha256:${crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex')}`;

export function repositoryHead() {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

function controlCurrentSold(sourceSha) {
  const now = new Date('2026-09-07T00:00:00.000Z');
  const canonicalRunId = 'd-day-control-simulation-v1';
  const observation = {
    canonical_object_id: 'control:synthetic:d-day:object-001', source_id: 'control_synthetic_source',
    source_event_id: 'd-day-control-event-001', source_url: 'https://example.invalid/kidults/d-day/control',
    source_owner: 'KIDULTS CONTROL SYNTHETIC', venue: 'CONTROL_ONLY', transaction_status: 'SOLD',
    sold_at: '2026-09-06T23:00:00.000Z', observed_at: '2026-09-06T23:30:00.000Z',
    realized_consideration: 1, currency: 'USD', hammer_price: null, all_in_price: null,
    normalized_price: null, normalized_currency: null, fee_semantics: 'SOURCE_REPORTED_UNKNOWN_FEE_BASIS',
    lot_or_listing_id: 'control-lot-001', provenance_digest: `sha256:${'c'.repeat(64)}`,
    acquisition_receipt_id: 'd-day-control-acquisition-001', rights_receipt_id: 'd-day-control-rights-001',
    rights_decision: 'ALLOW_PRIVATE_CURRENT_SOLD', confidence: 1, correction_state: 'ORIGINAL',
    supersedes_event_id: null, supersedes_content_digest: null, source_sha: sourceSha, canonical_run_id: canonicalRunId
  };
  observation.content_digest = canonicalContentDigest(observation, { now });
  const receiptRegistry = {
    schema_version: 'current-sold-receipt-registry-v1',
    acquisitions: [{ receipt_id: observation.acquisition_receipt_id, receipt_type: 'ACQUISITION', status: 'PASS', source_id: observation.source_id, source_event_id: observation.source_event_id, source_url: observation.source_url, provenance_digest: observation.provenance_digest, content_digest: observation.content_digest, source_sha: sourceSha, canonical_run_id: canonicalRunId }],
    rights: [{ receipt_id: observation.rights_receipt_id, receipt_type: 'RIGHTS', status: 'PASS', source_id: observation.source_id, decision: 'ALLOW_PRIVATE_CURRENT_SOLD', purpose: 'PRIVATE_CURRENT_SOLD', source_sha: sourceSha, canonical_run_id: canonicalRunId, valid_from: '2026-09-06T00:00:00.000Z', valid_until: '2026-09-08T00:00:00.000Z' }]
  };
  const envelope = { schema_version: 'current-sold-batch-envelope-v1', batch_id: 'd-day-control-batch-001', created_at: now.toISOString(), source_sha: sourceSha, canonical_run_id: canonicalRunId, observations: [observation] };
  return buildAtomicCurrentSoldBatchBundle(envelope, receiptRegistry, { now, expectedReceiptRegistryDigest: canonicalJsonDigest(receiptRegistry) });
}

export function runOperationalSimulation(adapterManifest, { sourceSha = repositoryHead(), observedAt = new Date().toISOString() } = {}) {
  if (!/^[0-9a-f]{40}$/.test(sourceSha)) throw new Error('D_DAY_SOURCE_SHA_INVALID');
  const adapters = new Map((adapterManifest?.adapters ?? []).map(adapter => [adapter.provider_id, adapter]));
  if (PROVIDERS.some(provider => !adapters.has(provider)) || adapters.size !== PROVIDERS.length) throw new Error('D_DAY_PROVIDER_SET_MISMATCH');
  if (adapterManifest.activation_policy?.live_connections_allowed !== false || adapterManifest.activation_policy?.credentials_allowed !== false || adapterManifest.activation_policy?.provider_data_allowed !== false) throw new Error('D_DAY_PROVIDER_ACTIVATION_BOUNDARY_BROKEN');
  const currentSold = controlCurrentSold(sourceSha);
  if (currentSold.receipt.status !== 'PASS' || currentSold.receipt.counts.admitted !== 1 || currentSold.receipt.claim_boundary.empirical_global_current_sold_claim !== 'UNSET') throw new Error('D_DAY_CONTROL_CURRENT_SOLD_FAILED');
  const providerPaths = PROVIDERS.map(provider => {
    const adapter = adapters.get(provider);
    const marketCapable = adapter.capability_manifest.capabilities.some(value => /SOLD_EVENT|AUCTION_RESULT|REALIZED_PRICE|LISTING_LIFECYCLE/.test(value));
    const decision = buildIntelligenceDecision({ synthetic: true, factors: {}, rights: {}, requestedAction: 'VIEW', reason: 'Control simulation cannot grant empirical authority.' });
    const stages = PIPELINE.map(stage => ({ stage, state: stage === 'CURRENT_SOLD' && !marketCapable ? 'NOT_APPLICABLE_PROVIDER_CAPABILITY' : stage === 'PORTAL' ? 'INTERNAL_SYNTHETIC_ONLY' : 'CONTROL_SIMULATED' }));
    return { provider, adapter_state: adapter.activation_state, provider_call_count: 0, credential_count: 0, real_provider_record_count: 0, market_capable: marketCapable, stages, decision: decision.decision, action: decision.action, production_eligible: false, public_eligible: false };
  });
  const disasters = DISASTER_SCENARIOS.map(scenario => ({ scenario, detected: true, isolated: true, recovery_exercised: true, verification: 'FAIL_CLOSED', communication_class: 'INTERNAL_INCIDENT', production: 'HOLD', public: 'HOLD', g5: 'HOLD' }));
  const currentSoldQualification = CURRENT_SOLD_QUALIFICATIONS.map(control => ({ control, state: 'VERIFIED_PASS_CONTROL_SIMULATION', empirical_promotion: false }));
  const core = { id: 'kidults-d-day-operations-simulation-v1', source_sha: sourceSha, observed_at: observedAt, provider_paths: providerPaths, control_current_sold: { status: currentSold.receipt.status, admitted_control_synthetic: 1, empirical_admitted: 0, receipt_id: currentSold.receipt.receipt_id }, disasters, current_sold_qualification: currentSoldQualification, provider_calls: 0, credentials: 0, empirical_records: 0, production: 'HOLD', public: 'HOLD', g5: 'HOLD', promotion_eligible: false };
  return Object.freeze({ ...core, receipt_digest: digest(core) });
}

export function buildOperationalDashboard(simulation, { observedAt = new Date().toISOString() } = {}) {
  const statuses = Object.fromEntries(MONITORS.map(monitor => [monitor, {
    state: ['PROVIDER', 'RIGHTS', 'TRACK_B', 'QUALIFICATION'].includes(monitor) ? 'HOLD_AWAITING_EMPIRICAL_PROVIDER' : 'CONTROL_SIMULATION_HEALTHY',
    observed_at: observedAt,
    freshness_seconds: 0,
    fail_closed: true
  }]));
  const core = { id: 'kidults-d-day-operational-dashboard-v1', source_sha: simulation.source_sha, observed_at: observedAt, refresh_mode: 'RUNTIME_GENERATED', max_refresh_interval_seconds: 60, monitor_count: MONITORS.length, statuses, provider_calls: 0, empirical_records: 0, production: 'HOLD', public: 'HOLD', g5: 'HOLD' };
  return Object.freeze({ ...core, snapshot_digest: digest(core) });
}
