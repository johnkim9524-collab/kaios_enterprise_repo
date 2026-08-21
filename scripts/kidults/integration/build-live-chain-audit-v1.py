#!/usr/bin/env python3
import hashlib, json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
STATE = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'artifacts/exact-pair-arrival/arrival-state.json'
OUT = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / 'artifacts/exact-pair-arrival/audit-chain.json'


def canon(v):
    if isinstance(v, dict): return {k: canon(v[k]) for k in sorted(v)}
    if isinstance(v, list): return [canon(x) for x in v]
    return v

def digest(v):
    raw=json.dumps(canon(v), separators=(',', ':'), ensure_ascii=False).encode()
    return 'sha256:' + hashlib.sha256(raw).hexdigest()

def event(stage, state, prev, ids, effect='INTERNAL_CONTROL_ONLY'):
    body={
      'stage': stage,
      'state': state,
      'correlation_id': ids.get('correlation_id'),
      'snapshot_id': ids.get('snapshot_id'),
      'evidence_package_id': ids.get('evidence_package_id'),
      'assessment_id': ids.get('assessment_id'),
      'replay_id': ids.get('replay_id'),
      'projection_id': ids.get('projection_id'),
      'exact_pair_digest': ids.get('exact_pair_digest'),
      'previous_event_digest': prev,
      'evidence_effect': effect,
      'raw_provider_payload': False,
      'credentials': False,
      'secrets': False,
      'production_touch': False,
      'public_touch': False,
      'g5': 'HOLD'
    }
    body['event_digest']=digest(body)
    body['event_id']='AUD-' + body['event_digest'].split(':',1)[1][:24]
    return body

s=json.loads(STATE.read_text(encoding='utf-8'))
if s.get('result')!='PASS': raise RuntimeError('ARRIVAL_STATE_NOT_PASS')
if s.get('production')!='HOLD' or s.get('public_intelligence')!='HOLD': raise RuntimeError('ARRIVAL_BOUNDARY_INVALID')
ids={k:s.get(k) for k in ['correlation_id','snapshot_id','evidence_package_id','assessment_id','replay_id','projection_id','exact_pair_digest']}
state=s['state']
sequence=[]
if state=='WAITING_PAIR':
    sequence=[('ARRIVAL_EVALUATED','WAITING_PAIR','NONE')]
else:
    sequence.append(('PAIR','BOUND_OR_EVALUATED','INTERNAL_TRACE'))
    if state in ['READY_FOR_TRACK_B','WAITING_ASSESSMENT','TRACK_B_BLOCKED','READY_FOR_STAGING_REPLAY','WAITING_REPLAY','READY_FOR_PROJECTION','WAITING_PROJECTION','CHAIN_COMPLETE_INTERNAL']:
        sequence.append(('TRACK_B_ADMISSION','READY_OR_EVALUATED','INTERNAL_TRACE'))
    if ids.get('assessment_id'):
        sequence.append(('TRACK_B_ASSESSMENT','BOUND','INTERNAL_TRACE'))
    if ids.get('replay_id'):
        sequence.append(('STAGING_REPLAY','BOUND','INTERNAL_TRACE'))
    if ids.get('projection_id'):
        sequence.append(('PROJECTION','BOUND','INTERNAL_TRACE'))

prev=None
events=[]
for stage, st, effect in sequence:
    e=event(stage, st, prev, ids, effect)
    if prev is not None and e['previous_event_digest']!=events[-1]['event_digest']:
        raise RuntimeError('AUDIT_CHAIN_PREVIOUS_DIGEST_MISMATCH')
    events.append(e)
    prev=e['event_digest']

payload={
  'audit_chain_id': digest({'state':state,'correlation_id':ids.get('correlation_id'),'tail':prev}),
  'source_suite': s.get('suite'),
  'source_state': state,
  'correlation_id': ids.get('correlation_id'),
  'event_count': len(events),
  'events': events,
  'tail_event_digest': prev,
  'append_only_semantics': True,
  'safe_fields_only': True,
  'raw_provider_payloads': False,
  'credentials': False,
  'secrets': False,
  'production':'HOLD',
  'public_intelligence':'HOLD',
  'g5':'HOLD'
}
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(payload, indent=2, sort_keys=True)+'\n', encoding='utf-8')
print(json.dumps({'suite':'KIDULTS_LIVE_CHAIN_AUDIT_V1','result':'PASS','state':state,'event_count':len(events),'tail_event_digest':prev}, indent=2))
