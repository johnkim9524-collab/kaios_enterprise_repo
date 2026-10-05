import { CONTROL_MODE, DIGEST, FIXTURE_PREFIX, req, requireRecord } from './constants-v1.mjs';

export function jsonSnapshot(value) {
  let nodes = 0;
  const visiting = new Set();
  const visit = (item, depth = 0) => {
    req(++nodes <= 100000 && depth <= 32, 'KIR_BRIDGE_INPUT_COMPLEXITY');
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return item;
    if (typeof item === 'number') {
      req(Number.isFinite(item), 'KIR_BRIDGE_JSON_NUMBER');
      return item;
    }
    req(typeof item === 'object' && !visiting.has(item), 'KIR_BRIDGE_JSON_DATA');
    visiting.add(item);
    let copy;
    if (Array.isArray(item)) {
      req(Reflect.ownKeys(item).length === item.length + 1, 'KIR_BRIDGE_JSON_ARRAY');
      copy = Array.from({ length: item.length }, (_, index) => {
        const descriptor = Object.getOwnPropertyDescriptor(item, String(index));
        req(descriptor && Object.hasOwn(descriptor, 'value'), 'KIR_BRIDGE_JSON_ARRAY');
        return visit(descriptor.value, depth + 1);
      });
    } else {
      req(Object.getPrototypeOf(item) === Object.prototype || Object.getPrototypeOf(item) === null,
        'KIR_BRIDGE_JSON_OBJECT');
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
  return typeof value === 'string' && value.startsWith(FIXTURE_PREFIX) && value.length > FIXTURE_PREFIX.length;
}

function syntheticUrl(value) {
  req(typeof value === 'string', 'KIR_BRIDGE_SYNTHETIC_URL_REQUIRED');
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('KIR_BRIDGE_SYNTHETIC_URL_REQUIRED');
  }
  req(url.protocol === 'https:' && url.hostname === 'kir-fixture.invalid' && !url.username && !url.password,
    'KIR_BRIDGE_SYNTHETIC_URL_REQUIRED');
}

export function validateControlOptions(options) {
  requireRecord(options,
    ['mode', 'identity', 'envelope', 'receiptRegistry', 'expectedReceiptRegistryDigest', 'now'],
    'KIR_BRIDGE_OPTIONS');
  req(options.mode === CONTROL_MODE, 'KIR_BRIDGE_CONTROL_MODE_REQUIRED');
  req(options.now instanceof Date && Number.isFinite(options.now.getTime()), 'KIR_BRIDGE_TEST_CLOCK');
  req(typeof options.expectedReceiptRegistryDigest === 'string'
    && DIGEST.test(options.expectedReceiptRegistryDigest), 'KIR_BRIDGE_EXPECTED_DIGEST_REQUIRED');
}

export function snapshotAndValidatePayload(options, identity, digestJson) {
  req(typeof digestJson === 'function', 'KIR_BRIDGE_DIGEST_PORT_REQUIRED');
  const envelope = jsonSnapshot(options.envelope);
  const registry = jsonSnapshot(options.receiptRegistry);
  const now = new Date(options.now.getTime());
  requireRecord(envelope,
    ['schema_version', 'batch_id', 'created_at', 'source_sha', 'canonical_run_id', 'observations'],
    'KIR_BRIDGE_ENVELOPE_KEYS');
  req(fixtureId(envelope.batch_id), 'KIR_BRIDGE_SYNTHETIC_BATCH_REQUIRED');
  req(envelope.source_sha === identity.source_sha, 'KIR_BRIDGE_SOURCE_SHA_MISMATCH');
  const run = `${FIXTURE_PREFIX}${identity.run_id}-${identity.run_attempt}`;
  req(envelope.canonical_run_id === run, 'KIR_BRIDGE_RUN_MISMATCH');
  req(envelope.created_at === now.toISOString(), 'KIR_BRIDGE_TEST_CLOCK_MISMATCH');
  req(Array.isArray(envelope.observations) && envelope.observations.length > 0
    && envelope.observations.length <= 10000, 'KIR_BRIDGE_BATCH_SIZE');
  for (const observation of envelope.observations) {
    req(observation && typeof observation === 'object', 'KIR_BRIDGE_OBSERVATION');
    req(observation.source_sha === identity.source_sha, 'KIR_BRIDGE_OBSERVATION_SHA');
    req(observation.canonical_run_id === run, 'KIR_BRIDGE_OBSERVATION_RUN');
    for (const key of ['source_id', 'source_event_id', 'acquisition_receipt_id', 'rights_receipt_id']) {
      req(fixtureId(observation[key]), 'KIR_BRIDGE_SYNTHETIC_ID_REQUIRED');
    }
    req(typeof observation.canonical_object_id === 'string'
      && observation.canonical_object_id.startsWith('kir-fixture:'), 'KIR_BRIDGE_SYNTHETIC_OBJECT_REQUIRED');
    syntheticUrl(observation.source_url);
  }
  requireRecord(registry, ['schema_version', 'acquisitions', 'rights'], 'KIR_BRIDGE_REGISTRY_KEYS');
  req(Array.isArray(registry.acquisitions) && Array.isArray(registry.rights), 'KIR_BRIDGE_REGISTRY_ARRAYS');
  for (const receipt of [...registry.acquisitions, ...registry.rights]) {
    req(fixtureId(receipt?.receipt_id) && fixtureId(receipt?.source_id), 'KIR_BRIDGE_SYNTHETIC_RECEIPT_REQUIRED');
    req(receipt.source_sha === identity.source_sha && receipt.canonical_run_id === run,
      'KIR_BRIDGE_RECEIPT_BINDING');
  }
  for (const receipt of registry.acquisitions) syntheticUrl(receipt.source_url);
  req(digestJson(registry) === options.expectedReceiptRegistryDigest,
    'KIR_BRIDGE_REGISTRY_DIGEST_MISMATCH');
  return { envelope, registry, now };
}
