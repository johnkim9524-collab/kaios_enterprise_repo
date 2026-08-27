import { validateNormalizedEvidence, type NormalizedEvidence, type SourceFamily } from './adapters';
import { goldenPathTransactions } from './golden-path';

export type AdapterConfig = {
  id: string;
  family: SourceFamily;
  endpoint: string;
  enabled?: boolean;
  authHeader?: string;
  authToken?: string;
  timeoutMs?: number;
};

export type CollectorBatch = {
  adapterId: string;
  family: SourceFamily;
  rawCount: number;
  normalized: NormalizedEvidence[];
};

const MAX_ADAPTER_RESPONSE_BYTES = 1_048_576;
const MAX_ADAPTER_ATTEMPTS = 3;
const MAX_ADAPTER_ITEMS = 5000;

function parseConfigs(value?: string): AdapterConfig[] {
  if (!value) return [];
  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error('SOURCE_ADAPTERS_JSON must be an array');
  return parsed.filter((item) => item?.enabled !== false) as AdapterConfig[];
}

function isGoldenPathAdapter(config: AdapterConfig): boolean {
  if (config.id !== 'staging-transactions-golden-path') return false;
  try { return new URL(config.endpoint).pathname === '/internal/golden-path/transactions'; }
  catch { return false; }
}

async function fetchJson(config: AdapterConfig): Promise<unknown> {
  let parsedUrl: URL;
  try { parsedUrl = new URL(config.endpoint); } catch { throw new Error(`${config.id} endpoint is invalid`); }
  if (parsedUrl.protocol !== 'https:') throw new Error(`${config.id} endpoint must use HTTPS`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort('adapter timeout'), Math.max(1000, config.timeoutMs || 15000));
  try {
    const headers = new Headers({ accept: 'application/json' });
    if (config.authHeader && config.authToken) headers.set(config.authHeader, config.authToken);
    for (let attempt = 1; attempt <= MAX_ADAPTER_ATTEMPTS; attempt += 1) {
      const response = await fetch(config.endpoint, { headers, signal: controller.signal });
      if (!response.ok) {
        if ((response.status === 429 || response.status >= 500) && attempt < MAX_ADAPTER_ATTEMPTS) {
          const retryAfter = Math.min(5000, Math.max(0, Number(response.headers.get('retry-after') || 0) * 1000));
          await new Promise(resolve => setTimeout(resolve, retryAfter || attempt * 250));
          continue;
        }
        throw new Error(`${config.id} returned HTTP ${response.status}`);
      }
      const body = await response.text();
      if (Buffer.byteLength(body, 'utf8') > MAX_ADAPTER_RESPONSE_BYTES) {
        throw new Error(`${config.id} response exceeds bounded size`);
      }
      try { return JSON.parse(body); } catch { throw new Error(`${config.id} returned invalid JSON`); }
    }
    throw new Error(`${config.id} exhausted bounded retry budget`);
  } finally {
    clearTimeout(timeout);
  }
}

async function loadAdapterPayload(config: AdapterConfig): Promise<unknown> {
  if (isGoldenPathAdapter(config)) return goldenPathTransactions();
  return fetchJson(config);
}

function extractEvidence(payload: unknown): NormalizedEvidence[] {
  if (Array.isArray(payload)) return payload as NormalizedEvidence[];
  if (payload && typeof payload === 'object') {
    const object = payload as Record<string, unknown>;
    if (Array.isArray(object.items)) return object.items as NormalizedEvidence[];
    if (Array.isArray(object.evidence)) return object.evidence as NormalizedEvidence[];
    if (object.item) return [object.item as NormalizedEvidence];
  }
  throw new Error('adapter response must be normalized evidence array or {items:[]}');
}

export async function collectConfiguredAdapters(sourceAdaptersJson?: string): Promise<CollectorBatch[]> {
  const configs = parseConfigs(sourceAdaptersJson);
  return Promise.all(configs.map(async (config): Promise<CollectorBatch> => {
    if (!config.id || !config.family || !config.endpoint) throw new Error('adapter requires id, family and endpoint');
    const payload = await loadAdapterPayload(config);
    const items = extractEvidence(payload).map((item) => {
      if (item.source.family !== config.family) throw new Error(`${config.id} family mismatch`);
      return validateNormalizedEvidence(item);
    });
    if (items.length > MAX_ADAPTER_ITEMS) throw new Error(`${config.id} item count exceeds bounded limit`);
    return { adapterId: config.id, family: config.family, rawCount: items.length, normalized: items };
  }));
}
