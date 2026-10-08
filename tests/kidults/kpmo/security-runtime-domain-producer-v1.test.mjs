import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildSecurityRuntimeDomainReceipt,verifyRawPythonAudit} from '../../../scripts/kidults/kpmo/lib/security-runtime-domain-producer-v1.mjs';
import {verifyValueChainDomainReceipt} from '../../../scripts/kidults/kpmo/lib/whole-platform-runtime-evidence-v1.mjs';
const source='a'.repeat(40);
test('empty native audit is accepted only for committed empty requirements',()=>{
  assert.equal(verifyRawPythonAudit({dependencies:[],fixes:[]},'# intentionally empty\n').state,'VERIFIED_EMPTY_REQUIREMENTS');
  assert.throws(()=>verifyRawPythonAudit({dependencies:[],fixes:[]},'requests==2.32.0\n'));
});
test('raw Python audit requires complete exact package identities and no vulnerabilities',()=>{
  const text='Example_Pkg==1.2.3 \\\n    --hash=sha256:'+ 'a'.repeat(64)+'\n';
  const good={dependencies:[{name:'example-pkg',version:'1.2.3',vulns:[]}],fixes:[]};
  assert.equal(verifyRawPythonAudit(good,text).dependency_count,1);
  for(const d of [{name:'other',version:'1.2.3',vulns:[]},{name:'example-pkg',version:'0',vulns:[]},
    {name:'example-pkg',version:'1.2.3',vulns:[{}]},{name:'example-pkg',version:'1.2.3',skip_reason:'unavailable'}])
    assert.throws(()=>verifyRawPythonAudit({dependencies:[d],fixes:[]},text));
  assert.throws(()=>verifyRawPythonAudit({dependencies:[...good.dependencies,...good.dependencies],fixes:[]},text));
  assert.throws(()=>verifyRawPythonAudit({dependencies:[],fixes:[],error:'unavailable'},''));
  assert.throws(()=>verifyRawPythonAudit({dependencies:[],fixes:[]},'-r unverified.txt'));
});
test('raw Python audit accepts exact inline-hashed lock identities',()=>{
  const hash='a'.repeat(64);
  const text=`pip==26.2.1 --hash=sha256:${hash}\npackaging==26.3 --hash=sha256:${hash}\n`;
  const good={dependencies:[
    {name:'pip',version:'26.2.1',vulns:[]},
    {name:'packaging',version:'26.3',vulns:[]},
  ],fixes:[]};
  assert.equal(verifyRawPythonAudit(good,text).dependency_count,2);
  assert.throws(()=>verifyRawPythonAudit({...good,dependencies:good.dependencies.slice(1)},text));
  assert.throws(()=>verifyRawPythonAudit({dependencies:[],fixes:[]},'pip==26.2.1 --hash=sha256:not-a-digest\n'));
});
for(const [name,audit] of [
  ['legacy array',[]],['missing fixes',{dependencies:[]}],['unexpected fixes',{dependencies:[],fixes:[{}]}],
  ['vulnerable package',{dependencies:[{name:'unsafe',version:'1.0',vulns:[{id:'CVE-test'}]}],fixes:[]}],
  ['missing vulnerability list',{dependencies:[{name:'unsafe',version:'1.0'}],fixes:[]}],
])test(`preserves #2603 rejection of ${name}`,()=>assert.throws(()=>verifyRawPythonAudit(audit,'unsafe==1.0\n')));
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
  assert.ok(w.includes('python -m pip_audit --disable-pip --no-deps -r "$req"'));
  assert.match(w,/push:\s+branches: \[main\]/);
  assert.match(w,/if: success\(\) && github.event_name == 'push' && github.ref == 'refs\/heads\/main'/);
  assert.match(w,/kidults-security-runtime-domain-\$\{\{ github.sha \}\}-\$\{\{ github.run_id \}\}-\$\{\{ github.run_attempt \}\}/);
  const c=JSON.parse(fs.readFileSync('coordination/kidults/kpmo/whole-platform-operating-proof-v1.json'));
  assert.equal(c.runtime_domain_sources.filter(s=>s.domain_id==='SECURITY_SUPPLY_CHAIN').length,1);
  assert.equal(c.runtime_domain_registry_required_count,14);
});
