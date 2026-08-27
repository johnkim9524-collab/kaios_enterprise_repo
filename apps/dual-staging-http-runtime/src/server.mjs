import http from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  createFileRuntimeSecurity,
  equalDigest,
  RuntimeControlError
} from './runtime-security.mjs';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function readToken(pathName) {
  const token = readFileSync(required(pathName), 'utf8').trim();
  if (!token) throw new Error(`Token file is empty: ${pathName}`);
  return token;
}

function safeTokenEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || !left || !right) return false;
  const leftDigest = createHash('sha256').update(left).digest();
  const rightDigest = createHash('sha256').update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

function requestHeader(request, name) {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : (value || '');
}

export function createRuntime(config) {
  const {
    vertical,
    viewerToken,
    operatorToken,
    viewerSubject = 'viewer',
    operatorSubject = 'operator',
    projectionStore = null,
    exportControl = null
  } = config;

  if (!['kidults', 'artfund'].includes(vertical)) throw new Error('Unsupported vertical');
  const isKidults = vertical === 'kidults';
  const snapshotPath = isKidults ? '/api/enterprise/snapshot' : '/api/institutional/snapshot';
  const exportPath = isKidults ? '/api/enterprise/export' : '/api/institutional/export';
  const title = isKidults ? 'Kidults Enterprise Intelligence' : 'Artfund Institutional Intelligence';

  const authorize = (request) => {
    const header = request.headers.authorization || '';
    if (!header.startsWith('Bearer ')) return null;
    const token = header.slice(7);
    if (safeTokenEqual(token, operatorToken)) return { role: 'operator', subject: operatorSubject };
    if (safeTokenEqual(token, viewerToken)) return { role: 'viewer', subject: viewerSubject };
    return null;
  };

  return http.createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    const principal = authorize(request);

    const json = (status, body, extraHeaders = {}) => {
      response.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
        'x-content-type-options': 'nosniff',
        'x-frame-options': 'DENY',
        'referrer-policy': 'no-referrer',
        ...extraHeaders
      });
      response.end(JSON.stringify(body));
    };

    const fail = (error) => {
      if (error instanceof RuntimeControlError) {
        return json(error.status, { ok: false, error: error.code });
      }
      console.error('RUNTIME_CONTROL_FAILURE', error);
      return json(503, { ok: false, error: 'RUNTIME_CONTROL_FAILURE' });
    };

    try {
      if (url.pathname === '/health') {
        if (request.method !== 'GET') {
          return json(405, { ok: false, error: 'method_not_allowed' }, { allow: 'GET' });
        }
        return json(200, {
          ok: true,
          environment: 'staging',
          vertical,
          publication_enabled: false,
          projection_runtime_configured: Boolean(projectionStore),
          export_control_configured: Boolean(exportControl),
          production_promotion_authorized: false
        });
      }

      if (url.pathname === snapshotPath) {
        if (request.method !== 'GET') {
          return json(405, { ok: false, error: 'method_not_allowed' }, { allow: 'GET' });
        }
        if (!principal) return json(401, { ok: false, error: 'unauthorized' });
        if (!projectionStore) return json(503, { ok: false, error: 'PROJECTION_RUNTIME_NOT_CONFIGURED' });

        const snapshot = await projectionStore.getSnapshot({
          vertical,
          subject: principal.subject,
          role: principal.role
        });
        return json(200, {
          ok: true,
          environment: 'staging',
          vertical,
          role: principal.role,
          status: 'ready',
          projection_digest: snapshot.digest,
          as_of: snapshot.asOf,
          snapshot: snapshot.projection
        });
      }

      if (url.pathname === exportPath) {
        if (request.method !== 'POST') {
          return json(405, { ok: false, error: 'method_not_allowed' }, { allow: 'POST' });
        }
        request.resume();
        if (!principal) return json(401, { ok: false, error: 'unauthorized' });
        if (principal.role !== 'operator') return json(403, { ok: false, error: 'forbidden' });
        if (!projectionStore || !exportControl) {
          return json(503, { ok: false, error: 'EXPORT_RUNTIME_NOT_CONFIGURED' });
        }

        const entitlementId = requestHeader(request, 'x-kaios-entitlement-id');
        const nonce = requestHeader(request, 'x-kaios-nonce');
        const requestedDigest = requestHeader(request, 'x-kaios-projection-digest');
        if (!entitlementId || !nonce || !requestedDigest) {
          return json(400, { ok: false, error: 'EXPORT_CONTROL_HEADERS_REQUIRED' });
        }

        const authorization = await exportControl.authorize({
          vertical,
          subject: principal.subject,
          entitlementId,
          scope: 'EXPORT'
        });
        const snapshot = await projectionStore.getSnapshot({
          vertical,
          subject: principal.subject,
          role: principal.role
        });

        if (!equalDigest(requestedDigest, snapshot.digest)) {
          return json(409, { ok: false, error: 'PROJECTION_DIGEST_MISMATCH' });
        }
        if (authorization.expectedDigest && !equalDigest(authorization.expectedDigest, snapshot.digest)) {
          return json(409, { ok: false, error: 'ENTITLEMENT_PROJECTION_MISMATCH' });
        }

        await exportControl.consumeNonce({
          vertical,
          entitlementId,
          nonce,
          digest: snapshot.digest
        });

        return json(200, {
          ok: true,
          environment: 'staging',
          vertical,
          export: 'authorized',
          entitlement_id: entitlementId,
          projection_digest: snapshot.digest,
          snapshot: snapshot.projection
        });
      }

      if (url.pathname === '/portal') {
        if (request.method !== 'GET') {
          return json(405, { ok: false, error: 'method_not_allowed' }, { allow: 'GET' });
        }
        if (!principal) return json(401, { ok: false, error: 'unauthorized' });
        response.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
          'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
          'x-content-type-options': 'nosniff',
          'x-frame-options': 'DENY',
          'referrer-policy': 'no-referrer'
        });
        response.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>*{box-sizing:border-box}html,body{margin:0;max-width:100%;overflow-x:hidden;background:#07111f;color:#f5f1e8;font-family:Arial,sans-serif}main{max-width:1100px;margin:auto;padding:24px}.card{border:1px solid #324054;border-radius:18px;padding:20px;background:#0d1a2b}h1{font-size:clamp(28px,7vw,64px);margin:0 0 18px}p{line-height:1.6}@media(max-width:480px){main{padding:16px}.card{padding:16px}}</style></head><body><main><h1>${title}</h1><div class="card"><p>Staging-only intelligence portal runtime.</p><p>Snapshots are loaded from a server-owned projection store. Exports require active entitlement, exact digest binding and a persistent one-time nonce.</p></div></main></body></html>`);
        return;
      }

      return json(404, { ok: false, error: 'not_found' });
    } catch (error) {
      return fail(error);
    }
  });
}

async function main() {
  const vertical = required('KAIOS_STAGING_VERTICAL');
  if (!['kidults', 'artfund'].includes(vertical)) throw new Error('KAIOS_STAGING_VERTICAL must be kidults or artfund');
  if (process.env.KAIOS_ENVIRONMENT !== 'staging') throw new Error('KAIOS_ENVIRONMENT must be staging');
  if (process.env.KAIOS_PRODUCTION_PROMOTION_AUTHORIZED !== 'false') throw new Error('Production promotion must remain false');

  const port = Number(required('PORT'));
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port');
  const runtimeSecurity = createFileRuntimeSecurity({
    dataDir: required('KAIOS_STAGING_RUNTIME_DATA_DIR')
  });
  const server = createRuntime({
    vertical,
    viewerToken: readToken('KAIOS_STAGING_VIEWER_TOKEN_FILE'),
    operatorToken: readToken('KAIOS_STAGING_OPERATOR_TOKEN_FILE'),
    viewerSubject: process.env.KAIOS_STAGING_VIEWER_SUBJECT || 'viewer',
    operatorSubject: process.env.KAIOS_STAGING_OPERATOR_SUBJECT || 'operator',
    ...runtimeSecurity
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`${vertical} staging runtime listening on 127.0.0.1:${port}`);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
