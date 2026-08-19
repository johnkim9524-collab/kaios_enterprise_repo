const token = process.env.KAIOS_PCGS_API_TOKEN;
const accountAuthorized = process.env.KAIOS_PCGS_ACCOUNT_AUTHORIZED === '1';
const eulaCompatible = process.env.KAIOS_PCGS_EULA_COMPATIBLE === '1';
if (!token) throw new Error('PCGS_TOKEN_SECRET_REQUIRED');
if (!accountAuthorized) throw new Error('PCGS_ACCOUNT_AUTHORIZATION_REQUIRED');
if (!eulaCompatible) throw new Error('PCGS_EULA_COMPATIBILITY_REQUIRED');

// Founder-approved bounded DEV/SHADOW single-record probe only.
// Use the exact CoinFacts-by-grade method published in PCGS Public API documentation.
// Raw provider response is never logged, persisted, uploaded, or admitted here.
const pcgsNo = process.env.KAIOS_PCGS_PROBE_PCGS_NO || '98836';
const gradeNo = process.env.KAIOS_PCGS_PROBE_GRADE_NO || '66';
const plusGrade = 'false';
if (!/^\d+$/.test(pcgsNo) || !/^\d{1,2}$/.test(gradeNo)) throw new Error('INVALID_BOUNDED_GRADE_PROBE_INPUT');

const url = new URL('https://api.pcgs.com/publicapi/coindetail/GetCoinFactsByGrade');
url.searchParams.set('PCGSNo', pcgsNo);
url.searchParams.set('GradeNo', gradeNo);
url.searchParams.set('PlusGrade', plusGrade);

const response = await fetch(url, {
  method: 'GET',
  headers: { authorization: `bearer ${token}`, accept: 'application/json' },
  redirect: 'error'
});
const httpStatus = response.status;
if (httpStatus !== 200) throw new Error(`PCGS_LIVE_PROBE_HTTP_${httpStatus}`);

let payload;
try { payload = await response.json(); } catch { throw new Error('PCGS_RESPONSE_NOT_JSON'); }

const keys = new Set();
function walk(v, depth=0) {
  if (depth > 5 || v == null) return;
  if (Array.isArray(v)) { for (const x of v.slice(0,3)) walk(x, depth+1); return; }
  if (typeof v !== 'object') return;
  for (const [k,val] of Object.entries(v)) { keys.add(k); walk(val, depth+1); }
}
walk(payload);
const schemaKeys = [...keys].sort();
const hasKey = (...names) => names.some(n => keys.has(n));

if (payload?.IsValidRequest === false) throw new Error('PCGS_REQUEST_NOT_VALID');
if (typeof payload?.ServerMessage === 'string' && /no data|invalid/i.test(payload.ServerMessage)) throw new Error('PCGS_RECORD_NOT_SUCCESSFUL');

const summary = {
  probe_id: 'pcgs-live-single-record-r1',
  provider_id: 'pcgs-public-api',
  environment: 'DEV_SHADOW',
  endpoint_class: 'COINFACTS_BY_PCGS_NUMBER_AND_GRADE',
  http_status: httpStatus,
  response_schema_keys: schemaKeys,
  grade_presence: hasKey('Grade','GradeNo','GradeDescription'),
  pcgs_number_presence: hasKey('PCGSNo','PcgsNo'),
  population_field_presence: hasKey('Population','PopHigher'),
  cert_identifier_presence: hasKey('CertNo','CertNumber','CertificationNumber'),
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

// This first live call proves the documented grading/population schema only.
// Cert/alias proof is deliberately a separate next probe and is not inferred.
if (!summary.pcgs_number_presence) throw new Error('PCGS_NUMBER_NOT_RETURNED');
if (!summary.grade_presence) throw new Error('PCGS_GRADE_NOT_RETURNED');
if (!summary.population_field_presence) throw new Error('PCGS_POPULATION_NOT_RETURNED');

console.log(JSON.stringify(summary, null, 2));
