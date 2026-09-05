import { loadKirRuntime, evaluateKirRuntime } from './kir-runtime-kernel-v1.mjs';
import { buildAtomicCurrentSoldBatchBundle } from '../market/current-sold-atomic-batch-v1.mjs';
import { canonicalJsonDigest } from '../market/current-sold-batch-v1.mjs';
import { currentSoldEvidenceDigest } from '../market/current-sold-evidence-v1.mjs';

const MODE = 'CONTROL_ONLY_SYNTHETIC';
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const PREFIX = 'kir-fixture-';
const req = (condition, code) => { if (!condition) throw new Error(code); };

function record(value, keys, code) {
  req(value !== null && typeof value === 'object' && !Array.isArray(value), code);
  const proto = Object.getPrototypeOf(value);
  req(proto === Object.prototype || proto === null, code);
  const own = Reflect.ownKeys(value);
  req(own.length === keys.length && own.every(key => keys.includes(key)), code);
  for (const key of own) req(Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'), code);
}

// Only JSON data is accepted: accessors, coercion hooks, sparse arrays and cycles
// cannot change a value between validation, cloning and digest calculation.
function jsonSnapshot(value) {
  let nodes = 0;
  const visiting = new Set();
  const visit = (item, depth = 0) => {
    req(++nodes <= 100000 && depth <= 32, 'KIR_BRIDGE_INPUT_COMPLEXITY');
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return item;
    if (typeof item === 'number') { req(Number.isFinite(item), 'KIR_BRIDGE_JSON_NUMBER'); return item; }
    req(typeof item === 'object' && !visiting.has(item), 'KIR_BRIDGE_JSON_DATA');
    visiting.add(item);
    let copy;
    if (Array.isArray(item)) {
      req(Reflect.ownKeys(item).length === item.length + 1, 'KIR_BRIDGE_JSON_ARRAY');
      copy = Array.from({length: item.length}, (_, index) => {
        const descriptor = Object.getOwnPropertyDescriptor(item, String(index));
        req(descriptor && Object.hasOwn(descriptor, 'value'), 'KIR_BRIDGE_JSON_ARRAY');
        return visit(descriptor.value, depth + 1);
      });
    } else {
      req(Object.getPrototypeOf(item) === Object.prototype || Object.getPrototypeOf(item) === null, 'KIR_BRIDGE_JSON_OBJECT');
      copy = Object.create(null);
      for (const key of Reflect.ownKeys(item)) {
        req(typeof key === 'string' && key !== '__proto__', 'KIR_BRIDGE_JSON_KEY');
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        req(descriptor.enumerable && Object.hasOwn(descriptor, 'value'), 'KIR_BRIDGE_JSON_DESCRIPTOR');
        copy[key] = visit(descriptor.value, depth + 1);
      }
    }
    visiting.delete(item);
    return copy;
  };
  const copy = visit(value);
  req(Buffer.byteLength(JSON.stringify(copy)) <= 1048576, 'KIR_BRIDGE_INPUT_SIZE');
  return copy;
}

function fixtureId(value) {
  return typeof value === 'string' && value.startsWith(PREFIX) && value.length > PREFIX.length;
}

function syntheticUrl(value) {
  req(typeof value === 'string', 'KIR_BRIDGE_SYNTHETIC_URL_REQUIRED');
  let url;
  try { url = new URL(value); } catch { throw new Error('KIR_BRIDGE_SYNTHETIC_URL_REQUIRED'); }
  req(url.protocol === 'https:' && url.hostname === 'kir-fixture.invalid' && !url.username && !url.password,
    'KIR_BRIDGE_SYNTHETIC_URL_REQUIRED');
}

/**
 * Exercise the real atomic admission/evidence implementation with synthetic
 * inputs. This deliberately returns no bundle, raw row, evidence object or
 * ledger eligibility. It is not an activation or empirical-admission API.
 */
export function evaluateKirCurrentSoldControl(options) {
  record(options, ['mode', 'identity', 'envelope', 'receiptRegistry', 'expectedReceiptRegistryDigest', 'now'], 'KIR_BRIDGE_OPTIONS');
  req(options.mode === MODE, 'KIR_BRIDGE_CONTROL_MODE_REQUIRED');
  req(options.now instanceof Date && Number.isFinite(options.now.getTime()), 'KIR_BRIDGE_TEST_CLOCK');
  req(typeof options.expectedReceiptRegistryDigest === 'string' && DIGEST.test(options.expectedReceiptRegistryDigest), 'KIR_BRIDGE_EXPECTED_DIGEST_REQUIRED');
  const identity = jsonSnapshot(options.identity);
  // Re-evaluate the exact on-disk KIR contract; detached receipts are not inputs.
  const runtime = evaluateKirRuntime({...loadKirRuntime(), identity});
  req(runtime.state === 'CONTROL_VALIDATED_EMPIRICAL_BLOCKED', 'KIR_BRIDGE_KIR_CONTROL_STATE');
  const envelope = jsonSnapshot(options.envelope);
  const registry = jsonSnapshot(options.receiptRegistry);
  const now = new Date(options.now.getTime());
  record(envelope, ['schema_version', 'batch_id', 'created_at', 'source_sha', 'canonical_run_id', 'observations'], 'KIR_BRIDGE_ENVELOPE_KEYS');
  req(fixtureId(envelope.batch_id), 'KIR_BRIDGE_SYNTHETIC_BATCH_REQUIRED');
  req(envelope.source_sha === identity.source_sha, 'KIR_BRIDGE_SOURCE_SHA_MISMATCH');
  const run = `${PREFIX}${identity.run_id}-${identity.run_attempt}`;
  req(envelope.canonical_run_id === run, 'KIR_BRIDGE_RUN_MISMATCH');
  req(envelope.created_at === now.toISOString(), 'KIR_BRIDGE_TEST_CLOCK_MISMATCH');
  req(Array.isArray(envelope.observations) && envelope.observations.length > 0 && envelope.observations.length <= 10000, 'KIR_BRIDGE_BATCH_SIZE');
  for (const observation of envelope.observations) {
    req(observation && typeof observation === 'object', 'KIR_BRIDGE_OBSERVATION');
    req(observation.source_sha === identity.source_sha, 'KIR_BRIDGE_OBSERVATION_SHA');
    req(observation.canonical_run_id === run, 'KIR_BRIDGE_OBSERVATION_RUN');
    for (const key of ['source_id', 'source_event_id', 'acquisition_receipt_id', 'rights_receipt_id']) {
      req(fixtureId(observation[key]), 'KIR_BRIDGE_SYNTHETIC_ID_REQUIRED');
    }
    req(typeof observation.canonical_object_id === 'string' && observation.canonical_object_id.startsWith('kir-fixture:'), 'KIR_BRIDGE_SYNTHETIC_OBJECT_REQUIRED');
    syntheticUrl(observation.source_url);
  }
  record(registry, ['schema_version', 'acquisitions', 'rights'], 'KIR_BRIDGE_REGISTRY_KEYS');
  req(Array.isArray(registry.acquisitions) && Array.isArray(registry.rights), 'KIR_BRIDGE_REGISTRY_ARRAYS');
  for (const receipt of [...registry.acquisitions, ...registry.rights]) {
    req(fixtureId(receipt?.receipt_id) && fixtureId(receipt?.source_id), 'KIR_BRIDGE_SYNTHETIC_RECEIPT_REQUIRED');
    req(receipt.source_sha === identity.source_sha && receipt.canonical_run_id === run, 'KIR_BRIDGE_RECEIPT_BINDING');
  }
  for (const receipt of registry.acquisitions) syntheticUrl(receipt.source_url);
  req(canonicalJsonDigest(registry) === options.expectedReceiptRegistryDigest, 'KIR_BRIDGE_REGISTRY_DIGEST_MISMATCH');

  const bundle = buildAtomicCurrentSoldBatchBundle(envelope, registry, {now, expectedReceiptRegistryDigest: options.expectedReceiptRegistryDigest});
  req(bundle.receipt.source_sha === identity.source_sha && bundle.receipt.canonical_run_id === run, 'KIR_BRIDGE_ENGINE_BINDING');
  req(bundle.receipt.receipt_registry_digest === options.expectedReceiptRegistryDigest, 'KIR_BRIDGE_ENGINE_REGISTRY_DIGEST');
  req(bundle.receipt.evidence_digest === currentSoldEvidenceDigest(bundle.evidence), 'KIR_BRIDGE_EVIDENCE_DIGEST');
  req(bundle.receipt.event_versions_digest === canonicalJsonDigest(bundle.event_versions), 'KIR_BRIDGE_EVENT_DIGEST');
  const pass = bundle.admission.status === 'PASS';
  if (!pass) req(bundle.admission.admitted_count === 0 && bundle.evidence.length === 0 && bundle.event_versions.length === 0, 'KIR_BRIDGE_PARTIAL_OUTPUT_ESCAPE');
  for (const evidence of bundle.evidence) {
    req(evidence.lineage.source_sha === identity.source_sha && evidence.lineage.canonical_run_id === run, 'KIR_BRIDGE_EVIDENCE_BINDING');
  }
  return {
    id: 'kidults-kir-current-sold-control-bridge-v1', version: '1.0.0',
    state: pass ? 'CONTROL_CHAIN_VALIDATED_EMPIRICAL_BLOCKED' : 'CONTROL_INPUT_REJECTED',
    scope: 'SYNTHETIC_KIR_ATOMIC_EVIDENCE_INTEGRATION_ONLY',
    repository: identity.repository, source_sha: identity.source_sha,
    run_id: identity.run_id, run_attempt: identity.run_attempt, trigger_event: identity.trigger_event,
    synthetic_test_clock: now.toISOString(),
    kir_receipt_sha256: canonicalJsonDigest(runtime),
    input_registry_sha256: options.expectedReceiptRegistryDigest,
    control_bundle_receipt_sha256: canonicalJsonDigest(bundle.receipt),
    control_evidence_sha256: bundle.receipt.evidence_digest,
    engine_control_status: bundle.admission.status,
    control_counts: {...bundle.receipt.counts},
    blockers: [...runtime.blockers],
    empirical_current_sold_delta: 0, postgres_rows_written: 0,
    raw_rows_emitted: false, raw_evidence_emitted: false, bundle_emitted: false,
    ledger_write_eligible: false, runtime_activation_authorized: false,
    provider_authority: false, database_authority: false, empirical_authority: false,
    producer_health_authority: false, promotion_eligible: false,
    track_b_started: false, projection_approved: false,
    public_release: 'HOLD', production: 'HOLD', g5: 'HOLD',
  };
}
