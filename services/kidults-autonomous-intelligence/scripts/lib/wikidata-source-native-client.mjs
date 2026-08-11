const OFFICIAL_ENDPOINT = 'https://www.wikidata.org/w/api.php';
const DEFAULT_UA = 'KIDULTS-Kidult100-Bot/1.0 (https://github.com/johnkim9524-collab/kaios_enterprise_repo; source-native semantic verification)';

export async function fetchWikidataEntities(ids, options = {}) {
  const endpoint = options.endpoint || OFFICIAL_ENDPOINT;
  const fetchImpl = options.fetchImpl || fetch;
  const userAgent = options.userAgent || DEFAULT_UA;
  const timeoutMs = Number(options.timeoutMs || 15000);
  const batchSize = Math.max(1, Number(options.batchSize || 40));
  const uniqueIds = [...new Set((Array.isArray(ids) ? ids : []).filter((id) => /^Q\d+$/.test(String(id || ''))))];
  const entities = {};
  const errors = [];
  let requestCount = 0;

  for (let index = 0; index < uniqueIds.length; index += batchSize) {
    const batch = uniqueIds.slice(index, index + batchSize);
    const url = new URL(endpoint);
    url.searchParams.set('action', 'wbgetentities');
    url.searchParams.set('ids', batch.join('|'));
    url.searchParams.set('props', 'claims|labels|descriptions');
    url.searchParams.set('format', 'json');
    url.searchParams.set('origin', '*');
    requestCount += 1;
    try {
      const response = await fetchImpl(url, {
        headers: { accept: 'application/json', 'user-agent': userAgent },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        errors.push({ ids: batch, error: `HTTP_${response.status}` });
        continue;
      }
      const body = await response.json();
      Object.assign(entities, body?.entities || {});
    } catch (error) {
      errors.push({ ids: batch, error: String(error?.message || error) });
    }
  }

  return { entities, errors, requestCount };
}
