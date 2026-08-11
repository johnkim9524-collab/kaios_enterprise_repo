const OFFICIAL_ENDPOINT = 'https://www.wikidata.org/w/api.php';
const DEFAULT_UA = 'KIDULTS-Kidult100-Bot/1.1 (https://github.com/johnkim9524-collab/kaios_enterprise_repo; source-native semantic verification)';
const DEFAULT_MAX_RETRIES = 4;
const DEFAULT_MAXLAG_SECONDS = 5;
const DEFAULT_BACKOFF_MS = 900;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(response, body, attempt, baseBackoffMs) {
  const retryAfterSeconds = Number(response?.headers?.get?.('retry-after'));
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) return retryAfterSeconds * 1000;
  const reportedLagSeconds = Number(body?.error?.lag);
  if (body?.error?.code === 'maxlag' && Number.isFinite(reportedLagSeconds) && reportedLagSeconds > 0) {
    return Math.ceil(reportedLagSeconds * 1000);
  }
  return Math.min(10000, baseBackoffMs * (2 ** attempt));
}

export async function fetchWikidataEntities(ids, options = {}) {
  const endpoint = options.endpoint || OFFICIAL_ENDPOINT;
  const fetchImpl = options.fetchImpl || fetch;
  const sleepImpl = options.sleepImpl || sleep;
  const userAgent = options.userAgent || DEFAULT_UA;
  const timeoutMs = Number(options.timeoutMs || 15000);
  const batchSize = Math.max(1, Number(options.batchSize || 40));
  const maxRetries = Math.max(0, Number(options.maxRetries ?? DEFAULT_MAX_RETRIES));
  const maxlagSeconds = Math.max(1, Number(options.maxlagSeconds || DEFAULT_MAXLAG_SECONDS));
  const baseBackoffMs = Math.max(1, Number(options.baseBackoffMs || DEFAULT_BACKOFF_MS));
  const uniqueIds = [...new Set((Array.isArray(ids) ? ids : []).filter((id) => /^Q\d+$/.test(String(id || ''))))];
  const entities = {};
  const errors = [];
  let requestCount = 0;
  let retries = 0;
  let rateLimits = 0;
  let maxlagResponses = 0;

  for (let index = 0; index < uniqueIds.length; index += batchSize) {
    const batch = uniqueIds.slice(index, index + batchSize);
    const url = new URL(endpoint);
    url.searchParams.set('action', 'wbgetentities');
    url.searchParams.set('ids', batch.join('|'));
    url.searchParams.set('props', 'claims|labels|descriptions');
    url.searchParams.set('format', 'json');
    url.searchParams.set('origin', '*');
    url.searchParams.set('maxlag', String(maxlagSeconds));

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      requestCount += 1;
      try {
        const response = await fetchImpl(url, {
          headers: { accept: 'application/json', 'accept-encoding': 'gzip,deflate', 'user-agent': userAgent },
          signal: AbortSignal.timeout(timeoutMs),
        });
        const body = await response.json().catch(() => null);
        const maxlag = body?.error?.code === 'maxlag';
        if (response.ok && !maxlag) {
          Object.assign(entities, body?.entities || {});
          break;
        }

        if (maxlag) maxlagResponses += 1;
        if (response.status === 429) rateLimits += 1;
        const explicitBackpressure = maxlag || response.status === 429;
        if (explicitBackpressure && attempt < maxRetries) {
          retries += 1;
          await sleepImpl(retryDelayMs(response, body, attempt, baseBackoffMs));
          continue;
        }

        errors.push({ ids: batch, error: maxlag ? 'WIKIDATA_MAXLAG' : `HTTP_${response.status}` });
        break;
      } catch (error) {
        errors.push({ ids: batch, error: String(error?.message || error) });
        break;
      }
    }
  }

  return {
    entities,
    errors,
    requestCount,
    retries,
    rateLimits,
    maxlagResponses,
    accessPolicy: {
      officialEndpoint: endpoint === OFFICIAL_ENDPOINT,
      serialRequests: true,
      serverDrivenBackpressure: true,
      retriesOnlyOnExplicitBackpressure: true,
      maxRetries,
      maxlagSeconds,
      gzipRequested: true,
    },
  };
}
