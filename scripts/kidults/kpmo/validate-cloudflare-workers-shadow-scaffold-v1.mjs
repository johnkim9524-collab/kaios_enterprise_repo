#!/usr/bin/env node
import fs from 'node:fs';

const inventoryPath = 'coordination/kidults/governance/cloudflare-pages-to-workers-inventory-v1.json';
const configPath = 'infrastructure/cloudflare/workers/kidults-public-portal-shadow/wrangler.jsonc';
const portalPath = 'apps/kidults-enterprise-staging/public/portal';
const fail = (m) => { throw new Error(`WORKERS_SHADOW_SCAFFOLD_FAIL:${m}`); };
const ok = (v,m) => { if (!v) fail(m); };

const inventory = JSON.parse(fs.readFileSync(inventoryPath,'utf8'));
const config = JSON.parse(fs.readFileSync(configPath,'utf8'));

ok(inventory.status === 'CONTROL_ONLY_INVENTORY','INVENTORY_STATUS');
ok(inventory.legacy_pages?.automatic_production_git_deploy === false,'PAGES_AUTO_PROD_NOT_FROZEN');
ok(inventory.legacy_pages?.automatic_preview_deploy === false,'PAGES_PREVIEW_NOT_FROZEN');
ok(inventory.legacy_pages?.delete_now === false,'PAGES_DELETE_PREMATURE');
ok(Array.isArray(inventory.inventory_gaps) && inventory.inventory_gaps.length >= 5,'EXTERNAL_GAPS_NOT_RECORDED');
ok(inventory.production_public_g5 === 'HOLD','RELEASE_BOUNDARY');
ok(fs.existsSync(portalPath + '/index.html'),'PORTAL_INDEX_MISSING');
ok(fs.existsSync(portalPath + '/workspace.html'),'WORKSPACE_MISSING');
ok(config.name === 'kidults-public-portal-shadow','WORKER_NAME');
ok(config.workers_dev === true,'SHADOW_ENDPOINT_REQUIRED');
ok(config.preview_urls === false,'PREVIEW_URLS_MUST_BE_FALSE');
ok(Array.isArray(config.routes) && config.routes.length === 0,'PRODUCTION_ROUTE_ATTACHED');
ok(config.assets?.directory === portalPath,'ASSET_SOURCE_DRIFT');
ok(config.assets?.not_found_handling === 'none','SOFT_404_RISK');

const raw = fs.readFileSync(configPath,'utf8');
for (const forbidden of ['account_id','api_token','zone_id','routes": [{','custom_domain']) {
  ok(!raw.includes(forbidden), `FORBIDDEN_CONFIG_AUTHORITY:${forbidden}`);
}

const mutations = [
  x => { x.routes = [{pattern:'kidults.com/*',zone_name:'kidults.com'}]; },
  x => { x.workers_dev = false; },
  x => { x.preview_urls = true; },
  x => { x.assets.not_found_handling = 'single-page-application'; }
];
for (const mutate of mutations) {
  const x = structuredClone(config); mutate(x);
  let rejected = false;
  try {
    ok(Array.isArray(x.routes) && x.routes.length === 0,'MUT_ROUTE');
    ok(x.workers_dev === true,'MUT_WORKERS_DEV');
    ok(x.preview_urls === false,'MUT_PREVIEW');
    ok(x.assets.not_found_handling === 'none','MUT_404');
  } catch { rejected = true; }
  ok(rejected,'NEGATIVE_MUTATION_ACCEPTED');
}

console.log(JSON.stringify({
  id:'kidults-cloudflare-workers-shadow-scaffold-validation-v1',
  state:'VERIFIED_PASS',
  portal_source:portalPath,
  worker_service:config.name,
  production_routes:0,
  deployment_authorized:false,
  external_inventory_gaps:inventory.inventory_gaps.length,
  negative_mutations_rejected:mutations.length,
  production:'HOLD',public:'HOLD',g5:'HOLD'
},null,2));
