import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const cwd = process.cwd();
const config = JSON.parse(readFileSync(resolve(cwd, 'wrangler.jsonc'), 'utf8').replace(/^\uFEFF/, ''));
if (config?.vars?.KIDULTS_ENV === 'production') {
  throw new Error('Remote D1 preflight is blocked in production.');
}
const db = config?.d1_databases?.find((x) => x.binding === 'DB');
if (!db?.database_id || !db?.database_name) {
  throw new Error('Missing D1 DB binding/database metadata.');
}

function run(command, maxBuffer = 10 * 1024 * 1024) {
  if (process.platform === 'win32') {
    const comspec = process.env.ComSpec || 'cmd.exe';
    return spawnSync(comspec, ['/d', '/s', '/c', command], {
      cwd,
      encoding: 'utf8',
      shell: false,
      maxBuffer,
      windowsHide: true,
    });
  }
  return spawnSync('sh', ['-lc', command], {
    cwd,
    encoding: 'utf8',
    shell: false,
    maxBuffer,
  });
}

function runQuery(sql, maxBuffer = 10 * 1024 * 1024) {
  if (process.platform === 'win32') {
    const escaped = sql.replaceAll("'", "''");
    const psCommand = `& npx wrangler d1 execute DB --remote --command '${escaped}'`;
    return spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psCommand], {
      cwd,
      encoding: 'utf8',
      shell: false,
      maxBuffer,
      windowsHide: true,
    });
  }
  const escaped = sql.replaceAll("'", "'\\''");
  return spawnSync('sh', ['-lc', `npx wrangler d1 execute DB --remote --command '${escaped}'`], {
    cwd,
    encoding: 'utf8',
    shell: false,
    maxBuffer,
  });
}

function assertOk(label, result) {
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${label} failed:\n${(result.stderr || result.stdout || `exit ${result.status}`).trim()}`);
  }
}

console.log('Remote D1 preflight: START');
console.log(`Database: ${db.database_name} (${db.database_id})`);

const whoami = run('npx wrangler whoami');
assertOk('Wrangler OAuth/session check', whoami);
if (!/d1\s*\(write\)/i.test(`${whoami.stdout}\n${whoami.stderr}`)) {
  throw new Error('Wrangler token does not expose D1 write permission. Run `npx wrangler login` and retry.');
}
console.log('PASS: OAuth session and D1 write permission');

const query = runQuery('SELECT 1 AS a14_preflight_query;');
assertOk('Remote D1 query-path check', query);
console.log('PASS: Remote D1 query path');

const sqlFile = resolve(cwd, '.remote-d1-preflight.sql');
writeFileSync(sqlFile, 'SELECT 1 AS a14_preflight_import;\n', 'utf8');
try {
  const importPath = run('npx wrangler d1 execute DB --remote --file .remote-d1-preflight.sql --yes');
  assertOk('Remote D1 file/import-path check', importPath);
  console.log('PASS: Remote D1 file/import path');
} finally {
  try { unlinkSync(sqlFile); } catch {}
}

console.log('Remote D1 preflight: PASS');
