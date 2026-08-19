const token = process.env.KAIOS_PCGS_API_TOKEN;
const accountAuthorized = process.env.KAIOS_PCGS_ACCOUNT_AUTHORIZED === '1';
const eulaCompatible = process.env.KAIOS_PCGS_EULA_COMPATIBLE === '1';
if (!token) throw new Error('PCGS_TOKEN_SECRET_REQUIRED');
if (!accountAuthorized) throw new Error('PCGS_ACCOUNT_AUTHORIZATION_REQUIRED');
if (!eulaCompatible) throw new Error('PCGS_EULA_COMPATIBILITY_REQUIRED');

// Founder-approved bounded DEV/SHADOW single-record probe only.
// The cert is a publicly verifiable PCGS-certified collectible and is used only
// to prove authoritative schema presence. Raw provider response is never logged,
// persisted, uploaded, or admitted by this script.
const certNo = process.env.KAIOS_PCGS_PROBE_CERT_NO || '47124425';
if (!/^\d{7,8}$/.test(certNo)) throw new Error('INVALID_BOUNDED_CERT_FORMAT');

const url = new URL('https://api.pcgs.com/publicapi/coindetail/GetCoinFactsByCertNo');
url.searchParams.set('CertNo', certNo);

const response = await fetch(url, {
  method: 'GET',
  headers: {
    authorization: `bearer ${token}`,
    accept: 'application/json'
  },
  redirect: 'error'
});

const httpStatus = response.status;
if (httpStatus !== 200) {
  throw new Error(`PCGS_LIVE_PROBE_HTTP_${httpStatus}`);
}

let payload;
try {
  payload = await response.json();
} catch {
  throw new Error('PCGS_RESPONSE_NOT_JSON');
}

const rootKeys = Object.keys(payload || {}).sort();
const record = payload?.CoinFacts || payload?.Coin || payload?.CoinDetail || payload?.Data || null;
const recordKeys = record && typeof record === 'object' ? Object.keys(record).sort() : [];
const allKeys = new Set([...rootKeys, ...recordKeys]);
const hasKey = (...names) => names.some(n => allKeys.has(n));

const isValidRequest = payload?.IsValidRequest;
const serverMessage = typeof payload?.ServerMessage === 'string' ? payload.ServerMessage : null;
if (isValidRequest !== true) throw new Error('PCGS_REQUEST_NOT_VALID');
if (serverMessage && !/successful/i.test(serverMessage)) throw new Error('PCGS_RECORD_NOT_SUCCESSFUL');

const summary = {
  probe_id: 'pcgs-live-single-record-r1',
  provider_id: 'pcgs-public-api',
  environment: 'DEV_SHADOW',
  endpoint_class: 'COINFACTS_BY_CERT_NUMBER',
  http_status: httpStatus,
  response_schema_root_keys: rootKeys,
  response_schema_record_keys: recordKeys,
  cert_identifier_presence: hasKey('CertNo','CertNumber','CertificationNumber'),
  grade_presence: hasKey('Grade','GradeNo','GradeDescription'),
  pcgs_number_presence: hasKey('PCGSNo','PcgsNo'),
  population_field_presence: hasKey('Population','PopHigher'),
  barcode_field_presence: hasKey('Barcode','HolderBarcode','BarcodeNo'),
  auction_realized_fields_presence: hasKey('AuctionPrices','AuctionRecords','AuctionPriceRealized','AuctionPricesRealized'),
  raw_provider_data_persisted: false,
  raw_provider_data_logged: false,
  provider_data_admitted: false,
  publication: 'HOLD',
  production: 'HOLD',
  rights_ceiling: 'BOUNDED_SINGLE_RECORD_RESEARCH_SCHEMA_AND_ER_CALIBRATION_REFERENCE_ONLY',
  provenance_timestamp: new Date().toISOString()
};

// Fail closed on the minimum schema needed to advance GRADED_POPULATION.
if (!summary.cert_identifier_presence) throw new Error('PCGS_CERT_IDENTIFIER_NOT_RETURNED');
if (!summary.grade_presence) throw new Error('PCGS_GRADE_NOT_RETURNED');
if (!summary.population_field_presence) throw new Error('PCGS_POPULATION_NOT_RETURNED');

console.log(JSON.stringify(summary, null, 2));
