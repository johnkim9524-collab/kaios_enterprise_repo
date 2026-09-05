#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const archiveRoot = 'coordination/kidults/governance/workflow-tombstones';
const actionsRoot = '.github/workflows';
const requiredArchive = 'kidults-cloudflare-credential-identity-preflight-v1.yml';

const fail = code => { throw new Error(`CONSUMED_WORKFLOW_TOMBSTONE_NAMESPACE_FAIL:${code}`); };
const ok = (condition, code) => { if (!condition) fail(code); };

ok(fs.existsSync(archiveRoot), 'ARCHIVE_ROOT_MISSING');
const archived = fs.readdirSync(archiveRoot, { withFileTypes: true })
  .filter(entry => entry.isFile() && /\.ya?ml$/i.test(entry.name))
  .map(entry => entry.name)
  .sort();

ok(archived.includes(requiredArchive), `REQUIRED_ARCHIVE_MISSING:${requiredArchive}`);
ok(archived.length > 0, 'NO_ARCHIVED_TOMBSTONES');

for (const name of archived) {
  const archivePath = path.join(archiveRoot, name);
  const activePath = path.join(actionsRoot, name);
  const text = fs.readFileSync(archivePath, 'utf8');

  ok(!fs.existsSync(activePath), `EXECUTABLE_NAMESPACE_COLLISION:${name}`);
  ok(/^on:\s*\[\]\s*$/m.test(text), `ARCHIVE_NOT_ZERO_TRIGGER:${name}`);
  ok(!text.includes('workflow_dispatch'), `ARCHIVE_DISPATCH_AUTHORITY:${name}`);
  ok(!text.includes('environment:'), `ARCHIVE_ENVIRONMENT_AUTHORITY:${name}`);
  ok(!text.includes('${{ secrets.'), `ARCHIVE_SECRET_AUTHORITY:${name}`);
  ok(!text.includes('api.cloudflare.com'), `ARCHIVE_PROVIDER_ENDPOINT:${name}`);
  ok(!/\bcurl\b/.test(text), `ARCHIVE_NETWORK_TOOL:${name}`);
}

console.log(JSON.stringify({
  id: 'kidults-consumed-workflow-tombstone-namespace-v1',
  state: 'VERIFIED_PASS',
  archive_root: archiveRoot,
  archived_count: archived.length,
  archived,
  executable_namespace_collisions: 0,
  public: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
}, null, 2));
