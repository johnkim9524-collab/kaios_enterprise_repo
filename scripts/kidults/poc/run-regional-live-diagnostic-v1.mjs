#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const input = process.argv[2]
  || 'coordination/kidults/scope-data/scope-poc-anchor-selection-v1.json';
const outDir = process.argv[3] || 'tmp/regional-live-diagnostic-v1';
const concurrency = Number(process.env.CONCURRENCY || 4);
const requestTimeoutMs = Number(process.env.REQUEST_TIMEOUT_MS || 12000);

fs.mkdirSync(outDir, { recursive: true });

const inputBytes = fs.readFileSync(input);
const source = JSON.parse(inputBytes.toString('utf8'));
const records = source.records || [];
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
      headers: { 'User-Agent': 'KIDULTS-Regional-Diagnostic/1.2' }
    });

    if ((response.status === 429 || response.status >= 500) && attempt < 4) {
      const retryAfter = Number(response.headers.get('retry-after') || 0);
      await sleep(Math.max(retryAfter * 1000, 800 * (2 ** attempt)));
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
const mapped = rows.filter(row => row.wikipedia_title).length;
const multi = rows.filter(row => row.regional_public_representation.length >= 2).length;
const scopes = new Set(
  rows
    .filter(row => row.regional_public_representation.length >= 2)
    .map(row => row.scope_id)
).size;

const defects = [
  {
    id: 'REGIONAL-INDEPENDENCE-GAP',
    severity: 'P0',
    finding: 'One Wikimedia lineage cannot satisfy the Regional contract requirement for two independent source families plus institutional/release/venue evidence.',
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
  id: 'kidults-regional-live-diagnostic-v1.2',
  version: '1.2.0',
  status: 'DIAGNOSTIC_COMPLETE_FAIL_CLOSED',
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
  rows,
  defects,
  selected_regional_challengers: 0,
  operating: {
    bounded_concurrency: concurrency,
    retry_after_backoff: true,
    request_timeout_ms: requestTimeoutMs,
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
  selected: 0
}, null, 2));
