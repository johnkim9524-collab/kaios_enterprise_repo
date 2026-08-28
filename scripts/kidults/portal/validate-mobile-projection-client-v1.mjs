import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  readMobileProjection,
  mobileProjectionContract,
} from '../../../apps/kidults-mobile-portal/public/mobile/projection-client.js';

const originalFetch = globalThis.fetch;
const observedRequests = [];
const jsonResponse = (value, status = 200, authorityDate = new Date().toUTCString()) => new Response(JSON.stringify(value), {
  status,
  headers: { 'content-type': 'application/json', ...(authorityDate === null ? {} : { date: authorityDate }) },
});

const control = {
  record_type: 'kidults_mobile_non_promotable_control_projection',
  schema_version: '1.0.0',
  fixture_type: 'NON_PROMOTABLE_CONTROL',
  projection: { state: 'NO_PROJECTION', synthetic: true, promotable: false, production: false, public: false },
  release: { state: 'HOLD' },
};
const evidenceDigest = `sha256:${'b'.repeat(64)}`;
const signals = [
  ['market-scale', 'Market scale'],
  ['venue-depth', 'Venue depth'],
  ['transaction-activity', 'Transaction activity'],
  ['liquidity', 'Liquidity'],
  ['demand-scarcity', 'Demand / scarcity'],
  ['momentum', 'Momentum'],
].map(([signal_id, label], index) => ({
  signal_id, label, state: 'LIVE_APPROVED', value: index + 1, confidence: 'HIGH',
  as_of: '2026-08-28T00:00:00Z', rights_state: 'CLEARED', freshness: 'CURRENT', evidence_refs: [evidenceDigest],
}));
const capabilityExpiresAt = Math.floor(Date.now() / 1_000) + 120;

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).filter(key => value[key] !== undefined).sort()
    .map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function mobilePayloadDigest(view) {
  const audit = view.audit;
  const payload = {
    schema_version: view.schema_version,
    source: view.source,
    projection: view.projection,
    release: view.release,
    signals: view.signals,
    evidence_methodology: view.evidence_methodology,
    kidult_100: view.kidult_100,
    audit: {
      projection_id: audit.projection_id,
      assessment_id: audit.assessment_id,
      exact_pair_digest: audit.exact_pair_digest,
      correlation_id: audit.correlation_id,
      reason_category: audit.reason_category,
    },
  };
  return `sha256:${crypto.createHash('sha256').update(`KIDULTS_MOBILE_PROJECTION_VIEW_V1\n${canonicalJson(payload)}`).digest('hex')}`;
}

const signed = {
  record_type: 'kidults_mobile_projection_envelope',
  schema_version: '1.0.0',
  ok: true,
  capability_expires_at: capabilityExpiresAt,
  revalidate_after_ms: 5000,
  mobile_view: {
    schema_version: 'kidults-mobile-portal-view-1.0.0',
    source: 'MOBILE_VERIFIED_SERVER_CAPABILITY',
    projection: { state: 'LIVE_APPROVED', publication_state: 'APPROVED_PROJECTION', projection_id: 'projection-1', assessment_id: 'assessment-1', rights_state: 'CLEARED', freshness: 'CURRENT', as_of: '2026-08-28T00:00:00Z' },
    release: { state: 'RELEASED' },
    objects: [],
    verticals: [],
    signals,
    evidence_methodology: { coverage: 'bounded mobile contract', independence: 'independent source families', freshness: 'CURRENT', rights: 'CLEARED', methodology_version: 'mobile-qa-v1', lineage_version: '1.0.0' },
    kidult_100: { state: 'NOT_AVAILABLE', index_value: null, as_of: null, methodology_version: null, publication_authority: null, evidence_package_digest: null },
    audit: {
      projection_id: 'projection-1',
      assessment_id: 'assessment-1',
      exact_pair_digest: 'a'.repeat(64),
      correlation_id: 'capability-1',
      reason_category: 'MOBILE_VERIFIED_CAPABILITY_ADMISSION',
    },
  },
  consumption_receipt: {
    record_type: 'kidults_mobile_projection_consumption_receipt',
    version: '1.0.0',
    decision: 'ACCEPTED',
    reason: 'MOBILE_VERIFIED_CAPABILITY_ADMISSION',
    errors: [],
    render_scope: 'MOBILE_PORTAL',
    purpose: 'MOBILE_PUBLIC_DISPLAY',
    publication_authority_state: 'VERIFIED_AUTHORIZED',
    public_live_intelligence: 'AUTHORIZED_FOR_EXACT_PROJECTION',
    clock_authority: 'KIDULTS_CONTROL_PLANE',
    capability_digest: 'a'.repeat(64),
    capability_id: 'capability-1',
    payload_exposed: true,
    state_only: false,
    projection_id: 'projection-1',
    assessment_id: 'assessment-1',
    rankability_assessment_id: 'assessment-1',
    rights_state: 'CLEARED',
    freshness_state: 'CURRENT',
    valid_until: new Date(capabilityExpiresAt * 1000).toISOString(),
    production_state: 'HOLD',
    g5_state: 'HOLD',
  },
};
function rebindPayload(envelope) {
  const digest = mobilePayloadDigest(envelope.mobile_view);
  envelope.mobile_view.audit.mobile_payload_digest = digest;
  envelope.consumption_receipt.mobile_payload_digest = digest;
  return envelope;
}
rebindPayload(signed);

async function scenario(primary, fallback = control) {
  globalThis.fetch = async (url, options) => {
    observedRequests.push({ url, options });
    if (url === '/api/mobile/v1/projection') return typeof primary === 'function' ? primary() : primary;
    if (url === '/mobile/data/no-projection.json') return typeof fallback === 'function' ? fallback() : fallback instanceof Response ? fallback : jsonResponse(fallback);
    throw new Error(`UNEXPECTED_URL:${url}`);
  };
  return readMobileProjection();
}

try {
  assert.equal(mobileProjectionContract.browser_clock_authoritative, false);
  assert.equal(mobileProjectionContract.public, 'HOLD');

  const bounded404 = await scenario(new Response('', { status: 404 }));
  assert.equal(bounded404.projection.state, 'NO_PROJECTION');
  assert.equal(bounded404.release.state, 'HOLD');

  const bounded503 = await scenario(new Response('', { status: 503 }));
  assert.equal(bounded503.projection.state, 'NO_PROJECTION');

  const serverFailure = await scenario(new Response('', { status: 500 }));
  assert.equal(serverFailure.projection.state, 'INVALID');
  assert.equal(serverFailure.audit.reason_category, 'HTTP_500');

  const malformed = await scenario(new Response('{broken', { status: 200, headers: { 'content-type': 'application/json' } }));
  assert.equal(malformed.projection.state, 'INVALID');
  assert.equal(malformed.audit.reason_category, 'PROJECTION_JSON_INVALID');

  const rawProjection = await scenario(jsonResponse({ record_type: 'kidults_proof_product_projection', projection_state: 'APPROVED_PUBLIC' }));
  assert.equal(rawProjection.projection.state, 'INVALID');
  assert.equal(rawProjection.audit.reason_category, 'PROJECTION_RECORD_TYPE_INVALID');

  const accepted = await scenario(jsonResponse(signed));
  assert.equal(accepted.projection.state, 'LIVE_APPROVED');
  assert.deepEqual(accepted.objects, []);
  assert.equal(accepted.verticals.length, 8);
  assert.equal(accepted.signals.length, 6);

  const desktopEnvelope = structuredClone(signed);
  desktopEnvelope.mobile_view.source = 'SIGNED_SERVER_CAPABILITY';
  desktopEnvelope.consumption_receipt.render_scope = 'PORTAL_RENDER';
  desktopEnvelope.consumption_receipt.purpose = 'PUBLIC_DISPLAY';
  rebindPayload(desktopEnvelope);
  assert.equal((await scenario(jsonResponse(desktopEnvelope))).projection.state, 'INVALID');

  const legacyDesktopShape = structuredClone(signed);
  legacyDesktopShape.portal_view = legacyDesktopShape.mobile_view;
  delete legacyDesktopShape.mobile_view;
  assert.equal((await scenario(jsonResponse(legacyDesktopShape))).projection.state, 'INVALID');

  const malformedAsOf = structuredClone(signed);
  malformedAsOf.mobile_view.projection.as_of = 'not-a-date';
  rebindPayload(malformedAsOf);
  assert.equal((await scenario(jsonResponse(malformedAsOf))).projection.state, 'INVALID');

  const signalWithoutEvidence = structuredClone(signed);
  signalWithoutEvidence.mobile_view.signals[0].evidence_refs = [];
  rebindPayload(signalWithoutEvidence);
  assert.equal((await scenario(jsonResponse(signalWithoutEvidence))).projection.state, 'INVALID');

  const signalSemanticDrift = structuredClone(signed);
  signalSemanticDrift.mobile_view.signals[0].signal_id = 'desktop-what-changed';
  rebindPayload(signalSemanticDrift);
  assert.equal((await scenario(jsonResponse(signalSemanticDrift))).projection.state, 'INVALID');

  const signalLabelDrift = structuredClone(signed);
  signalLabelDrift.mobile_view.signals[0].label = 'Momentum';
  rebindPayload(signalLabelDrift);
  assert.equal((await scenario(jsonResponse(signalLabelDrift))).projection.state, 'INVALID');

  const falseLiveK100 = structuredClone(signed);
  falseLiveK100.mobile_view.kidult_100 = { state: 'LIVE_APPROVED', index_value: 999, as_of: '2026-08-28T00:00:00Z', methodology_version: 'x', publication_authority: null, evidence_package_digest: null };
  rebindPayload(falseLiveK100);
  assert.equal((await scenario(jsonResponse(falseLiveK100))).projection.state, 'INVALID');

  const payloadTamper = structuredClone(signed);
  payloadTamper.mobile_view.signals[0].value = 999;
  assert.equal((await scenario(jsonResponse(payloadTamper))).projection.state, 'INVALID');

  const injectedTaxonomy = structuredClone(signed);
  injectedTaxonomy.mobile_view.verticals = [{ vertical_id: 'desktop-injected', label: 'Desktop injected', structural_state: 'LIVE_APPROVED' }];
  const taxonomyResult = await scenario(jsonResponse(injectedTaxonomy));
  assert.equal(taxonomyResult.projection.state, 'INVALID');

  const injectedObject = structuredClone(signed);
  injectedObject.mobile_view.objects = [{ object_id: 'PRIVATE_SENTINEL' }];
  assert.equal((await scenario(jsonResponse(injectedObject))).projection.state, 'INVALID');

  const unknownViewField = structuredClone(signed);
  unknownViewField.mobile_view.raw_provider_payload = 'PRIVATE_SENTINEL';
  const unknownViewResult = await scenario(jsonResponse(unknownViewField));
  assert.equal(unknownViewResult.projection.state, 'INVALID');
  assert.equal('raw_provider_payload' in unknownViewResult, false);

  const unknownSignalField = structuredClone(signed);
  unknownSignalField.mobile_view.signals[0].raw_provider_payload = 'PRIVATE_SENTINEL';
  rebindPayload(unknownSignalField);
  assert.equal((await scenario(jsonResponse(unknownSignalField))).projection.state, 'INVALID');

  const forged = structuredClone(signed);
  forged.consumption_receipt.publication_authority_state = 'SELF_ASSERTED';
  const forgedResult = await scenario(jsonResponse(forged));
  assert.equal(forgedResult.projection.state, 'INVALID');

  const promotableControl = structuredClone(control);
  promotableControl.projection.promotable = true;
  const promotableResult = await scenario(new Response('', { status: 404 }), promotableControl);
  assert.equal(promotableResult.projection.state, 'INVALID');

  const signedAtControl = await scenario(new Response('', { status: 404 }), signed);
  assert.equal(signedAtControl.projection.state, 'INVALID');

  const rightsMismatch = structuredClone(signed);
  rightsMismatch.mobile_view.projection.rights_state = 'BLOCKED';
  rebindPayload(rightsMismatch);
  assert.equal((await scenario(jsonResponse(rightsMismatch))).projection.state, 'INVALID');

  const weakReceipt = structuredClone(signed);
  weakReceipt.consumption_receipt.capability_id = '';
  assert.equal((await scenario(jsonResponse(weakReceipt))).projection.state, 'INVALID');

  const invalidExpiry = structuredClone(signed);
  invalidExpiry.consumption_receipt.valid_until = 'not-a-date';
  assert.equal((await scenario(jsonResponse(invalidExpiry))).projection.state, 'INVALID');

  const expiredCapability = structuredClone(signed);
  expiredCapability.capability_expires_at = 1;
  expiredCapability.consumption_receipt.valid_until = new Date(1_000).toISOString();
  assert.equal((await scenario(jsonResponse(expiredCapability))).projection.state, 'INVALID');

  const unboundExpiry = structuredClone(signed);
  unboundExpiry.consumption_receipt.valid_until = new Date((unboundExpiry.capability_expires_at + 1) * 1000).toISOString();
  assert.equal((await scenario(jsonResponse(unboundExpiry))).projection.state, 'INVALID');

  const overlongCapability = structuredClone(signed);
  overlongCapability.capability_expires_at = Math.floor(Date.now() / 1_000) + 600;
  overlongCapability.consumption_receipt.valid_until = new Date(overlongCapability.capability_expires_at * 1000).toISOString();
  assert.equal((await scenario(jsonResponse(overlongCapability))).projection.state, 'INVALID');

  const expiredReceipt = structuredClone(signed);
  expiredReceipt.consumption_receipt.valid_until = new Date(1_000).toISOString();
  assert.equal((await scenario(jsonResponse(expiredReceipt))).projection.state, 'INVALID');

  assert.equal((await scenario(jsonResponse(signed, 200, null))).projection.state, 'INVALID');
  assert.equal((await scenario(jsonResponse(signed, 200, 'not-an-authority-date'))).projection.state, 'INVALID');

  const zeroCapability = structuredClone(signed);
  zeroCapability.capability_expires_at = 0;
  assert.equal((await scenario(jsonResponse(zeroCapability))).projection.state, 'INVALID');

  const nullIdentity = structuredClone(signed);
  nullIdentity.consumption_receipt.projection_id = null;
  nullIdentity.mobile_view.projection.projection_id = null;
  nullIdentity.mobile_view.audit.projection_id = null;
  rebindPayload(nullIdentity);
  assert.equal((await scenario(jsonResponse(nullIdentity))).projection.state, 'INVALID');

  const external = jsonResponse(signed);
  Object.defineProperty(external, 'redirected', { value: true });
  Object.defineProperty(external, 'url', { value: 'https://external.invalid/projection' });
  assert.equal((await scenario(external)).projection.state, 'INVALID');

  const dualNetworkFailure = await scenario(() => { throw new Error('PRIMARY_OFFLINE'); }, () => { throw new Error('CONTROL_OFFLINE'); });
  assert.equal(dualNetworkFailure.projection.state, 'INVALID');

  const malformedControl = await scenario(new Response('', { status: 503 }), new Response('{broken', { status: 200, headers: { 'content-type': 'application/json' } }));
  assert.equal(malformedControl.projection.state, 'INVALID');

  assert.ok(observedRequests.length > 0);
  for (const { options } of observedRequests) {
    assert.equal(options.redirect, 'error');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.mode, 'same-origin');
  }

  console.log(JSON.stringify({
    suite: 'KIDULTS_INDEPENDENT_MOBILE_PROJECTION_CLIENT_V1',
    result: 'PASS',
    cases: 35,
    desktop_links: 0,
    desktop_runtime_dependencies: 0,
    public: 'HOLD',
  }, null, 2));
} finally {
  globalThis.fetch = originalFetch;
}
