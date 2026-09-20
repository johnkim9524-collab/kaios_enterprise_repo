const MUTATION = /^(?:INSERT|UPDATE|DELETE|REPLACE)\b/i;
const SCHEMA_CHANGE = /\b(?:CREATE|DROP|ALTER|TRUNCATE|VACUUM|REINDEX|ATTACH|DETACH|PRAGMA)\b/i;

function required(value, name) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${name}_REQUIRED`);
  return value.trim();
}

function normalize(sql) {
  return required(sql, 'D1_SQL').replace(/\s+/g, ' ');
}

export function createGovernedD1RestBinding({
  accountId,
  databaseId,
  apiToken,
  projectorId = 'kpmo-d1-projector-v1',
  fetchImpl = globalThis.fetch,
  apiBase = 'https://api.cloudflare.com/client/v4',
}) {
  const account = required(accountId, 'CLOUDFLARE_ACCOUNT_ID');
  const database = required(databaseId, 'CLOUDFLARE_D1_DATABASE_ID');
  const token = required(apiToken, 'CLOUDFLARE_API_TOKEN');
  if (projectorId !== 'kpmo-d1-projector-v1') throw new Error('D1_WRITER_ID_NOT_GOVERNED');
  if (typeof fetchImpl !== 'function') throw new Error('FETCH_IMPLEMENTATION_REQUIRED');
  return {
    prepare(sql) {
      const statement = normalize(sql);
      if (!MUTATION.test(statement)) throw new Error('D1_PROJECTOR_STATEMENT_NON_MUTATION');
      if (SCHEMA_CHANGE.test(statement)) throw new Error('D1_PROJECTOR_SCHEMA_MUTATION_DENIED');

      return {
        bind(...params) {
          return {
            async run() {
              const response = await fetchImpl(
                `${apiBase}/accounts/${account}/d1/database/${database}/query`,
                {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ sql: statement, params }),
                },
              );
              let payload;
              try {
                payload = await response.json();
              } catch {
                throw new Error('D1_REMOTE_RESPONSE_NOT_JSON');
              }
              if (!response.ok || payload?.success !== true || payload?.errors?.length) {
                const code = payload?.errors?.[0]?.code ?? response.status;
                throw new Error(`D1_REMOTE_QUERY_FAILED:${code}`);
              }
              const result = payload.result?.[0] ?? payload.result ?? {};
              if (result?.success === false) throw new Error('D1_REMOTE_STATEMENT_FAILED');
              return {
                success: true,
                meta: result?.meta ?? null,
              };
            },
          };
        },
      };
    },
  };
}
