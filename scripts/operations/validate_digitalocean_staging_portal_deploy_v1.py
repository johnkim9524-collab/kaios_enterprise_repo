#!/usr/bin/env python3
import json
from pathlib import Path

root=Path(__file__).resolve().parents[2]
contract=json.loads((root/'coordination/kidults/runtime/digitalocean-staging-portal-deploy-contract-v1.json').read_text())
receipt_contract=json.loads((root/'coordination/kidults/runtime/digitalocean-staging-portal-receipt-contract-v1.json').read_text())
script=(root/'scripts/operations/digitalocean_staging_portal_deploy_v1.sh').read_text()
receipt_validator=(root/'scripts/operations/validate_digitalocean_staging_portal_receipts_v1.py').read_text()
deploy_workflow=(root/'.github/workflows/digitalocean-staging-portal-deploy.yml').read_text()
receipt_workflow_path=root/'.github/workflows/digitalocean-staging-portal-receipt-contract.yml'
receipt_workflow=receipt_workflow_path.read_text() if receipt_workflow_path.exists() else ''
portal=(root/'apps/kidults-enterprise-staging/public/portal-r001/index.html').read_text()
errors=[]
need=lambda c,m: errors.append(m) if not c else None
need(contract['id']=='kidults-digitalocean-staging-portal-deploy-v1','id')
need(contract['version']=='1.2.0','deploy contract version')
need(contract['issue']==921,'issue')
need(contract['environment']=='STAGING','env')
need(contract['target']['hostname']=='ih-staging-01','hostname')
need(contract['target']['public_ip']=='165.232.175.45','public ip')
need(contract['target']['private_ip']=='10.104.0.3','private ip')
need(contract['target']['user']=='kidults-staging','user')
need(contract['target']['bind_host']=='127.0.0.1','bind must be localhost')
need(contract['deployment']['no_sudo'] is True,'no sudo')
need(contract['deployment']['public_bind'] is False,'no public bind')
need(contract['deployment']['rollback_required'] is True,'rollback required')
need(contract['deployment']['deployment_scoped_receipts_required'] is True,'deployment-scoped receipts required')
need(contract['deployment']['exact_source_and_workflow_binding_required'] is True,'exact binding required')
need(contract['deployment']['successful_deploy_rollback_readiness_receipt_required'] is True,'rollback readiness receipt required')
need(contract['deployment']['previous_release_required_before_cutover'] is True,'previous release required before cutover')
need(contract['deployment']['rollback_target_digest_revalidation_required'] is True,'rollback target digest revalidation required')
need(contract['deployment']['serialized_deployments_required'] is True,'serialized deployments required')
need(contract['deployment']['run_attempt_scoped_release_id'] is True,'run-attempt-scoped release id required')
need(contract['deployment']['local_contract_proof_is_remote_evidence'] is False,'local proof must not be remote evidence')
need(contract['receipt_contract']=='coordination/kidults/runtime/digitalocean-staging-portal-receipt-contract-v1.json','receipt contract binding')
need(contract['production']=='HOLD','production hold')
need(contract['public_intelligence']=='HOLD','public hold')
need(contract['g5']=='EXPLICIT_APPROVAL_REQUIRED','g5')
for bad in ['sudo ','apt ','0.0.0.0','ufw ','iptables','systemctl enable']:
    need(bad not in script, f'forbidden token: {bad}')
for marker in ['data-release="portal-release-001"','data-state="NO_PROJECTION"','Read the market.','Know the evidence.']:
    need(marker in portal, f'portal marker {marker}')
for marker in [
    '127.0.0.1',
    'production_touch',
    'raw_provider_ingestion',
    'previous_release',
    'release_digest',
    'ROLLBACK_ARMED',
    'rollback_on_exit',
    'trap \'rollback_on_exit "$?"\' EXIT',
    'portal-r001-rollback-receipt.json',
    'ln -sfn "$PREVIOUS" "$CURRENT"',
    'rollback_status',
    'SOURCE_COMMIT_SHA="${6:?source commit sha}"',
    'WORKFLOW_RUN_ID="${7:?workflow run id}"',
    'WORKFLOW_RUN_ATTEMPT="${8:?workflow run attempt}"',
    'LOCALHOST_CONTRACT_PROOF',
    'portal-r001-deployments',
    'deploy-receipt.json',
    'health-receipt.json',
    'receipt_contract_id',
    'body_sha256',
    'rollback_target_digest',
    'rollback_target_digest_verified',
    'restored_release_digest',
    'flock -n 9',
    'another Portal deployment holds the remote lock',
    'a verified previous release is required before cutover',
    'rollback_target_matches_digest',
    '"state": "DEPLOYED_VERIFIED"',
    '"state": "VERIFIED_PASS"',
]:
    need(marker in script, f'script marker {marker}')
need(script.index('ROLLBACK_ARMED=true') < script.index('ln -sfn "$RELEASE" "$CURRENT"'), 'rollback must arm before cutover')
need('"public_bind": False' in script,'rollback/deploy receipt public bind false')
need('"production_touch": False' in script,'rollback/deploy receipt production touch false')
need('"raw_provider_ingestion": False' in script,'rollback/deploy receipt provider ingestion false')
need('"g5": "HOLD"' in script,'rollback/deploy receipt g5 hold')
need(receipt_contract['id']=='kidults-digitalocean-staging-portal-receipt-contract-v1','receipt contract id')
need(receipt_contract['version']=='1.2.0','receipt contract version')
need(receipt_contract['issue']==921,'receipt contract issue')
need(receipt_contract['evidence_classes']['REMOTE_STAGING']['eligible_for_remote_exit_candidate'] is True,'remote candidate eligibility')
need(receipt_contract['evidence_classes']['REMOTE_STAGING']['eligible_for_issue_921_remote_exit'] is False,'in-run remote evidence must not be final eligibility')
need(receipt_contract['evidence_classes']['REMOTE_STAGING']['final_eligibility_requires_successful_workflow_attestation'] is True,'successful workflow attestation required')
need(receipt_contract['evidence_classes']['LOCALHOST_CONTRACT_PROOF']['eligible_for_remote_exit_candidate'] is False,'local evidence candidate eligibility')
need(receipt_contract['evidence_classes']['LOCALHOST_CONTRACT_PROOF']['eligible_for_issue_921_remote_exit'] is False,'local evidence eligibility')
need('runner-execution.json' in receipt_contract['bundle']['required_for_deployed_outcome'],'deployed runner execution receipt required')
need('runner-execution.json' in receipt_contract['bundle']['required_for_rolled_back_outcome'],'rolled-back runner execution receipt required')
need(receipt_contract['runner_execution_receipt']['required_state']=='CAPTURED_NOT_ATTESTED','runner receipt attestation boundary')
need(receipt_contract['runner_execution_receipt']['successful_workflow_attested'] is False,'runner receipt cannot attest workflow success')
need(receipt_contract['validation_receipt']['remote_deployed_state']=='REMOTE_EXIT_CANDIDATE','remote candidate validation state')
need(receipt_contract['validation_receipt']['issue_921_remote_exit_eligible'] is False,'validation receipt final eligibility must be false')
need(receipt_contract['rollback_receipt']['issue_921_exit_requires_previous_target'] is True,'previous rollback target required')
need(receipt_contract['rollback_receipt']['deployed_outcome']['rollback_target_digest_verified'] is True,'armed target digest verification required')
need(receipt_contract['rollback_receipt']['rolled_back_outcome']['restored_release_digest_must_equal_rollback_target_digest'] is True,'restored target digest equality required')
need(receipt_contract['safety_boundaries']['production']=='HOLD','receipt Production HOLD')
need(receipt_contract['safety_boundaries']['g5']=='HOLD','receipt G5 HOLD')
for marker in ['--expected-deployment-id','--expected-source-sha','--expected-run-id','--expected-run-attempt','--expected-repository','--expected-workflow-name','--expected-workflow-ref','--expected-workflow-sha','--expected-source-ref','--expected-event-name','--expected-job-name','--expected-evidence-class','--require-rollback-target','runner-execution.json','CAPTURED_NOT_ATTESTED','REMOTE_EXIT_CANDIDATE','SUCCESSFUL_WORKFLOW_ATTESTATION_REQUIRED','issue_921_remote_exit_eligible": False','LOCALHOST_CONTRACT_PROOF','REMOTE_STAGING','localhost body digest mismatch','previous-release target is required']:
    need(marker in receipt_validator, f'receipt validator marker {marker}')
need('pull_request:' not in deploy_workflow,'privileged deploy workflow must not run on pull_request')
need('group: kidults-digitalocean-staging-portal' in deploy_workflow,'workflow deployment concurrency group')
need('cancel-in-progress: false' in deploy_workflow,'workflow deployment concurrency must not cancel in progress')
need('RELEASE_ID="portal-r001-${GITHUB_SHA:0:12}-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"' in deploy_workflow,'release id must include workflow run attempt')
for marker in ["'receipt_type':'GITHUB_RUNNER_EXECUTION'","'state':'CAPTURED_NOT_ATTESTED'","'workflow_ref':os.environ['GITHUB_WORKFLOW_REF']","'workflow_sha':os.environ['GITHUB_WORKFLOW_SHA']","'job_name':os.environ['GITHUB_JOB']","'successful_workflow_attested':False",'--expected-workflow-ref "$GITHUB_WORKFLOW_REF"','--expected-workflow-sha "$GITHUB_WORKFLOW_SHA"','--expected-job-name "$GITHUB_JOB"']:
    need(marker in deploy_workflow, f'workflow runner binding marker {marker}')
for marker in ['pull_request:','push:','persist-credentials: false','Verify exact source SHA','test_digitalocean_staging_portal_receipts_v1.sh','validate-staging-portal-workflow-provenance-v1.mjs']:
    need(marker in receipt_workflow, f'safe receipt workflow marker {marker}')
if errors:
    print(json.dumps({'suite':'DIGITALOCEAN_STAGING_PORTAL_DEPLOY_V1','state':'VERIFIED_FAIL','errors':errors},indent=2));raise SystemExit(1)
print(json.dumps({'suite':'DIGITALOCEAN_STAGING_PORTAL_DEPLOY_V1','state':'VERIFIED_PASS','target':'ih-staging-01','bind':'127.0.0.1:4173','rollback':'FAIL_CLOSED_ARMED','receipt_contract':'kidults-digitalocean-staging-portal-receipt-contract-v1','production':'HOLD','public_intelligence':'HOLD','g5':'EXPLICIT_APPROVAL_REQUIRED'},indent=2))
