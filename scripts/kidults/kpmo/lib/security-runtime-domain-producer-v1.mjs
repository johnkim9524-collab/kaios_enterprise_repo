import {canonicalJson,sha256} from './canonical-json-v1.mjs';
const fail=code=>{throw new Error(`SECURITY_RUNTIME_PRODUCER_${code}`);};
export function buildSecurityRuntimeDomainReceipt({context,report,evidence}){
  if(context?.repository!=='johnkim9524-collab/kaios_enterprise_repo'
    ||context.ref!=='refs/heads/main'||context.event!=='push'
    ||!/^[a-f0-9]{40}$/.test(context.source_sha||'')||context.actual_sha!==context.source_sha
    ||!Number.isSafeInteger(context.run_id)||context.run_id<1||context.run_attempt!==1
    ||context.workflow_path!=='.github/workflows/kidults-security-assurance-empirical-r1.yml')fail('EXECUTION_BINDING');
  if(report?.id!=='kidults-security-assurance-empirical-r1'||report.production!=='HOLD'
    ||report.vulnerability_response_owner!=='REGISTERED')fail('REPORT');
  const inv=report.dependency_inventory,npm=report.npm_audit,pip=report.pip_audit;
  if(!Number.isSafeInteger(inv?.tracked_file_count)||inv.tracked_file_count<1
    ||!Number.isSafeInteger(inv?.dependency_input_count)||inv.dependency_input_count<1
    ||report.secret_scan?.finding_count!==0||!Array.isArray(report.secret_scan.findings)
    ||report.secret_scan.findings.length!==0)fail('INVENTORY_OR_SECRET_SCAN');
  if(!Number.isSafeInteger(npm?.expected_lockfile_count)||npm.expected_lockfile_count<1
    ||npm.audit_file_count!==npm.expected_lockfile_count||npm.high!==0||npm.critical!==0
    ||npm.invalid!==0||npm.unavailable!==0||npm.nonzero_audit_exit!==false
    ||npm.scope!=='FULL_LOCKFILE_INCLUDING_DEV')fail('NODE_AUDIT');
  if(!Number.isSafeInteger(pip?.requirements_file_count)||pip.requirements_file_count<1
    ||pip.vulnerability_count!==0||pip.audit_failures!==0
    ||report.pip_audit_bootstrap?.install_mode!=='HASH_VERIFIED_WHEELS_ONLY')fail('PYTHON_AUDIT');
  const required=['security-assurance-report.json','source-integrity.sha256','dependency-inputs.sha256',
    'secret-scan.json','npm-audit-summary.json','pip-audit-summary.json','pip-audit-bootstrap.json'];
  if(!Array.isArray(evidence)||evidence.length!==required.length
    ||required.some(name=>evidence.filter(e=>e.name===name).length!==1)
    ||evidence.some(e=>!/^sha256:[a-f0-9]{64}$/.test(e.digest||'')))fail('EVIDENCE');
  if(`sha256:${report.source_integrity_manifest_sha256}`!==evidence.find(e=>e.name==='source-integrity.sha256').digest)fail('INTEGRITY_BINDING');
  const prefix=`https://github.com/${context.repository}/actions/runs/${context.run_id}`;
  const body={id:'kidults-value-chain-runtime-domain-receipt-v1',domain_id:'SECURITY_SUPPLY_CHAIN',
    repository:context.repository,source_sha:context.source_sha,run_id:context.run_id,run_attempt:context.run_attempt,
    workflow_path:context.workflow_path,state:'VERIFIED_PASS',execution_mode:'LIVE_RUNTIME',
    fixture_evidence:false,empirical_inputs_verified:true,
    empirical_scope:'ACTUAL_REPOSITORY_SOURCE_AND_DEPENDENCY_SECURITY_ONLY',
    external_infrastructure_security_proven:false,penetration_test_proven:false,
    business_data_runtime_proven:false,promotion_authority:false,
    primary_evidence:evidence.map(e=>({name:e.name,digest:e.digest,protected_source_ref:`${prefix}#artifact/${e.name}`})),
    production:'HOLD',public:'HOLD',g5:'HOLD',provider_activation:'HOLD'};
  return {...body,receipt_digest:sha256(canonicalJson(body))};
}
