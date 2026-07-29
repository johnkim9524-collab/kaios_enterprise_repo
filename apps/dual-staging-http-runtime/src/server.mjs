import http from 'node:http';
import { readFileSync } from 'node:fs';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function readToken(pathName) {
  return readFileSync(required(pathName), 'utf8').trim();
}

export function createRuntime(config) {
  const { vertical, viewerToken, operatorToken } = config;
  const isKidults = vertical === 'kidults';
  const snapshotPath = isKidults ? '/api/enterprise/snapshot' : '/api/institutional/snapshot';
  const exportPath = isKidults ? '/api/enterprise/export' : '/api/institutional/export';
  const title = isKidults ? 'Kidults Enterprise Intelligence' : 'Artfund Institutional Intelligence';

  const authorize = (request) => {
    const header = request.headers.authorization || '';
    if (!header.startsWith('Bearer ')) return null;
    const token = header.slice(7);
    if (token === operatorToken) return 'operator';
    if (token === viewerToken) return 'viewer';
    return null;
  };

  return http.createServer((request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    const role = authorize(request);

    const json = (status, body) => {
      response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      response.end(JSON.stringify(body));
    };

    if (url.pathname === '/health') {
      return json(200, { ok: true, environment: 'staging', vertical, publication_enabled: false });
    }

    if (url.pathname === snapshotPath) {
      if (!role) return json(401, { ok: false, error: 'unauthorized' });
      return json(200, {
        ok: true,
        environment: 'staging',
        vertical,
        role,
        status: 'ready',
        illustrative: true,
        trust_surface: {
          confidence: 95,
          evidence_count: 1,
          source_coverage: 1,
          rights_status: 'approved',
          methodology_status: 'approved',
          freshness: 'current'
        }
      });
    }

    if (url.pathname === exportPath) {
      if (!role) return json(401, { ok: false, error: 'unauthorized' });
      if (role === 'viewer') return json(403, { ok: false, error: 'forbidden' });
      return json(200, { ok: true, environment: 'staging', vertical, export: 'authorized' });
    }

    if (url.pathname === '/portal') {
      if (!role) return json(401, { ok: false, error: 'unauthorized' });
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'x-frame-options': 'DENY'
      });
      response.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>*{box-sizing:border-box}html,body{margin:0;max-width:100%;overflow-x:hidden;background:#07111f;color:#f5f1e8;font-family:Arial,sans-serif}main{max-width:1100px;margin:auto;padding:24px}.card{border:1px solid #324054;border-radius:18px;padding:20px;background:#0d1a2b}h1{font-size:clamp(28px,7vw,64px);margin:0 0 18px}p{line-height:1.6}@media(max-width:480px){main{padding:16px}.card{padding:16px}}</style></head><body><main><h1>${title}</h1><div class="card"><p>Staging-only luxury intelligence portal runtime.</p><p>Evidence, rights, methodology, confidence, freshness and audit controls are active.</p></div></main></body></html>`);
      return;
    }

    return json(404, { ok: false, error: 'not_found' });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const vertical = required('KAIOS_STAGING_VERTICAL');
  if (!['kidults', 'artfund'].includes(vertical)) throw new Error('KAIOS_STAGING_VERTICAL must be kidults or artfund');
  if (process.env.KAIOS_ENVIRONMENT !== 'staging') throw new Error('KAIOS_ENVIRONMENT must be staging');
  if (process.env.KAIOS_PRODUCTION_PROMOTION_AUTHORIZED !== 'false') throw new Error('Production promotion must remain false');

  const port = Number(required('PORT'));
  const server = createRuntime({
    vertical,
    viewerToken: readToken('KAIOS_STAGING_VIEWER_TOKEN_FILE'),
    operatorToken: readToken('KAIOS_STAGING_OPERATOR_TOKEN_FILE')
  });
  server.listen(port, '127.0.0.1', () => console.log(`${vertical} staging runtime listening on 127.0.0.1:${port}`));
}
