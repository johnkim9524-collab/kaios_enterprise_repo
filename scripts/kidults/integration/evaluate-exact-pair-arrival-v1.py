#!/usr/bin/env python3
import hashlib, json, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
CONTRACT = ROOT / 'coordination/kidults/integration/exact-pair-arrival-orchestrator-v1.json'
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'artifacts/exact-pair-arrival/arrival-state.json'
MANIFEST = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / 'coordination/kidults/integration/live-arrival/live-admission-manifest.json'


def load(p):
    return json.loads(p.read_text(encoding='utf-8'))

def canon(v):
    if isinstance(v, dict): return {k: canon(v[k]) for k in sorted(v)}
    if isinstance(v, list): return [canon(x) for x in v]
    return v

def digest_json(v):
    raw=json.dumps(canon(v), separators=(',', ':'), ensure_ascii=False).encode()
    return 'sha256:' + hashlib.sha256(raw).hexdigest()

def digest_file(p):
    return 'sha256:' + hashlib.sha256(p.read_bytes()).hexdigest()

def corr(pair):
    return 'sha256:' + hashlib.sha256(('kidults-live-chain-v1|' + pair).encode()).hexdigest()

def resolve(rel):
    p=(ROOT / rel).resolve()
    if ROOT not in p.parents and p != ROOT: raise RuntimeError('PATH_ESCAPES_REPOSITORY')
    return p

def contains_ready(v):
    if v == 'READY_FOR_TRACK_B': return True
    if isinstance(v, dict): return any(contains_ready(x) for x in v.values())
    if isinstance(v, list): return any(contains_ready(x) for x in v)
    return False

def write(state, **extra):
    OUT.parent.mkdir(parents=True, exist_ok=True)
    payload={
      'suite':'KIDULTS_EXACT_PAIR_ARRIVAL_ORCHESTRATOR_V1',
      'result':'PASS', 'state':state,
      'production':'HOLD','public_intelligence':'HOLD','g5':'EXPLICIT_APPROVAL_REQUIRED',
      **extra
    }
    OUT.write_text(json.dumps(payload, indent=2, sort_keys=True)+'\n', encoding='utf-8')
    print(json.dumps(payload, indent=2, sort_keys=True))

MANIFEST=resolve(str(MANIFEST))
c=load(CONTRACT)
assert c['id']=='kidults-exact-pair-arrival-orchestrator-v1'
assert c['version']=='1.2.0'
assert c['current_truth']['expected_state']=='WAITING_PAIR'
assert 'TRACK_B_BYPASS' in c['forbidden_shortcuts'] and 'PRODUCTION_BYPASS' in c['forbidden_shortcuts']
assert 'TRACK_B_BLOCKED_TO_RUNTIME' in c['forbidden_shortcuts']

if not MANIFEST.exists():
    write('WAITING_PAIR', candidate='NONE', evidence_package='NONE', track_b='NOT_STARTED', final_business_workload='NOT_RUN', live_projection='NONE')
    sys.exit(0)

m=load(MANIFEST)
for k in c['manifest_required_fields']:
    if k not in m: raise RuntimeError('MANIFEST_FIELD_MISSING:'+k)
if m['synthetic'] is not False or m['promotable'] is not True: raise RuntimeError('NON_PROMOTABLE_INPUT_REJECTED')
cp, ep = resolve(m['candidate_path']), resolve(m['evidence_path'])
if not cp.exists() or not ep.exists(): raise RuntimeError('EXACT_PAIR_FILE_MISSING')
if cp.name!='snapshot-candidate.json' or ep.name!='evidence-package.json': raise RuntimeError('EXACT_PAIR_FILENAME_INVALID')
if digest_file(cp)!=m['candidate_sha256'] or digest_file(ep)!=m['evidence_sha256']: raise RuntimeError('EXACT_FILE_DIGEST_MISMATCH')
candidate,evidence=load(cp),load(ep)
pair=digest_json({'snapshot':candidate,'evidence':evidence})
if pair!=m['exact_pair_digest']: raise RuntimeError('EXACT_PAIR_DIGEST_MISMATCH')
correlation=corr(pair)
snapshot_id=candidate.get('snapshot_id')
evidence_package_id=evidence.get('evidence_package_id')
if not snapshot_id or not evidence_package_id: raise RuntimeError('PAIR_IDENTITY_MISSING')

base_state={
    'exact_pair_digest':pair,
    'correlation_id':correlation,
    'snapshot_id':snapshot_id,
    'evidence_package_id':evidence_package_id,
}
preflight=OUT.parent/'handoff-r2.json'
proc=subprocess.run(['node', str(ROOT/'scripts/kidults/poc/validate-candidate-evidence-handoff-r2.mjs'), str(cp), str(ep), str(preflight)], cwd=ROOT)
if proc.returncode!=0 or not preflight.exists():
    write('PAIR_BLOCKED_PRE_TRACK_B', **base_state, handoff_r2='BLOCKED', track_b='NOT_STARTED')
    sys.exit(0)
hand=load(preflight)
if not contains_ready(hand):
    write('PAIR_BLOCKED_PRE_TRACK_B', **base_state, handoff_r2='BLOCKED', track_b='NOT_STARTED')
    sys.exit(0)

assessment_path=m.get('assessment_path')
if not assessment_path:
    write('READY_FOR_TRACK_B', **base_state, handoff_r2='READY_FOR_TRACK_B', assessment='NOT_CREATED', track_b='READY_TO_ASSESS')
    sys.exit(0)

env=load(resolve(assessment_path))
if env.get('record_type')!='live_rankability_assessment_envelope' or env.get('version')!='1.0.0':
    raise RuntimeError('ASSESSMENT_ENVELOPE_INVALID')
if env.get('synthetic') is not False or env.get('promotable') is not True:
    raise RuntimeError('ASSESSMENT_NON_PROMOTABLE')
if env.get('exact_pair_digest')!=pair or env.get('correlation_id')!=correlation:
    raise RuntimeError('ASSESSMENT_PAIR_BINDING_MISMATCH')
a=env.get('assessment')
if not isinstance(a, dict): raise RuntimeError('ASSESSMENT_BODY_MISSING')
if a.get('record_type')!='rankability_assessment' or a.get('immutable') is not True or a.get('assessment_status')!='COMPLETED':
    raise RuntimeError('ASSESSMENT_BODY_INVALID')
if a.get('assessment_fingerprint')!=digest_json({k:v for k,v in a.items() if k!='assessment_fingerprint'}): raise RuntimeError('ASSESSMENT_FINGERPRINT_INVALID')
if a.get('production_eligible') is not False: raise RuntimeError('ASSESSMENT_PRODUCTION_PREAUTH_FORBIDDEN')
if a.get('publication_eligible') is not False: raise RuntimeError('ASSESSMENT_PUBLIC_PREAUTH_FORBIDDEN')
if a.get('snapshot_id')!=snapshot_id or a.get('evidence_package_id')!=evidence_package_id:
    raise RuntimeError('ASSESSMENT_INPUT_ID_MISMATCH')
assessment_id=a.get('assessment_id') or a.get('id')
if not assessment_id: raise RuntimeError('ASSESSMENT_ID_MISSING')
recommendation=a.get('recommendation')
if recommendation not in c['assessment_binding']['staging_replay_pass_recommendations'] or a.get('overall_rankability') is not True:
    write('TRACK_B_BLOCKED', **base_state, assessment_id=assessment_id, track_b='COMPLETED_NOT_PASS', recommendation=recommendation, final_business_workload='NOT_RUN', live_projection='NONE')
    sys.exit(0)

replay_path=m.get('replay_receipt_path')
if not replay_path:
    write('READY_FOR_STAGING_REPLAY', **base_state, assessment_id=assessment_id, track_b='PASS_FOR_INTERNAL_STAGING', recommendation=recommendation, final_business_workload='NOT_RUN')
    sys.exit(0)
r=load(resolve(replay_path))
if r.get('record_type')!='kidults_internal_staging_replay_receipt' or r.get('version')!='1.0.0': raise RuntimeError('REPLAY_RECEIPT_INVALID')
if r.get('replay_fingerprint')!=digest_json({k:v for k,v in r.items() if k!='replay_fingerprint'}): raise RuntimeError('REPLAY_FINGERPRINT_INVALID')
if r.get('result')!='PASS' or r.get('workload_result')!='PASS' or r.get('projection_ready') is not True: raise RuntimeError('REPLAY_NOT_PASS')
if r.get('exact_pair_digest')!=pair or r.get('correlation_id')!=correlation or r.get('assessment_id')!=assessment_id: raise RuntimeError('REPLAY_BINDING_MISMATCH')
if r.get('environment')!='STAGING' or r.get('production_touch') is not False or r.get('public_touch') is not False or r.get('g5')!='HOLD': raise RuntimeError('REPLAY_BOUNDARY_VIOLATION')
if r.get('synthetic') is not False or r.get('promotable') is not True: raise RuntimeError('REPLAY_NON_PROMOTABLE')
replay_id=r.get('replay_id') or r.get('id')
if not replay_id: raise RuntimeError('REPLAY_ID_MISSING')
canonical_object_id=r.get('canonical_object_id')
if not canonical_object_id: raise RuntimeError('REPLAY_CANONICAL_OBJECT_ID_MISSING')

projection_path=m.get('projection_admission_path')
if not projection_path:
    write('READY_FOR_PROJECTION', **base_state, assessment_id=assessment_id, replay_id=replay_id, track_b='PASS_FOR_INTERNAL_STAGING', final_business_workload='PASS', live_projection='NONE')
    sys.exit(0)
p=load(resolve(projection_path))
if p.get('record_type')!='kidults_canonical_projection_admission_receipt' or p.get('version')!='1.0.0' or p.get('result')!='PASS': raise RuntimeError('PROJECTION_ADMISSION_INVALID')
if p.get('admission_fingerprint')!=digest_json({k:v for k,v in p.items() if k!='admission_fingerprint'}): raise RuntimeError('PROJECTION_ADMISSION_FINGERPRINT_INVALID')
if p.get('exact_pair_digest')!=pair or p.get('correlation_id')!=correlation or p.get('assessment_id')!=assessment_id or p.get('replay_id')!=replay_id: raise RuntimeError('PROJECTION_BINDING_MISMATCH')
if p.get('production') is not False or p.get('public') is not False: raise RuntimeError('PROJECTION_BOUNDARY_VIOLATION')
if p.get('synthetic') is not False or p.get('fixture') is not False or p.get('promotable') is not True: raise RuntimeError('PROJECTION_NON_PROMOTABLE')
if p.get('canonical_object_id')!=canonical_object_id: raise RuntimeError('PROJECTION_OBJECT_ID_MISMATCH')
if p.get('product_type')!='OBJECT_PASSPORT' or p.get('projection_state')!='APPROVED_INTERNAL': raise RuntimeError('PROJECTION_PRODUCT_STATE_INVALID')
if p.get('schema_and_semantics_admitted') is not True: raise RuntimeError('PROJECTION_SCHEMA_ADMISSION_MISSING')
enabled_actions=p.get('enabled_actions')
if not isinstance(enabled_actions,list) or not {'COMPARE','WATCHLIST'}.issubset(set(enabled_actions)): raise RuntimeError('PROJECTION_REQUIRED_ACTIONS_MISSING')
projection_id=p.get('projection_id') or p.get('id')
if not projection_id: raise RuntimeError('PROJECTION_ID_MISSING')
projection_record_path=resolve(p.get('projection_path'))
if not projection_record_path.exists(): raise RuntimeError('PROJECTION_RECORD_MISSING')
if digest_file(projection_record_path)!=p.get('projection_file_sha256'): raise RuntimeError('PROJECTION_FILE_DIGEST_MISMATCH')
projection=load(projection_record_path)
if projection.get('record_type')!='kidults_proof_product_projection' or projection.get('projection_id')!=projection_id: raise RuntimeError('PROJECTION_RECORD_INVALID')
if projection.get('product_type')!='OBJECT_PASSPORT' or projection.get('projection_state')!='APPROVED_INTERNAL' or projection.get('display_eligibility')!='INTERNAL_ONLY': raise RuntimeError('PROJECTION_RECORD_STATE_INVALID')
if projection.get('lineage',{}).get('snapshot_id')!=snapshot_id or projection.get('lineage',{}).get('evidence_package_id')!=evidence_package_id or projection.get('lineage',{}).get('assessment_id')!=assessment_id: raise RuntimeError('PROJECTION_LINEAGE_MISMATCH')
if projection.get('rankability',{}).get('assessment_id')!=assessment_id: raise RuntimeError('PROJECTION_RANKABILITY_BINDING_MISMATCH')
if projection.get('payload',{}).get('canonical_object_id')!=canonical_object_id: raise RuntimeError('PROJECTION_PAYLOAD_OBJECT_ID_MISMATCH')
actions={x.get('action_id'):x for x in projection.get('actions',[]) if isinstance(x,dict)}
for action in ['COMPARE','WATCHLIST']:
    if actions.get(action,{}).get('state')!='ENABLED' or not actions.get(action,{}).get('destination'): raise RuntimeError('PROJECTION_ACTION_INVALID:'+action)
write('CHAIN_COMPLETE_INTERNAL', **base_state, assessment_id=assessment_id, replay_id=replay_id, projection_id=projection_id, projection_path=p.get('projection_path'), product_type='OBJECT_PASSPORT', canonical_object_id=canonical_object_id, enabled_actions=['COMPARE','WATCHLIST'], track_b='PASS_FOR_INTERNAL_STAGING', final_business_workload='PASS', live_projection='GOVERNED_INTERNAL')
