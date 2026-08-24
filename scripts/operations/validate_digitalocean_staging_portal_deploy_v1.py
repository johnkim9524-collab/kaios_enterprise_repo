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
need(contract['version']=='1.4.0','deploy contract version')
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
need(contract['deployment']['runtime']=='NODE_SERVER_ENTRY_V1_WITH_STATIC_FALLBACK_FOR_LOCAL_CONTRACT_PROOF','Node runtime contract')
need(contract['deployment']['runtime_entry']=='scripts/operations/kidults_portal_runtime_entry_v1.mjs','Node runtime entry binding')
need(contract['deployment']['exact_source_and_workflow_binding_required'] is True,'exact binding required')
need(contract['deployment']['successful_deploy_rollback_readiness_receipt_required'] is True,'rollback readiness receipt required')
need(contract['deployment']['previous_release_required_before_cutover'] is True,'previous release required before cutover')
need(contract['deployment']['rollback_target_digest_revalidation_required'] is True,'rollback target digest revalidation required')
need(contract['deployment']['serialized_deployments_required'] is True,'serialized deployments required')
need(contract['deployment']['run_attempt_scoped_release_id'] is True,'run-attempt-scoped release id required')
need(contract['deployment']['local_contract_proof_is_remote_evidence'] is False,'local proof must not be remote evidence')
need(contract['deployment']['exact_main_ref_required_before_validation'] is True,'exact main required before validation')
need(contract['deployment']['exact_main_ref_required_before_secret_consumption'] is True,'exact main required before secret consumption')
need(contract['deployment']['live_main_branch_sha_equality_required_before_secret_consumption'] is True,'live main SHA equality required before secret consumption')
need(contract['deployment']['live_main_read_uses_builtin_github_token_contents_read'] is True,'live main read must use built-in contents-read token')
need(contract['deployment']['ssh_private_key_step_scoped'] is True,'SSH private key must be step scoped')
need(contract['deployment']['host_key_scan_and_fingerprint_secret_free'] is True,'host-key scan must be secret free')
need(contract['deployment']['ssh_materialization_separate_after_host_verification'] is True,'SSH materialization must follow host verification')
need(contract['deployment']['ssh_key_cleanup_immediately_after_remote_receipts'] is True,'SSH key cleanup must immediately follow remote receipts')
need(contract['deployment']['ssh_key_cleanup_before_artifact_upload'] is True,'SSH key cleanup must precede artifact upload')
need(contract['deployment']['non_main_remote_mutation_allowed'] is False,'non-main remote mutation must be forbidden')
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
    'runtime/server-entry.mjs',
    'server-entry.mjs',
    'node "$directory/runtime/server-entry.mjs"',
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
validate_guard='''      - name: Reject non-main source before privileged validation
        shell: bash
        run: |
          set -euo pipefail
          test "$GITHUB_REF" = "refs/heads/main"
          case "$GITHUB_EVENT_NAME" in
            push|workflow_dispatch) ;;
            *) exit 64 ;;
          esac'''
deploy_guard="""      - name: Verify live main before provider credential resolution
        shell: bash
        env:
          GITHUB_TOKEN: ${{ github.token }}
        run: |
          set -euo pipefail
          test "$GITHUB_REF" = "refs/heads/main"
          LIVE_MAIN_SHA="$(
            curl --fail-with-body --silent --show-error \\
              --connect-timeout 10 \\
              --max-time 30 \\
              --header "Authorization: Bearer $GITHUB_TOKEN" \\
              --header "Accept: application/vnd.github+json" \\
              --header "X-GitHub-Api-Version: 2022-11-28" \\
              "$GITHUB_API_URL/repos/$GITHUB_REPOSITORY/branches/main" |
              python3 -c 'import json,re,sys; sha=str(json.load(sys.stdin).get("commit",{}).get("sha","")); print(sha) if re.fullmatch(r"[0-9a-f]{40}",sha) else sys.exit(65)'
          )"
          test "$LIVE_MAIN_SHA" = "$GITHUB_SHA"
"""
deploy_job_guard="if: github.ref == 'refs/heads/main' && (github.event_name == 'workflow_dispatch' || github.event_name == 'push')"
need(validate_guard in deploy_workflow,'validate exact-main pre-privileged guard')
need(deploy_guard in deploy_workflow,'deploy exact-main pre-secret guard')
need(deploy_job_guard in deploy_workflow,'deploy job exact-main guard')
need(deploy_workflow.count('${{ secrets.KIDULTS_STAGING_SSH_PRIVATE_KEY_B64 }}')==1,'SSH secret binding must be unique')
if deploy_guard in deploy_workflow:
    guard_index=deploy_workflow.index(deploy_guard)
    for marker in ['${{ secrets.KIDULTS_STAGING_SSH_PRIVATE_KEY_B64 }}','ssh-keyscan -t ed25519','scp "${SSH_OPTS[@]}"']:
        need(marker in deploy_workflow and guard_index < deploy_workflow.index(marker),f'exact-main guard must precede {marker}')
host_scan_marker='''      - name: Scan and verify STAGING host key without SSH secret
        shell: bash'''
materialize_marker='''      - name: Materialize minimal SSH identity
        env:
          SSH_PRIVATE_KEY_B64: ${{ secrets.KIDULTS_STAGING_SSH_PRIVATE_KEY_B64 }}'''
cleanup_marker='''      - name: Remove SSH material before receipt validation or upload
        if: always()
        shell: bash'''
need(host_scan_marker in deploy_workflow,'host scan must be a separate secret-free step')
need(materialize_marker in deploy_workflow,'SSH secret must be scoped to materialization step')
need(cleanup_marker in deploy_workflow,'SSH cleanup must be unconditional')
if host_scan_marker in deploy_workflow and materialize_marker in deploy_workflow:
    host_index=deploy_workflow.index(host_scan_marker)
    materialize_index=deploy_workflow.index(materialize_marker)
    host_block=deploy_workflow[host_index:materialize_index]
    need('${{ secrets.' not in host_block and 'SSH_PRIVATE_KEY_B64' not in host_block,'host scan step must be secret free')
    next_step=deploy_workflow.find('\n      - ',materialize_index+len(materialize_marker))
    materialize_block=deploy_workflow[materialize_index:next_step if next_step >= 0 else len(deploy_workflow)]
    need('ssh-keyscan' not in materialize_block,'host scan and key materialization must remain separate')
    need('unset SSH_PRIVATE_KEY_B64' in materialize_block,'materialization step must unset decoded secret input')
if cleanup_marker in deploy_workflow:
    collect_index=deploy_workflow.find('      - name: Collect deployment-scoped remote receipts and localhost body')
    cleanup_index=deploy_workflow.index(cleanup_marker)
    validator_index=deploy_workflow.find('      - name: Validate exact remote receipt bundle')
    upload_index=deploy_workflow.find('      - uses: actions/upload-artifact@',cleanup_index)
    need(-1 not in [collect_index,validator_index,upload_index] and collect_index < cleanup_index < validator_index < upload_index,'SSH cleanup must immediately follow remote receipt collection and precede validation/upload')
    cleanup_block=deploy_workflow[cleanup_index:validator_index]
    for marker in ['"$RUNNER_TEMP/ssh/id_ed25519"','"$RUNNER_TEMP/ssh/id_ed25519.normalized"','"$RUNNER_TEMP/ssh/known_hosts"']:
        need(marker in cleanup_block,f'SSH cleanup marker {marker}')
need('RELEASE_ID="portal-r001-${GITHUB_SHA:0:12}-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"' in deploy_workflow,'release id must include workflow run attempt')
for marker in ["'receipt_type':'GITHUB_RUNNER_EXECUTION'","'state':'CAPTURED_NOT_ATTESTED'","'workflow_ref':os.environ['GITHUB_WORKFLOW_REF']","'workflow_sha':os.environ['GITHUB_WORKFLOW_SHA']","'job_name':os.environ['GITHUB_JOB']","'successful_workflow_attested':False",'--expected-workflow-ref "$GITHUB_WORKFLOW_REF"','--expected-workflow-sha "$GITHUB_WORKFLOW_SHA"','--expected-job-name "$GITHUB_JOB"']:
    need(marker in deploy_workflow, f'workflow runner binding marker {marker}')
for marker in ['pull_request:','push:','persist-credentials: false','Verify exact source SHA','test_digitalocean_staging_portal_receipts_v1.sh','validate-staging-portal-workflow-provenance-v1.mjs']:
    need(marker in receipt_workflow, f'safe receipt workflow marker {marker}')
if errors:
    print(json.dumps({'suite':'DIGITALOCEAN_STAGING_PORTAL_DEPLOY_V1','state':'VERIFIED_FAIL','errors':errors},indent=2));raise SystemExit(1)
print(json.dumps({'suite':'DIGITALOCEAN_STAGING_PORTAL_DEPLOY_V1','state':'VERIFIED_PASS','target':'ih-staging-01','bind':'127.0.0.1:4173','rollback':'FAIL_CLOSED_ARMED','receipt_contract':'kidults-digitalocean-staging-portal-receipt-contract-v1','production':'HOLD','public_intelligence':'HOLD','g5':'EXPLICIT_APPROVAL_REQUIRED'},indent=2))
