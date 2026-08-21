from __future__ import annotations
import hashlib, json
from pathlib import Path

CONTRACT=Path('coordination/kidults/runtime/digitalocean-staging-bootstrap-contract-v1.json')
SCRIPT=Path('scripts/operations/digitalocean_staging_userspace_bootstrap_v1.sh')

def main():
    c=json.loads(CONTRACT.read_text())
    s=SCRIPT.read_bytes()
    digest=hashlib.sha256(s).hexdigest()
    errors=[]
    if c['bootstrap_script']['sha256']!=digest: errors.append('bootstrap digest mismatch')
    if c['rollback_target']['state']!='DECLARED': errors.append('rollback target not declared')
    p=c['bootstrap_policy']
    for k in ['idempotent','versioned','audited','staging_only','user_space_only']:
        if p.get(k) is not True: errors.append(f'{k} must be true')
    for k in ['sudo_required','os_package_mutation','systemd_activation','production_touch','production_id_reuse','production_ip_reuse','production_credential_reuse']:
        if p.get(k) is not False: errors.append(f'{k} must be false')
    prohibited=set(c['prohibited'])
    for x in ['ROOT_SSH_AUTOMATION','SUDO_BOOTSTRAP','APT_MUTATION','SYSTEMD_ENABLE_OR_START','RAW_PROVIDER_INGESTION','REAL_BUSINESS_WORKLOAD','PRODUCTION_DEPLOY','G5_PROMOTION']:
        if x not in prohibited: errors.append(f'missing prohibition {x}')
    if c['production']!='HOLD' or c['g5']!='EXPLICIT_APPROVAL_REQUIRED': errors.append('release boundary weakened')
    if errors: raise SystemExit('\n'.join(errors))
    print(json.dumps({'suite':'DIGITALOCEAN_STAGING_BOOTSTRAP_EXEC_V1','result':'PASS','script_sha256':digest,'rollback_target':c['rollback_target']['id'],'remote_mutation':False,'production':'HOLD'},indent=2))
if __name__=='__main__': main()
