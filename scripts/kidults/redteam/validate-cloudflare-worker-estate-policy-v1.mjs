import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const policyPath = 'coordination/kidults/redteam/cloudflare-worker-estate-policy-v1.json';
const validatorPath = 'scripts/kidults/redteam/validate-cloudflare-worker-estate-policy-v1.mjs';
const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
const forbidden = policy.forbidden_new_deploy_targets || [];
const ignoreDirs = new Set(['.git', 'node_modules', 'dist', 'build', '.wrangler', '.next', 'coverage']);
const hits = [];

function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function isWranglerConfig(rel) {
  const base = path.basename(rel).toLowerCase();
  return base.startsWith('wrangler.') || base === 'wrangler.json' || base === 'wrangler.jsonc' || base === 'wrangler.toml';
}

function isPackageManifest(rel) {
  return path.basename(rel).toLowerCase() === 'package.json';
}

function isDeployScript(rel) {
  return rel.startsWith('.github/workflows/') || /\.(?:sh|ps1|js|mjs|cjs|ts)$/.test(rel);
}

function isDeploySurface(rel) {
  return isDeployScript(rel) || isPackageManifest(rel);
}

function hasDeployIntent(text) {
  return /\bwrangler(?:\.cmd)?\b[\s\S]*?\b(?:deploy|publish)\b/i.test(text)
    || /uses\s*:\s*cloudflare\/wrangler-action@/i.test(text)
    || /\bcloudflare(?:\s+pages)?\s+deploy\b/i.test(text);
}

function inspect(rel, text, output = hits) {
  if (rel === validatorPath) return;
  for (const name of forbidden) {
    const n = esc(name);
    if (isWranglerConfig(rel)) {
      const configTarget = new RegExp(`(?:["']?name["']?\\s*[:=]\\s*["']${n}["'])`, 'i');
      if (configTarget.test(text)) output.push(`${rel}: forbidden legacy wrangler target ${name}`);
    }

    if (!isDeploySurface(rel)) continue;

    const workerName = new RegExp(`--name(?:=|\\s+)["']?${n}["']?(?=["'\\s,}]|$)`, 'i');
    const pagesName = new RegExp(`--project-name(?:=|\\s+)["']?${n}["']?(?=["'\\s,}]|$)`, 'i');
    const targetLiteral = new RegExp(`(?:^|[^A-Za-z0-9_-])${n}(?=$|[^A-Za-z0-9_-])`, 'i');
    const targetVariable = new RegExp(
      `(?:^|\\n)\\s*[A-Z0-9_-]*(?:CLOUDFLARE|WORKER|PAGES|PROJECT|DEPLOY)[A-Z0-9_-]*\\s*[:=]\\s*["']?${n}["']?(?=["'\\s#;,}]|$)`,
      'i',
    );

    if (workerName.test(text) || pagesName.test(text)) {
      output.push(`${rel}: forbidden legacy Cloudflare deploy target ${name}`);
      continue;
    }
    if (targetVariable.test(text)) {
      output.push(`${rel}: forbidden legacy Cloudflare target variable ${name}`);
      continue;
    }
    if (hasDeployIntent(text) && targetLiteral.test(text)) {
      output.push(`${rel}: forbidden legacy Cloudflare target on deployment surface ${name}`);
    }
  }
}

function runSelfTests() {
  const cases = [
    {
      id: 'DIRECT_WORKER_FLAG',
      rel: '.github/workflows/direct.yml',
      text: 'steps:\n  - run: npx wrangler deploy --name kidults-api',
      expected: true,
    },
    {
      id: 'WORKFLOW_ENV_INDIRECTION',
      rel: '.github/workflows/indirect.yml',
      text: 'env:\n  WORKER_NAME: kidults-api\nsteps:\n  - run: npx wrangler deploy --name "$WORKER_NAME"',
      expected: true,
    },
    {
      id: 'PACKAGE_DEPLOY_SCRIPT',
      rel: 'package.json',
      text: '{"scripts":{"deploy":"wrangler deploy --name kidults-api"}}',
      expected: true,
    },
    {
      id: 'WRANGLER_CONFIG',
      rel: 'wrangler.toml',
      text: 'name = "kidults-api"',
      expected: true,
    },
    {
      id: 'WRANGLER_ACTION_ENV',
      rel: '.github/workflows/action.yml',
      text: 'env:\n  TARGET_WORKER: kidults-api\nsteps:\n  - uses: cloudflare/wrangler-action@deadbeef\n    with:\n      command: deploy --name ${{ env.TARGET_WORKER }}',
      expected: true,
    },
    {
      id: 'CANONICAL_KEEP_NEGATIVE',
      rel: '.github/workflows/canonical.yml',
      text: 'steps:\n  - run: npx wrangler deploy --name kidults-autonomous-intelligence',
      expected: false,
    },
    {
      id: 'POLICY_RECORD_NEGATIVE',
      rel: policyPath,
      text: '{"forbidden_new_deploy_targets":["kidults-api"]}',
      expected: false,
    },
  ];

  const failures = [];
  for (const testCase of cases) {
    const testHits = [];
    inspect(testCase.rel, testCase.text, testHits);
    if ((testHits.length > 0) !== testCase.expected) {
      failures.push({ id: testCase.id, expected: testCase.expected, hits: testHits });
    }
  }
  if (failures.length) {
    console.error(JSON.stringify({ suite: 'CLOUDFLARE_WORKER_ESTATE_POLICY_V1', result: 'FAIL', mode: 'SELF_TEST', failures }, null, 2));
    process.exit(1);
  }
}

function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoreDirs.has(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) { walk(p); continue; }
    const rel = path.relative(root, p).replaceAll('\\', '/');
    if (!(isWranglerConfig(rel) || isDeploySurface(rel))) continue;
    let text = '';
    try { text = fs.readFileSync(p, 'utf8'); } catch { continue; }
    inspect(rel, text);
  }
}

runSelfTests();
if (process.argv.includes('--self-test-only')) {
  console.log(JSON.stringify({
    suite: 'CLOUDFLARE_WORKER_ESTATE_POLICY_V1',
    result: 'PASS',
    mode: 'SELF_TEST',
    adversarial_self_tests: 7,
  }, null, 2));
  process.exit(0);
}
walk(root);
if (hits.length) {
  console.error(JSON.stringify({ suite: 'CLOUDFLARE_WORKER_ESTATE_POLICY_V1', result: 'FAIL', hits: [...new Set(hits)] }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({
  suite: 'CLOUDFLARE_WORKER_ESTATE_POLICY_V1',
  result: 'PASS',
  canonical_keep: policy.canonical_keep,
  adversarial_self_tests: 7,
}, null, 2));
