#!/usr/bin/env node
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const [
  missionQueuePath = '/tmp/kidults-asi-intelligence-preparation-wave-v1/autonomous-mission-queue-v1.json',
  outputPath = '/tmp/kidults-asi-mission-discovery-raw-v1.json'
] = process.argv.slice(2);

const missionQueue = JSON.parse(await fs.readFile(missionQueuePath, 'utf8'));
const concurrency = Math.max(1, Math.min(8, Number(process.env.ASI_MISSION_DISCOVERY_CONCURRENCY || 4)));
const timeoutMs = Math.max(5000, Math.min(30000, Number(process.env.ASI_MISSION_DISCOVERY_TIMEOUT_MS || 18000)));
const retryCount = Math.max(0, Math.min(3, Number(process.env.ASI_MISSION_DISCOVERY_RETRIES || 2)));
const groupLimit = Math.max(1, Math.min(64, Number(process.env.ASI_MISSION_QUERY_GROUP_LIMIT || 64)));
const userAgent = 'KIDULTS-ASI-Discovery/1.0 (bounded public metadata research; contact via repository owner)';
const nowIso = () => new Date().toISOString();
const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

if (missionQueue.id !== 'kidults-asi-autonomous-mission-queue-v1' || missionQueue.mission_count !== 192 || missionQueue.missions?.length !== 192) {
  throw new Error('MISSION_QUEUE_INVALID');
}

const groupMap = new Map();
for (const mission of missionQueue.missions) {
  const groupId = `${mission.scope_id}::${mission.evidence_class}`;
  if (!groupMap.has(groupId)) {
    groupMap.set(groupId, {
      query_group_id: groupId,
      scope_id: mission.scope_id,
      scope_name: mission.scope_name,
      domain: mission.domain,
      archetype: mission.archetype,
      evidence_class: mission.evidence_class,
      claim_ceiling: mission.claim_ceiling,
      mission_ids: [],
      regions: [],
      language_rules: []
    });
  }
  const group = groupMap.get(groupId);
  group.mission_ids.push(mission.mission_id);
  group.regions.push(mission.region);
  group.language_rules.push(mission.language_rule);
}

const groups = [...groupMap.values()]
  .map((group) => ({
    ...group,
    mission_ids: [...new Set(group.mission_ids)].sort(),
    regions: [...new Set(group.regions)].sort(),
    language_rules: [...new Set(group.language_rules)].sort()
  }))
  .sort((a, b) => a.query_group_id.localeCompare(b.query_group_id))
  .slice(0, groupLimit);

if (groups.length !== groupLimit || (groupLimit === 64 && groups.some((group) => group.mission_ids.length !== 3))) {
  throw new Error(`QUERY_GROUP_SHAPE_INVALID:${groups.length}`);
}

const evidenceTerms = {
  CURRENT_SOLD_TRANSACTION: ['auction results', 'sold for', 'hammer price', 'realized price'],
  LIQUIDITY_TIME_TO_SALE_EXPOSURE: ['sell through', 'time to sale', 'days on market', 'auction clearance']
};

function compactScopeName(value) {
  return String(value)
    .replace(/&/g, ' and ')
    .replace(/[“”"'`]/g, ' ')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function gdeltQuery(group) {
  const scope = compactScopeName(group.scope_name);
  const terms = evidenceTerms[group.evidence_class];
  if (!terms) throw new Error(`EVIDENCE_TERMS_MISSING:${group.evidence_class}`);
  return `"${scope}" (${terms.map((term) => `"${term}"`).join(' OR ')})`;
}

function wikidataQuery(group) {
  const scope = compactScopeName(group.scope_name);
  return group.evidence_class === 'CURRENT_SOLD_TRANSACTION'
    ? `${scope} auction marketplace dealer`
    : `${scope} auction marketplace exchange`;
}

async function fetchText(url, laneId) {
  let lastError = null;
  const attempts = [];
  for (let attempt = 1; attempt <= retryCount + 1; attempt += 1) {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          accept: 'application/json',
          'user-agent': userAgent
        },
        signal: controller.signal,
        redirect: 'follow'
      });
      const text = await response.text();
      clearTimeout(timer);
      const attemptRecord = {
        attempt,
        observed_at: nowIso(),
        http_status: response.status,
        ok: response.ok,
        duration_ms: Date.now() - startedAt,
        response_bytes: Buffer.byteLength(text),
        response_digest: sha256(text)
      };
      attempts.push(attemptRecord);
      if (response.ok) {
        return { ok: true, text, attempts, final_http_status: response.status, error: null };
      }
      lastError = `HTTP_${response.status}`;
      if (![408, 425, 429, 500, 502, 503, 504].includes(response.status) || attempt > retryCount) break;
    } catch (error) {
      clearTimeout(timer);
      lastError = error?.name === 'AbortError' ? 'TIMEOUT' : `FETCH_ERROR:${String(error?.message || error)}`;
      attempts.push({
        attempt,
        observed_at: nowIso(),
        http_status: null,
        ok: false,
        duration_ms: Date.now() - startedAt,
        response_bytes: 0,
        response_digest: null,
        error: lastError
      });
      if (attempt > retryCount) break;
    }
    await sleep(300 * attempt);
  }
  return { ok: false, text: '', attempts, final_http_status: attempts.at(-1)?.http_status ?? null, error: `${laneId}:${lastError || 'UNKNOWN_FAILURE'}` };
}

function parseJson(text, code) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(code);
  }
}

async function collectGdelt(group) {
  const query = gdeltQuery(group);
  const params = new URLSearchParams({
    query,
    mode: 'ArtList',
    maxrecords: '10',
    format: 'json',
    sort: 'HybridRel'
  });
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?${params}`;
  const fetched = await fetchText(url, 'GDELT_DOC_PUBLIC_METADATA');
  let parsed = null;
  let records = [];
  let parseError = null;
  if (fetched.ok) {
    try {
      parsed = parseJson(fetched.text, 'GDELT_JSON_INVALID');
      records = Array.isArray(parsed?.articles) ? parsed.articles.slice(0, 10).map((article) => ({
        url: typeof article.url === 'string' ? article.url : null,
        url_mobile: typeof article.url_mobile === 'string' ? article.url_mobile : null,
        title: typeof article.title === 'string' ? article.title : null,
        seendate: typeof article.seendate === 'string' ? article.seendate : null,
        domain: typeof article.domain === 'string' ? article.domain : null,
        language: typeof article.language === 'string' ? article.language : null,
        sourcecountry: typeof article.sourcecountry === 'string' ? article.sourcecountry : null,
        socialimage: typeof article.socialimage === 'string' ? article.socialimage : null
      })) : [];
    } catch (error) {
      parseError = String(error?.message || error);
    }
  }
  return {
    lane_id: 'GDELT_DOC_PUBLIC_METADATA',
    query,
    request_url: url,
    request_url_digest: sha256(url),
    state: fetched.ok && !parseError ? (records.length > 0 ? 'SUCCESS_WITH_RESULTS' : 'SUCCESS_EMPTY') : 'FAILED',
    attempts: fetched.attempts,
    final_http_status: fetched.final_http_status,
    response_digest: fetched.attempts.at(-1)?.response_digest ?? null,
    response_bytes: fetched.attempts.at(-1)?.response_bytes ?? 0,
    record_count: records.length,
    records,
    error: parseError || fetched.error,
    response_snapshot: fetched.ok ? parsed : null,
    discovery_only: true,
    target_site_body_crawled: false
  };
}

async function collectWikidata(group) {
  const query = wikidataQuery(group);
  const searchParams = new URLSearchParams({
    action: 'wbsearchentities',
    search: query,
    language: 'en',
    uselang: 'en',
    type: 'item',
    limit: '10',
    format: 'json',
    origin: '*'
  });
  const searchUrl = `https://www.wikidata.org/w/api.php?${searchParams}`;
  const searchFetched = await fetchText(searchUrl, 'WIKIDATA_OFFICIAL_WEBSITE_GRAPH');
  let searchParsed = null;
  let searchResults = [];
  let parseError = null;
  if (searchFetched.ok) {
    try {
      searchParsed = parseJson(searchFetched.text, 'WIKIDATA_SEARCH_JSON_INVALID');
      searchResults = Array.isArray(searchParsed?.search) ? searchParsed.search.slice(0, 10) : [];
    } catch (error) {
      parseError = String(error?.message || error);
    }
  }
  const ids = searchResults.map((item) => item.id).filter((id) => /^Q\d+$/.test(String(id)));
  let entityFetched = null;
  let entityParsed = null;
  let entities = {};
  if (!parseError && ids.length > 0) {
    const entityParams = new URLSearchParams({
      action: 'wbgetentities',
      ids: ids.join('|'),
      props: 'claims|labels|descriptions',
      languages: 'en',
      format: 'json',
      origin: '*'
    });
    const entityUrl = `https://www.wikidata.org/w/api.php?${entityParams}`;
    entityFetched = await fetchText(entityUrl, 'WIKIDATA_OFFICIAL_WEBSITE_GRAPH');
    if (entityFetched.ok) {
      try {
        entityParsed = parseJson(entityFetched.text, 'WIKIDATA_ENTITY_JSON_INVALID');
        entities = entityParsed?.entities && typeof entityParsed.entities === 'object' ? entityParsed.entities : {};
      } catch (error) {
        parseError = String(error?.message || error);
      }
    }
  }
  const records = searchResults.map((item) => {
    const entity = entities[item.id] || {};
    const websites = Array.isArray(entity?.claims?.P856)
      ? entity.claims.P856.map((claim) => claim?.mainsnak?.datavalue?.value).filter((value) => typeof value === 'string')
      : [];
    return {
      entity_id: item.id || null,
      label: item.label || entity?.labels?.en?.value || null,
      description: item.description || entity?.descriptions?.en?.value || null,
      concept_url: item.concepturi || null,
      official_websites: [...new Set(websites)].sort()
    };
  });
  const attempts = [...searchFetched.attempts, ...(entityFetched?.attempts || [])];
  const overallOk = searchFetched.ok && !parseError && (ids.length === 0 || entityFetched?.ok === true);
  return {
    lane_id: 'WIKIDATA_OFFICIAL_WEBSITE_GRAPH',
    query,
    request_url: searchUrl,
    request_url_digest: sha256(searchUrl),
    state: overallOk ? (records.length > 0 ? 'SUCCESS_WITH_RESULTS' : 'SUCCESS_EMPTY') : 'FAILED',
    attempts,
    final_http_status: entityFetched?.final_http_status ?? searchFetched.final_http_status,
    response_digest: sha256(JSON.stringify({ search: searchParsed, entities: entityParsed })),
    response_bytes: attempts.reduce((total, attempt) => total + Number(attempt.response_bytes || 0), 0),
    record_count: records.length,
    records,
    error: parseError || entityFetched?.error || searchFetched.error,
    response_snapshot: overallOk ? { search: searchParsed, entities: entityParsed } : null,
    discovery_only: true,
    target_site_body_crawled: false
  };
}

async function collectGroup(group) {
  const startedAt = nowIso();
  const [gdelt, wikidata] = await Promise.all([
    collectGdelt(group),
    collectWikidata(group)
  ]);
  return {
    ...group,
    started_at: startedAt,
    completed_at: nowIso(),
    lanes: [gdelt, wikidata]
  };
}

async function mapConcurrent(values, limit, fn) {
  const output = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= values.length) return;
      output[index] = await fn(values[index], index);
      await sleep(100);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, () => worker()));
  return output;
}

const collectedAt = nowIso();
const queryGroups = await mapConcurrent(groups, concurrency, collectGroup);
const lanes = queryGroups.flatMap((group) => group.lanes);
const report = {
  id: 'kidults-asi-mission-discovery-raw-v1',
  version: '1.0.0',
  state: lanes.some((lane) => lane.state.startsWith('SUCCESS'))
    ? (lanes.some((lane) => lane.state === 'FAILED') ? 'PARTIAL_SUCCESS_WITH_EXPLICIT_PROVIDER_FAILURES' : 'SUCCESS')
    : 'FAILED_NO_PROVIDER_SUCCESS',
  collected_at: collectedAt,
  mission_queue: {
    id: missionQueue.id,
    version: missionQueue.version,
    mission_count: missionQueue.mission_count
  },
  query_group_count: queryGroups.length,
  mission_count_represented: queryGroups.reduce((total, group) => total + group.mission_ids.length, 0),
  discovery_lane_count: 2,
  request_attempt_count: lanes.reduce((total, lane) => total + lane.attempts.length, 0),
  successful_lane_queries: lanes.filter((lane) => lane.state.startsWith('SUCCESS')).length,
  failed_lane_queries: lanes.filter((lane) => lane.state === 'FAILED').length,
  successful_provider_lanes: [...new Set(lanes.filter((lane) => lane.state.startsWith('SUCCESS')).map((lane) => lane.lane_id))].sort(),
  raw_record_count: lanes.reduce((total, lane) => total + lane.record_count, 0),
  query_groups: queryGroups,
  external_http_method: 'GET_ONLY',
  target_site_body_crawled: false,
  collection_right_created: false,
  evidence_admitted: false,
  market_claim_created: false,
  public_release: 'HOLD',
  production: 'HOLD'
};

await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  state: report.state,
  query_groups: report.query_group_count,
  missions_represented: report.mission_count_represented,
  successful_lane_queries: report.successful_lane_queries,
  failed_lane_queries: report.failed_lane_queries,
  successful_provider_lanes: report.successful_provider_lanes,
  raw_records: report.raw_record_count,
  output: outputPath
}, null, 2));

if (report.state === 'FAILED_NO_PROVIDER_SUCCESS') process.exitCode = 2;
