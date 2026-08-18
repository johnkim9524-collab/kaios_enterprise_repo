#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const input = process.argv[2]
  || 'coordination/kidults/scope-data/scope-poc-anchor-selection-v1.json';
const outDir = process.argv[3] || 'tmp/regional-live-diagnostic-v1';

function boundedInteger(name, rawValue, fallback, minimum, maximum) {
  const value = rawValue === undefined ? fallback : Number(rawValue);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name}_MUST_BE_INTEGER_${minimum}_TO_${maximum}`);
  }
  return value;
}

function boundedRate(name, rawValue, fallback) {
  const value = rawValue === undefined ? fallback : Number(rawValue);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${name}_MUST_BE_NUMBER_0_TO_1`);
  }
  return value;
}

function retryAfterMilliseconds(value, now = Date.now()) {
  if (!value) return 0;
  if (/^\d+(?:\.\d+)?$/.test(value)) return Number(value) * 1000;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - now) : 0;
}

function diagnosticStatus(recordCount, rowCount, errorRecordCount, maximumErrorRate) {
  if (recordCount <= 0 || rowCount !== recordCount) {
    return 'DIAGNOSTIC_INCOMPLETE_FAIL_CLOSED';
  }
  const errorRate = errorRecordCount / recordCount;
  return errorRecordCount < recordCount && errorRate <= maximumErrorRate
    ? 'DIAGNOSTIC_COMPLETE_FAIL_CLOSED'
    : 'DIAGNOSTIC_INCOMPLETE_FAIL_CLOSED';
}

function runSelfTest() {
  const failures = [];
  const expect = (condition, message) => { if (!condition) failures.push(message); };
  expect(diagnosticStatus(64, 64, 0, 0.2) === 'DIAGNOSTIC_COMPLETE_FAIL_CLOSED', 'healthy run');
  expect(diagnosticStatus(64, 64, 12, 0.2) === 'DIAGNOSTIC_COMPLETE_FAIL_CLOSED', 'bounded partial run');
  expect(diagnosticStatus(64, 64, 13, 0.2) === 'DIAGNOSTIC_INCOMPLETE_FAIL_CLOSED', 'excess error run');
  expect(diagnosticStatus(64, 64, 64, 0.2) === 'DIAGNOSTIC_INCOMPLETE_FAIL_CLOSED', 'total outage');
  expect(diagnosticStatus(64, 63, 0, 0.2) === 'DIAGNOSTIC_INCOMPLETE_FAIL_CLOSED', 'row loss');
  expect(retryAfterMilliseconds('2', 0) === 2000, 'numeric Retry-After');
  expect(retryAfterMilliseconds('Thu, 01 Jan 1970 00:00:03 GMT', 0) === 3000, 'date Retry-After');
  try {
    boundedInteger('CONCURRENCY', '0', 4, 1, 16);
    failures.push('zero concurrency accepted');
  } catch {}
  if (failures.length) throw new Error(`SELF_TEST_FAILED: ${failures.join(', ')}`);
  console.log(JSON.stringify({ status: 'PASS', tests: 8 }, null, 2));
}

if (process.argv.includes('--self-test')) {
  runSelfTest();
  process.exit(0);
}

const concurrency = boundedInteger('CONCURRENCY', process.env.CONCURRENCY, 4, 1, 16);
const requestTimeoutMs = boundedInteger(
  'REQUEST_TIMEOUT_MS',
  process.env.REQUEST_TIMEOUT_MS,
  12000,
  1000,
  60000
);
const maximumRecordErrorRate = boundedRate(
  'MAX_RECORD_ERROR_RATE',
  process.env.MAX_RECORD_ERROR_RATE,
  0.2
);

fs.mkdirSync(outDir, { recursive: true });

const inputBytes = fs.readFileSync(input);
const source = JSON.parse(inputBytes.toString('utf8'));
if (!Array.isArray(source.records) || source.records.length === 0) {
  throw new Error('INPUT_RECORDS_REQUIRED');
}
const records = source.records;
const recordIds = records.map(record => record?.representative_product_id);
if (recordIds.some(id => typeof id !== 'string' || id.length === 0)) {
  throw new Error('REPRESENTATIVE_PRODUCT_ID_REQUIRED');
}
if (new Set(recordIds).size !== recordIds.length) {
  throw new Error('REPRESENTATIVE_PRODUCT_ID_MUST_BE_UNIQUE');
}
if (records.some(record => typeof record?.target_scope_id !== 'string' || record.target_scope_id.length === 0)) {
  throw new Error('TARGET_SCOPE_ID_REQUIRED');
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const targetLangs = {
  en: 'GLOBAL_EN',
  ja: 'JAPAN_JA',
  ko: 'KOREA_KO',
  de: 'GERMANY_DE',
  fr: 'FRANCE_FR'
};

function canonicalScopeId(scopeId) {
  return scopeId === 'vintage_digital_watches'
    ? 'vintage_neo_vintage_watches'
    : scopeId;
}

async function fetchJson(url, attempt = 0) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'KIDULTS-Regional-Diagnostic/1.3 (+https://github.com/johnkim9524-collab/kaios_enterprise_repo)'
      }
    });

    if ((response.status === 429 || response.status >= 500) && attempt < 4) {
      const retryAfter = retryAfterMilliseconds(response.headers.get('retry-after'));
      await sleep(Math.min(60000, Math.max(retryAfter, 800 * (2 ** attempt))));
      return fetchJson(url, attempt + 1);
    }

    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function probe(record) {
  const errors = [];
  let title = null;

  try {
    const url = new URL('https://en.wikipedia.org/w/api.php');
    for (const [key, value] of Object.entries({
      action: 'query',
      list: 'search',
      srsearch: record.display_name || record.representative_product_id,
      srlimit: '1',
      format: 'json',
      origin: '*'
    })) url.searchParams.set(key, value);

    const search = await fetchJson(url);
    title = search?.query?.search?.[0]?.title || null;
  } catch (error) {
    errors.push({
      id: record.representative_product_id,
      stage: 'SEARCH',
      error: error.message
    });
  }

  let langlinks = [];
  if (title) {
    try {
      const url = new URL('https://en.wikipedia.org/w/api.php');
      for (const [key, value] of Object.entries({
        action: 'query',
        titles: title,
        prop: 'langlinks',
        lllimit: 'max',
        format: 'json',
        origin: '*'
      })) url.searchParams.set(key, value);

      const data = await fetchJson(url);
      const page = Object.values(data?.query?.pages || {})[0] || {};
      langlinks = page.langlinks || [];
    } catch (error) {
      errors.push({
        id: record.representative_product_id,
        stage: 'LANGLINKS',
        error: error.message
      });
    }
  }

  const regionalPresence = [
    { lang: 'en', region: 'GLOBAL_EN', title },
    ...langlinks
      .filter(value => targetLangs[value.lang])
      .map(value => ({
        lang: value.lang,
        region: targetLangs[value.lang],
        title: value['*']
      }))
  ].filter(value => value.title);

  return {
    row: {
      representative_product_id: record.representative_product_id,
      scope_id: canonicalScopeId(record.target_scope_id),
      source_scope_id: record.target_scope_id,
      display_name: record.display_name,
      wikipedia_title: title,
      mapping_state: title
        ? 'CANDIDATE_MAPPING_NOT_IDENTITY_VERIFIED'
        : 'NOT_MAPPED',
      regional_public_representation: regionalPresence,
      source_family: 'WIKIMEDIA_SINGLE_LINEAGE',
      regional_semantics: 'PUBLIC_LANGUAGE_REGION_REPRESENTATION_ONLY_NOT_DEMAND_NOT_TRANSACTION',
      state: regionalPresence.length >= 2
        ? 'PUBLIC_REGIONAL_REPRESENTATION_OBSERVED_NOT_REGIONAL_MARKET_PROVEN'
        : 'LIMITED_PUBLIC_REGIONAL_REPRESENTATION'
    },
    errors
  };
}

const results = [];
for (let index = 0; index < records.length; index += concurrency) {
  results.push(...await Promise.all(records.slice(index, index + concurrency).map(probe)));
  await sleep(250);
}

const rows = results.map(result => result.row);
const errors = results.flatMap(result => result.errors);
const errorRecordCount = new Set(errors.map(error => error.id)).size;
const recordErrorRate = errorRecordCount / records.length;
const runStatus = diagnosticStatus(records.length, rows.length, errorRecordCount, maximumRecordErrorRate);
const mapped = rows.filter(row => row.wikipedia_title).length;
const multi = rows.filter(row => row.regional_public_representation.length >= 2).length;
const scopes = new Set(
  rows
    .filter(row => row.regional_public_representation.length >= 2)
    .map(row => row.scope_id)
).size;

const defects = [
  {
    id: 'WIKIMEDIA-STREAM-INDEPENDENCE-GAP',
    severity: 'P0',
    finding: 'This live diagnostic contains one Wikimedia lineage and cannot by itself satisfy the separate regional-context source-pair contract.',
    remediation: 'Add independent regional institutional/release/venue evidence family before any REGIONAL challenger selection.'
  },
  {
    id: 'REGIONAL-SEMANTICS-GUARD',
    severity: 'P0_GUARD',
    finding: 'Language/region representation is not regional demand, liquidity or transaction evidence.'
  },
  {
    id: 'REGIONAL-IDENTITY-MAPPING-REVIEW-GAP',
    severity: 'P0_GUARD',
    finding: 'Search-title matches are candidate mappings only and require identity review before they can support a regional terminal state.'
  }
];

if (mapped < records.length * 0.7) {
  defects.push({
    id: 'REGIONAL-MAPPING-COVERAGE',
    severity: 'P1',
    finding: 'Public-encyclopedia title mapping is below 70%; regional representation cannot be treated as universal.'
  });
}

const output = {
  id: 'kidults-regional-live-diagnostic-v1.3',
  version: '1.3.0',
  status: runStatus,
  observed_at: new Date().toISOString(),
  input: {
    path: input,
    digest: `sha256:${crypto.createHash('sha256').update(inputBytes).digest('hex')}`
  },
  products: records.length,
  mapped_products: mapped,
  identity_reviewed_products: 0,
  products_with_multi_region_public_representation: multi,
  scopes_with_multi_region_public_representation: scopes,
  request_errors: errors,
  error_record_count: errorRecordCount,
  record_error_rate: recordErrorRate,
  successful_record_count: records.length - errorRecordCount,
  data_completeness_state: errorRecordCount === 0
    ? 'COMPLETE'
    : runStatus === 'DIAGNOSTIC_COMPLETE_FAIL_CLOSED'
      ? 'PARTIAL_WITHIN_EXPLICIT_ERROR_BUDGET'
      : 'INCOMPLETE_ERROR_BUDGET_EXCEEDED',
  rows,
  defects,
  selected_regional_challengers: 0,
  operating: {
    bounded_concurrency: concurrency,
    retry_after_backoff: true,
    request_timeout_ms: requestTimeoutMs,
    maximum_record_error_rate: maximumRecordErrorRate,
    canonical_scope_migration_applied: true
  },
  provider_contact: 'HOLD',
  production: 'HOLD'
};

fs.writeFileSync(
  path.join(outDir, 'regional-live-diagnostic-v1.json'),
  JSON.stringify(output, null, 2)
);

console.log(JSON.stringify({
  status: output.status,
  products: output.products,
  mapped,
  multi_region: multi,
  scopes_multi_region: scopes,
  errors: errors.length,
  error_records: errorRecordCount,
  record_error_rate: recordErrorRate,
  selected: 0
}, null, 2));

if (output.status !== 'DIAGNOSTIC_COMPLETE_FAIL_CLOSED') {
  process.exitCode = 2;
}
