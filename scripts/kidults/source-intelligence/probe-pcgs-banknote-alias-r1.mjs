const token = process.env.KAIOS_PCGS_API_TOKEN;
const accountAuthorized = process.env.KAIOS_PCGS_ACCOUNT_AUTHORIZED === '1';
const eulaCompatible = process.env.KAIOS_PCGS_EULA_COMPATIBLE === '1';
if (!token) throw new Error('PCGS_TOKEN_SECRET_REQUIRED');
if (!accountAuthorized) throw new Error('PCGS_ACCOUNT_AUTHORIZATION_REQUIRED');
if (!eulaCompatible) throw new Error('PCGS_EULA_COMPATIBILITY_REQUIRED');

// Founder-approved bounded DEV/SHADOW single-record probe only.
// Official PCGS Swagger documents /banknotedetail/GetBanknoteByCertNo and
// returns Banknote.CertNo + Banknote.SerialNo + Grade + Population/PopHigher.
// Use one publicly verifiable PCGS Banknote certification as a calibration reference.
const certNo = process.env.KAIOS_PCGS_BANKNOTE_PROBE_CERT_NO || '59009488';
if (!/^\d{8}$/.test(certNo)) throw new Error('INVALID_BOUNDED_CERT_FORMAT');

const url = new URL('https://api.pcgs.com/publicapi/banknotedetail/GetBanknoteByCertNo');
url.searchParams.set('certNo', certNo);

const response = await fetch(url, {
  method: 'GET',
  headers: {
    authorization: `bearer ${token}`,
    accept: 'application/json'
  },
  redirect: 'error'
});
if (response.status !== 200) throw new Error(`PCGS_BANKNOTE_LIVE_PROBE_HTTP_${response.status}`);

let payload;
try { payload = await response.json(); } catch { throw new Error('PCGS_BANKNOTE_RESPONSE_NOT_JSON'); }
if (payload?.IsValidRequest !== true) throw new Error('PCGS_BANKNOTE_REQUEST_NOT_VALID');
if (typeof payload?.ServerMessage === 'string' && !/successful/i.test(payload.ServerMessage)) throw new Error('PCGS_BANKNOTE_RECORD_NOT_SUCCESSFUL');
const record = payload?.Banknote;
if (!record || typeof record !== 'object') throw new Error('PCGS_BANKNOTE_RECORD_MISSING');

const keys = Object.keys(record).sort();
const certPresent = typeof record.CertNo === 'string' && record.CertNo.length > 0;
const serialPresent = typeof record.SerialNo === 'string' && record.SerialNo.length > 0;
const gradePresent = typeof record.Grade === 'string' && record.Grade.length > 0;
const populationPresent = Number.isInteger(record.Population) || Number.isInteger(record.PopHigher);
if (!certPresent) throw new Error('PCGS_BANKNOTE_CERT_IDENTIFIER_NOT_RETURNED');
if (!serialPresent) throw new Error('PCGS_BANKNOTE_SERIAL_ALIAS_NOT_RETURNED');
if (!gradePresent) throw new Error('PCGS_BANKNOTE_GRADE_NOT_RETURNED');
if (!populationPresent) throw new Error('PCGS_BANKNOTE_POPULATION_NOT_RETURNED');

// Do not emit raw provider values. Only schema/presence and cryptographic-free equality semantics.
const summary = {
  probe_id: 'pcgs-banknote-alias-r1',
  provider_id: 'pcgs-public-api',
  environment: 'DEV_SHADOW',
  endpoint_class: 'BANKNOTE_BY_CERT_NUMBER',
  http_status: response.status,
  response_schema_record_keys: keys,
  cert_identifier_presence: certPresent,
  authoritative_second_identifier_class: 'BANKNOTE_SERIAL_NUMBER',
  authoritative_second_identifier_presence: serialPresent,
  grade_presence: gradePresent,
  population_context_presence: populationPresent,
  alias_binding_same_authoritative_record: certPresent && serialPresent,
  raw_provider_data_persisted: false,
  raw_provider_data_logged: false,
  provider_data_admitted: false,
  publication: 'HOLD',
  production: 'HOLD',
  rights_ceiling: 'BOUNDED_SINGLE_RECORD_RESEARCH_SCHEMA_AND_ER_CALIBRATION_REFERENCE_ONLY',
  provenance_timestamp: new Date().toISOString()
};
console.log(JSON.stringify(summary, null, 2));
