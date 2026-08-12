import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CONFIG_PATH = path.join(ROOT, 'config', 'kidult100-wikimedia-demand-source.json');
const DEFAULT_OPEN_EVIDENCE = path.join(ROOT, 'reports', 'kidult100-right-data', 'open-evidence-latest.json');
const DEFAULT_OUT = path.join(ROOT, 'reports', 'kidult100-right-data', 'wikimedia-demand-evidence-latest.json');
const CONTACT_URL = 'https://github.com/johnkim9524-collab/kaios_enterprise_repo';
const UA = `KIDULTS-Kidult100-Bot/1.0 (${CONTACT_URL}; CC0 Wikimedia Analytics demand supplement)`;
const MAX_RETRIES = 3;

function readJsonInput(value, fallbackPath) {
  const raw = value == null || String(value).trim() === '' ? fallbackPath : String(value).trim();
  if (raw.startsWith('{') || raw.startsWith('[')) return JSON.parse(raw);
  const resolved = path.isAbsolute(raw) ? raw : path.join(ROOT, raw);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) throw new Error(`Missing JSON input: ${resolved}`);
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function compactDate(date) {
  return date.toISOString().slice(0, 10).replaceAll('-', '');
}

function evidenceWindow(windowDays, loadLagDays) {
  const today = new Date();
  const utcDay = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const end = new Date(utcDay.getTime() - loadLagDays * 86400000);
  const start = new Date(end.getTime() - (windowDays - 1) * 86400000);
  return { start: compactDate(start), end: compactDate(end) };
}

function wikipediaProject(site) {
  const match = String(site || '').match(/^([a-z][a-z0-9_]{1,14}|simple)wiki$/i);
  if (!match) return null;
  const language = match[1].toLowerCase().replaceAll('_', '-');
  if (['commons', 'wikidata', 'species', 'mediawiki', 'meta'].includes(language)) return null;
  return `${language}.wikipedia.org`;
}

function chooseWikipediaSitelink(sitelinks) {
  if (!sitelinks || typeof sitelinks !== 'object') return null;
  if (sitelinks.enwiki?.title) return { project: 'en.wikipedia.org', title: sitelinks.enwiki.title, site: 'enwiki' };
  const entries = Object.entries(sitelinks)
    .map(([site, row]) => ({ site, project: wikipediaProject(site), title: row?.title || null }))
    .filter((row) => row.project && row.title)
    .sort((a, b) => a.site.localeCompare(b.site));
  return entries[0] || null;
}

function wikipediaActionApi(project) {
  const match = String(project || '').match(/^([a-z][a-z0-9-]{1,20}|simple)\.wikipedia\.org$/i);
  return match ? `https://${match[0].toLowerCase()}/w/api.php` : null;
}

function buildPageviewUrl(apiBase, sitelink, evidencePolicy, window, title = sitelink.title) {
  const article = encodeURIComponent(String(title).replaceAll(' ', '_'));
  return `${apiBase}/metrics/pageviews/per-article/${encodeURIComponent(sitelink.project)}/${evidencePolicy.access}/${evidencePolicy.agent}/${article}/${evidencePolicy.granularity}/${window.start}/${window.end}`;
}

function resolvedWikipediaTitle(body) {
  const pages = Array.isArray(body?.query?.pages) ? body.query.pages : [];
  const page = pages[0];
  if (!page || page.missing === true || typeof page.title !== 'string' || !page.title.trim()) return null;
  return page.title.trim();
}

async function fetchJson(url, { allow404 = false } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { accept: 'application/json', 'user-agent': UA },
        signal: AbortSignal.timeout(15000),
      });
      if (response.ok) return { body: await response.json(), status: response.status };
      if (allow404 && response.status === 404) return { body: null, status: 404 };
      const transient = response.status === 429 || response.status >= 500;
      if (transient && attempt < MAX_RETRIES) {
        const retryAfter = Number(response.headers.get('retry-after'));
        const delay = Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(10000, retryAfter * 1000)
          : Math.min(8000, 600 * (2 ** attempt));
        await sleep(delay);
        continue;
      }
      throw new Error(`HTTP_${response.status}:${url}`);
    } catch (error) {
      lastError = error;
      const message = String(error?.message || error);
      const transient = /timeout|fetch failed|ECONNRESET|ETIMEDOUT/i.test(message);
      if (transient && attempt < MAX_RETRIES) {
        await sleep(Math.min(8000, 600 * (2 ** attempt)));
        continue;
      }
      throw error;
    }
  }
  throw lastError || new Error(`REQUEST_FAILED:${url}`);
}

const config = readJsonInput(process.env.KIDULTS_WIKIMEDIA_DEMAND_CONFIG_JSON, CONFIG_PATH);
const openEvidence = readJsonInput(process.env.KIDULTS_WIKIMEDIA_DEMAND_OPEN_EVIDENCE_JSON, DEFAULT_OPEN_EVIDENCE);
const outRaw = process.env.KIDULTS_WIKIMEDIA_DEMAND_OUTPUT || DEFAULT_OUT;
const outPath = path.isAbsolute(outRaw) ? outRaw : path.join(ROOT, outRaw);
const source = config?.source || {};
const evidencePolicy = config?.evidence || {};

if (config?.policy !== 'RIGHTS_QUALIFIED_CC0_WIKIMEDIA_ANALYTICS_DEMAND_SUPPLEMENT') throw new Error('Invalid Wikimedia demand source policy');
if (source.apiBase !== 'https://wikimedia.org/api/rest_v1') throw new Error('Wikimedia Analytics API base must remain official HTTPS endpoint');
if (source.license !== 'CC0-1.0' || source.rightsClass !== 'CC0_WIKIMEDIA_ANALYTICS_DATA') throw new Error('Wikimedia Analytics CC0 rights contract mismatch');
if (source.requiresUserAgent !== true || source.sequentialRequests !== true || source.unauthorizedScrapingAllowed !== false || source.paidProviderRequired !== false) throw new Error('Unsafe Wikimedia access contract');
if (evidencePolicy.primitive !== 'DEMAND_ATTENTION' || evidencePolicy.signalType !== 'CULTURAL_ATTENTION_PROXY' || evidencePolicy.normalizedScoreAllowed !== false || evidencePolicy.marketDemandClaimAllowed !== false) throw new Error('Unsafe Wikimedia demand evidence contract');

const summary = Array.isArray(openEvidence?.candidateEvidenceSummary) ? openEvidence.candidateEvidenceSummary : [];
const linked = summary.filter((row) => /^Q\d+$/.test(String(row?.wikidataId || '')));
const missingDemand = linked.filter((row) => row?.demandAttentionEvidence !== true);
const wikidataIds = [...new Set(missingDemand.map((row) => row.wikidataId))];
const entityById = new Map();
const sourceErrors = [];
let wikidataRequests = 0;

for (let i = 0; i < wikidataIds.length; i += 40) {
  const batch = wikidataIds.slice(i, i + 40);
  const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(batch.join('|'))}&props=sitelinks&format=json&origin=*`;
  try {
    wikidataRequests += 1;
    const { body } = await fetchJson(url);
    for (const [id, entity] of Object.entries(body?.entities || {})) entityById.set(id, entity);
  } catch (error) {
    sourceErrors.push({ stage: 'WIKIDATA_SITELINK_FETCH', ids: batch, error: String(error?.message || error) });
  }
}

const window = evidenceWindow(Number(evidencePolicy.windowDays), Number(evidencePolicy.loadLagDays));
const evidence = [];
let pageviewRequests = 0;
let pageview404 = 0;
let noWikipediaSitelink = 0;
let zeroViewResponses = 0;
let titleResolutionRequests = 0;
let pageviewResolutionRetries = 0;
let pageview404Recovered = 0;
let pageview404AfterResolution = 0;

for (const row of missingDemand) {
  const entity = entityById.get(row.wikidataId);
  const sitelink = chooseWikipediaSitelink(entity?.sitelinks);
  if (!sitelink) {
    noWikipediaSitelink += 1;
    continue;
  }

  const originalTitle = sitelink.title;
  let evidenceTitle = originalTitle;
  let pageviewUrl = buildPageviewUrl(source.apiBase, sitelink, evidencePolicy, window, evidenceTitle);
  try {
    pageviewRequests += 1;
    let response = await fetchJson(pageviewUrl, { allow404: true });
    if (response.status === 404) {
      pageview404 += 1;
      const actionApi = wikipediaActionApi(sitelink.project);
      if (!actionApi) {
        sourceErrors.push({ stage: 'WIKIPEDIA_TITLE_RESOLUTION_PROJECT_REJECTED', candidateKey: row.candidateKey, project: sitelink.project, title: originalTitle });
        continue;
      }

      const resolutionUrl = `${actionApi}?action=query&titles=${encodeURIComponent(originalTitle)}&redirects=1&format=json&formatversion=2&origin=*`;
      try {
        titleResolutionRequests += 1;
        const resolution = await fetchJson(resolutionUrl);
        const resolvedTitle = resolvedWikipediaTitle(resolution.body);
        if (!resolvedTitle || resolvedTitle === originalTitle) continue;
        evidenceTitle = resolvedTitle;
        pageviewUrl = buildPageviewUrl(source.apiBase, sitelink, evidencePolicy, window, evidenceTitle);
        pageviewResolutionRetries += 1;
        pageviewRequests += 1;
        response = await fetchJson(pageviewUrl, { allow404: true });
        if (response.status === 404) {
          pageview404AfterResolution += 1;
          continue;
        }
        pageview404Recovered += 1;
      } catch (error) {
        sourceErrors.push({ stage: 'WIKIPEDIA_TITLE_RESOLUTION', candidateKey: row.candidateKey, project: sitelink.project, title: originalTitle, error: String(error?.message || error) });
        continue;
      }
    }

    const items = Array.isArray(response.body?.items) ? response.body.items : [];
    const totalViews = items.reduce((sum, item) => sum + (Number.isFinite(Number(item?.views)) ? Number(item.views) : 0), 0);
    if (totalViews < Number(evidencePolicy.minimumViews)) {
      zeroViewResponses += 1;
      continue;
    }
    evidence.push({
      candidateKey: row.candidateKey,
      primitive: evidencePolicy.primitive,
      source: source.id,
      sourceUrl: pageviewUrl,
      rightsClass: source.rightsClass,
      observedAt: new Date().toISOString(),
      payloadHash: hash({ project: sitelink.project, title: evidenceTitle, originalTitle, window, items }),
      evidenceClass: evidencePolicy.evidenceClass,
      value: {
        signalType: evidencePolicy.signalType,
        metric: evidencePolicy.metric,
        project: sitelink.project,
        articleTitle: evidenceTitle,
        originalArticleTitle: evidenceTitle === originalTitle ? null : originalTitle,
        wikidataId: row.wikidataId,
        totalPageviews: totalViews,
        reportedDays: items.length,
        windowStart: window.start,
        windowEnd: window.end,
        titleResolutionViaOfficialMediaWikiApi: evidenceTitle !== originalTitle,
        interpretation: 'Wikimedia reader-attention signal only; not market demand, transaction volume, liquidity, price or willingness-to-pay.',
      },
      safety: {
        openDataOnly: true,
        synthetic: false,
        estimated: false,
        marketTransactionClaim: false,
        marketDemandClaim: false,
        sourceLicense: source.license,
        titleResolutionEvidenceOnly: false,
      },
    });
  } catch (error) {
    sourceErrors.push({ stage: 'WIKIMEDIA_PAGEVIEWS', candidateKey: row.candidateKey, project: sitelink.project, title: evidenceTitle, error: String(error?.message || error) });
  }
}

const output = {
  schemaVersion: '1.1.0',
  mode: 'KIDULT100_WIKIMEDIA_ANALYTICS_DEMAND_EVIDENCE',
  generatedAt: new Date().toISOString(),
  policy: config.policy,
  source,
  evidencePolicy,
  window,
  metrics: {
    linkedCandidates: linked.length,
    existingDemandCandidates: linked.length - missingDemand.length,
    missingDemandCandidates: missingDemand.length,
    wikidataIdsRequested: wikidataIds.length,
    wikidataRequests,
    pageviewRequests,
    pageview404,
    noWikipediaSitelink,
    zeroViewResponses,
    titleResolutionRequests,
    pageviewResolutionRetries,
    pageview404Recovered,
    pageview404AfterResolution,
    newDemandEvidenceRecords: evidence.length,
    sourceErrorCount: sourceErrors.length,
  },
  claims: {
    rightsClassifiedInputs: true,
    provenanceRecorded: true,
    normalizedScoresGenerated: false,
    marketDemandClaimed: false,
    transactionOrLiquidityClaimed: false,
    syntheticOrEstimatedEvidenceUsed: false,
    unauthorizedScrapingUsed: false,
    paidProviderUsed: false,
    titleResolutionUsesOfficialWikipediaApiOnly: true,
    titleResolutionCreatesEvidenceByItself: false,
  },
  evidence,
  sourceErrors,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
console.log(`Wikimedia demand supplement: linked=${linked.length} missingDemand=${missingDemand.length} pageviewRequests=${pageviewRequests} newEvidence=${evidence.length}`);
console.log(`noWikipediaSitelink=${noWikipediaSitelink} pageview404=${pageview404} resolved404=${pageview404Recovered} titleResolutionRequests=${titleResolutionRequests} errors=${sourceErrors.length} window=${window.start}-${window.end}`);
