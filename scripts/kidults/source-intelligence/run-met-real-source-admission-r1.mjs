import fs from 'node:fs/promises';

const SEARCH_URL = 'https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&q=baseball%20card';
const RIGHTS_URLS = [
  'https://www.metmuseum.org/policies/terms-and-conditions',
  'https://www.metmuseum.org/hubs/open-access'
];
const DOCUMENTED_PUBLIC_DOMAIN_FALLBACK_IDS = [45734, 437133];
const timeoutMs = 15000;

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'KIDULTS-ASI-DEV-SHADOW/1.0 (+rights-admission-r1)' },
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function projectIdentityContext(obj) {
  return {
    objectID: obj.objectID,
    title: obj.title ?? null,
    objectName: obj.objectName ?? null,
    department: obj.department ?? null,
    culture: obj.culture ?? null,
    period: obj.period ?? null,
    objectDate: obj.objectDate ?? null,
    accessionNumber: obj.accessionNumber ?? null,
    objectURL: obj.objectURL ?? null,
    isPublicDomain: true
  };
}

const search = await fetchJson(SEARCH_URL);
if (!Number.isInteger(search.total) || search.total <= 0 || !Array.isArray(search.objectIDs)) {
  throw new Error('Met search returned no usable object IDs.');
}

const sampled = [];
const attempted = [];
for (const objectID of search.objectIDs.slice(0, 60)) {
  attempted.push(objectID);
  const obj = await fetchJson(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${objectID}`);
  if (obj?.isPublicDomain === true) sampled.push(projectIdentityContext(obj));
  if (sampled.length >= 3) break;
}

let fallbackUsed = false;
if (sampled.length === 0) {
  fallbackUsed = true;
  for (const objectID of DOCUMENTED_PUBLIC_DOMAIN_FALLBACK_IDS) {
    const obj = await fetchJson(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${objectID}`);
    if (obj?.isPublicDomain === true) sampled.push(projectIdentityContext(obj));
  }
}

if (sampled.length === 0) {
  throw new Error('No public-domain object could be verified from search results or documented fallback controls.');
}

const artifact = {
  id: 'met-real-source-admission-run-r1',
  execution_mode: 'DEV_SHADOW_ONLY',
  source_id: 'met-open-access-api',
  rights_basis: 'CC0_OPEN_ACCESS',
  rights_evidence: RIGHTS_URLS,
  retrieved_at: new Date().toISOString(),
  query_class: 'IDENTITY_CONTEXT',
  search_total: search.total,
  bounded_search_attempts: attempted.length,
  fallback_used: fallbackUsed,
  sample_count: sampled.length,
  samples: sampled,
  validations: {
    live_public_api_retrieval: 'PASS',
    public_domain_filter: 'PASS',
    identity_context_semantics: 'PASS',
    sold_transaction_semantics: 'NOT_PRESENT',
    market_price_semantics: 'NOT_PRESENT',
    market_event_admission: 'PROHIBITED',
    production_mutation: false
  },
  truth_boundary: 'This proves live retrieval and rights-admitted identity/context handling only. It does not prove sold-event or market-price evidence.'
};

const output = process.argv[2] || '/tmp/met-real-source-admission-r1.json';
await fs.writeFile(output, JSON.stringify(artifact, null, 2));
console.log(JSON.stringify(artifact, null, 2));
