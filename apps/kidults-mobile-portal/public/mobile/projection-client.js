const INTELLIGENCE_STATES = new Set(['LIVE_APPROVED', 'WAITING', 'STALE', 'INVALID', 'RIGHTS_BLOCKED', 'NOT_AVAILABLE', 'NO_PROJECTION']);
const RELEASE_STATES = new Set(['HOLD', 'READY', 'RELEASED']);
const CONTROL_RECORD_TYPE = 'kidults_mobile_non_promotable_control_projection';
const CONTROL_SCHEMA_VERSION = '1.0.0';
const MOBILE_ENVELOPE_RECORD_TYPE = 'kidults_mobile_projection_envelope';
const MOBILE_ENVELOPE_SCHEMA_VERSION = '1.0.0';
const MOBILE_VIEW_SCHEMA_VERSION = 'kidults-mobile-portal-view-1.0.0';
const MOBILE_CAPABILITY_SOURCE = 'MOBILE_VERIFIED_SERVER_CAPABILITY';
const MOBILE_ADMISSION_REASON = 'MOBILE_VERIFIED_CAPABILITY_ADMISSION';
const MOBILE_SIGNAL_DEFINITIONS = Object.freeze([
  ['market-scale', 'Market scale'], ['venue-depth', 'Venue depth'], ['transaction-activity', 'Transaction activity'],
  ['liquidity', 'Liquidity'], ['demand-scarcity', 'Demand / scarcity'], ['momentum', 'Momentum'],
].map(([signal_id, label]) => Object.freeze({ signal_id, label })));
const MOBILE_SIGNAL_IDS = Object.freeze(MOBILE_SIGNAL_DEFINITIONS.map(signal => signal.signal_id));
const SIGNAL_CONFIDENCE = new Set(['HIGH', 'MEDIUM', 'LOW']);
const SHA256_DIGEST = /^sha256:[a-f0-9]{64}$/i;
const MAX_CAPABILITY_LIFETIME_MILLISECONDS = 300_000;
const ENVELOPE_KEYS = Object.freeze(['record_type', 'schema_version', 'ok', 'capability_expires_at', 'revalidate_after_ms', 'mobile_view', 'consumption_receipt']);
const VIEW_KEYS = Object.freeze(['schema_version', 'source', 'projection', 'release', 'verticals', 'signals', 'objects', 'evidence_methodology', 'kidult_100', 'audit']);
const PROJECTION_KEYS = Object.freeze(['state', 'publication_state', 'projection_id', 'assessment_id', 'rights_state', 'freshness', 'as_of']);
const SIGNAL_KEYS = Object.freeze(['signal_id', 'label', 'state', 'value', 'confidence', 'as_of', 'rights_state', 'freshness', 'evidence_refs']);
const METHODOLOGY_KEYS = Object.freeze(['coverage', 'independence', 'freshness', 'rights', 'methodology_version', 'lineage_version']);
const KIDULT_100_KEYS = Object.freeze(['state', 'index_value', 'as_of', 'methodology_version', 'publication_authority', 'evidence_package_digest']);
const AUDIT_KEYS = Object.freeze(['projection_id', 'assessment_id', 'exact_pair_digest', 'correlation_id', 'reason_category', 'mobile_payload_digest']);
const RECEIPT_KEYS = Object.freeze(['record_type', 'version', 'decision', 'reason', 'errors', 'render_scope', 'purpose', 'publication_authority_state', 'public_live_intelligence', 'clock_authority', 'capability_digest', 'capability_id', 'payload_exposed', 'state_only', 'projection_id', 'assessment_id', 'rankability_assessment_id', 'rights_state', 'freshness_state', 'valid_until', 'production_state', 'g5_state', 'mobile_payload_digest']);
export const mobileStructuralVerticals = Object.freeze([
  ['toys-models', 'Toys & Models'],
  ['watches-jewelry', 'Watches & Jewelry'],
  ['automobiles-mobility', 'Automobiles & Mobility'],
  ['fashion-accessories', 'Fashion & Accessories'],
  ['design-furniture', 'Design & Furniture'],
  ['technology-cameras', 'Technology & Cameras'],
  ['gaming-music-screen', 'Gaming / Music / Screen Culture'],
  ['cards-comics-memorabilia', 'Cards / Comics / Memorabilia'],
].map(([vertical_id, label]) => Object.freeze({ vertical_id, label, structural_state: 'AVAILABLE' })));

export function normalizeIntelligenceState(value) {
  return INTELLIGENCE_STATES.has(value) ? value : 'INVALID';
}

export function normalizeReleaseState(value) {
  return RELEASE_STATES.has(value) ? value : 'HOLD';
}

function closedProjection(reason, source = 'MOBILE_CONTROL_FALLBACK', state = 'INVALID') {
  return {
    source,
    projection: { state, projection_id: null, as_of: null, assessment_id: null, rights_state: 'WAITING', freshness: 'NOT_AVAILABLE' },
    release: { state: 'HOLD' },
    audit: { reason_category: reason || 'LOAD_FAILURE' },
    verticals: [...mobileStructuralVerticals],
    signals: [],
    objects: [],
    evidence: [],
    evidence_methodology: { coverage: 'NOT_AVAILABLE', independence: 'NOT_AVAILABLE', freshness: 'NOT_AVAILABLE', rights: 'WAITING', methodology_version: null, lineage_version: null },
    kidult_100: { state: 'NOT_AVAILABLE', index_value: null, as_of: null, methodology_version: null },
    runtime_revalidate_after_ms: 60_000,
  };
}

function boundedText(value, maximum = 160) {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum && !/[\u0000-\u001f\u007f]/.test(value);
}

function parseableTimestamp(value) {
  return boundedText(value, 40) && Number.isFinite(Date.parse(value));
}

function exactObjectKeys(value, keys) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.keys(value).sort().join('\n') === [...keys].sort().join('\n');
}

function exactMobileSignals(signals) {
  if (!Array.isArray(signals) || signals.length !== MOBILE_SIGNAL_IDS.length) return false;
  return signals.every((signal, index) => exactObjectKeys(signal, SIGNAL_KEYS)
    && signal?.signal_id === MOBILE_SIGNAL_IDS[index]
    && signal?.label === MOBILE_SIGNAL_DEFINITIONS[index].label
    && signal?.state === 'LIVE_APPROVED'
    && ((typeof signal?.value === 'number' && Number.isFinite(signal.value)) || boundedText(signal?.value, 160))
    && SIGNAL_CONFIDENCE.has(signal?.confidence)
    && parseableTimestamp(signal?.as_of)
    && signal?.rights_state === 'CLEARED'
    && signal?.freshness === 'CURRENT'
    && Array.isArray(signal?.evidence_refs)
    && signal.evidence_refs.length > 0
    && signal.evidence_refs.length <= 8
    && signal.evidence_refs.every(reference => SHA256_DIGEST.test(reference)));
}

function exactKidult100(value) {
  if (!exactObjectKeys(value, KIDULT_100_KEYS)) return false;
  if (value?.state === 'NOT_AVAILABLE') {
    return value.index_value === null
      && value.as_of === null
      && value.methodology_version === null
      && value.publication_authority === null
      && value.evidence_package_digest === null;
  }
  return value?.state === 'LIVE_APPROVED'
    && Number.isFinite(value?.index_value)
    && parseableTimestamp(value?.as_of)
    && boundedText(value?.methodology_version, 80)
    && value?.publication_authority === MOBILE_CAPABILITY_SOURCE
    && SHA256_DIGEST.test(value?.evidence_package_digest ?? '');
}

function exactEvidenceMethodology(value) {
  return exactObjectKeys(value, METHODOLOGY_KEYS)
    && boundedText(value?.coverage, 120)
    && boundedText(value?.independence, 120)
    && value?.freshness === 'CURRENT'
    && value?.rights === 'CLEARED'
    && boundedText(value?.methodology_version, 80)
    && boundedText(value?.lineage_version, 80);
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).filter(key => value[key] !== undefined).sort()
    .map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function digestBoundMobilePayload(view) {
  const audit = view?.audit ?? {};
  return {
    schema_version: view?.schema_version,
    source: view?.source,
    projection: view?.projection,
    release: view?.release,
    signals: view?.signals,
    evidence_methodology: view?.evidence_methodology,
    kidult_100: view?.kidult_100,
    audit: {
      projection_id: audit.projection_id,
      assessment_id: audit.assessment_id,
      exact_pair_digest: audit.exact_pair_digest,
      correlation_id: audit.correlation_id,
      reason_category: audit.reason_category,
    },
  };
}

async function sha256(value) {
  if (!globalThis.crypto?.subtle) return null;
  const bytes = new TextEncoder().encode(`KIDULTS_MOBILE_PROJECTION_VIEW_V1\n${canonicalJson(value)}`);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return `sha256:${[...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

async function exactMobileEnvelope(candidate, authorityNowMilliseconds) {
  const view = candidate?.mobile_view;
  const receipt = candidate?.consumption_receipt;
  const capabilityExpiresMilliseconds = candidate?.capability_expires_at * 1000;
  const validUntilMilliseconds = Date.parse(receipt?.valid_until ?? '');
  const structurallyValid = exactObjectKeys(candidate, ENVELOPE_KEYS)
    && exactObjectKeys(view, VIEW_KEYS)
    && exactObjectKeys(view?.projection, PROJECTION_KEYS)
    && exactObjectKeys(view?.release, ['state'])
    && exactObjectKeys(view?.audit, AUDIT_KEYS)
    && exactObjectKeys(receipt, RECEIPT_KEYS)
    && candidate?.record_type === MOBILE_ENVELOPE_RECORD_TYPE
    && candidate?.schema_version === MOBILE_ENVELOPE_SCHEMA_VERSION
    && candidate?.ok === true
    && Number.isInteger(candidate?.capability_expires_at)
    && Number.isSafeInteger(capabilityExpiresMilliseconds)
    && Number.isSafeInteger(authorityNowMilliseconds)
    && capabilityExpiresMilliseconds > authorityNowMilliseconds
    && capabilityExpiresMilliseconds <= authorityNowMilliseconds + MAX_CAPABILITY_LIFETIME_MILLISECONDS
    && candidate?.revalidate_after_ms === 5000
    && view?.schema_version === MOBILE_VIEW_SCHEMA_VERSION
    && view?.source === MOBILE_CAPABILITY_SOURCE
    && view?.projection?.state === 'LIVE_APPROVED'
    && view?.projection?.publication_state === 'APPROVED_PROJECTION'
    && parseableTimestamp(view?.projection?.as_of)
    && view?.release?.state === 'RELEASED'
    && Array.isArray(view?.verticals)
    && view.verticals.length === 0
    && Array.isArray(view?.objects)
    && view.objects.length === 0
    && exactMobileSignals(view?.signals)
    && exactEvidenceMethodology(view?.evidence_methodology)
    && exactKidult100(view?.kidult_100)
    && receipt?.decision === 'ACCEPTED'
    && receipt?.record_type === 'kidults_mobile_projection_consumption_receipt'
    && receipt?.version === '1.0.0'
    && receipt?.reason === MOBILE_ADMISSION_REASON
    && Array.isArray(receipt?.errors)
    && receipt.errors.length === 0
    && receipt?.render_scope === 'MOBILE_PORTAL'
    && receipt?.purpose === 'MOBILE_PUBLIC_DISPLAY'
    && receipt?.publication_authority_state === 'VERIFIED_AUTHORIZED'
    && receipt?.public_live_intelligence === 'AUTHORIZED_FOR_EXACT_PROJECTION'
    && receipt?.clock_authority === 'KIDULTS_CONTROL_PLANE'
    && /^[a-f0-9]{64}$/i.test(receipt?.capability_digest ?? '')
    && SHA256_DIGEST.test(receipt?.mobile_payload_digest ?? '')
    && receipt?.payload_exposed === true
    && receipt?.state_only === false
    && typeof receipt?.capability_id === 'string'
    && receipt.capability_id.length > 0
    && typeof receipt?.valid_until === 'string'
    && receipt.valid_until.length > 0
    && Number.isFinite(validUntilMilliseconds)
    && validUntilMilliseconds > authorityNowMilliseconds
    && capabilityExpiresMilliseconds === validUntilMilliseconds
    && validUntilMilliseconds <= authorityNowMilliseconds + MAX_CAPABILITY_LIFETIME_MILLISECONDS
    && typeof receipt?.projection_id === 'string'
    && receipt.projection_id.length > 0
    && typeof receipt?.assessment_id === 'string'
    && receipt.assessment_id.length > 0
    && typeof receipt?.rankability_assessment_id === 'string'
    && receipt.rankability_assessment_id.length > 0
    && typeof view?.projection?.as_of === 'string'
    && view.projection.as_of.length > 0
    && receipt?.projection_id === view?.projection?.projection_id
    && receipt?.assessment_id === view?.projection?.assessment_id
    && receipt?.rankability_assessment_id === receipt?.assessment_id
    && receipt?.rights_state === 'CLEARED'
    && receipt?.freshness_state === 'CURRENT'
    && receipt?.production_state === 'HOLD'
    && receipt?.g5_state === 'HOLD'
    && view?.projection?.rights_state === receipt?.rights_state
    && view?.projection?.freshness === receipt?.freshness_state
    && view?.audit?.projection_id === receipt?.projection_id
    && view?.audit?.assessment_id === receipt?.assessment_id
    && view?.audit?.exact_pair_digest === receipt?.capability_digest
    && view?.audit?.mobile_payload_digest === receipt?.mobile_payload_digest
    && view?.audit?.correlation_id === receipt?.capability_id
    && view?.audit?.reason_category === receipt?.reason;
  if (!structurallyValid) return false;
  return await sha256(digestBoundMobilePayload(view)) === receipt.mobile_payload_digest;
}

function responseAuthorityTime(response) {
  const value = response.headers.get('date') ?? '';
  if (!boundedText(value, 64)) return null;
  const milliseconds = Date.parse(value);
  if (!Number.isSafeInteger(milliseconds)) return null;
  return new Date(milliseconds).toUTCString() === value ? milliseconds : null;
}

function admittedMobileView(view, runtimeRevalidateAfterMilliseconds) {
  return Object.freeze({
    schema_version: view.schema_version,
    source: view.source,
    projection: Object.freeze({ ...view.projection }),
    release: Object.freeze({ state: view.release.state }),
    audit: Object.freeze({ ...view.audit }),
    verticals: [...mobileStructuralVerticals],
    signals: view.signals.map((signal, index) => Object.freeze({ ...signal, label: MOBILE_SIGNAL_DEFINITIONS[index].label, evidence_refs: [...signal.evidence_refs] })),
    objects: [],
    evidence: [],
    evidence_methodology: Object.freeze({ ...view.evidence_methodology }),
    kidult_100: Object.freeze({ ...view.kidult_100 }),
    runtime_revalidate_after_ms: runtimeRevalidateAfterMilliseconds,
  });
}

function exactMobileControl(candidate) {
  return candidate?.record_type === CONTROL_RECORD_TYPE
    && candidate?.schema_version === CONTROL_SCHEMA_VERSION
    && candidate?.fixture_type === 'NON_PROMOTABLE_CONTROL'
    && candidate?.release?.state === 'HOLD'
    && candidate?.projection?.state === 'NO_PROJECTION'
    && candidate?.projection?.synthetic === true
    && candidate?.projection?.promotable === false
    && candidate?.projection?.production === false
    && candidate?.projection?.public === false;
}

function requestOptions(signal) {
  return {
    cache: 'no-store',
    credentials: 'omit',
    headers: { Accept: 'application/json' },
    mode: 'same-origin',
    redirect: 'error',
    referrerPolicy: 'no-referrer',
    signal,
  };
}

function exactSameOriginResponse(response, requestedUrl) {
  const base = globalThis.location?.href ?? 'https://mobile.invalid/';
  const requested = new URL(requestedUrl, base);
  const actual = new URL(response.url || requested.href, base);
  return response.redirected !== true
    && requested.origin === new URL(base).origin
    && actual.origin === requested.origin
    && actual.pathname === requested.pathname
    && /^(application|text)\/json\b/i.test(response.headers.get('content-type') ?? '');
}

async function parseResponse(response, source, { allowSigned = false } = {}) {
  let candidate;
  try {
    candidate = await response.json();
  } catch {
    return Object.freeze(closedProjection('PROJECTION_JSON_INVALID', source));
  }
  if (allowSigned && await exactMobileEnvelope(candidate, responseAuthorityTime(response))) {
    return admittedMobileView(candidate.mobile_view, candidate.revalidate_after_ms);
  }
  if (exactMobileControl(candidate)) {
    return Object.freeze(closedProjection('NO_GOVERNED_PROJECTION', source, 'NO_PROJECTION'));
  }
  return Object.freeze(closedProjection('PROJECTION_RECORD_TYPE_INVALID', source));
}

async function readControl(controlUrl, signal) {
  const response = await fetch(controlUrl, requestOptions(signal));
  if (!response.ok) return Object.freeze(closedProjection(`CONTROL_HTTP_${response.status}`));
  if (!exactSameOriginResponse(response, controlUrl)) return Object.freeze(closedProjection('CONTROL_RESPONSE_ORIGIN_INVALID'));
  return parseResponse(response, 'MOBILE_CONTROL_FALLBACK', { allowSigned: false });
}

export async function readMobileProjection({ url = '/api/mobile/v1/projection', controlUrl = '/mobile/data/no-projection.json', signal } = {}) {
  let response;
  try {
    response = await fetch(url, requestOptions(signal));
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    try { return await readControl(controlUrl, signal); }
    catch (fallbackError) {
      if (fallbackError?.name === 'AbortError') throw fallbackError;
      return Object.freeze(closedProjection(error?.message));
    }
  }
  if (!response.ok) {
    if (response.status === 404 || response.status === 503) {
      try { return await readControl(controlUrl, signal); }
      catch (error) {
        if (error?.name === 'AbortError') throw error;
        return Object.freeze(closedProjection(`HTTP_${response.status}`));
      }
    }
    return Object.freeze(closedProjection(`HTTP_${response.status}`, 'MOBILE_PRIMARY_INVALID'));
  }
  if (!exactSameOriginResponse(response, url)) return Object.freeze(closedProjection('PRIMARY_RESPONSE_ORIGIN_INVALID', 'MOBILE_PRIMARY_INVALID'));
  return parseResponse(response, 'MOBILE_VERIFIED_PRIMARY', { allowSigned: true });
}

export const mobileProjectionContract = Object.freeze({
  version: 'mobile-projection-read-contract-001',
  approved_render: 'MOBILE_OWNED_DIGEST_BOUND_SAME_ORIGIN_ENVELOPE_ONLY',
  mobile_envelope_record_type: MOBILE_ENVELOPE_RECORD_TYPE,
  mobile_envelope_schema_version: MOBILE_ENVELOPE_SCHEMA_VERSION,
  mobile_signal_ids: MOBILE_SIGNAL_IDS,
  live_release_requirement: 'MOBILE_PUBLIC_AUTHORIZED_EXACT_PROJECTION_AND_RELEASED',
  mobile_payload_binding: 'DOMAIN_SEPARATED_CANONICAL_SHA256',
  redirect_policy: 'ERROR',
  response_origin_binding: 'EXACT_SAME_ORIGIN_PATH_AND_JSON',
  local_control: 'MOBILE_OWNED_NON_PROMOTABLE_NO_PROJECTION_ONLY',
  raw_provider_payloads: false,
  credentials: false,
  browser_clock_authoritative: false,
  authority_clock: 'SAME_ORIGIN_HTTPS_RESPONSE_DATE_REJECTION_ONLY',
  public: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
});
