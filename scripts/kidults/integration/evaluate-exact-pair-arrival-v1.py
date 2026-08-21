#!/usr/bin/env python3
import hashlib, json, os, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
CONTRACT = ROOT / 'coordination/kidults/integration/exact-pair-arrival-orchestrator-v1.json'
MANIFEST = ROOT / 'coordination/kidults/integration/live-arrival/live-admission-manifest.json'
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'artifacts/exact-pair-arrival/arrival-state.json'


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

c=load(CONTRACT)
assert c['id']=='kidults-exact-pair-arrival-orchestrator-v1'
assert c['current_truth']['expected_state']=='WAITING_PAIR'
assert 'TRACK_B_BYPASS' in c['forbidden_shortcuts'] and 'PRODUCTION_BYPASS' in c['forbidden_shortcuts']

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

preflight=OUT.parent/'handoff-r2.json'
proc=subprocess.run(['node', str(ROOT/'scripts/kidults/poc/validate-candidate-evidence-handoff-r2.mjs'), str(cp), str(ep), str(preflight)], cwd=ROOT)
if proc.returncode!=0 or not preflight.exists():
    write('WAITING_PAIR', exact_pair_digest=pair, correlation_id=correlation, handoff_r2='BLOCKED', track_b='NOT_STARTED')
    sys.exit(0)
hand=load(preflight)
if not contains_ready(hand):
    write('WAITING_PAIR', exact_pair_digest=pair, correlation_id=correlation, handoff_r2='BLOCKED', track_b='NOT_STARTED')
    sys.exit(0)

assessment_path=m.get('assessment_path')
if not assessment_path:
    write('READY_FOR_TRACK_B', exact_pair_digest=pair, correlation_id=correlation, handoff_r2='READY_FOR_TRACK_B', assessment='NOT_CREATED')
    sys.exit(0)
a=load(resolve(assessment_path))
if a.get('synthetic') is True or a.get('promotable') is False: raise RuntimeError('ASSESSMENT_NON_PROMOTABLE')
if a.get('exact_pair_digest')!=pair or a.get('correlation_id')!=correlation: raise RuntimeError('ASSESSMENT_PAIR_BINDING_MISMATCH')
if a.get('snapshot_id')!=candidate.get('snapshot_id') or a.get('evidence_package_id')!=evidence.get('evidence_package_id'): raise RuntimeError('ASSESSMENT_INPUT_ID_MISMATCH')
assessment_id=a.get('assessment_id') or a.get('id')
if not assessment_id: raise RuntimeError('ASSESSMENT_ID_MISSING')

replay_path=m.get('replay_receipt_path')
if not replay_path:
    write('READY_FOR_STAGING_REPLAY', exact_pair_digest=pair, correlation_id=correlation, assessment_id=assessment_id)
    sys.exit(0)
r=load(resolve(replay_path))
if r.get('exact_pair_digest')!=pair or r.get('correlation_id')!=correlation or r.get('assessment_id')!=assessment_id: raise RuntimeError('REPLAY_BINDING_MISMATCH')
if r.get('environment')!='STAGING' or r.get('production_touch') is not False or r.get('public_touch') is not False or r.get('g5')!='HOLD': raise RuntimeError('REPLAY_BOUNDARY_VIOLATION')
replay_id=r.get('replay_id') or r.get('id')
if not replay_id: raise RuntimeError('REPLAY_ID_MISSING')

projection_path=m.get('projection_admission_path')
if not projection_path:
    write('READY_FOR_PROJECTION', exact_pair_digest=pair, correlation_id=correlation, assessment_id=assessment_id, replay_id=replay_id)
    sys.exit(0)
p=load(resolve(projection_path))
if p.get('exact_pair_digest')!=pair or p.get('correlation_id')!=correlation or p.get('assessment_id')!=assessment_id or p.get('replay_id')!=replay_id: raise RuntimeError('PROJECTION_BINDING_MISMATCH')
if p.get('production') is not False or p.get('public') is not False: raise RuntimeError('PROJECTION_BOUNDARY_VIOLATION')
write('CHAIN_COMPLETE_INTERNAL', exact_pair_digest=pair, correlation_id=correlation, assessment_id=assessment_id, replay_id=replay_id, projection_id=p.get('projection_id') or p.get('id'))
