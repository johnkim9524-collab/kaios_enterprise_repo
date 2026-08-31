#!/usr/bin/env node
import fs from 'node:fs';

const path='coordination/kidults/governance/cloudflare-pages-to-workers-migration-contract-v1.json';
const inventory='coordination/kidults/governance/cloudflare-pages-to-workers-inventory-v1.json';
const shadow='infrastructure/cloudflare/workers/kidults-public-portal-shadow/wrangler.jsonc';
const fail=(m)=>{throw new Error(m)};
if(!fs.existsSync(path)) fail('MIGRATION_CONTRACT_MISSING');
if(!fs.existsSync(inventory)) fail('MIGRATION_INVENTORY_MISSING');
if(!fs.existsSync(shadow)) fail('SHADOW_CONFIG_MISSING');
const c=JSON.parse(fs.readFileSync(path,'utf8'));
const i=JSON.parse(fs.readFileSync(inventory,'utf8'));
const w=JSON.parse(fs.readFileSync(shadow,'utf8'));
if(c.version!=='1.1.0') fail('VERSION');
if(c.status!=='MANDATORY_FAIL_CLOSED_MIGRATION') fail('STATUS');
if(c.inventory_contract!==inventory) fail('INVENTORY_BINDING');
if(c.shadow_config!==shadow) fail('SHADOW_BINDING');
if(c.current_truth?.automatic_production_git_deploy!==false) fail('AUTO_PRODUCTION_MUST_BE_OFF');
if(c.current_truth?.automatic_preview_deploy!==false) fail('AUTO_PREVIEW_MUST_BE_OFF');
for(const x of [
 'MAIN_NE_DEPLOY','DEPLOY_NE_PUBLIC_APPROVAL','PUBLIC_APPROVAL_NE_PRODUCTION_APPROVAL',
 'NO_GIT_PUSH_OR_MERGE_MAY_AUTOMATICALLY_DEPLOY_PUBLIC_OR_PRODUCTION',
 'NO_PAGES_DELETION_BEFORE_PROVEN_WORKERS_CUTOVER_AND_ZERO_REQUIRED_CALLERS',
 'ROLLBACK_TARGET_REQUIRED_BEFORE_CUTOVER','UNKNOWN_EXTERNAL_INVENTORY_GAPS_BLOCK_CUTOVER_AND_RETIREMENT',
 'SHADOW_SCAFFOLD_MUST_HAVE_ZERO_PRODUCTION_ROUTES'
]) if(!c.hard_invariants?.includes(x)) fail(`MISSING_INVARIANT:${x}`);
const expected=['P0_FREEZE','P1_INVENTORY','P2_BUILD','P3_SHADOW_VALIDATE','P4_RELEASE_GATE','P5_CUTOVER','P6_OBSERVE','P7_RETIRE_PAGES'];
if(JSON.stringify((c.phases||[]).map(x=>x.id))!==JSON.stringify(expected)) fail('PHASE_ORDER');
if(!c.prohibited?.includes('AUTO_DEPLOY_FROM_MAIN')) fail('AUTO_DEPLOY_PROHIBITION');
if(!c.prohibited?.includes('DELETE_PAGES_BEFORE_CUTOVER')) fail('EARLY_DELETE_PROHIBITION');
if(c.authority_boundary?.cloudflare_settings_route_domain_deployment_delete!=='SEPARATELY_AUTHORIZED_EXTERNAL_MUTATION') fail('EXTERNAL_BOUNDARY');
if(c.authority_boundary?.public_production_g5!=='SEPARATELY_AUTHORIZED') fail('RELEASE_BOUNDARY');
for(const owner of ['KPMO','TRACK_C','TRACK_D','TRACK_E','TRACK_Z','RED_TEAM']) if(!c.track_ownership?.[owner]) fail(`OWNER:${owner}`);
if(i.legacy_pages?.delete_now!==false) fail('INVENTORY_EARLY_DELETE');
if(!Array.isArray(i.inventory_gaps)||i.inventory_gaps.length<5) fail('INVENTORY_GAPS');
if(!Array.isArray(w.routes)||w.routes.length!==0) fail('SHADOW_PRODUCTION_ROUTE');
console.log(JSON.stringify({id:'cloudflare-pages-to-workers-migration-validation-v1',state:'VERIFIED_PASS',phase_count:expected.length,inventory_gaps:i.inventory_gaps.length,shadow_production_routes:w.routes.length,auto_deploy:false,early_pages_delete:false,production_public_g5:'HOLD'},null,2));
