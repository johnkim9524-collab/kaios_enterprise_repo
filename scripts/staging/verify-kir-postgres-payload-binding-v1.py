#!/usr/bin/env python3
"""Execute actual PostgreSQL CHECK regressions in the existing pinned CI service.

Never accepts a DSN or contacts a remote database. The only transport is
`docker exec` into the exact ephemeral PostgreSQL service supplied by the job.
Constraint-copy probes isolate CHECK behavior from unrelated FK/trigger gates;
two dirty real-table upgrades additionally verify atomic failure preservation.
These synthetic schema tests are NOT lawful rows, PITR, staging or release proof.
"""
from __future__ import annotations
import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
IMAGE = 'postgres:16@sha256:f1c3376c26f2609ab9f29f71f824103fe2fcd8ee0346485cb6122a4f93df6f94'
BASE = [
    'services/kidults-control-plane/migrations/postgres/0001_system_of_record.sql',
    'infrastructure/postgres/source-intelligence/0001_global_sold_source_registry_v1.sql',
    'infrastructure/postgres/source-intelligence/0002_source_evidence_manifest_ledger_v1.sql',
    'infrastructure/postgres/current-sold/0001_current_sold_append_only_ledger_v1.sql',
]
UPGRADES = [
    'infrastructure/postgres/current-sold/0002_payload_binding_fail_closed_v1.sql',
    'infrastructure/postgres/source-intelligence/0003_payload_binding_fail_closed_v1.sql',
]
D = 'sha256:' + 'a' * 64
STAMP = '2026-09-01T00:00:00Z'
META = {'ledger_id': 1, 'inserted_at': STAMP}
WRITER = 'kpmo-supply-chain-admission-v1'
CONSTRAINTS = (
    'current_sold_event_payload_binding_ck', 'current_sold_evidence_payload_binding_ck',
    'current_sold_receipt_payload_binding_ck', 'global_source_registry_payload_binding_ck',
    'global_source_assessment_payload_binding_ck', 'global_source_assessment_rights_shape_ck',
    'global_source_assessment_decision_consistency_ck', 'source_evidence_manifest_payload_binding_ck',
)


def fixtures() -> list[tuple[str, str, dict, list[list[str]]]]:
    """Deliberately synthetic SQL-shape fixtures, not engine admission receipts."""
    event = dict(META, event_id='cs_'+'1'*24, content_digest=D,
        canonical_object_id='synthetic:object', source_id='synthetic-source',
        source_event_id='synthetic-transaction', source_sha='a'*40,
        canonical_run_id='synthetic-sql-only', correction_state='ORIGINAL',
        supersedes_content_digest=None, sold_at=STAMP, observed_at=STAMP,
        batch_receipt_id='csr_'+'2'*24)
    ekeys = ['event_id','content_digest','canonical_object_id','source_id','source_event_id',
             'source_sha','canonical_run_id','correction_state']
    event['event_payload'] = {k:event[k] for k in ekeys + ['supersedes_content_digest']}
    evidence = dict(META, evidence_id='ev_cs_'+'3'*24, fact_id='evf_cs_'+'4'*24,
        evidence_digest=D, current_sold_event_id=event['event_id'],
        current_sold_content_digest=D, canonical_object_id='synthetic:object',
        source_sha='a'*40, canonical_run_id='synthetic-sql-only', batch_receipt_id='csr_'+'2'*24)
    lineage = ['current_sold_event_id','current_sold_content_digest','source_sha','canonical_run_id']
    evidence['evidence_payload'] = {k:evidence[k] for k in ['evidence_id','fact_id','canonical_object_id']}
    evidence['evidence_payload']['lineage'] = {k:evidence[k] for k in lineage}
    receipt = dict(META, receipt_id='csr_'+'2'*24, receipt_digest=D, batch_id='synthetic-batch',
        status='PASS', source_sha='a'*40, canonical_run_id='synthetic-sql-only',
        envelope_digest=D, event_versions_digest=D, evidence_digest=D)
    rkeys = ['receipt_id','batch_id','status','source_sha','canonical_run_id',
             'envelope_digest','event_versions_digest','evidence_digest']
    receipt['receipt_payload'] = {k:receipt[k] for k in rkeys}
    release = {k:False for k in ['acquisition_authorized','adapter_activation_authorized',
                               'postgres_migration_authorized','d1_projection_authorized']}
    release.update(public_release='HOLD', production='HOLD', g5='HOLD')
    registry = dict(META, registry_id='kidults-global-sold-source-registry-v1',
        registry_version='1.0.0', snapshot_digest=D, generated_at=STAMP, source_count=1,
        writer_id=WRITER, registry_payload={'id':'kidults-global-sold-source-registry-v1',
        'version':'1.0.0','snapshot_digest':D,'sources':[{'source_id':'synthetic-source'}],
        'release_boundary':release})
    rights = {k:'HOLD' for k in ['collect','store','derive','commercial_use','display','raw_archive']}
    assessment = dict(META, snapshot_digest=D, source_id='synthetic-source', source_name='Synthetic',
        owner_name='Synthetic', region='TEST', decision='HOLD', rights_matrix=rights,
        claim_ceiling='CONTROL_ONLY', source_roles=['TEST'], verticals=['TEST'],
        official_urls=['https://example.invalid'], freshness='NOT_LIVE', evidence_state='SYNTHETIC',
        activation_authorized=False, production_authorized=False, assessment_digest=D, writer_id=WRITER)
    akeys = ['source_id','source_name','owner_name','region','decision','claim_ceiling','source_roles',
             'verticals','official_urls','freshness','evidence_state','activation_authorized','production_authorized']
    assessment['assessment_payload'] = {k:assessment[k] for k in akeys}
    assessment['assessment_payload']['rights'] = rights.copy()
    release2 = {k:False for k in ['source_acquisition','adapter_activation','database_mutation','d1_projection']}
    release2.update(public='HOLD',production='HOLD',g5='HOLD')
    manifest = dict(META, manifest_id='synthetic-manifest', manifest_version='1.0.0',
        manifest_type='REGISTRY_SNAPSHOT', manifest_digest=D, registry_snapshot_digest=D,
        source_ids=['synthetic-source'], source_count=1, artifact_digest=D,
        storage_mode='METADATA_ONLY', evidence_uri=None, contains_external_raw_content=False,
        rights_decision_id=None, supply_chain_run_id=None, writer_id=WRITER,
        manifest_payload={'id':'synthetic-manifest','version':'1.0.0','manifest_type':'REGISTRY_SNAPSHOT',
        'manifest_digest':D,'registry_snapshot_digest':D,
        'artifact':{'digest':D,'storage_mode':'METADATA_ONLY','contains_external_raw_content':False,'evidence_uri':None},
        'admission':{'rights_decision_id':None,'supply_chain_run_id':None},'release_boundary':release2})
    return [
        ('kidults_private.current_sold_event_ledger','event_payload',event,[[k] for k in ekeys]),
        ('kidults_private.current_sold_evidence_ledger','evidence_payload',evidence,
         [[k] for k in ['evidence_id','fact_id','canonical_object_id']]+[['lineage',k] for k in lineage]),
        ('kidults_private.current_sold_batch_receipt_ledger','receipt_payload',receipt,[[k] for k in rkeys]),
        ('kidults_control.global_source_registry_snapshot_ledger','registry_payload',registry,
         [[k] for k in ['id','version','snapshot_digest','sources']]+[['release_boundary',k] for k in release]),
        ('kidults_control.global_source_assessment_ledger','assessment_payload',assessment,[[k] for k in akeys+['rights']]),
        ('kidults_control.source_evidence_manifest_ledger','manifest_payload',manifest,
         [[k] for k in ['id','version','manifest_type','manifest_digest','registry_snapshot_digest']]+
         [['artifact',k] for k in ['digest','storage_mode','contains_external_raw_content']]+[['release_boundary',k] for k in release2]),
    ]


def variants(field: str, row: dict, paths: list[list[str]]) -> list[tuple[str, dict, bool]]:
    result = [('valid', copy.deepcopy(row), True)]
    for label, payload in [('empty',{}),('json-null',None),('array',[]),('scalar',1)]:
        x=copy.deepcopy(row);x[field]=payload;result.append((label,x,False))
    for p in paths:
        for null in (False,True):
            x=copy.deepcopy(row); parent=x[field]
            for key in p[:-1]:parent=parent[key]
            if null:parent[p[-1]]=None
            else:del parent[p[-1]]
            legacy_reject = null and ((field=='registry_payload' and p==['sources']) or
                (field=='assessment_payload' and p[0] in {'rights','source_roles','verticals','official_urls'}))
            result.append((('null-' if null else 'missing-') + '-'.join(p),x,legacy_reject))
    # Values that are correctly rejected even by the original CHECK remain rejected.
    x=copy.deepcopy(row);x[field][paths[0][0]]='BOUND_VALUE_MISMATCH'
    result.append(('mismatched-value',x,True))
    if field in ('registry_payload','manifest_payload'):
        x=copy.deepcopy(row)
        for k,v in x[field]['release_boundary'].items():
            if v is False:x[field]['release_boundary'][k]='false'
        result.append(('string-boolean-authority',x,False))
    if field=='manifest_payload':
        x=copy.deepcopy(row);x[field]['artifact']['contains_external_raw_content']='false'
        result.append(('string-boolean-artifact',x,False))
    if field=='assessment_payload':
        x=copy.deepcopy(row);x[field]['activation_authorized']='false';x[field]['production_authorized']='false'
        result.append(('string-boolean-authority',x,False))
        for decision in ('HOLD','PASS','NO_GO'):
            x=copy.deepcopy(row);x['decision']=decision;x[field]['decision']=decision
            x['rights_matrix']={k:None for k in x['rights_matrix']};x[field]['rights']=x['rights_matrix'].copy()
            result.append(('null-rights-'+decision,x,False))
    return result


def literal(value: object) -> str:
    return "'"+json.dumps(value,separators=(',',':')).replace("'","''")+"'::jsonb"


def probe_sql(hardened: bool) -> tuple[str,int,int]:
    statements=['BEGIN;','SET LOCAL statement_timeout = \'45s\';']
    count=negative=0
    for i,(table,field,row,paths) in enumerate(fixtures()):
        temp=f'kir_probe_{i}'
        statements.append(f'CREATE TEMP TABLE {temp} (LIKE {table} INCLUDING CONSTRAINTS);')
        for label,variant,legacy_invariant in variants(field,row,paths):
            accept = label=='valid' or (not hardened and not legacy_invariant)
            count+=1;negative+=not accept
            # jsonb_populate_record maps a top-level JSON null to SQL NULL.
            # Preserve JSONB payload bytes explicitly so CHECK, not NOT NULL, is tested.
            columns=','.join(variant)
            values=','.join(literal(v) if k==field else f'r.{k}' for k,v in variant.items())
            statements.append(f"""DO $probe$
DECLARE accepted boolean := false;
BEGIN
  BEGIN
    INSERT INTO {temp} ({columns}) SELECT {values}
      FROM jsonb_populate_record(NULL::{temp},{literal(variant)}) AS r;
    accepted := true;
  EXCEPTION WHEN check_violation OR invalid_parameter_value THEN accepted := false;
  END;
  IF accepted IS DISTINCT FROM {'true' if accept else 'false'} THEN
    RAISE EXCEPTION 'KIR_SQL_CASE_{count}_EXPECTED_{'ACCEPT' if accept else 'REJECT'}';
  END IF;
END $probe$;""")
    statements.extend(['ROLLBACK;',f"SELECT 'KIR_SQL_CASES_PASS={count}';"])
    return '\n'.join(statements),count,negative


def run_command(argv: list[str], *, data: str|None=None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(argv,input=data,text=True,capture_output=True,timeout=90,check=False)


def verify_context(env: dict[str,str]) -> tuple[str,int,int,str]:
    if env.get('GITHUB_REPOSITORY')!='johnkim9524-collab/kaios_enterprise_repo':
        raise ValueError('CANONICAL_REPOSITORY_REQUIRED')
    if env.get('GITHUB_ACTIONS')!='true' or env.get('GITHUB_EVENT_NAME') not in ('pull_request','push'):
        raise ValueError('CI_EVENT_REQUIRED')
    cid=env.get('KIR_SQL_TEST_CONTAINER_ID','')
    if not re.fullmatch(r'[0-9a-f]{64}',cid):raise ValueError('EXACT_SERVICE_CONTAINER_REQUIRED')
    run=env.get('GITHUB_RUN_ID','');attempt=env.get('GITHUB_RUN_ATTEMPT','')
    if not re.fullmatch(r'[1-9][0-9]{0,14}',run) or not re.fullmatch(r'[1-9][0-9]{0,5}',attempt):
        raise ValueError('RUN_IDENTITY_REQUIRED')
    sha=env.get('KIR_EXPECTED_SOURCE_SHA','')
    if not re.fullmatch(r'[0-9a-f]{40}',sha):raise ValueError('EXACT_SOURCE_REQUIRED')
    return cid,int(run),int(attempt),sha


def persist(file: Path, receipt: dict) -> None:
    file.parent.mkdir(parents=True,exist_ok=True)
    tmp=file.with_name(file.name+'.tmp')
    tmp.write_text(json.dumps(receipt,indent=2)+'\n');tmp.chmod(0o600);tmp.replace(file)


def self_test() -> None:
    f=fixtures();assert len(f)==6
    for table,field,row,paths in f:
        assert re.fullmatch(r'kidults_(private|control)\.[a-z_]+',table)
        for p in paths:
            value=row[field]
            for key in p:value=value[key]
    a,n,_=probe_sql(False);b,n2,negative=probe_sql(True)
    assert n==n2 and negative==n-6 and a!=b
    assert a.count("'null'::jsonb")==6 and b.count("'null'::jsonb")==6
    assert 'AS r;' in a
    # JSONB equality rejects explicit null vs an object/array even before repair.
    assess=next(x for x in f if x[1]=='assessment_payload')
    av=variants(assess[1],assess[2],assess[3])
    assert all(old for name,_,old in av if name in {'null-rights','null-source_roles','null-verticals','null-official_urls'})
    env={'GITHUB_REPOSITORY':'johnkim9524-collab/kaios_enterprise_repo','GITHUB_ACTIONS':'true','GITHUB_EVENT_NAME':'pull_request','KIR_SQL_TEST_CONTAINER_ID':'b'*64,
         'GITHUB_RUN_ID':'10','GITHUB_RUN_ATTEMPT':'1','KIR_EXPECTED_SOURCE_SHA':'a'*40}
    verify_context(env)
    for key,bad in [('GITHUB_ACTIONS','false'),('GITHUB_EVENT_NAME','workflow_dispatch'),
                    ('KIR_SQL_TEST_CONTAINER_ID','main'),('GITHUB_RUN_ID','0'),
                    ('GITHUB_RUN_ATTEMPT','1;echo'),('KIR_EXPECTED_SOURCE_SHA','main')]:
        try:verify_context(dict(env,**{key:bad}))
        except ValueError:continue
        raise AssertionError(key)
    print(json.dumps({'state':'VERIFIED_PASS','scope':'OFFLINE_FIXTURE_AND_GUARD_SELF_TEST',
                      'planned_cases_per_phase':n,'actual_postgres_executed':False}))


def main() -> int:
    env=dict(os.environ);out=ROOT/'out/kir-sql-boundary/receipt.json'
    receipt={'id':'kir-postgres-payload-boundary-ci-v1','state':'VERIFIED_FAIL',
             'scope':'PINNED_EPHEMERAL_CI_POSTGRES_CHECKS_NOT_STAGING_OR_PITR',
             'synthetic_only':True,'constraint_copy_probes':True,
             'remote_staging_verified':False,'production_readiness_verified':False,
             'lawful_current_sold_rows':0,'provider_authority':False,'database_authority':False,
             'promotion_eligible':False,'production':'HOLD','public':'HOLD','g5':'HOLD',
             'created_databases':0,'cleaned_databases':0}
    created=[];cid=''
    def psql(db: str,sql: str, *, ok: bool=True) -> str:
        if db!='postgres' and db not in created:raise ValueError('DATABASE_SCOPE_DENIED')
        p=run_command(['docker','exec','-i',cid,'psql','--no-psqlrc','--quiet','--tuples-only',
                       '--no-align','--set=ON_ERROR_STOP=1','--set=VERBOSITY=verbose','-U','postgres','-d',db],data=sql)
        if (p.returncode==0)!=ok:
            # The only input is repository SQL and explicitly synthetic fixtures.
            print(p.stderr[-3000:],file=sys.stderr)
            raise ValueError('POSTGRES_EXPECTED_RESULT_MISMATCH')
        if not ok and '23514' not in p.stderr:
            print(p.stderr[-3000:],file=sys.stderr)
            raise ValueError('EXPECTED_CHECK_VIOLATION_REQUIRED')
        return p.stdout.strip()
    try:
        cid,run,attempt,sha=verify_context(env)
        p=run_command(['git','-C',str(ROOT),'rev-parse','HEAD'])
        if p.returncode or p.stdout.strip()!=sha:raise ValueError('CHECKOUT_SHA_MISMATCH')
        p=run_command(['docker','inspect',cid])
        if p.returncode:raise ValueError('SERVICE_INSPECTION_FAILED')
        inspected=json.loads(p.stdout)
        if len(inspected)!=1 or inspected[0].get('Id')!=cid or inspected[0]['Config']['Image']!=IMAGE or not inspected[0]['State']['Running']:
            raise ValueError('PINNED_SERVICE_IDENTITY_MISMATCH')
        receipt.update(source_sha=sha,run_id=run,run_attempt=attempt,trigger_event=env['GITHUB_EVENT_NAME'],
                       repository=env.get('GITHUB_REPOSITORY'),postgres_image=IMAGE)
        persist(out,receipt)
        version=psql('postgres','SHOW server_version_num;')
        if not re.fullmatch(r'16[0-9]{4}',version):raise ValueError('POSTGRES_MAJOR_MISMATCH')
        receipt['server_version_num']=int(version)
        texts={p:(ROOT/p).read_text() for p in BASE+UPGRADES}
        receipt['migration_sha256']={p:'sha256:'+hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in texts}
        for suffix in ('clean','dirty'):
            db=f'kir_payload_{run}_{attempt}_{secrets.token_hex(4)}_{suffix}'
            if not re.fullmatch(r'kir_payload_[a-z0-9_]{1,50}',db):raise ValueError('DATABASE_NAME_INVALID')
            psql('postgres',f'CREATE DATABASE {db};');created.append(db);receipt['created_databases']+=1
            psql(db,'\n'.join(texts[p] for p in BASE))
            if suffix=='clean':
                sql,n,_=probe_sql(False);psql(db,sql)
                receipt['original_cases_passed']=n
                preserve_sql="""SELECT md5(string_agg(x,E'\\n' ORDER BY x)) FROM (
SELECT pg_get_triggerdef(oid) x FROM pg_trigger WHERE NOT tgisinternal
UNION ALL SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE contype IN ('f','p','u')
UNION ALL SELECT n.nspname||'.'||c.relname||':'||COALESCE(c.relacl::text,'')
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('kidults_control','kidults_private')
) t;"""
                before=psql(db,preserve_sql)
                for upgrade in UPGRADES:psql(db,texts[upgrade])
                if psql(db,preserve_sql)!=before:raise ValueError('TRIGGER_FK_OR_PRIVILEGE_DRIFT')
                sql,n,negative=probe_sql(True);psql(db,sql)
                receipt.update(hardened_cases_passed=n,hardened_rejections=negative,
                               triggers_fks_and_privileges_preserved=True)
                for upgrade in UPGRADES:psql(db,texts[upgrade])
                psql(db,sql);receipt['reapply_cases_passed']=n
                names=','.join("'"+x+"'" for x in CONSTRAINTS)
                result=psql(db,f"SELECT count(*) FROM pg_constraint WHERE conname IN ({names}) AND convalidated AND pg_get_constraintdef(oid) LIKE '%IS TRUE%';")
                if result!='8':raise ValueError('EIGHT_VALIDATED_CONSTRAINTS_REQUIRED')
            else:
                # Existing invalid rows are not deleted or silently marked valid.
                for ix,upgrade in ((2,UPGRADES[0]),(3,UPGRADES[1])):
                    table,field,row,_=fixtures()[ix];row[field]={}
                    sql=f'INSERT INTO {table} SELECT (jsonb_populate_record(NULL::{table},{literal(row)})).*;'
                    if ix==3:sql="SET ROLE kidults_control_supply; SET kidults.writer_id='"+WRITER+"';\n"+sql+'\nRESET ROLE;'
                    psql(db,sql)
                    psql(db,texts[upgrade],ok=False)
                    if psql(db,f'SELECT count(*) FROM {table};')!='1':raise ValueError('INVALID_ROW_NOT_PRESERVED')
                    name=CONSTRAINTS[2 if ix==2 else 3]
                    if psql(db,f"SELECT pg_get_constraintdef(oid) LIKE '%IS TRUE%' FROM pg_constraint WHERE conname='{name}';")!='f':
                        raise ValueError('FAILED_MIGRATION_NOT_ATOMIC')
                receipt['dirty_upgrade_abort_and_original_row_preservation_cases']=2
        receipt['state']='VERIFIED_PASS'
    except Exception as exc:
        receipt['failure_class']=str(exc)[:160] if isinstance(exc,ValueError) else type(exc).__name__
        print('KIR_SQL_BOUNDARY_FAILED:'+receipt['failure_class'],file=sys.stderr)
    finally:
        for db in reversed(created):
            try:psql('postgres',f'DROP DATABASE {db};');receipt['cleaned_databases']+=1
            except Exception:receipt['state']='VERIFIED_FAIL';receipt['cleanup_failed']=True
        persist(out,receipt)
        print(json.dumps(receipt,sort_keys=True))
    return 0 if receipt['state']=='VERIFIED_PASS' else 1


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    group=parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--self-test',action='store_true');group.add_argument('--run-ci',action='store_true')
    args=parser.parse_args()
    if args.self_test:self_test()
    else:raise SystemExit(main())
