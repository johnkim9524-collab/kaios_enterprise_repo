import { readFileSync } from 'node:fs';
import { createRuntime } from './server.mjs';
import { createPostgresCliRuntime } from './postgres-runtime.mjs';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function readToken(variableName) {
  const token = readFileSync(required(variableName), 'utf8').trim();
  if (!token) throw new Error(`Token file is empty: ${variableName}`);
  return token;
}

async function main() {
  const vertical = required('KAIOS_STAGING_VERTICAL');
  if (!['kidults', 'artfund'].includes(vertical)) throw new Error('KAIOS_STAGING_VERTICAL must be kidults or artfund');
  if (required('KAIOS_ENVIRONMENT') !== 'staging') throw new Error('KAIOS_ENVIRONMENT must be staging');
  if (required('KAIOS_PRODUCTION_PROMOTION_AUTHORIZED') !== 'false') {
    throw new Error('Production promotion must remain false');
  }

  const port = Number(required('PORT'));
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port');

  const dependencies = createPostgresCliRuntime({
    dsn: required('KAIOS_POSTGRES_DSN'),
    tenantId: required('KAIOS_STAGING_TENANT_ID'),
    timeoutMs: Number(process.env.KAIOS_POSTGRES_QUERY_TIMEOUT_MS || '10000')
  });

  const server = createRuntime({
    vertical,
    viewerToken: readToken('KAIOS_STAGING_VIEWER_TOKEN_FILE'),
    operatorToken: readToken('KAIOS_STAGING_OPERATOR_TOKEN_FILE'),
    viewerSubject: 'viewer',
    operatorSubject: 'operator',
    ...dependencies
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`${vertical} PostgreSQL staging runtime listening on 127.0.0.1:${port}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
