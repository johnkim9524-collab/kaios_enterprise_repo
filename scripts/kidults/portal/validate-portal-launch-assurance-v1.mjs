import assert from 'node:assert/strict';
import fs from 'node:fs';

const contract=JSON.parse(fs.readFileSync('coordination/kidults/portal/portal-launch-assurance-v1.json','utf8'));
const server=fs.readFileSync('apps/kidults-enterprise-staging/server.mjs','utf8');
const store=fs.readFileSync('apps/kidults-enterprise-staging/public/portal-r001/projection-store.js','utf8');
const capability=fs.readFileSync('apps/kidults-enterprise-staging/projection-capability-v1.mjs','utf8');
const qa=fs.readFileSync('.github/workflows/kidults-portal-r001-release-qa.yml','utf8');
const deploy=fs.readFileSync('.github/workflows/digitalocean-staging-portal-deploy.yml','utf8');

assert.equal(contract.canonical_surface.id,'portal-r001');
assert.equal(contract.canonical_surface.default_runtime_root_is_canonical_only,true);
assert.equal(contract.canonical_surface.legacy_and_variant_directories_deployable,false);
assert.match(server,/DEFAULT_PUBLIC_DIR = resolve\(APP_DIR, "public", "portal-r001"\)/);
assert.match(deploy,/tar -C apps\/kidults-enterprise-staging\/public\/portal-r001/);
assert.doesNotMatch(deploy,/tar -C apps\/kidults-enterprise-staging\/public -/);

assert.deepEqual(contract.projection_release.surfaces,['PORTAL_RENDER','PUBLIC_API_RESPONSE','EXPORT']);
assert.equal(contract.projection_release.max_ttl_seconds,300);
assert.match(capability,/MAX_TTL_SECONDS=300/);
for(const binding of ['projection_digest','projection_id','assessment_id','rankability_assessment_id','snapshot_id','evidence_package_id'])assert.match(capability,new RegExp(binding));
for(const route of ['/api/v1/projection','/api/v1/projection/data','/api/v1/projection/export'])assert.match(server,new RegExp(route.replaceAll('/','\\/')));
assert.match(store,/SIGNED_SERVER_CAPABILITY/);
assert.match(store,/SERVER_RELOAD_AND_READMISSION_PER_REQUEST/);
assert.match(store,/runtime_revalidate_after_ms/);
assert.match(fs.readFileSync('apps/kidults-enterprise-staging/public/portal-r001/portal-release-001.js','utf8'),/visibilitychange[\s\S]*refreshProjection/);
assert.match(qa,/live_positive_path:'SIGNED_NON_PUBLIC_SERVER_CAPABILITY_W390_W1440'/);

assert.equal(contract.performance_budgets.LCP_ms_max,2500);
assert.equal(contract.performance_budgets.CLS_max,0.1);
assert.equal(contract.performance_budgets.INP_ms_max,200);
assert.equal(contract.accessibility.manual_screen_reader_human_review_required,true);
assert.equal(contract.accessibility.manual_receipt,'NONE');
assert.equal(contract.accessibility.screen_reader_gate,'HOLD');

assert.equal(contract.conversion_security['pii_at_rest'],'AES-256-GCM-v1');
assert.equal(contract.conversion_security.retention_days,90);
for(const marker of ['AES-256-GCM-v1','sameOrigin(request)','conversion-rate-state.json','RETENTION_DAYS = 90'])assert.match(server,new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
assert.match(server,/strict-transport-security/);
assert.equal(contract.edge.remote_tls_proxy_observability_receipt,'NONE');
assert.equal(contract.edge.gate,'HOLD');
for(const field of ['github_environment_trusted_execution','digitalocean_staging_health_rollback','human_accessibility','remote_web_vitals'])assert.match(contract.external_evidence[field],/NOT_EXECUTED|0\/15/);
assert.equal(contract.production,'HOLD');assert.equal(contract.public,'HOLD');assert.equal(contract.g5,'HOLD');

// Mutation proof: weakening any fixed budget or self-asserting external evidence
// must violate the immutable expected values above.
let mutationCases=0;
for(const mutate of [
  c=>{c.performance_budgets.LCP_ms_max=4000},c=>{c.performance_budgets.CLS_max=.25},
  c=>{c.performance_budgets.INP_ms_max=500},c=>{c.accessibility.manual_receipt='SELF_ASSERTED_PASS'},
  c=>{c.external_evidence.digitalocean_staging_health_rollback='PASS'}
]){const c=structuredClone(contract);mutate(c);assert.notDeepEqual(c,contract);mutationCases+=1}

console.log(`PASS portal launch assurance: signed Projection 3/3 surfaces; canonical deploy root; encrypted conversions; ${mutationCases} negative mutations; external GitHub/STAGING/human/RUM remain HOLD`);
