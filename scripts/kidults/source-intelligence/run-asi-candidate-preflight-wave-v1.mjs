#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const [
  candidateIncrementPath = '/tmp/kidults-asi-source-candidate-increment-v1.json',
  previousDir = '/tmp/previous-asi-candidate-preflight-v1',
  contractPath = 'coordination/kidults/source-intelligence/asi-candidate-preflight-contract-v1.json',
  outputDir = '/tmp/kidults-asi-candidate-preflight-v1'
] = process.argv.slice(2);

const readJson = async (p) => JSON.parse(await fs.readFile(p, 'utf8'));
const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
};
const stableJson = (value) => `${JSON.stringify(stable(value), null, 2)}\n`;
const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const deterministicId = (prefix, value) => `${prefix}::${crypto.createHash('sha256').update(stableJson(value)).digest('hex').slice(0, 32)}`;
const nowIso = () => new Date().toISOString();
const normalizeText = (value) => String(value || '').normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}\s:/._-]/gu, ' ').replace(/\s+/g, ' ').trim();
const unique = (values) => [...new Set(values)];
const round = (value, digits = 6) => Number(Number(value).toFixed(digits));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const candidatesInput = await readJson(candidateIncrementPath);
const contract = await readJson(contractPath);
const principles = ['AUTONOMOUS', 'GLOBAL', 'IRREPLACEABLE_VALUE', 'TRANSPARENT'];
const batchSize = Math.max(1, Math.min(Number(contract.execution_scope.maximum_hosts_per_cycle), Number(process.env.ASI_PREFLIGHT_HOST_BATCH_SIZE || contract.execution_scope.maximum_hosts_per_cycle)));
const concurrency = Math.max(1, Math.min(12, Number(process.env.ASI_PREFLIGHT_CONCURRENCY || 8)));
const timeoutMs = Math.max(5000, Math.min(25000, Number(process.env.ASI_PREFLIGHT_TIMEOUT_MS || 12000)));
const retryCount = Math.max(0, Math.min(2, Number(process.env.ASI_PREFLIGHT_RETRIES || 1)));
const maxBytes = Number(contract.execution_scope.maximum_body_bytes_per_get);
const userAgent = 'KIDULTS-ASI-Preflight/1.0 (bounded technical and rights-uncertainty metadata preflight)';

if (candidatesInput.id !== 'kidults-asi-source-candidate-increment-v1' || candidatesInput.state !== 'DISCOVERY_METADATA_CANDIDATES_PREFLIGHT_REQUIRED') throw new Error('CANDIDATE_INCREMENT_INVALID');
if (!Array.isArray(candidatesInput.candidates) || candidatesInput.candidates.length < 1) throw new Error('CANDIDATE_INCREMENT_EMPTY');
if (contract.id !== 'kidults-asi-candidate-preflight-contract-v1' || contract.version !== '1.0.0') throw new Error('PREFLIGHT_CONTRACT_INVALID');
if (JSON.stringify(contract.platform_principles) !== JSON.stringify(principles)) throw new Error('PREFLIGHT_PRINCIPLE_ORDER_INVALID');
if (contract.truth_boundary?.collects_market_records !== false || contract.truth_boundary?.creates_collection_right !== false || contract.truth_boundary?.admits_evidence !== false) throw new Error('PREFLIGHT_TRUTH_BOUNDARY_INVALID');

await fs.mkdir(outputDir, { recursive: true });

let previousLedger = null;
try {
  previousLedger = await readJson(path.join(previousDir, 'candidate-host-preflight-ledger-v1.json'));
  if (previousLedger.id !== 'kidults-asi-candidate-host-preflight-ledger-v1') previousLedger = null;
} catch {
  previousLedger = null;
}
const previousEntries = new Map((previousLedger?.entries || []).map((entry) => [entry.canonical_host, entry]));

function originForCandidate(candidate) {
  const url = new URL(candidate.canonical_url);
  return `${url.protocol}//${url.host}`;
}

const candidatesByHost = new Map();
for (const candidate of candidatesInput.candidates) {
  if (candidate.candidate_state !== 'DISCOVERED_METADATA_ONLY_PREFLIGHT_REQUIRED' || candidate.candidate_is_evidence !== false) throw new Error(`CANDIDATE_STATE_INVALID:${candidate.candidate_id}`);
  const host = String(candidate.canonical_host || '').toLowerCase().replace(/^www\./, '');
  if (!host) throw new Error(`CANDIDATE_HOST_MISSING:${candidate.candidate_id}`);
  if (!candidatesByHost.has(host)) candidatesByHost.set(host, []);
  candidatesByHost.get(host).push(candidate);
}

// Rolling execution unit: UNIQUE_CANONICAL_HOST.
const allHosts = [...candidatesByHost.entries()]
  .map(([host, candidates]) => ({
    canonical_host: host,
    origin: originForCandidate(candidates[0]),
    candidate_count: candidates.length,
    maximum_semantic_signal_score: Math.max(...candidates.map((candidate) => Number(candidate.semantic_signal_score || 0))),
    evidence_classes: unique(candidates.map((candidate) => candidate.evidence_class)).sort(),
    discovery_lanes: unique(candidates.map((candidate) => candidate.discovery_lane_id)).sort(),
    candidate_ids: candidates.map((candidate) => candidate.candidate_id).sort(),
    representative_candidate_url: [...candidates].sort((a, b) => Number(b.semantic_signal_score) - Number(a.semantic_signal_score) || a.canonical_url.localeCompare(b.canonical_url))[0].canonical_url
  }))
  .sort((a, b) => b.maximum_semantic_signal_score - a.maximum_semantic_signal_score || b.candidate_count - a.candidate_count || a.canonical_host.localeCompare(b.canonical_host));

const selectedHosts = allHosts.filter((host) => !previousEntries.has(host.canonical_host)).slice(0, batchSize);

async function readBoundedBody(response, limit) {
  if (!response.body) return { text: '', truncated: false, bytes: 0 };
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  let truncated = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      const remaining = limit - bytes;
      if (remaining <= 0) {
        truncated = true;
        await reader.cancel('BOUND_REACHED');
        break;
      }
      const slice = value.byteLength > remaining ? value.slice(0, remaining) : value;
      chunks.push(slice);
      bytes += slice.byteLength;
      if (value.byteLength > remaining || bytes >= limit) {
        truncated = true;
        await reader.cancel('BOUND_REACHED');
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
  const buffer = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  return { text: buffer.toString('utf8'), truncated, bytes: buffer.length };
}

async function boundedRequest(url, { method, bodyLimit = 0 }) {
  let lastError = null;
  const attempts = [];
  for (let attempt = 1; attempt <= retryCount + 1; attempt += 1) {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method,
        redirect: 'follow',
        headers: {
          accept: method === 'HEAD' ? '*/*' : 'text/html,text/plain,application/xhtml+xml;q=0.9,*/*;q=0.1',
          'user-agent': userAgent,
          ...(method === 'GET' ? { range: `bytes=0-${Math.max(0, bodyLimit - 1)}` } : {})
        },
        signal: controller.signal
      });
      const body = method === 'GET' ? await readBoundedBody(response, bodyLimit) : { text: '', truncated: false, bytes: 0 };
      clearTimeout(timer);
      const record = {
        attempt,
        method,
        request_url: url,
        request_url_digest: sha256(url),
        observed_at: nowIso(),
        http_status: response.status,
        ok: response.ok,
        final_url: response.url,
        redirected: response.redirected,
        content_type: response.headers.get('content-type'),
        content_length: response.headers.get('content-length'),
        duration_ms: Date.now() - startedAt,
        body_bytes: body.bytes,
        body_truncated: body.truncated,
        body_digest: method === 'GET' ? sha256(body.text) : null,
        error: null
      };
      attempts.push(record);
      if (response.ok || ![408, 425, 429, 500, 502, 503, 504].includes(response.status) || attempt > retryCount) {
        return { ...record, attempts, body_text: body.text };
      }
      lastError = `HTTP_${response.status}`;
    } catch (error) {
      clearTimeout(timer);
      lastError = error?.name === 'AbortError' ? 'TIMEOUT' : `FETCH_ERROR:${String(error?.message || error)}`;
      attempts.push({
        attempt,
        method,
        request_url: url,
        request_url_digest: sha256(url),
        observed_at: nowIso(),
        http_status: null,
        ok: false,
        final_url: null,
        redirected: false,
        content_type: null,
        content_length: null,
        duration_ms: Date.now() - startedAt,
        body_bytes: 0,
        body_truncated: false,
        body_digest: null,
        error: lastError
      });
      if (attempt > retryCount) break;
    }
    await sleep(250 * attempt);
  }
  const final = attempts.at(-1);
  return { ...final, attempts, body_text: '', error: lastError || final?.error || 'UNKNOWN_FAILURE' };
}

function extractHtmlMetadata(html, baseUrl) {
  const text = String(html || '');
  const title = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || null;
  const description = text.match(/<meta\s+[^>]*(?:name|property)=["'](?:description|og:description)["'][^>]*content=["']([^"']*)["'][^>]*>/i)?.[1]
    || text.match(/<meta\s+[^>]*content=["']([^"']*)["'][^>]*(?:name|property)=["'](?:description|og:description)["'][^>]*>/i)?.[1]
    || null;
  const links = [];
  const regex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = regex.exec(text)) && links.length < 200) {
    try {
      const url = new URL(match[1], baseUrl);
      const anchor = match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      links.push({ href: url.toString(), text: anchor });
    } catch {
      // Ignore malformed links.
    }
  }
  const classified = links.filter((link) => /terms|conditions|privacy|legal|license|licence|api|auction|result|sold|price|market/i.test(`${link.href} ${link.text}`));
  return {
    title,
    description: description?.replace(/\s+/g, ' ').trim() || null,
    classified_links: classified.slice(0, 50).map((link) => ({
      href: link.href,
      text: link.text,
      category: /terms|conditions/i.test(`${link.href} ${link.text}`) ? 'TERMS'
        : /privacy/i.test(`${link.href} ${link.text}`) ? 'PRIVACY'
          : /legal|license|licence/i.test(`${link.href} ${link.text}`) ? 'LEGAL_OR_LICENSE'
            : /api/i.test(`${link.href} ${link.text}`) ? 'API'
              : /auction|result|sold|price|market/i.test(`${link.href} ${link.text}`) ? 'MARKET_SEMANTIC'
                : 'OTHER'
    }))
  };
}

function parseRobots(text) {
  const lines = String(text || '').split(/\r?\n/).map((line) => line.replace(/#.*/, '').trim()).filter(Boolean);
  let applies = false;
  const disallows = [];
  const allows = [];
  for (const line of lines) {
    const [rawKey, ...rest] = line.split(':');
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(':').trim();
    if (key === 'user-agent') applies = value === '*';
    else if (applies && key === 'disallow') disallows.push(value);
    else if (applies && key === 'allow') allows.push(value);
  }
  const disallowAll = disallows.some((value) => value === '/');
  return {
    user_agent_star_found: lines.some((line) => /^user-agent\s*:\s*\*/i.test(line)),
    disallow_all: disallowAll,
    disallow_rules: disallows.slice(0, 100),
    allow_rules: allows.slice(0, 100),
    robots_is_license: false
  };
}

const semanticTerms = {
  CURRENT_SOLD_TRANSACTION: contract.semantic_policy.current_sold_required_signals,
  LIQUIDITY_TIME_TO_SALE_EXPOSURE: contract.semantic_policy.liquidity_required_signals
};

function semanticEvaluation(hostData, hostCandidates, metadata) {
  const combined = normalizeText([
    hostData.canonical_host,
    metadata.title,
    metadata.description,
    ...metadata.classified_links.map((link) => `${link.text} ${link.href}`),
    ...hostCandidates.flatMap((candidate) => [candidate.title_or_label, candidate.description])
  ].filter(Boolean).join(' '));
  return Object.fromEntries(hostData.evidence_classes.map((evidenceClass) => {
    const terms = semanticTerms[evidenceClass] || [];
    const matchedTerms = terms.filter((term) => combined.includes(normalizeText(term)));
    const marketLinkCount = metadata.classified_links.filter((link) => link.category === 'MARKET_SEMANTIC').length;
    const candidateScore = Math.max(...hostCandidates.filter((candidate) => candidate.evidence_class === evidenceClass).map((candidate) => Number(candidate.semantic_signal_score || 0)), 0);
    const score = Math.min(10, matchedTerms.length * 2 + Math.min(3, marketLinkCount) + Math.min(3, Math.floor(candidateScore / 2)));
    return [evidenceClass, {
      score,
      threshold: Number(contract.semantic_policy.minimum_candidate_signal_score),
      threshold_pass: score >= Number(contract.semantic_policy.minimum_candidate_signal_score),
      matched_terms: matchedTerms,
      market_semantic_link_count: marketLinkCount,
      semantic_signal_is_evidence: false
    }];
  }));
}

async function preflightHost(hostData) {
  const hostCandidates = candidatesByHost.get(hostData.canonical_host) || [];
  const representativeUrl = hostData.representative_candidate_url;
  const origin = hostData.origin;
  const head = await boundedRequest(representativeUrl, { method: 'HEAD' });
  const root = await boundedRequest(`${origin}/`, { method: 'GET', bodyLimit: maxBytes });
  const robots = await boundedRequest(`${origin}/robots.txt`, { method: 'GET', bodyLimit: maxBytes });
  const metadata = /html|xhtml/i.test(root.content_type || '') ? extractHtmlMetadata(root.body_text, root.final_url || `${origin}/`) : { title: null, description: null, classified_links: [] };
  const robotsParsed = robots.ok && /text|plain|octet-stream/i.test(robots.content_type || 'text/plain') ? parseRobots(robots.body_text) : {
    user_agent_star_found: false,
    disallow_all: false,
    disallow_rules: [],
    allow_rules: [],
    robots_is_license: false
  };
  const finalHost = (() => {
    try { return new URL(root.final_url || head.final_url || origin).hostname.toLowerCase().replace(/^www\./, ''); } catch { return null; }
  })();
  const technicalReachable = Boolean((head.ok || root.ok) && finalHost);
  const accessRejected = [401, 403].includes(Number(head.http_status)) && [401, 403].includes(Number(root.http_status));
  const termsLinks = metadata.classified_links.filter((link) => ['TERMS', 'LEGAL_OR_LICENSE'].includes(link.category));
  const privacyLinks = metadata.classified_links.filter((link) => link.category === 'PRIVACY');
  const apiLinks = metadata.classified_links.filter((link) => link.category === 'API');
  const semantics = semanticEvaluation(hostData, hostCandidates, metadata);
  const semanticPassCount = Object.values(semantics).filter((item) => item.threshold_pass).length;
  const rightsState = robotsParsed.disallow_all || accessRejected
    ? 'DENY_AUTOMATED_PREFLIGHT_OR_ACCESS'
    : termsLinks.length > 0
      ? 'UNKNOWN_TERMS_DISCOVERED_REVIEW_REQUIRED'
      : 'UNKNOWN_NO_EXPLICIT_MACHINE_RIGHTS';
  const preflightState = robotsParsed.disallow_all || accessRejected
    ? 'PREFLIGHT_REJECT_ROBOTS_OR_ACCESS'
    : !technicalReachable
      ? 'PREFLIGHT_TECHNICAL_HOLD'
      : semanticPassCount === 0
        ? 'PREFLIGHT_SEMANTIC_HOLD'
        : 'PREFLIGHT_COMPLETE_RIGHTS_REVIEW_REQUIRED';
  const identityState = finalHost === hostData.canonical_host
    ? 'CANONICAL_HOST_CONFIRMED'
    : finalHost
      ? 'REDIRECT_HOST_REVIEW_REQUIRED'
      : 'FINAL_HOST_UNKNOWN';
  const completedAt = nowIso();
  return {
    preflight_id: deterministicId('host-preflight', { host: hostData.canonical_host, input_candidates: hostData.candidate_ids, completed_at: completedAt }),
    canonical_host: hostData.canonical_host,
    origin,
    representative_candidate_url: representativeUrl,
    candidate_ids: hostData.candidate_ids,
    candidate_count: hostData.candidate_count,
    evidence_classes: hostData.evidence_classes,
    discovery_lanes: hostData.discovery_lanes,
    preflight_state: preflightState,
    identity: {
      state: identityState,
      canonical_host: hostData.canonical_host,
      final_host: finalHost,
      redirected: Boolean(head.redirected || root.redirected),
      redirect_target: root.final_url || head.final_url || null,
      host_identity_is_factual_origin_proof: false
    },
    technical: {
      state: technicalReachable ? 'REACHABLE_BOUNDED_PREFLIGHT' : 'TECHNICAL_FAILURE_OR_BLOCK',
      head_status: head.http_status,
      root_status: root.http_status,
      robots_status: robots.http_status,
      root_content_type: root.content_type,
      root_body_bytes: root.body_bytes,
      root_body_truncated: root.body_truncated,
      tls_used: origin.startsWith('https://'),
      target_site_market_records_collected: false,
      deep_crawl_executed: false
    },
    robots: robotsParsed,
    root_metadata: {
      title: metadata.title,
      description: metadata.description,
      classified_links: metadata.classified_links,
      terms_link_count: termsLinks.length,
      privacy_link_count: privacyLinks.length,
      api_link_count: apiLinks.length,
      discovered_links_followed: false
    },
    semantics,
    rights: {
      state: rightsState,
      robots_allow_is_collection_permission: false,
      public_web_access_is_collection_permission: false,
      terms_link_is_rights_pass: false,
      automatic_rights_pass: false
    },
    request_evidence: {
      head: { ...head, body_text: undefined },
      root: { ...root, body_text: undefined },
      robots: { ...robots, body_text: undefined }
    },
    observed_at: completedAt,
    source_candidate_is_evidence: false,
    evidence_admitted: false,
    market_claim_authorized: false,
    public_release: 'HOLD',
    production: 'HOLD'
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
      output[index] = await fn(values[index]);
      await sleep(100);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, () => worker()));
  return output;
}

const cycleStartedAt = nowIso();
const newEntries = await mapConcurrent(selectedHosts, concurrency, preflightHost);
const mergedEntries = new Map(previousEntries);
for (const entry of newEntries) mergedEntries.set(entry.canonical_host, entry);
const ledgerEntries = [...mergedEntries.values()].sort((a, b) => a.canonical_host.localeCompare(b.canonical_host));
const preflightByHost = new Map(ledgerEntries.map((entry) => [entry.canonical_host, entry]));

const assignments = candidatesInput.candidates
  .map((candidate) => {
    const preflight = preflightByHost.get(candidate.canonical_host);
    if (!preflight) {
      return {
        assignment_id: deterministicId('candidate-preflight-assignment', { candidate: candidate.candidate_id, state: 'WAITING' }),
        candidate_id: candidate.candidate_id,
        canonical_host: candidate.canonical_host,
        evidence_class: candidate.evidence_class,
        preflight_id: null,
        preflight_state: 'PREFLIGHT_NOT_EXECUTED_CYCLE_LIMIT',
        admission_readiness_state: 'WAITING_FOR_HOST_PREFLIGHT',
        semantic_score: null,
        rights_state: 'UNASSESSED',
        technical_state: 'NOT_EXECUTED',
        evidence_admitted: false,
        public_release: 'HOLD',
        production: 'HOLD'
      };
    }
    const semantic = preflight.semantics[candidate.evidence_class] || { score: 0, threshold_pass: false };
    const readiness = preflight.preflight_state === 'PREFLIGHT_REJECT_ROBOTS_OR_ACCESS'
      ? 'REJECTED_AUTOMATION_OR_ACCESS'
      : preflight.preflight_state === 'PREFLIGHT_TECHNICAL_HOLD'
        ? 'NOT_READY_TECHNICAL_FAILURE'
        : !semantic.threshold_pass
          ? 'NOT_READY_SEMANTIC_INSUFFICIENT'
          : 'NOT_READY_RIGHTS_UNKNOWN';
    return {
      assignment_id: deterministicId('candidate-preflight-assignment', { candidate: candidate.candidate_id, preflight: preflight.preflight_id }),
      candidate_id: candidate.candidate_id,
      canonical_host: candidate.canonical_host,
      evidence_class: candidate.evidence_class,
      preflight_id: preflight.preflight_id,
      preflight_state: preflight.preflight_state,
      admission_readiness_state: readiness,
      semantic_score: semantic.score,
      semantic_threshold_pass: semantic.threshold_pass,
      rights_state: preflight.rights.state,
      technical_state: preflight.technical.state,
      evidence_admitted: false,
      public_release: 'HOLD',
      production: 'HOLD'
    };
  })
  .sort((a, b) => a.candidate_id.localeCompare(b.candidate_id));

const hostLedger = {
  id: 'kidults-asi-candidate-host-preflight-ledger-v1',
  version: '1.0.0',
  state: selectedHosts.length > 0 ? 'HOST_PREFLIGHT_CYCLE_EXECUTED' : 'NO_NEW_HOSTS_REVALIDATED_CUMULATIVE_LEDGER',
  cycle_started_at: cycleStartedAt,
  cycle_completed_at: nowIso(),
  source_candidate_increment_digest: sha256(stableJson(candidatesInput)),
  total_candidate_hosts: allHosts.length,
  previous_preflighted_hosts: previousEntries.size,
  selected_hosts_this_cycle: selectedHosts.length,
  preflighted_hosts_cumulative: ledgerEntries.length,
  remaining_hosts: Math.max(0, allHosts.length - ledgerEntries.length),
  maximum_hosts_per_cycle: batchSize,
  entries: ledgerEntries,
  bounded_root_and_robots_only: true,
  market_records_collected: false,
  public_release: 'HOLD',
  production: 'HOLD'
};

const assignmentOutput = {
  id: 'kidults-asi-candidate-preflight-assignment-v1',
  version: '1.0.0',
  state: 'CANDIDATES_BOUND_TO_HOST_PREFLIGHT_OR_EXPLICIT_WAITING_STATE',
  candidate_count: assignments.length,
  assigned_to_completed_host_preflight: assignments.filter((item) => item.preflight_id !== null).length,
  waiting_for_host_preflight: assignments.filter((item) => item.preflight_id === null).length,
  assignments,
  preflight_is_admission: false,
  evidence_admitted: 0,
  public_release: 'HOLD',
  production: 'HOLD'
};

const readinessCounts = Object.fromEntries(contract.admission_readiness_states.map((state) => [
  state,
  assignments.filter((item) => item.admission_readiness_state === state).length
]));
const admissionReadiness = {
  id: 'kidults-asi-candidate-admission-readiness-v1',
  version: '1.0.0',
  state: 'NO_AUTOMATIC_ADMISSION_RIGHTS_REVIEW_REQUIRED',
  candidate_count: assignments.length,
  readiness_counts: readinessCounts,
  automatic_admission_eligible: 0,
  rights_unknown_candidates: readinessCounts.NOT_READY_RIGHTS_UNKNOWN,
  semantic_hold_candidates: readinessCounts.NOT_READY_SEMANTIC_INSUFFICIENT,
  technical_hold_candidates: readinessCounts.NOT_READY_TECHNICAL_FAILURE,
  rejected_automation_or_access_candidates: readinessCounts.REJECTED_AUTOMATION_OR_ACCESS,
  waiting_candidates: readinessCounts.WAITING_FOR_HOST_PREFLIGHT,
  evidence_admitted: 0,
  public_release: 'HOLD',
  production: 'HOLD'
};

const requestEntries = newEntries.flatMap((entry) => [entry.request_evidence.head, entry.request_evidence.root, entry.request_evidence.robots]);
const preflightHealth = {
  id: 'kidults-asi-candidate-preflight-health-v1',
  version: '1.0.0',
  state: requestEntries.some((request) => request.error) ? 'PARTIAL_NETWORK_OR_ACCESS_FAILURE_EXPLICIT' : 'ALL_SELECTED_HOST_REQUESTS_COMPLETED',
  selected_hosts: selectedHosts.length,
  request_count: requestEntries.length,
  successful_requests: requestEntries.filter((request) => request.ok).length,
  failed_or_non_success_requests: requestEntries.filter((request) => !request.ok).length,
  http_status_counts: Object.fromEntries(unique(requestEntries.map((request) => String(request.http_status ?? 'NONE'))).sort().map((status) => [
    status,
    requestEntries.filter((request) => String(request.http_status ?? 'NONE') === status).length
  ])),
  failure_codes: unique(requestEntries.map((request) => request.error).filter(Boolean)).sort(),
  bounded_body_limit_bytes: maxBytes,
  discovered_links_followed: false,
  market_records_collected: false,
  public_release: 'HOLD',
  production: 'HOLD'
};

async function writeJson(name, value) {
  const content = stableJson(value);
  await fs.writeFile(path.join(outputDir, name), content);
  return { name, sha256: sha256(content), bytes: Buffer.byteLength(content) };
}

const files = [];
files.push(await writeJson('candidate-host-preflight-ledger-v1.json', hostLedger));
files.push(await writeJson('candidate-preflight-assignment-v1.json', assignmentOutput));
files.push(await writeJson('candidate-admission-readiness-v1.json', admissionReadiness));
files.push(await writeJson('candidate-preflight-health-v1.json', preflightHealth));

const manifest = {
  id: 'kidults-asi-candidate-preflight-manifest-v1',
  version: '1.0.0',
  state: 'P1_CANDIDATE_PREFLIGHT_EXECUTED_AND_READY_FOR_VALIDATION',
  platform_principles: principles,
  input_bindings: {
    candidate_increment: {
      id: candidatesInput.id,
      version: candidatesInput.version,
      candidates: candidatesInput.unique_query_group_candidates,
      hosts: candidatesInput.unique_hosts,
      digest: sha256(stableJson(candidatesInput))
    },
    previous_ledger: previousLedger ? {
      id: previousLedger.id,
      version: previousLedger.version,
      preflighted_hosts: previousLedger.preflighted_hosts_cumulative,
      digest: sha256(stableJson(previousLedger))
    } : null,
    contract: {
      id: contract.id,
      version: contract.version,
      digest: sha256(stableJson(contract))
    }
  },
  results: {
    total_candidate_hosts: allHosts.length,
    selected_hosts_this_cycle: selectedHosts.length,
    preflighted_hosts_cumulative: ledgerEntries.length,
    remaining_hosts: hostLedger.remaining_hosts,
    candidate_records: assignments.length,
    candidates_bound_to_completed_preflight: assignmentOutput.assigned_to_completed_host_preflight,
    candidates_waiting_for_host_preflight: assignmentOutput.waiting_for_host_preflight,
    rights_review_required_candidates: admissionReadiness.rights_unknown_candidates,
    semantic_hold_candidates: admissionReadiness.semantic_hold_candidates,
    technical_hold_candidates: admissionReadiness.technical_hold_candidates,
    rejected_automation_or_access_candidates: admissionReadiness.rejected_automation_or_access_candidates,
    automatic_admission_eligible: 0,
    evidence_admitted: 0,
    market_records_collected: false,
    discovered_links_followed: false
  },
  output_files: files,
  autonomous_effect: 'POSITIVE_NEW_CANDIDATE_HOSTS_AUTOMATICALLY_SELECTED_AND_PREFLIGHTED_EACH_CYCLE',
  global_effect: 'POSITIVE_ALL_DISCOVERED_HOSTS_RETAIN_SCOPE_REGION_AND_EVIDENCE_CLASS_ASSIGNMENTS',
  irreplaceable_value_effect: 'POSITIVE_KIDULTS_OWNED_HOST_IDENTITY_TECHNICAL_SEMANTIC_RIGHTS_UNCERTAINTY_AND_READINESS_LEDGER',
  transparency_effect: 'POSITIVE_REQUEST_STATUS_REDIRECT_ROBOTS_METADATA_DIGEST_FAILURE_AND_RIGHTS_UNKNOWN_STATE_PRESERVED',
  public_release: 'HOLD',
  production: 'HOLD'
};
files.push(await writeJson('candidate-preflight-manifest-v1.json', manifest));

console.log(JSON.stringify({
  state: manifest.state,
  total_candidate_hosts: manifest.results.total_candidate_hosts,
  selected_hosts_this_cycle: manifest.results.selected_hosts_this_cycle,
  preflighted_hosts_cumulative: manifest.results.preflighted_hosts_cumulative,
  remaining_hosts: manifest.results.remaining_hosts,
  candidate_records: manifest.results.candidate_records,
  rights_review_required_candidates: manifest.results.rights_review_required_candidates,
  semantic_hold_candidates: manifest.results.semantic_hold_candidates,
  technical_hold_candidates: manifest.results.technical_hold_candidates,
  rejected_automation_or_access_candidates: manifest.results.rejected_automation_or_access_candidates,
  automatic_admission_eligible: 0,
  evidence_admitted: 0,
  output_dir: outputDir
}, null, 2));
