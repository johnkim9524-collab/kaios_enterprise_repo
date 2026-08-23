#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const [
  intentPath,
  previousStatePath,
  contractPath = 'coordination/kidults/source-intelligence/asi-mission-directed-discovery-contract-v1.json',
  outputDir = '/tmp/kidults-asi-mission-directed-discovery-v1',
  primaryFailure = 'PRIMARY_DISCOVERY_ZERO_CANDIDATES'
] = process.argv.slice(2);
if (!intentPath || !previousStatePath) throw new Error('FALLBACK_INPUT_PATHS_REQUIRED');

const input = JSON.parse(fs.readFileSync(intentPath, 'utf8'));
const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
const hash = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const normalizeUrl = (value) => {
  try { const url = new URL(String(value || '').trim()); if (!['http:', 'https:'].includes(url.protocol)) return null; url.hash = ''; return url.toString().replace(/\/$/, ''); }
  catch { return null; }
};
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const nowIso = () => new Date().toISOString();
const fetchJson = async (url, options = {}, attempt = 0) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if ((response.status === 429 || response.status >= 500) && attempt < 2) {
      await sleep(1000 * (2 ** attempt));
      return fetchJson(url, options, attempt + 1);
    }
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    return await response.json();
  } finally { clearTimeout(timeout); }
};

if (input.id !== 'kidults-asi-mission-discovery-intent-v1' || input.intent_count !== input.intents?.length || input.intent_count < 1) throw new Error('FALLBACK_INTENT_INPUT_INVALID');
if (contract.id !== 'kidults-asi-mission-directed-discovery-contract-v1') throw new Error('FALLBACK_CONTRACT_INVALID');
const inputDigest = `sha256:${hash(JSON.stringify(input))}`;
let previous = null;
try {
  if (fs.existsSync(previousStatePath)) {
    const candidate = JSON.parse(fs.readFileSync(previousStatePath, 'utf8'));
    if (candidate.id === 'kidults-asi-mission-directed-discovery-cycle-state-v1' && candidate.input_intent_digest === inputDigest &&
        Number.isInteger(candidate.next_cursor) && candidate.next_cursor >= 0 && candidate.next_cursor < input.intent_count) previous = candidate;
  }
} catch {}
const batchSize = Number(process.env.MISSION_DISCOVERY_BATCH_SIZE || contract.cycle_policy.default_batch_size);
if (!Number.isInteger(batchSize) || batchSize < contract.cycle_policy.minimum_batch_size || batchSize > contract.cycle_policy.maximum_batch_size) throw new Error('FALLBACK_BATCH_SIZE_INVALID');
const startCursor = previous?.next_cursor ?? 0;
const cycleNumber = Number(previous?.cycle_number || 0) + 1;
const selected = [];
for (let offset = 0; offset < Math.min(batchSize, input.intent_count); offset += 1) {
  const index = (startCursor + offset) % input.intent_count;
  selected.push({ index, intent: input.intents[index] });
}
const nextCursor = (startCursor + selected.length) % input.intent_count;
const wrapped = startCursor + selected.length >= input.intent_count;
const fullRotationCount = Number(previous?.full_rotation_count || 0) + (wrapped ? 1 : 0);
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
const headers = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'KIDULTS-ASI-Mission-Directed-GitHub-Fallback-v1',
  'X-GitHub-Api-Version': '2022-11-28'
};
if (token) headers.Authorization = `Bearer ${token}`;
const cache = new Map();
const genericQuery = 'auction marketplace collector in:name,description';

const searchRepositories = async (scopeName) => {
  if (cache.has(scopeName)) return cache.get(scopeName);
  const execute = async (query) => {
    const url = new URL('https://api.github.com/search/repositories');
    url.searchParams.set('q', query.slice(0, 240));
    url.searchParams.set('sort', 'updated');
    url.searchParams.set('order', 'desc');
    url.searchParams.set('per_page', '5');
    const data = await fetchJson(url, { headers });
    return data.items || [];
  };
  let items = await execute(`${scopeName} in:name,description`);
  let fallbackUsed = false;
  if (items.length === 0) { items = await execute(genericQuery); fallbackUsed = true; }
  const result = { items, fallbackUsed };
  cache.set(scopeName, result);
  return result;
};

const candidates = [];
const receipts = [];
let failedIntents = 0;
let successfulIntents = 0;
for (const { index, intent } of selected) {
  if (!intent.discovery_intent_id || !intent.mission_id || !intent.market_cell_id || intent.target_site_body_traversal_authorized !== false || intent.collection_authorized !== false) throw new Error('FALLBACK_INTENT_BOUNDARY_INVALID');
  const receipt = {
    receipt_id: `mission-discovery-receipt-${hash(`${cycleNumber}|${intent.discovery_intent_id}|GITHUB_PUBLIC_REPOSITORY_HOMEPAGE_METADATA`).slice(0, 32)}`,
    cycle_number: cycleNumber,
    cursor_index: index,
    mission_discovery_intent_id: intent.discovery_intent_id,
    mission_id: intent.mission_id,
    market_cell_id: intent.market_cell_id,
    lane_slot: intent.lane_slot,
    scope_id: intent.scope_id,
    region: intent.region,
    evidence_class: intent.evidence_class,
    provider_lane: 'GITHUB_PUBLIC_REPOSITORY_HOMEPAGE_METADATA',
    started_at: nowIso(),
    completed_at: null,
    state: 'RUNNING',
    candidate_count: 0,
    error: null,
    fallback_used: true,
    fallback_reason: String(primaryFailure).slice(0, 200),
    target_site_body_traversed: false,
    source_content_collected: false,
    collection_right_created: false,
    admission_effect: 'NONE',
    public_release: 'HOLD',
    production: 'HOLD'
  };
  try {
    const { items, fallbackUsed } = await searchRepositories(intent.scope_name);
    const emitted = [];
    for (const item of items.slice(0, 2)) {
      const endpoint = normalizeUrl(item.homepage) || normalizeUrl(item.html_url);
      if (!endpoint) continue;
      const metadata = {
        repository_url: item.html_url || null,
        repository_homepage_declared: Boolean(normalizeUrl(item.homepage)),
        description: item.description || null,
        query: fallbackUsed ? genericQuery : `${intent.scope_name} in:name,description`,
        broad_query_fallback_used: fallbackUsed,
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
      };
      emitted.push({
        candidate_id: `mission-candidate-${hash(`${intent.discovery_intent_id}|GITHUB_PUBLIC_REPOSITORY_HOMEPAGE_METADATA|${item.id}|${endpoint}`).slice(0, 32)}`,
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
        endpoint_url: endpoint,
        discovery_provider: 'GITHUB_PUBLIC_REPOSITORY_HOMEPAGE_METADATA',
        discovery_channel: 'OPEN_STRUCTURED_DATA',
        provider_record_id: String(item.id),
        observed_at: nowIso(),
        source_name: item.full_name || endpoint,
        source_owner_hint: item.owner?.login || 'UNKNOWN',
        scope_hint: intent.scope_id,
        region_hint: intent.region,
        metadata,
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
    }
    candidates.push(...emitted);
    receipt.candidate_count = emitted.length;
    receipt.state = emitted.length ? 'SUCCESS_WITH_RESULTS' : 'SUCCESS_ZERO_RESULTS';
    successfulIntents += 1;
  } catch (error) {
    receipt.state = 'FAILED';
    receipt.error = String(error?.message || error).slice(0, 160);
    failedIntents += 1;
  }
  receipt.completed_at = nowIso();
  receipts.push(receipt);
}
const deduplicated = new Map();
for (const candidate of candidates) deduplicated.set(`${candidate.mission_discovery_intent_id}|${candidate.endpoint_url}`, candidate);
const candidateList = [...deduplicated.values()].sort((left, right) => left.mission_discovery_intent_id.localeCompare(right.mission_discovery_intent_id) || left.endpoint_url.localeCompare(right.endpoint_url));
if (candidateList.length < 1) throw new Error('FALLBACK_NO_LIVE_CANDIDATE');
const laneHealth = contract.provider_lanes.map((lane) => lane.lane_id === 'GITHUB_PUBLIC_REPOSITORY_HOMEPAGE_METADATA'
  ? {
      lane_id: lane.lane_id,
      attempted_intents: selected.length,
      successful_intents: successfulIntents,
      failed_intents: failedIntents,
      observed_candidates: candidateList.length,
      errors: [...new Set(receipts.filter((receipt) => receipt.error).map((receipt) => receipt.error))],
      status: failedIntents === selected.length ? 'FAILED' : failedIntents > 0 ? 'PARTIAL_SUCCESS' : 'SUCCESS_WITH_RESULTS'
    }
  : { lane_id: lane.lane_id, attempted_intents: 0, successful_intents: 0, failed_intents: 0, observed_candidates: 0, errors: [], status: 'NOT_SCHEDULED_THIS_CYCLE' });
const healthyLanes = laneHealth.filter((lane) => ['SUCCESS_WITH_RESULTS', 'SUCCESS_ZERO_RESULTS', 'PARTIAL_SUCCESS'].includes(lane.status)).length;
const discovery = {
  id: 'kidults-asi-mission-directed-public-metadata-discovery-v1',
  version: '1.0.0',
  status: 'SHADOW_MISSION_DIRECTED_PUBLIC_METADATA_DISCOVERY_COMPLETE',
  contract_id: contract.id,
  contract_version: contract.version,
  cycle_number: cycleNumber,
  input_intent_id: input.id,
  input_intent_digest: inputDigest,
  total_intent_count: input.intent_count,
  batch_size: selected.length,
  cursor_start: startCursor,
  cursor_next: nextCursor,
  wrapped_this_cycle: wrapped,
  full_rotation_count: fullRotationCount,
  attempted_intent_count: selected.length,
  successful_intent_count: successfulIntents,
  failed_intent_count: failedIntents,
  partial_failure_state: failedIntents > 0 ? 'PARTIAL_PROVIDER_FAILURE_VISIBLE' : 'NONE',
  primary_discovery_fallback_used: true,
  primary_discovery_failure: String(primaryFailure).slice(0, 200),
  candidate_count: candidateList.length,
  unique_endpoint_count: new Set(candidateList.map((candidate) => candidate.endpoint_url)).size,
  missions_with_candidates: new Set(candidateList.map((candidate) => candidate.mission_id)).size,
  healthy_provider_lanes: healthyLanes,
  failed_provider_lanes: laneHealth.filter((lane) => lane.status === 'FAILED').length,
  lane_health: laneHealth,
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
  input_intent_digest: inputDigest,
  total_intent_count: input.intent_count,
  cycle_number: cycleNumber,
  cursor_start: startCursor,
  batch_size: selected.length,
  next_cursor: nextCursor,
  wrapped_this_cycle: wrapped,
  full_rotation_count: fullRotationCount,
  attempted_intents_cumulative: Number(previous?.attempted_intents_cumulative || 0) + selected.length,
  successful_intents_cumulative: Number(previous?.successful_intents_cumulative || 0) + successfulIntents,
  failed_intents_cumulative: Number(previous?.failed_intents_cumulative || 0) + failedIntents,
  candidates_observed_cumulative_not_deduplicated: Number(previous?.candidates_observed_cumulative_not_deduplicated || 0) + candidateList.length,
  last_cycle_candidate_count: candidateList.length,
  last_cycle_healthy_provider_lanes: healthyLanes,
  manual_orchestration_required: false,
  target_site_body_crawled: false,
  content_acquired: false,
  public_release: 'HOLD',
  production: 'HOLD'
};
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'mission-directed-discovery-v1.json'), `${JSON.stringify(discovery, null, 2)}\n`);
fs.writeFileSync(path.join(outputDir, 'mission-directed-discovery-cycle-state-v1.json'), `${JSON.stringify(state, null, 2)}\n`);
console.log(JSON.stringify({
  status: discovery.status,
  fallback_used: true,
  primary_failure: discovery.primary_discovery_failure,
  cycle_number: cycleNumber,
  cursor_start: startCursor,
  cursor_next: nextCursor,
  attempted_intents: selected.length,
  successful_intents: successfulIntents,
  failed_intents: failedIntents,
  candidates: candidateList.length,
  unique_endpoints: discovery.unique_endpoint_count,
  missions_with_candidates: discovery.missions_with_candidates,
  healthy_provider_lanes: healthyLanes,
  target_site_body_crawled: false,
  content_acquired: false,
  collection_right_created: false,
  market_claim_authorized: false
}, null, 2));
