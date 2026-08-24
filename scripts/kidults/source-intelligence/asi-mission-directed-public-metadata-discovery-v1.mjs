#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const [
  intentPath = '/tmp/kidults-asi-mission-consumption-v1/mission-discovery-intent-v1.json',
  previousStatePath = '/tmp/previous-mission-directed-discovery/mission-directed-discovery-cycle-state-v1.json',
  contractPath = 'coordination/kidults/source-intelligence/asi-mission-directed-discovery-contract-v1.json',
  outputDir = '/tmp/kidults-asi-mission-directed-discovery-v1'
] = process.argv.slice(2);

const intentsInput = JSON.parse(fs.readFileSync(intentPath, 'utf8'));
const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
const hash = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const normalizeUrl = (value) => {
  try {
    const url = new URL(String(value || '').trim());
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
};
const boundedError = (error) => String(error?.message || error || 'UNKNOWN').replace(/[^A-Za-z0-9_:.\-]/g, '_').slice(0, 160);
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const nowIso = () => new Date().toISOString();
const fetchJson = async (url, options = {}, attempt = 0) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if ((response.status === 429 || response.status >= 500) && attempt < 2) {
      await sleep(800 * (2 ** attempt));
      return fetchJson(url, options, attempt + 1);
    }
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
};

const principles = ['AUTONOMOUS', 'GLOBAL', 'IRREPLACEABLE_VALUE', 'TRANSPARENT'];
if (intentsInput.id !== 'kidults-asi-mission-discovery-intent-v1' || intentsInput.intent_count !== intentsInput.intents?.length || intentsInput.intent_count < 1) {
  throw new Error('MISSION_DISCOVERY_INTENT_INPUT_INVALID');
}
if (contract.id !== 'kidults-asi-mission-directed-discovery-contract-v1' || contract.version !== '1.0.0' ||
    JSON.stringify(contract.platform_principles) !== JSON.stringify(principles)) {
  throw new Error('MISSION_DIRECTED_DISCOVERY_CONTRACT_INVALID');
}
if (contract.truth_boundary?.target_source_body_traversed !== false || contract.truth_boundary?.source_content_collected !== false ||
    contract.truth_boundary?.collection_right_created !== false) {
  throw new Error('MISSION_DIRECTED_DISCOVERY_BOUNDARY_INVALID');
}

const intentDigest = `sha256:${hash(JSON.stringify(intentsInput))}`;
let previous = null;
try {
  if (fs.existsSync(previousStatePath)) {
    const value = JSON.parse(fs.readFileSync(previousStatePath, 'utf8'));
    if (value.id === 'kidults-asi-mission-directed-discovery-cycle-state-v1' && value.input_intent_digest === intentDigest &&
        Number.isInteger(value.next_cursor) && value.next_cursor >= 0 && value.next_cursor < intentsInput.intent_count &&
        Number.isInteger(value.cycle_number) && value.cycle_number >= 1) previous = value;
  }
} catch {}

const configuredBatch = Number(process.env.MISSION_DISCOVERY_BATCH_SIZE || contract.cycle_policy.default_batch_size);
if (!Number.isInteger(configuredBatch) || configuredBatch < contract.cycle_policy.minimum_batch_size || configuredBatch > contract.cycle_policy.maximum_batch_size) {
  throw new Error(`MISSION_DISCOVERY_BATCH_SIZE_INVALID:${configuredBatch}`);
}
const totalIntents = intentsInput.intent_count;
const startCursor = previous?.next_cursor ?? 0;
const cycleNumber = (previous?.cycle_number ?? 0) + 1;
const fullRotationCountBefore = previous?.full_rotation_count ?? 0;
const selected = [];
for (let offset = 0; offset < Math.min(configuredBatch, totalIntents); offset += 1) {
  const index = (startCursor + offset) % totalIntents;
  selected.push({ index, intent: intentsInput.intents[index] });
}
const nextCursor = (startCursor + selected.length) % totalIntents;
const wrapped = startCursor + selected.length >= totalIntents;
const fullRotationCount = fullRotationCountBefore + (wrapped ? 1 : 0);

const laneIds = contract.provider_lanes.map((lane) => lane.lane_id);
const laneHealth = new Map(laneIds.map((laneId) => [laneId, {
  lane_id: laneId,
  attempted_intents: 0,
  successful_intents: 0,
  failed_intents: 0,
  observed_candidates: 0,
  errors: []
}]));
const receipts = [];
const candidates = [];
const ghToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';

const candidateBase = (intent, provider, providerRecordId, endpointUrl, sourceName, ownerHint, metadata) => ({
  candidate_id: `mission-candidate-${hash(`${intent.discovery_intent_id}|${provider}|${providerRecordId}|${endpointUrl}`).slice(0, 32)}`,
  mission_discovery_intent_id: intent.discovery_intent_id,
  mission_id: intent.mission_id,
  market_cell_id: intent.market_cell_id,
  lane_slot: intent.lane_slot,
  scope_id: intent.scope_id,
  scope_name: intent.scope_name,
  region: intent.region,
  evidence_class: intent.evidence_class,
  required_source_roles: intent.required_source_roles,
  required_market_semantics: intent.required_market_semantics,
  query_term: intent.query_term,
  endpoint_url: endpointUrl,
  discovery_provider: provider,
  discovery_channel: 'OPEN_STRUCTURED_DATA',
  provider_record_id: String(providerRecordId),
  observed_at: nowIso(),
  source_name: sourceName || endpointUrl,
  source_owner_hint: ownerHint || 'UNKNOWN',
  scope_hint: intent.scope_id,
  region_hint: intent.region,
  metadata: {
    ...metadata,
    mission_discovery_intent_id: intent.discovery_intent_id,
    mission_id: intent.mission_id,
    market_cell_id: intent.market_cell_id,
    lane_slot: intent.lane_slot,
    scope_name: intent.scope_name,
    region: intent.region,
    evidence_class: intent.evidence_class,
    required_source_roles: intent.required_source_roles,
    required_market_semantics: intent.required_market_semantics,
    query_term: intent.query_term
  },
  universe_target: 'GLOBAL_ANY_SITE_SOURCE_UNIVERSE',
  live_external_observation: true,
  supplemental_discovery_intent: true,
  discovery_intent_family_hint: 'MISSION_DIRECTED_CRITICAL_MARKET_GAP',
  source_family_hint: 'UNCLASSIFIED_ANY_SITE_CANDIDATE',
  candidate_source_roles: ['UNCLASSIFIED_PENDING_RELEVANCE'],
  terminal_transaction_asserted: false,
  rights_state: 'UNASSESSED',
  admission_state: 'NOT_ADMITTED',
  gate_1_state: 'PENDING',
  evidence_state: 'DISCOVERY_METADATA_ONLY',
  acquisition_authorized: false,
  target_site_body_crawled: false,
  content_acquired: false,
  provider_contacted: false,
  account_created: false,
  eula_accepted: false,
  spend_authorized: false,
  public_release: 'HOLD',
  production: 'HOLD'
});

const discoverWikidata = async (intent) => {
  const searchUrl = new URL('https://www.wikidata.org/w/api.php');
  const query = `${intent.scope_name} ${intent.evidence_class === 'CURRENT_SOLD_TRANSACTION' ? 'auction' : 'marketplace'}`;
  for (const [key, value] of Object.entries({
    action: 'wbsearchentities', search: query, language: 'en', uselang: 'en', limit: '5', format: 'json', origin: '*'
  })) searchUrl.searchParams.set(key, value);
  const search = await fetchJson(searchUrl, { headers: { 'User-Agent': 'KIDULTS-ASI-Mission-Directed-Discovery-v1' } });
  const ids = (search.search || []).map((item) => item.id).filter(Boolean);
  if (ids.length === 0) return [];
  const entityUrl = new URL('https://www.wikidata.org/w/api.php');
  for (const [key, value] of Object.entries({
    action: 'wbgetentities', ids: ids.join('|'), props: 'labels|descriptions|claims', languages: 'en', format: 'json', origin: '*'
  })) entityUrl.searchParams.set(key, value);
  const data = await fetchJson(entityUrl, { headers: { 'User-Agent': 'KIDULTS-ASI-Mission-Directed-Discovery-v1' } });
  const output = [];
  for (const id of ids) {
    const entity = data.entities?.[id];
    if (!entity) continue;
    for (const claim of entity.claims?.P856 || []) {
      const endpoint = normalizeUrl(claim.mainsnak?.datavalue?.value);
      if (!endpoint) continue;
      output.push(candidateBase(
        intent,
        'WIKIDATA_OFFICIAL_WEBSITE_GRAPH',
        `${id}:P856`,
        endpoint,
        entity.labels?.en?.value || id,
        entity.labels?.en?.value || 'UNKNOWN',
        { wikidata_id: id, description: entity.descriptions?.en?.value || null, query }
      ));
    }
  }
  return output.slice(0, 4);
};

const discoverGitHub = async (intent) => {
  const url = new URL('https://api.github.com/search/repositories');
  const query = `${intent.scope_name} ${intent.evidence_class === 'CURRENT_SOLD_TRANSACTION' ? 'auction sold results' : 'marketplace listings'} in:name,description`;
  url.searchParams.set('q', query.slice(0, 240));
  url.searchParams.set('per_page', '5');
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'KIDULTS-ASI-Mission-Directed-Discovery-v1',
    'X-GitHub-Api-Version': '2022-11-28'
  };
  if (ghToken) headers.Authorization = `Bearer ${ghToken}`;
  const data = await fetchJson(url, { headers });
  const output = [];
  for (const item of data.items || []) {
    const endpoint = normalizeUrl(item.homepage);
    if (!endpoint) continue;
    output.push(candidateBase(
      intent,
      'GITHUB_PUBLIC_REPOSITORY_HOMEPAGE_METADATA',
      item.id,
      endpoint,
      item.full_name || endpoint,
      item.owner?.login || 'UNKNOWN',
      { repository_url: item.html_url || null, description: item.description || null, query }
    ));
  }
  return output.slice(0, 4);
};

const discoverDataCite = async (intent) => {
  const url = new URL('https://api.datacite.org/dois');
  const query = `${intent.scope_name} ${intent.evidence_class === 'CURRENT_SOLD_TRANSACTION' ? 'auction transaction market' : 'market liquidity exposure'}`;
  url.searchParams.set('query', query);
  url.searchParams.set('page[size]', '5');
  const data = await fetchJson(url, {
    headers: { Accept: 'application/vnd.api+json', 'User-Agent': 'KIDULTS-ASI-Mission-Directed-Discovery-v1' }
  });
  const output = [];
  for (const item of data.data || []) {
    const attributes = item.attributes || {};
    const recordId = attributes.doi || item.id;
    const endpoint = normalizeUrl(attributes.url || `https://doi.org/${recordId}`);
    if (!endpoint) continue;
    output.push(candidateBase(
      intent,
      'DATACITE_OPEN_RESEARCH_METADATA',
      recordId,
      endpoint,
      attributes.titles?.[0]?.title || recordId,
      attributes.publisher || attributes.clientId || 'UNKNOWN',
      {
        publisher: attributes.publisher || null,
        rights_list: attributes.rightsList || [],
        descriptions: attributes.descriptions || [],
        query
      }
    ));
  }
  return output.slice(0, 4);
};

const discoveryFunctions = {
  WIKIDATA_OFFICIAL_WEBSITE_GRAPH: discoverWikidata,
  GITHUB_PUBLIC_REPOSITORY_HOMEPAGE_METADATA: discoverGitHub,
  DATACITE_OPEN_RESEARCH_METADATA: discoverDataCite
};

for (let selectedOffset = 0; selectedOffset < selected.length; selectedOffset += 1) {
  const { index, intent } = selected[selectedOffset];
  if (!intent.discovery_intent_id || !intent.mission_id || !intent.market_cell_id || !intent.lane_slot || !intent.scope_id ||
      !intent.region || !intent.evidence_class || intent.target_site_body_traversal_authorized !== false ||
      intent.rights_effect !== 'NONE' || intent.admission_effect !== 'NONE' || intent.collection_authorized !== false) {
    throw new Error(`MISSION_DISCOVERY_INTENT_BOUNDARY_INVALID:${intent.discovery_intent_id || index}`);
  }
  const providerIndex = (index + fullRotationCountBefore) % laneIds.length;
  const laneId = laneIds[providerIndex];
  const health = laneHealth.get(laneId);
  health.attempted_intents += 1;
  const receipt = {
    receipt_id: `mission-discovery-receipt-${hash(`${cycleNumber}|${intent.discovery_intent_id}|${laneId}`).slice(0, 32)}`,
    cycle_number: cycleNumber,
    cursor_index: index,
    mission_discovery_intent_id: intent.discovery_intent_id,
    mission_id: intent.mission_id,
    market_cell_id: intent.market_cell_id,
    lane_slot: intent.lane_slot,
    scope_id: intent.scope_id,
    region: intent.region,
    evidence_class: intent.evidence_class,
    provider_lane: laneId,
    started_at: nowIso(),
    completed_at: null,
    state: 'RUNNING',
    candidate_count: 0,
    error: null,
    target_site_body_traversed: false,
    source_content_collected: false,
    collection_right_created: false,
    admission_effect: 'NONE',
    public_release: 'HOLD',
    production: 'HOLD'
  };
  try {
    const discovered = await discoveryFunctions[laneId](intent);
    for (const candidate of discovered) candidates.push(candidate);
    receipt.state = discovered.length > 0 ? 'SUCCESS_WITH_RESULTS' : 'SUCCESS_ZERO_RESULTS';
    receipt.candidate_count = discovered.length;
    health.successful_intents += 1;
    health.observed_candidates += discovered.length;
  } catch (error) {
    receipt.state = 'FAILED';
    receipt.error = boundedError(error);
    health.failed_intents += 1;
    health.errors.push(receipt.error);
  }
  receipt.completed_at = nowIso();
  receipts.push(receipt);
  await sleep(60);
}

const deduplicated = new Map();
for (const candidate of candidates) {
  const key = `${candidate.mission_discovery_intent_id}|${candidate.endpoint_url}`;
  const existing = deduplicated.get(key);
  if (!existing) deduplicated.set(key, candidate);
  else {
    existing.discovery_provider_aliases = [...new Set([...(existing.discovery_provider_aliases || [existing.discovery_provider]), candidate.discovery_provider])].sort();
    existing.provider_record_aliases = [...new Set([...(existing.provider_record_aliases || [existing.provider_record_id]), candidate.provider_record_id])].sort();
  }
}
const candidateList = [...deduplicated.values()].sort((left, right) =>
  left.mission_discovery_intent_id.localeCompare(right.mission_discovery_intent_id) ||
  left.endpoint_url.localeCompare(right.endpoint_url)
);
const laneHealthList = [...laneHealth.values()].map((health) => ({
  ...health,
  errors: [...new Set(health.errors)].sort(),
  status: health.failed_intents === health.attempted_intents
    ? 'FAILED'
    : health.failed_intents > 0
      ? 'PARTIAL_SUCCESS'
      : health.observed_candidates > 0
        ? 'SUCCESS_WITH_RESULTS'
        : health.attempted_intents > 0
          ? 'SUCCESS_ZERO_RESULTS'
          : 'NOT_SCHEDULED_THIS_CYCLE'
}));
const healthyLanes = laneHealthList.filter((lane) => ['SUCCESS_WITH_RESULTS', 'SUCCESS_ZERO_RESULTS', 'PARTIAL_SUCCESS'].includes(lane.status)).length;
const failedLanes = laneHealthList.filter((lane) => lane.status === 'FAILED').length;
const attemptedIntentCount = receipts.length;
const successfulIntentCount = receipts.filter((receipt) => receipt.state.startsWith('SUCCESS')).length;
const failedIntentCount = receipts.filter((receipt) => receipt.state === 'FAILED').length;
const missionCount = new Set(candidateList.map((candidate) => candidate.mission_id)).size;
const hostCount = new Set(candidateList.map((candidate) => normalizeUrl(candidate.endpoint_url)).filter(Boolean)).size;

if (healthyLanes < contract.cycle_policy.minimum_healthy_provider_lanes) throw new Error(`NO_HEALTHY_PROVIDER_LANE:${healthyLanes}`);
if (candidateList.length < contract.cycle_policy.minimum_live_candidates_per_successful_cycle) throw new Error(`NO_LIVE_CANDIDATE:${candidateList.length}`);

fs.mkdirSync(outputDir, { recursive: true });
const discovery = {
  id: 'kidults-asi-mission-directed-public-metadata-discovery-v1',
  version: '1.0.0',
  status: 'SHADOW_MISSION_DIRECTED_PUBLIC_METADATA_DISCOVERY_COMPLETE',
  contract_id: contract.id,
  contract_version: contract.version,
  cycle_number: cycleNumber,
  input_intent_id: intentsInput.id,
  input_intent_digest: intentDigest,
  total_intent_count: totalIntents,
  batch_size: selected.length,
  cursor_start: startCursor,
  cursor_next: nextCursor,
  wrapped_this_cycle: wrapped,
  full_rotation_count: fullRotationCount,
  attempted_intent_count: attemptedIntentCount,
  successful_intent_count: successfulIntentCount,
  failed_intent_count: failedIntentCount,
  partial_failure_state: failedIntentCount > 0 ? 'PARTIAL_PROVIDER_FAILURE_VISIBLE' : 'NONE',
  candidate_count: candidateList.length,
  unique_endpoint_count: hostCount,
  missions_with_candidates: missionCount,
  healthy_provider_lanes: healthyLanes,
  failed_provider_lanes: failedLanes,
  lane_health: laneHealthList,
  intent_receipts: receipts,
  candidates: candidateList,
  target_site_body_crawled: false,
  content_acquired: false,
  acquisition_authorized: false,
  account_created: false,
  eula_accepted: false,
  spend_authorized: false,
  collection_right_created: false,
  evidence_admitted: false,
  market_claim_authorized: false,
  public_release: 'HOLD',
  production: 'HOLD'
};
const state = {
  id: 'kidults-asi-mission-directed-discovery-cycle-state-v1',
  version: '1.0.0',
  status: 'ACTIVE_ROLLING_CURSOR',
  input_intent_digest: intentDigest,
  total_intent_count: totalIntents,
  cycle_number: cycleNumber,
  cursor_start: startCursor,
  batch_size: selected.length,
  next_cursor: nextCursor,
  wrapped_this_cycle: wrapped,
  full_rotation_count: fullRotationCount,
  attempted_intents_cumulative: Number(previous?.attempted_intents_cumulative || 0) + attemptedIntentCount,
  successful_intents_cumulative: Number(previous?.successful_intents_cumulative || 0) + successfulIntentCount,
  failed_intents_cumulative: Number(previous?.failed_intents_cumulative || 0) + failedIntentCount,
  candidates_observed_cumulative_not_deduplicated: Number(previous?.candidates_observed_cumulative_not_deduplicated || 0) + candidateList.length,
  last_cycle_candidate_count: candidateList.length,
  last_cycle_healthy_provider_lanes: healthyLanes,
  manual_orchestration_required: false,
  target_site_body_crawled: false,
  content_acquired: false,
  public_release: 'HOLD',
  production: 'HOLD'
};
fs.writeFileSync(path.join(outputDir, 'mission-directed-discovery-v1.json'), `${JSON.stringify(discovery, null, 2)}\n`);
fs.writeFileSync(path.join(outputDir, 'mission-directed-discovery-cycle-state-v1.json'), `${JSON.stringify(state, null, 2)}\n`);
console.log(JSON.stringify({
  status: discovery.status,
  cycle_number: cycleNumber,
  cursor_start: startCursor,
  cursor_next: nextCursor,
  attempted_intents: attemptedIntentCount,
  successful_intents: successfulIntentCount,
  failed_intents: failedIntentCount,
  candidates: candidateList.length,
  unique_endpoints: hostCount,
  missions_with_candidates: missionCount,
  healthy_provider_lanes: healthyLanes,
  target_site_body_crawled: false,
  content_acquired: false,
  collection_right_created: false,
  market_claim_authorized: false
}, null, 2));
