import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const policyPath = 'coordination/kidults/redteam/cloudflare-worker-estate-policy-v1.json';
const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
const forbidden = new Set(policy.forbidden_new_deploy_targets || []);
const ignoreDirs = new Set(['.git','node_modules','dist','build','.wrangler','.next','coverage']);
const inspectExt = new Set(['.json','.jsonc','.toml','.yml','.yaml','.js','.mjs','.cjs','.ts','.tsx','.sh','.ps1','.md']);
const allowedPolicyRefs = new Set([
  policyPath,
  'scripts/kidults/redteam/validate-cloudflare-worker-estate-policy-v1.mjs'
]);
const hits = [];

function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoreDirs.has(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) { walk(p); continue; }
    if (!inspectExt.has(path.extname(ent.name).toLowerCase())) continue;
    const rel = path.relative(root, p).replaceAll('\\', '/');
    if (allowedPolicyRefs.has(rel)) continue;
    let text = '';
    try { text = fs.readFileSync(p, 'utf8'); } catch { continue; }
    for (const name of forbidden) {
      if (text.includes(name)) hits.push(`${rel}: forbidden legacy Cloudflare deploy target ${name}`);
    }
  }
}

walk(root);
if (hits.length) {
  console.error(JSON.stringify({suite:'CLOUDFLARE_WORKER_ESTATE_POLICY_V1', result:'FAIL', hits}, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({suite:'CLOUDFLARE_WORKER_ESTATE_POLICY_V1', result:'PASS', canonical_keep:policy.canonical_keep}, null, 2));
