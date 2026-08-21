#!/usr/bin/env python3
import json
from pathlib import Path

root=Path(__file__).resolve().parents[2]
contract=json.loads((root/'coordination/kidults/runtime/digitalocean-staging-portal-deploy-contract-v1.json').read_text())
script=(root/'scripts/operations/digitalocean_staging_portal_deploy_v1.sh').read_text()
portal=(root/'apps/kidults-enterprise-staging/public/portal-r001/index.html').read_text()
errors=[]
need=lambda c,m: errors.append(m) if not c else None
need(contract['id']=='kidults-digitalocean-staging-portal-deploy-v1','id')
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
]:
    need(marker in script, f'script marker {marker}')
need(script.index('ROLLBACK_ARMED=true') < script.index('ln -sfn "$RELEASE" "$CURRENT"'), 'rollback must arm before cutover')
need('"public_bind": false' in script,'rollback/deploy receipt public bind false')
need('"production_touch": false' in script,'rollback/deploy receipt production touch false')
need('"raw_provider_ingestion": false' in script,'rollback/deploy receipt provider ingestion false')
need('"g5": "HOLD"' in script,'rollback/deploy receipt g5 hold')
if errors:
    print(json.dumps({'suite':'DIGITALOCEAN_STAGING_PORTAL_DEPLOY_V1','result':'FAIL','errors':errors},indent=2));raise SystemExit(1)
print(json.dumps({'suite':'DIGITALOCEAN_STAGING_PORTAL_DEPLOY_V1','result':'PASS','target':'ih-staging-01','bind':'127.0.0.1:4173','rollback':'FAIL_CLOSED_ARMED','production':'HOLD','public_intelligence':'HOLD','g5':'EXPLICIT_APPROVAL_REQUIRED'},indent=2))
