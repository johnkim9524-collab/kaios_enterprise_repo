const LIMIT_BYTES = 1024 * 1024;
const error = code => new Error(`COMMON_CRAWL_${code}`);

// Public index metadata only. The deadline includes headers and decoded body.
export async function getCommonCrawlIndexResponse(url, {
  fetchImpl = globalThis.fetch, timeoutMs = 15000,
  maxBytes = LIMIT_BYTES, retryDelayMs = 700,
} = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 15000
    || !Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > LIMIT_BYTES
    || !Number.isInteger(retryDelayMs) || retryDelayMs < 0 || retryDelayMs > 700)
    throw error('READ_BUDGET_INVALID');
  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    let reader, response, timer;
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(error('READ_DEADLINE_EXCEEDED'));
        controller.abort();
      }, timeoutMs);
    });
    let result;
    try {
      result = await Promise.race([deadline, (async () => {
        response = await fetchImpl(url, {signal: controller.signal, headers: {
          Accept: 'application/json,text/plain',
          'User-Agent': 'KIDULTS-ASI-Common-Crawl-Host-Expansion-v1',
        }});
        if (!response.ok) {
          if ((response.status === 429 || response.status >= 500) && attempt < 2)
            return {retry: true};
          throw new Error(`HTTP_${response.status}`);
        }
        const length = response.headers.get('content-length');
        if (length !== null && /^\d+$/.test(length) && Number(length) > maxBytes)
          throw error('BODY_TOO_LARGE');
        const chunks = [];
        let bytes = 0;
        if (response.body !== null) {
          reader = response.body.getReader();
          for (;;) {
            const {done, value} = await reader.read();
            if (done) break;
            if (!(value instanceof Uint8Array)) throw error('BODY_CHUNK_INVALID');
            bytes += value.byteLength;
            if (bytes > maxBytes) throw error('BODY_TOO_LARGE');
            chunks.push(Buffer.from(value));
          }
        }
        const text = Buffer.concat(chunks, bytes).toString('utf8');
        return {text: async () => text, json: async () => JSON.parse(text)};
      })()]);
    } finally {
      clearTimeout(timer);
      controller.abort();
      // Cleanup must never create a second unbounded wait, including 429/5xx.
      try {
        const cancelled = reader ? reader.cancel() : response?.body?.cancel();
        cancelled?.catch(() => {});
      } catch {}
      try { reader?.releaseLock(); } catch {}
    }
    if (!result.retry) return result;
    await new Promise(resolve => setTimeout(resolve, retryDelayMs * (2 ** attempt)));
  }
}
