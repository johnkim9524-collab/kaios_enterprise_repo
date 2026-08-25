import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const policyPath = 'coordination/kidults/redteam/cloudflare-worker-estate-policy-v1.json';
const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
const forbidden = policy.forbidden_new_deploy_targets || [];
const ignoreDirs = new Set(['.git','node_modules','dist','build','.wrangler','.next','coverage']);
const hits = [];

function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function isWranglerConfig(rel) {
  const base = path.basename(rel).toLowerCase();
  return base.startsWith('wrangler.') || base === 'wrangler.json' || base === 'wrangler.jsonc' || base === 'wrangler.toml';
}
function isDeployScript(rel) {
  return rel.startsWith('.github/workflows/') || /\.(?:sh|ps1|js|mjs|cjs|ts)$/.test(rel);
}
function inspect(rel, text) {
  for (const name of forbidden) {
    const n = esc(name);
    if (isWranglerConfig(rel)) {
      const configTarget = new RegExp(`(?:["']?name["']?\\s*[:=]\\s*["']${n}["'])`, 'i');
      if (configTarget.test(text)) hits.push(`${rel}: forbidden legacy wrangler target ${name}`);
    }
    if (isDeployScript(rel)) {
      const workerName = new RegExp(`--name(?:=|\\s+)["']?${n}["']?(?=\\s|$)`, 'i');
      const pagesName = new RegExp(`--project-name(?:=|\\s+)["']?${n}["']?(?=\\s|$)`, 'i');
      if (workerName.test(text) || pagesName.test(text)) hits.push(`${rel}: forbidden legacy Cloudflare deploy target ${name}`);
    }
  }
}

function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoreDirs.has(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) { walk(p); continue; }
    const rel = path.relative(root, p).replaceAll('\\', '/');
    if (!(isWranglerConfig(rel) || isDeployScript(rel))) continue;
    let text = '';
    try { text = fs.readFileSync(p, 'utf8'); } catch { continue; }
    inspect(rel, text);
  }
}

walk(root);
if (hits.length) {
  console.error(JSON.stringify({suite:'CLOUDFLARE_WORKER_ESTATE_POLICY_V1', result:'FAIL', hits:[...new Set(hits)]}, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({suite:'CLOUDFLARE_WORKER_ESTATE_POLICY_V1', result:'PASS', canonical_keep:policy.canonical_keep}, null, 2));
