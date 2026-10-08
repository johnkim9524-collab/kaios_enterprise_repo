import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildSecurityRuntimeDomainReceipt,verifyRawPythonAudit} from '../../../scripts/kidults/kpmo/lib/security-runtime-domain-producer-v1.mjs';
import {verifyValueChainDomainReceipt} from '../../../scripts/kidults/kpmo/lib/whole-platform-runtime-evidence-v1.mjs';
const source='a'.repeat(40);
// Synthetic unit inputs exercise the producer; they are never published as native proof.
function fixture(){return {context:{repository:'johnkim9524-collab/kaios_enterprise_repo',ref:'refs/heads/main',event:'push',
  source_sha:source,actual_sha:source,run_id:123,run_attempt:1,workflow_path:'.github/workflows/kidults-security-assurance-empirical-r1.yml'},
  report:{id:'kidults-security-assurance-empirical-r1',production:'HOLD',vulnerability_response_owner:'REGISTERED',
    dependency_inventory:{tracked_file_count:5,dependency_input_count:2},secret_scan:{finding_count:0,findings:[]},
    npm_audit:{expected_lockfile_count:2,audit_file_count:2,high:0,critical:0,invalid:0,unavailable:0,nonzero_audit_exit:false,scope:'FULL_LOCKFILE_INCLUDING_DEV'},
    pip_audit:{requirements_file_count:1,vulnerability_count:0,audit_failures:0},pip_audit_bootstrap:{install_mode:'HASH_VERIFIED_WHEELS_ONLY'},
    source_integrity_manifest_sha256:'b'.repeat(64)},
  evidence:['security-assurance-report.json','source-integrity.sha256','dependency-inputs.sha256','secret-scan.json',
    'npm-audit-summary.json','pip-audit-summary.json','pip-audit-bootstrap.json'].map(name=>({name,digest:'sha256:'+'b'.repeat(64)}))};}
test('native security producer matches consumer schema without certifying business or infrastructure',()=>{
  const f=fixture(),r=buildSecurityRuntimeDomainReceipt(f);
  assert.equal(verifyValueChainDomainReceipt(r,'SECURITY_SUPPLY_CHAIN',{id:123,run_attempt:1},source).state,'VERIFIED_PASS');
  assert.equal(r.business_data_runtime_proven,false);assert.equal(r.external_infrastructure_security_proven,false);
  assert.equal(r.penetration_test_proven,false);assert.equal(r.promotion_authority,false);
});
for(const [name,change] of [
  ['PR',f=>f.context.ref='refs/pull/1/merge'],['manual',f=>f.context.event='workflow_dispatch'],
  ['rerun',f=>f.context.run_attempt=2],['foreign repository',f=>f.context.repository='other/repo'],
  ['source drift',f=>f.context.actual_sha='c'.repeat(40)],['foreign workflow',f=>f.context.workflow_path='other.yml'],
  ['missing inventory',f=>f.report.dependency_inventory=null],['secret finding',f=>f.report.secret_scan.finding_count=1],
  ['contradictory finding',f=>f.report.secret_scan.findings=[{}]],['unavailable audit',f=>f.report.npm_audit.unavailable=1],
  ['vulnerability',f=>f.report.npm_audit.high=1],['partial audit',f=>f.report.npm_audit.audit_file_count=1],
  ['missing Python audit',f=>f.report.pip_audit=null],['Python vulnerability',f=>f.report.pip_audit.vulnerability_count=1],
  ['Python failure',f=>f.report.pip_audit.audit_failures=1],['unlocked install',f=>f.report.pip_audit_bootstrap.install_mode='UNLOCKED'],
  ['missing evidence',f=>f.evidence.pop()],['duplicate evidence',f=>f.evidence[0]=f.evidence[1]],
  ['bad digest',f=>f.evidence[0].digest='bad'],['integrity drift',f=>f.report.source_integrity_manifest_sha256='c'.repeat(64)],
  ['release elevation',f=>f.report.production='PASS'],
])test(`rejects ${name}`,()=>{const f=fixture();change(f);assert.throws(()=>buildSecurityRuntimeDomainReceipt(f));});
test('registered native producer has automatic main execution and success-only exact-run upload',()=>{
  const w=fs.readFileSync('.github/workflows/kidults-security-assurance-empirical-r1.yml','utf8');
  assert.match(w,/push:\s+branches: \[main\]/);
  assert.match(w,/if: success\(\) && github.event_name == 'push' && github.ref == 'refs\/heads\/main'/);
  assert.match(w,/kidults-security-runtime-domain-\$\{\{ github.sha \}\}-\$\{\{ github.run_id \}\}-\$\{\{ github.run_attempt \}\}/);
  const c=JSON.parse(fs.readFileSync('coordination/kidults/kpmo/whole-platform-operating-proof-v1.json'));
  assert.equal(c.runtime_domain_sources.filter(s=>s.domain_id==='SECURITY_SUPPLY_CHAIN').length,1);
  assert.equal(c.runtime_domain_registry_required_count,14);
});

test('raw Python audit accepts an authenticated empty dependency set',()=>{
  assert.equal(verifyRawPythonAudit({dependencies:[],fixes:[]}),0);
});
for(const [name,audit] of [
  ['legacy top-level array',[]],['missing fixes',{dependencies:[]}],
  ['unexpected fixes',{dependencies:[],fixes:[{}]}],
  ['vulnerability',{dependencies:[{name:'unsafe',version:'1.0',vulns:[{id:'CVE-test'}]}],fixes:[]}],
  ['malformed vulnerability list',{dependencies:[{name:'unsafe',version:'1.0'}],fixes:[]}],
])test(`raw Python audit rejects ${name}`,()=>assert.throws(()=>verifyRawPythonAudit(audit),/SECURITY_RUNTIME_PRODUCER_RAW_PYTHON_AUDIT/));
