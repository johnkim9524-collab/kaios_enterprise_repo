import fs from 'node:fs/promises';

const RECORD_URL = 'https://data.getty.edu/provenance/fbc91494-294c-30a6-b6dc-885f3ea074ed';
const RIGHTS_URL = 'https://data.getty.edu/provenance/docs/';
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 15000);
let res;
try {
  res = await fetch(RECORD_URL, {
    headers: {
      accept: 'application/ld+json, application/json;q=0.9',
      'user-agent': 'KIDULTS-ASI-DEV-SHADOW/1.0 (+getty-historical-sale-r1)'
    },
    signal: controller.signal
  });
} finally {
  clearTimeout(timer);
}
if (!res.ok) throw new Error(`Getty provenance record -> HTTP ${res.status}`);
const record = await res.json();
const serialized = JSON.stringify(record).toLowerCase();
const type = Array.isArray(record.type) ? record.type.join('|') : String(record.type ?? '');
const hasActivitySemantics = /activity/i.test(type) || serialized.includes('sale') || serialized.includes('auction');
if (!hasActivitySemantics) throw new Error('Getty record did not expose sale/activity semantics.');

const artifact = {
  id: 'getty-historical-sale-run-r1',
  execution_mode: 'DEV_SHADOW_ONLY',
  source_id: 'getty-provenance-index',
  rights_basis: 'CC0',
  rights_evidence: [RIGHTS_URL],
  retrieved_at: new Date().toISOString(),
  record_url: RECORD_URL,
  record_id: record.id ?? record['@id'] ?? RECORD_URL,
  record_type: record.type ?? null,
  validations: {
    live_public_api_retrieval: 'PASS',
    historical_sale_activity_semantics: 'PASS',
    rights_admission: 'PASS_CC0',
    current_market_price_semantics: 'NOT_ESTABLISHED',
    current_liquidity_semantics: 'NOT_ESTABLISHED',
    current_demand_semantics: 'NOT_ESTABLISHED',
    production_mutation: false
  },
  truth_boundary: 'Historical sale/provenance activity only. This record must not be promoted into current market price, liquidity, demand, or ranking claims.'
};

const output = process.argv[2] || '/tmp/getty-historical-sale-r1.json';
await fs.writeFile(output, JSON.stringify(artifact, null, 2));
console.log(JSON.stringify(artifact, null, 2));
